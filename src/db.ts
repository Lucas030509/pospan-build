import Database from '@tauri-apps/plugin-sql';

let dbInstance: Database | null = null;
let dbPromise: Promise<Database> | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) return dbInstance;
  if (dbPromise) return dbPromise;

  dbPromise = Database.load('sqlite:pospan.db').then(db => {
    dbInstance = db;
    return db;
  }).catch(error => {
    dbPromise = null;
    throw error;
  });

  return dbPromise;
}

export async function hashPin(pin: string): Promise<string> {
  if (!pin) return "";
  if (pin.length === 64 && /^[0-9a-fA-F]+$/.test(pin)) {
    return pin;
  }
  const msgBuffer = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

let initPromise: Promise<void> | null = null;

export async function initDb() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const db = await getDb();

    try {
      await db.execute('PRAGMA journal_mode = WAL;');
      await db.execute('PRAGMA busy_timeout = 5000;');
      await db.execute('PRAGMA synchronous = NORMAL;');
    } catch (e) {
      console.warn("Error setting PRAGMAs:", e);
    }

    // Migración Inicial: Creación de tablas
    await db.execute(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      price REAL NOT NULL,
      img TEXT,
      uuid_global TEXT UNIQUE,
      sucursal_id TEXT,
      version INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME
    )
  `);

    await db.execute(`
    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      total REAL NOT NULL,
      uuid_global TEXT UNIQUE,
      sucursal_id TEXT,
      status TEXT DEFAULT 'pending_sync',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

    await db.execute(`
    CREATE TABLE IF NOT EXISTS sale_items(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER,
      product_id INTEGER,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY(sale_id) REFERENCES sales(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `);

    await db.execute(`
    CREATE TABLE IF NOT EXISTS shifts(
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      uuid_global TEXT UNIQUE,
      sucursal_id TEXT,
      start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      end_time DATETIME,
      initial_amount REAL DEFAULT 0,
      expected_amount REAL,
      actual_amount REAL,
      status TEXT DEFAULT 'open',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    `);

    await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      pin TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'cashier',
      permissions TEXT DEFAULT NULL,
      uuid_global TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME
    )
  `);

    await db.execute(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
    `);

    // Almacenes: unidad física donde vive el stock (materia prima, producto terminado, etc.)
    await db.execute(`
    CREATE TABLE IF NOT EXISTS warehouses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME
    )
    `);

    // Sucursales
    await db.execute(`
    CREATE TABLE IF NOT EXISTS branches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      email TEXT,
      warehouse_id INTEGER REFERENCES warehouses(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME
    )
    `);

    // Almacenes de producción de la sucursal (Fase 2: orden de producción en 2 etapas)
    try {
      await db.execute('ALTER TABLE branches ADD COLUMN raw_material_warehouse_id INTEGER REFERENCES warehouses(id)');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    try {
      await db.execute('ALTER TABLE branches ADD COLUMN wip_warehouse_id INTEGER REFERENCES warehouses(id)');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    try {
      await db.execute('ALTER TABLE branches ADD COLUMN finished_goods_warehouse_id INTEGER REFERENCES warehouses(id)');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    // Fase 3: Mercancía en Tránsito de la sucursal (usado por TRINS) + bandera de
    // traspasos/recepción automáticos de insumos.
    try {
      await db.execute('ALTER TABLE branches ADD COLUMN transit_warehouse_id INTEGER REFERENCES warehouses(id)');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    try {
      await db.execute('ALTER TABLE branches ADD COLUMN auto_confirm_production INTEGER NOT NULL DEFAULT 0');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    // Clientes (se usa principalmente el "Público en General" sembrado por defecto)
    await db.execute(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      rfc TEXT,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME
    )
    `);

    // Datos fiscales para poder timbrar factura (CFDI) a partir de una venta
    try {
      await db.execute('ALTER TABLE customers ADD COLUMN postal_code TEXT');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }
    try {
      await db.execute('ALTER TABLE customers ADD COLUMN tax_regime TEXT');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }
    try {
      await db.execute('ALTER TABLE customers ADD COLUMN cfdi_use TEXT');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    // Cajas: pertenecen a una sucursal, venden contra el almacén de esa sucursal
    await db.execute(`
    CREATE TABLE IF NOT EXISTS cashboxes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      branch_id INTEGER NOT NULL REFERENCES branches(id),
      default_customer_id INTEGER REFERENCES customers(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME
    )
    `);

    // Asignación de cajeros a cajas (varios a varios)
    await db.execute(`
    CREATE TABLE IF NOT EXISTS cashier_cashboxes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      cashbox_id INTEGER NOT NULL REFERENCES cashboxes(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, cashbox_id)
    )
    `);

    // Existencias por almacén: reemplaza a products.stock/ingredients.stock como fuente de verdad
    await db.execute(`
    CREATE TABLE IF NOT EXISTS warehouse_stock (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      warehouse_id INTEGER NOT NULL REFERENCES warehouses(id),
      item_type TEXT NOT NULL,
      item_id INTEGER NOT NULL,
      stock REAL NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(warehouse_id, item_type, item_id)
    )
    `);

    // Intentamos agregar llaves foraneas a ventas de forma no destructiva
    try {
      await db.execute('ALTER TABLE sales ADD COLUMN shift_id INTEGER REFERENCES shifts(id)');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    try {
      await db.execute('ALTER TABLE sales ADD COLUMN user_id INTEGER REFERENCES users(id)');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    try {
      await db.execute('ALTER TABLE sales ADD COLUMN payment_method TEXT DEFAULT "cash"');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    try {
      await db.execute('ALTER TABLE sales ADD COLUMN cash_received REAL DEFAULT 0');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    try {
      await db.execute('ALTER TABLE sales ADD COLUMN cash_change REAL DEFAULT 0');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    // Cliente y almacén de la venta. El almacén siempre se resuelve solo desde la caja activa.
    // El cliente también se resuelve solo (cliente por defecto de la caja) salvo que el cajero
    // marque "requiere factura" al cobrar y elija/capture un cliente específico para esa venta.
    try {
      await db.execute('ALTER TABLE sales ADD COLUMN customer_id INTEGER REFERENCES customers(id)');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    try {
      await db.execute('ALTER TABLE sales ADD COLUMN warehouse_id INTEGER REFERENCES warehouses(id)');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    try {
      await db.execute('ALTER TABLE sales ADD COLUMN requires_invoice INTEGER NOT NULL DEFAULT 0');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    // Cobro mixto / cortesía: subtotal e IVA se guardan al momento de la venta (para que una
    // reimpresión futura sea fiel a como fue la venta real, sin importar si el IVA cambia o se
    // apaga después); payment_method ahora también admite 'mixed' y 'cortesia'.
    try {
      await db.execute('ALTER TABLE sales ADD COLUMN subtotal REAL DEFAULT 0');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    try {
      await db.execute('ALTER TABLE sales ADD COLUMN tax REAL DEFAULT 0');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    try {
      await db.execute('ALTER TABLE sales ADD COLUMN courtesy_reason TEXT');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    try {
      await db.execute('ALTER TABLE sales ADD COLUMN courtesy_authorized_by INTEGER REFERENCES users(id)');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    // Catálogo de instituciones bancarias para pagos con tarjeta (Configuración > Ventas).
    // "General / Otro" (is_general=1) es una fila protegida, no se puede borrar.
    await db.execute(`
    CREATE TABLE IF NOT EXISTS card_institutions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      is_general INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted_at DATETIME
    )
    `);

    // Desglose de líneas de pago por venta (una fila incluso para ventas de un solo método) —
    // fuente única de verdad para cobro mixto y para el corte de caja por método de pago.
    await db.execute(`
    CREATE TABLE IF NOT EXISTS sale_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL REFERENCES sales(id),
      method TEXT NOT NULL,
      amount REAL NOT NULL,
      card_type TEXT,
      bank_institution_id INTEGER REFERENCES card_institutions(id),
      received REAL,
      change_given REAL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
    `);

    try {
      const cardInstCount: any[] = await db.select('SELECT COUNT(*) as count FROM card_institutions');
      if (Number(cardInstCount[0]?.count) === 0) {
        await db.execute("INSERT INTO card_institutions (name, is_general) VALUES ('General / Otro', 1)");
        const seedBanks = [
          'Banco del Bienestar', 'BBVA México', 'Banamex', 'Banco Azteca', 'Banorte',
          'Santander', 'BanCoppel', 'HSBC', 'Scotiabank', 'Inbursa'
        ];
        for (const name of seedBanks) {
          await db.execute('INSERT INTO card_institutions (name) VALUES ($1)', [name]);
        }
      }
    } catch (e) {
      console.error("Error sembrando catálogo de instituciones bancarias:", e);
    }

    // Caja y usuario del turno (antes openShift recibía userId pero nunca lo guardaba)
    try {
      await db.execute('ALTER TABLE shifts ADD COLUMN cashbox_id INTEGER REFERENCES cashboxes(id)');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    try {
      await db.execute('ALTER TABLE shifts ADD COLUMN user_id INTEGER REFERENCES users(id)');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    // Stock en productos
    // OBSOLETA desde que existe warehouse_stock (ver más abajo): esta columna se deja de
    // escribir/leer para operación normal, no se borra por ser una base de producción real.
    try {
      await db.execute('ALTER TABLE products ADD COLUMN stock REAL DEFAULT 0');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    // Costo unitario de producción
    try {
      await db.execute('ALTER TABLE products ADD COLUMN cost REAL DEFAULT 0');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    // Permisos en usuarios (por si la tabla users ya existía en versiones previas)
    try {
      await db.execute('ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT NULL');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    // Cuenta "master": distinta del rol 'admin', es quien autoriza pagos de Cortesía con su PIN.
    try {
      await db.execute('ALTER TABLE users ADD COLUMN is_master INTEGER NOT NULL DEFAULT 0');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    // Migración: quitar el UNIQUE de "pin" en users (permite reutilizar el PIN de un
    // empleado eliminado y también asignar el mismo PIN a varios empleados a la vez).
    try {
      const tableInfo: any[] = await db.select("SELECT sql FROM sqlite_master WHERE type='table' AND name='users'");
      const createSql = tableInfo[0]?.sql || '';
      if (/pin\s+TEXT\s+UNIQUE/i.test(createSql)) {
        // Por si un intento anterior quedó a medias (ej. por un reinicio abrupto de la app)
        await db.execute("DROP TABLE IF EXISTS users_new");
        await db.execute(`
          CREATE TABLE users_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            pin TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'cashier',
            permissions TEXT DEFAULT NULL,
            uuid_global TEXT UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME
          )
        `);
        await db.execute(`
          INSERT INTO users_new (id, name, pin, role, permissions, uuid_global, created_at, deleted_at)
          SELECT id, name, pin, role, permissions, uuid_global, created_at, deleted_at FROM users
        `);
        await db.execute("DROP TABLE users");
        await db.execute("ALTER TABLE users_new RENAME TO users");
      }
    } catch (e) {
      console.error("Error migrando tabla users (quitar UNIQUE de pin):", e);
    }

    // Tabla de Ingredientes (materia prima)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT 'kg',
        stock REAL DEFAULT 0,  -- OBSOLETA: ver warehouse_stock, fuente de verdad desde multi-almacén
        min_stock REAL DEFAULT 0,
        cost_per_unit REAL DEFAULT 0,
        uuid_global TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        deleted_at DATETIME
      )
    `);

    // Movimientos de inventario (entradas/salidas/mermas)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS inventory_movements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        item_type TEXT NOT NULL,
        item_id INTEGER NOT NULL,
        movement_type TEXT NOT NULL,
        quantity REAL NOT NULL,
        reason TEXT,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try {
      await db.execute('ALTER TABLE inventory_movements ADD COLUMN warehouse_id INTEGER REFERENCES warehouses(id)');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    // Tabla de Ajustes con Folio (ENTAJ / SALAJ)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS adjustments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folio TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        product_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        unit_cost REAL NOT NULL,
        previous_stock REAL NOT NULL,
        new_stock REAL NOT NULL,
        previous_cost REAL NOT NULL,
        new_avg_cost REAL NOT NULL,
        status TEXT DEFAULT 'Realizada',
        notes TEXT,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(product_id) REFERENCES products(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    // Documentos de Ajuste multi-producto (ENTAJ / SALAJ) — reemplaza el flujo de un solo producto por folio.
    // No se toca la tabla "adjustments" de arriba: su historial se sigue mostrando tal cual.
    await db.execute(`
      CREATE TABLE IF NOT EXISTS adjustment_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folio TEXT UNIQUE NOT NULL,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'Realizada',
        notes TEXT,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    try {
      await db.execute('ALTER TABLE adjustment_documents ADD COLUMN warehouse_id INTEGER REFERENCES warehouses(id)');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    await db.execute(`
      CREATE TABLE IF NOT EXISTS adjustment_document_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        unit_cost REAL NOT NULL,
        previous_stock REAL NOT NULL,
        new_stock REAL NOT NULL,
        previous_cost REAL NOT NULL,
        new_avg_cost REAL NOT NULL,
        FOREIGN KEY(document_id) REFERENCES adjustment_documents(id),
        FOREIGN KEY(product_id) REFERENCES products(id)
      )
    `);

    // Recetas (relación producto -> ingredientes)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        product_id INTEGER NOT NULL UNIQUE,
        yield_qty REAL DEFAULT 1,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(product_id) REFERENCES products(id)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS recipe_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id INTEGER NOT NULL,
        ingredient_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        FOREIGN KEY(recipe_id) REFERENCES recipes(id),
        FOREIGN KEY(ingredient_id) REFERENCES ingredients(id)
      )
    `);

    // Documentos de Producción multi-producto con Folio (ENTOP)
    await db.execute(`
      CREATE TABLE IF NOT EXISTS production_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folio TEXT UNIQUE NOT NULL,
        status TEXT DEFAULT 'Realizada',
        notes TEXT,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    try {
      await db.execute('ALTER TABLE production_documents ADD COLUMN source_warehouse_id INTEGER REFERENCES warehouses(id)');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    try {
      // Desde Fase 2: almacén de producto terminado, ya no se usa para mover stock (solo
      // informativo) — el destino real de las órdenes nuevas es wip_warehouse_id.
      await db.execute('ALTER TABLE production_documents ADD COLUMN dest_warehouse_id INTEGER REFERENCES warehouses(id)');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    try {
      await db.execute('ALTER TABLE production_documents ADD COLUMN branch_id INTEGER REFERENCES branches(id)');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    try {
      // Almacén "en proceso": a donde se mandan los insumos al crear la orden (Fase 2).
      await db.execute('ALTER TABLE production_documents ADD COLUMN wip_warehouse_id INTEGER REFERENCES warehouses(id)');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    await db.execute(`
      CREATE TABLE IF NOT EXISTS production_document_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        recipe_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        batches REAL NOT NULL,
        yield_qty REAL NOT NULL,
        previous_stock REAL NOT NULL,
        new_stock REAL NOT NULL,
        previous_cost REAL NOT NULL,
        new_avg_cost REAL NOT NULL,
        FOREIGN KEY(document_id) REFERENCES production_documents(id),
        FOREIGN KEY(recipe_id) REFERENCES recipes(id),
        FOREIGN KEY(product_id) REFERENCES products(id)
      )
    `);

    try {
      // Acumulado recibido vía FIFO (Fase 2); pendiente = yield_qty - received_qty.
      await db.execute('ALTER TABLE production_document_items ADD COLUMN received_qty REAL NOT NULL DEFAULT 0');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }

    await db.execute(`
      CREATE TABLE IF NOT EXISTS production_document_ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_item_id INTEGER NOT NULL,
        ingredient_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        unit_cost REAL NOT NULL,
        FOREIGN KEY(document_item_id) REFERENCES production_document_items(id),
        FOREIGN KEY(ingredient_id) REFERENCES ingredients(id)
      )
    `);

    // Recepción de producción (Fase 2, Etapa B): registra "llegó tanto de tal producto" y
    // reparte esa cantidad por FIFO contra las órdenes (production_documents) abiertas.
    await db.execute(`
      CREATE TABLE IF NOT EXISTS production_receipts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        folio TEXT UNIQUE NOT NULL,
        branch_id INTEGER NOT NULL,
        status TEXT DEFAULT 'Realizada',
        notes TEXT,
        user_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(branch_id) REFERENCES branches(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS production_receipt_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_id INTEGER NOT NULL,
        product_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        previous_stock REAL NOT NULL,
        new_stock REAL NOT NULL,
        previous_cost REAL NOT NULL,
        new_avg_cost REAL NOT NULL,
        FOREIGN KEY(receipt_id) REFERENCES production_receipts(id),
        FOREIGN KEY(product_id) REFERENCES products(id)
      )
    `);

    // Trazabilidad FIFO: de qué línea de orden (production_document_items) vino cada parte
    // de cada línea recibida, y con qué costo de insumos — permite auditar y revertir exacto.
    await db.execute(`
      CREATE TABLE IF NOT EXISTS production_receipt_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_item_id INTEGER NOT NULL,
        document_item_id INTEGER NOT NULL,
        qty_taken REAL NOT NULL,
        ingredient_cost REAL NOT NULL,
        FOREIGN KEY(receipt_item_id) REFERENCES production_receipt_items(id),
        FOREIGN KEY(document_item_id) REFERENCES production_document_items(id)
      )
    `);

    // Fase 3: producción repurposa "production_receipts" como ENTOP (recepción de producto
    // terminado); cada recepción también genera un folio SALPROD (consumo de insumos) sobre
    // la misma fila. SQLite no permite UNIQUE vía ALTER TABLE ADD COLUMN, se agrega aparte.
    try {
      await db.execute('ALTER TABLE production_receipts ADD COLUMN salprod_folio TEXT');
    } catch (e: any) { if (!/duplicate column/i.test(String(e?.message || e))) console.error("Migración de esquema falló (ALTER TABLE):", e); }
    try {
      await db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_production_receipts_salprod_folio ON production_receipts(salprod_folio)');
    } catch (e: any) { if (!/already exists/i.test(String(e?.message || e))) console.error("Migración de esquema falló (CREATE INDEX):", e); }

    // Detalle de SALPROD: qué insumo y cuánto se consumió en cada recepción (
    // production_receipt_allocations solo trae un costo agregado por asignación FIFO, no el
    // desglose por insumo que necesita el documento SALPROD).
    await db.execute(`
      CREATE TABLE IF NOT EXISTS production_receipt_ingredient_consumption (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        receipt_id INTEGER NOT NULL,
        ingredient_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        unit_cost REAL NOT NULL,
        FOREIGN KEY(receipt_id) REFERENCES production_receipts(id),
        FOREIGN KEY(ingredient_id) REFERENCES ingredients(id)
      )
    `);

    // Traspasos entre almacenes: tabla compartida por TRASP (general, cualquier par de
    // almacenes) y TRINS (exclusivo de producción, Materia Prima -> Proceso, ligado a una
    // orden). Ambos comparten la misma vida Pendiente -> Confirmado/Cancelado.
    await db.execute(`
      CREATE TABLE IF NOT EXISTS warehouse_transfers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        folio TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'Pendiente',
        source_warehouse_id INTEGER NOT NULL,
        dest_warehouse_id INTEGER NOT NULL,
        transit_warehouse_id INTEGER NOT NULL,
        production_document_id INTEGER,
        branch_id INTEGER,
        notes TEXT,
        user_id INTEGER,
        confirmed_by_user_id INTEGER,
        confirmed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(source_warehouse_id) REFERENCES warehouses(id),
        FOREIGN KEY(dest_warehouse_id) REFERENCES warehouses(id),
        FOREIGN KEY(transit_warehouse_id) REFERENCES warehouses(id),
        FOREIGN KEY(production_document_id) REFERENCES production_documents(id),
        FOREIGN KEY(branch_id) REFERENCES branches(id)
      )
    `);

    try {
      // Un solo TRINS activo (no cancelado) por orden — evita duplicar el traspaso de insumos.
      await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_one_active_trins_per_order
        ON warehouse_transfers(production_document_id) WHERE type='TRINS' AND status != 'Cancelado'
      `);
    } catch (e: any) { if (!/already exists/i.test(String(e?.message || e))) console.error("Migración de esquema falló (CREATE INDEX):", e); }

    await db.execute(`
      CREATE TABLE IF NOT EXISTS warehouse_transfer_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        transfer_id INTEGER NOT NULL,
        item_type TEXT NOT NULL,
        item_id INTEGER NOT NULL,
        quantity REAL NOT NULL,
        unit_cost REAL NOT NULL DEFAULT 0,
        FOREIGN KEY(transfer_id) REFERENCES warehouse_transfers(id)
      )
    `);

    // TABLA DE CONFIGURACIONES
    await db.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    // Inserción no destructiva de nuevas configuraciones por defecto
    try {
      await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('allow_negative_stock', 'true')");
      await db.execute("INSERT OR IGNORE INTO settings (key, value) VALUES ('lock_timeout_mins', '5')");
    } catch (e) {
      console.error("Error al sembrar configuraciones por defecto:", e);
    }

    // Sembrar datos iniciales si no hay productos
    try {
      const result: any[] = await db.select('SELECT COUNT(*) as count FROM products');
      console.log("DB count result:", result);

      let count = 0;
      if (result && result.length > 0) {
        const firstRow = result[0];
        const firstKey = Object.keys(firstRow)[0];
        count = Number(firstRow[firstKey]) || 0;
      }

      console.log("Parsed count:", count);

      if (count === 0) {
        console.log("Sembrando base de datos inicial...");
        const MOCK_PRODUCTS = [
          { id: 1, name: "Concha de Vainilla", category: "Pan Dulce", price: 12.00, img: "🥐" },
          { id: 2, name: "Concha de Chocolate", category: "Pan Dulce", price: 12.00, img: "🍩" },
          { id: 3, name: "Bolillo", category: "Bolillo y Telera", price: 2.50, img: "🥖" },
          { id: 4, name: "Telera", category: "Bolillo y Telera", price: 3.00, img: "🥖" },
          { id: 5, name: "Cuernito", category: "Pan Dulce", price: 15.00, img: "🥐" },
          { id: 6, name: "Dona de Chocolate", category: "Pan Dulce", price: 18.00, img: "🍩" },
          { id: 7, name: "Pastel 3 Leches", category: "Pasteles", price: 250.00, img: "🍰" },
          { id: 8, name: "Café Americano", category: "Bebidas", price: 25.00, img: "☕" },
          { id: 9, name: "Oreja", category: "Pan Dulce", price: 14.00, img: "🥨" },
          { id: 10, name: "Beso", category: "Pan Dulce", price: 16.00, img: "🥧" },
        ];

        for (const p of MOCK_PRODUCTS) {
          await db.execute(
            'INSERT INTO products (id, name, category, price, img, uuid_global) VALUES ($1, $2, $3, $4, $5, hex(randomblob(16)))',
            [p.id, p.name, p.category, p.price, p.img]
          );
        }
        console.log("Siembra de productos completada.");
      }

      // Semilla para Usuarios
      const userCountResult: any[] = await db.select('SELECT COUNT(*) as count FROM users');
      let userCount = 0;
      if (userCountResult && userCountResult.length > 0) {
        const firstKey = Object.keys(userCountResult[0])[0];
        userCount = Number(userCountResult[0][firstKey]) || 0;
      }

      if (userCount === 0) {
        console.log("Sembrando Administrador inicial...");
        // PIN aleatorio (no un valor fijo conocido): evita que cualquier instalación nueva
        // quede con un PIN de administrador público/adivinable.
        const initialAdminPin = String(Math.floor(1000 + Math.random() * 9000));
        const adminPinHashed = await hashPin(initialAdminPin);
        await db.execute(
          "INSERT INTO users (name, pin, role, uuid_global) VALUES ('Administrador Maestro', $1, 'admin', hex(randomblob(16)))",
          [adminPinHashed]
        );
        const { notify } = await import("./lib/dialogs");
        await notify(
          `Se creó el usuario "Administrador Maestro" con el PIN: ${initialAdminPin}\n\nApúntalo y cámbialo desde Gestión de Cajeros en cuanto puedas.`,
          'warning'
        );
      }

      // Migración de PINs antiguos a hashes SHA-256
      try {
        const allUsers = await db.select("SELECT id, pin FROM users");
        for (const u of (allUsers as any[])) {
          if (u.pin && u.pin.length !== 64) {
            const hashed = await hashPin(u.pin);
            await db.execute("UPDATE users SET pin = $1 WHERE id = $2", [hashed, u.id]);
            console.log(`Usuario ID ${u.id} migrado a hash SHA-256.`);
          }
        }
      } catch (err) {
        console.error("Error al migrar PINs a hashes:", err);
      }

      // Semilla para Configuraciones (Ticket estilo Michoacana)
      const settingsCount: any[] = await db.select('SELECT COUNT(*) as count FROM settings');
      let sCount = 0;
      if (settingsCount && settingsCount.length > 0) {
        sCount = Number(settingsCount[0][Object.keys(settingsCount[0])[0]]) || 0;
      }

      if (sCount === 0) {
        const DEFAULT_SETTINGS = [
          ['biz_name', 'LA MICHOACANA'],
          ['biz_subtitle', 'SISTEMA BARMAN'],
          ['biz_address_1', 'IGLESIA #2 T B-403 TIZAPAN'],
          ['biz_address_2', 'ALVARO OBREGON MEXICO D.F. 01090'],
          ['biz_rfc', 'RDI0412217C4'],
          ['biz_phone', '(55) 5616-7102'],
          ['tax_rate', '16'],
          ['ticket_legal', '(COMPROBANTE SIMPLIFICADO DE OPERACION CON PUBLICO EN GENERAL DE ACUERDO AL ART 37 DEL CODIGO FISCAL DE LA FEDERACION)'],
          ['ticket_footer_msg', 'GRACIAS POR SU VISITA'],
          ['ticket_website', 'WWW.BARMAN.COM.MX'],
          ['ticket_extra_address', 'AV. CORONA DEL ROSAL N. 44 EL TANQUE']
        ];
        for (const [k, v] of DEFAULT_SETTINGS) {
          await db.execute('INSERT INTO settings (key, value) VALUES ($1, $2)', [k, v]);
        }
      }

      // Sucursales, Cajas, Almacenes y Clientes (Fase 1 multi-almacén). Todo condicionado a que
      // la tabla correspondiente esté vacía, salvo el backfill de existencias (paso 5), que corre
      // siempre con INSERT OR IGNORE para poder auto-repararse sin pisar ajustes ya hechos.
      try {
        // 1. Almacén por defecto
        const whCount: any[] = await db.select('SELECT COUNT(*) as count FROM warehouses');
        if (Number(whCount[0]?.count) === 0) {
          await db.execute("INSERT INTO warehouses (name) VALUES ('Almacén Principal')");
        }
        const defaultWarehouseRow: any[] = await db.select('SELECT id FROM warehouses ORDER BY id ASC LIMIT 1');
        const defaultWarehouseId = defaultWarehouseRow[0]?.id;

        // 2. Sucursal por defecto (reusa los datos de la empresa ya capturados en Configuración)
        const branchCount: any[] = await db.select('SELECT COUNT(*) as count FROM branches');
        if (Number(branchCount[0]?.count) === 0 && defaultWarehouseId) {
          const bizSettings: any[] = await db.select(
            "SELECT key, value FROM settings WHERE key IN ('biz_name','biz_address_1','biz_phone')"
          );
          const s: Record<string, string> = {};
          for (const row of bizSettings) s[row.key] = row.value;
          await db.execute(
            "INSERT INTO branches (name, address, phone, warehouse_id) VALUES ($1, $2, $3, $4)",
            [s.biz_name || 'Sucursal Principal', s.biz_address_1 || null, s.biz_phone || null, defaultWarehouseId]
          );
        }
        const defaultBranchRow: any[] = await db.select('SELECT id FROM branches ORDER BY id ASC LIMIT 1');
        const defaultBranchId = defaultBranchRow[0]?.id;

        // 3. Cliente "Público en General"
        const customerCount: any[] = await db.select('SELECT COUNT(*) as count FROM customers');
        if (Number(customerCount[0]?.count) === 0) {
          await db.execute("INSERT INTO customers (name, is_default) VALUES ('Público en General', 1)");
        }
        const defaultCustomerRow: any[] = await db.select('SELECT id FROM customers WHERE is_default = 1 ORDER BY id ASC LIMIT 1');
        const defaultCustomerId = defaultCustomerRow[0]?.id;

        // 4. Caja por defecto
        const cashboxCount: any[] = await db.select('SELECT COUNT(*) as count FROM cashboxes');
        if (Number(cashboxCount[0]?.count) === 0 && defaultBranchId) {
          await db.execute(
            "INSERT INTO cashboxes (name, branch_id, default_customer_id) VALUES ('Caja 1', $1, $2)",
            [defaultBranchId, defaultCustomerId || null]
          );
        }
        const defaultCashboxRow: any[] = await db.select('SELECT id FROM cashboxes ORDER BY id ASC LIMIT 1');
        const defaultCashboxId = defaultCashboxRow[0]?.id;

        // 5. Backfill de existencias hacia warehouse_stock. INSERT OR IGNORE: si ya existe la fila
        // (venta/ajuste posterior a la migración ya la tocó), no se pisa el valor real.
        if (defaultWarehouseId) {
          const allProducts: any[] = await db.select('SELECT id, stock FROM products');
          for (const p of allProducts) {
            await db.execute(
              "INSERT OR IGNORE INTO warehouse_stock (warehouse_id, item_type, item_id, stock) VALUES ($1, 'product', $2, $3)",
              [defaultWarehouseId, p.id, Number(p.stock) || 0]
            );
          }
          const allIngredients: any[] = await db.select('SELECT id, stock FROM ingredients');
          for (const i of allIngredients) {
            await db.execute(
              "INSERT OR IGNORE INTO warehouse_stock (warehouse_id, item_type, item_id, stock) VALUES ($1, 'ingredient', $2, $3)",
              [defaultWarehouseId, i.id, Number(i.stock) || 0]
            );
          }
        }

        // 6. Auto-asignar cajeros ya existentes a la caja por defecto, para no bloquear una
        // instalación que ya está en operación el día que reciba esta actualización.
        const assignedCount: any[] = await db.select('SELECT COUNT(*) as count FROM cashier_cashboxes');
        if (Number(assignedCount[0]?.count) === 0 && defaultCashboxId) {
          const cashiers: any[] = await db.select("SELECT id FROM users WHERE role = 'cashier'");
          for (const c of cashiers) {
            await db.execute(
              "INSERT OR IGNORE INTO cashier_cashboxes (user_id, cashbox_id) VALUES ($1, $2)",
              [c.id, defaultCashboxId]
            );
          }
        }
      } catch (err) {
        console.error("Error sembrando sucursales/cajas/almacenes/clientes:", err);
      }

    } catch (e) {
      console.error("Error sembrando base de datos:", e);
    }
  })();
  return initPromise;
}

export async function getProducts(): Promise<any[]> {
  const db = await getDb();
  const products = await db.select('SELECT * FROM products WHERE deleted_at IS NULL');
  console.log("Productos leídos DB:", products);
  return products as any[];
}

export async function createProduct(product: Omit<any, 'id'>, userId?: number): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    'INSERT INTO products (name, category, price, cost, img, uuid_global) VALUES ($1, $2, $3, $4, $5, hex(randomblob(16)))',
    [product.name, product.category, product.price, product.cost ?? 0, product.img]
  );
  if (userId) {
    await logAction(userId, "PRODUCTO CREADO", `Se creó el producto ${product.name} con precio $${product.price}`);
  }
  return Number(result.lastInsertId);
}

export async function updateProduct(id: number, product: Partial<any>, userId?: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE products SET name = $1, category = $2, price = $3, cost = $4, img = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6',
    [product.name, product.category, product.price, product.cost ?? 0, product.img, id]
  );
  if (userId) {
    await logAction(userId, "PRODUCTO ACTUALIZADO", `Se modificó el producto con ID ${id} (${product.name})`);
  }
}

export async function deleteProduct(id: number, userId?: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    'UPDATE products SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1',
    [id]
  );
  if (userId) {
    await logAction(userId, "PRODUCTO ELIMINADO", `Se eliminó (lógicamente) el producto con ID ${id}`);
  }
}

export type SavePaymentInput =
  | { type: 'cash'; amount: number; received: number; change: number }
  | { type: 'card'; amount: number; cardType: 'debito' | 'credito'; bankInstitutionId: number }
  | { type: 'mixed'; cashAmount: number; cashReceived: number; cashChange: number;
      cardAmount: number; cardType: 'debito' | 'credito'; bankInstitutionId: number }
  | { type: 'cortesia'; reason: string; authorizedByUserId: number };

export async function saveSale(opts: {
  total: number;
  items: any[];
  shiftId?: number;
  userId?: number;
  subtotal: number;
  tax: number;
  requiresInvoice?: boolean;
  invoiceCustomerId?: number;
  payment: SavePaymentInput;
}): Promise<number> {
  const { total, items, shiftId, userId, subtotal, tax, requiresInvoice = false, invoiceCustomerId, payment } = opts;
  const db = await getDb();

  // Validaciones server-side antes de escribir nada: como este proyecto no usa transacciones
  // manuales (commit 9228393), esta es la única red de seguridad real contra un PaymentModal
  // manipulado o un caso borde no contemplado en la UI.
  if (payment.type === 'cortesia') {
    if (!payment.reason || !payment.reason.trim()) {
      throw new Error("El pago de cortesía requiere un motivo.");
    }
    const master: any[] = await db.select(
      "SELECT is_master FROM users WHERE id = $1 AND deleted_at IS NULL",
      [payment.authorizedByUserId]
    );
    if (master.length === 0 || Number(master[0].is_master) !== 1) {
      throw new Error("El usuario que autoriza no es una cuenta master activa.");
    }
  }
  if (payment.type === 'mixed') {
    const sum = Math.round((payment.cashAmount + payment.cardAmount) * 100);
    if (sum !== Math.round(total * 100)) {
      throw new Error("El desglose de pago mixto no coincide con el total de la venta.");
    }
  }
  if (payment.type === 'card' || payment.type === 'mixed') {
    const bankId = payment.bankInstitutionId;
    const bank: any[] = await db.select("SELECT id FROM card_institutions WHERE id = $1 AND deleted_at IS NULL", [bankId]);
    if (bank.length === 0) throw new Error("La institución bancaria seleccionada no existe.");
  }

  // Resolver almacén y cliente de la venta a partir del turno -> caja -> sucursal.
  // El almacén siempre se resuelve solo. El cliente también, salvo que el cajero haya
  // marcado "requiere factura" y elegido/capturado un cliente específico para esta venta.
  let warehouseId: number | null = null;
  let customerId: number | null = invoiceCustomerId || null;
  if (shiftId) {
    const resolved: any[] = await db.select(`
      SELECT b.warehouse_id, cb.default_customer_id
      FROM shifts sh
      JOIN cashboxes cb ON sh.cashbox_id = cb.id
      JOIN branches b ON cb.branch_id = b.id
      WHERE sh.id = $1
    `, [shiftId]);
    warehouseId = resolved[0]?.warehouse_id ?? null;
    if (!customerId) customerId = resolved[0]?.default_customer_id ?? null;
  }
  if (!warehouseId) {
    const fallbackWh: any[] = await db.select("SELECT id FROM warehouses ORDER BY id ASC LIMIT 1");
    warehouseId = fallbackWh[0]?.id ?? null;
  }
  if (!customerId) {
    const fallbackCust: any[] = await db.select("SELECT id FROM customers WHERE is_default = 1 ORDER BY id ASC LIMIT 1");
    customerId = fallbackCust[0]?.id ?? null;
  }

  const cashReceivedTotal = payment.type === 'cash' ? payment.received : payment.type === 'mixed' ? payment.cashReceived : 0;
  const cashChangeTotal = payment.type === 'cash' ? payment.change : payment.type === 'mixed' ? payment.cashChange : 0;
  const courtesyReason = payment.type === 'cortesia' ? payment.reason.trim() : null;
  const courtesyAuthorizedBy = payment.type === 'cortesia' ? payment.authorizedByUserId : null;

  // await db.execute("BEGIN");
  try {
    // Crear venta vinculada al turno y al cajero
    const result = await db.execute(
      `INSERT INTO sales (total, uuid_global, shift_id, user_id, payment_method, cash_received, cash_change,
        customer_id, warehouse_id, requires_invoice, subtotal, tax, courtesy_reason, courtesy_authorized_by)
       VALUES ($1, hex(randomblob(16)), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [total, shiftId || null, userId || null, payment.type, cashReceivedTotal, cashChangeTotal, customerId,
        warehouseId, requiresInvoice ? 1 : 0, subtotal, tax, courtesyReason, courtesyAuthorizedBy]
    );

    const saleId = result.lastInsertId;
    if (!saleId) throw new Error("No se pudo obtener el ID de la venta");

    for (const item of items) {
      await db.execute(
        'INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
        [saleId, item.product.id, item.quantity, item.product.price]
      );

      // Descontar stock del producto (del almacén de la caja activa) y dejar rastro en el
      // kardex de movimientos, dentro de la misma secuencia que la venta (antes vivía en un
      // loop aparte en App.tsx, sin ninguna garantía de que se aplicara completo). Se hace
      // igual para cortesía: el producto sale físicamente aunque no se cobre.
      await db.execute(
        "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id, warehouse_id) VALUES ('product', $1, 'exit', $2, $3, $4, $5)",
        [item.product.id, item.quantity, `Venta en caja #${shiftId || ''}`, userId || null, warehouseId]
      );
      if (warehouseId) {
        await adjustWarehouseStock(warehouseId, 'product', item.product.id, -item.quantity);
      }
    }

    // Desglose de líneas de pago (fuente única de verdad para cobro mixto y para el corte de
    // caja por método) — no aplica a cortesía, que no tiene monto cobrado que desglosar.
    if (payment.type === 'cash') {
      await db.execute(
        "INSERT INTO sale_payments (sale_id, method, amount, received, change_given) VALUES ($1, 'cash', $2, $3, $4)",
        [saleId, payment.amount, payment.received, payment.change]
      );
    } else if (payment.type === 'card') {
      await db.execute(
        "INSERT INTO sale_payments (sale_id, method, amount, card_type, bank_institution_id) VALUES ($1, 'card', $2, $3, $4)",
        [saleId, payment.amount, payment.cardType, payment.bankInstitutionId]
      );
    } else if (payment.type === 'mixed') {
      await db.execute(
        "INSERT INTO sale_payments (sale_id, method, amount, received, change_given) VALUES ($1, 'cash', $2, $3, $4)",
        [saleId, payment.cashAmount, payment.cashReceived, payment.cashChange]
      );
      await db.execute(
        "INSERT INTO sale_payments (sale_id, method, amount, card_type, bank_institution_id) VALUES ($1, 'card', $2, $3, $4)",
        [saleId, payment.cardAmount, payment.cardType, payment.bankInstitutionId]
      );
    }

    // Registrar en bitácora de auditoría dentro de la base de datos
    await db.execute(
      "INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)",
      [userId || null, "VENTA REGISTRADA", `Ticket #${saleId} registrado por un total de $${total.toFixed(2)} (${payment.type})`]
    );

    // Segunda entrada específica de auditoría para cortesía (motivo + quién autorizó + cajero),
    // filtrable en Bitácora sin tener que parsear el texto genérico de arriba.
    if (payment.type === 'cortesia') {
      await logAction(
        payment.authorizedByUserId,
        "VENTA CORTESÍA",
        `Ticket #${saleId} por $${total.toFixed(2)} — Motivo: ${courtesyReason} — Cajero ID: ${userId ?? 'N/A'}`
      );
    }

    // await db.execute("COMMIT");
    return Number(saleId);
  } catch (err) {
    try {
      // ROLLBACK
    } catch (rollbackErr) {
      console.warn("Error doing rollback (maybe transaction already aborted):", rollbackErr);
    }
    throw err;
  }
}

export async function getUserByPin(pin: string): Promise<any> {
  const db = await getDb();
  const hashed = await hashPin(pin);
  const users = await db.select("SELECT * FROM users WHERE pin = $1 AND deleted_at IS NULL", [hashed]);
  return (users as any[])[0] || null;
}

export async function getUsers(): Promise<any[]> {
  const db = await getDb();
  const users = await db.select("SELECT * FROM users WHERE deleted_at IS NULL");
  return users as any[];
}

export async function createUser(user: Omit<any, 'id'>, userId?: number): Promise<number> {
  const db = await getDb();
  const hashedPin = await hashPin(user.pin);
  // El PIN es la única forma de identificarse al entrar (no hay usuario/contraseña aparte),
  // así que dos empleados activos con el mismo PIN harían imposible saber quién inició sesión.
  // Sí se puede reutilizar el PIN de un empleado ya eliminado (deleted_at IS NOT NULL).
  const conflict: any[] = await db.select("SELECT id FROM users WHERE pin = $1 AND deleted_at IS NULL", [hashedPin]);
  if (conflict.length > 0) {
    throw new Error("Ese PIN ya lo está usando otro empleado activo. Elige un PIN distinto.");
  }
  const result = await db.execute(
    "INSERT INTO users (name, pin, role, permissions, is_master, uuid_global) VALUES ($1, $2, $3, $4, $5, hex(randomblob(16)))",
    [user.name, hashedPin, user.role, user.permissions || null, user.is_master ? 1 : 0]
  );
  if (userId) {
    await logAction(userId, "EMPLEADO CREADO", `Se creó el empleado ${user.name} con rol ${user.role}`);
  }
  return Number(result.lastInsertId);
}

export async function updateUser(id: number, user: Partial<any>, userId?: number): Promise<void> {
  const db = await getDb();
  const hashedPin = await hashPin(user.pin);
  const conflict: any[] = await db.select("SELECT id FROM users WHERE pin = $1 AND deleted_at IS NULL AND id != $2", [hashedPin, id]);
  if (conflict.length > 0) {
    throw new Error("Ese PIN ya lo está usando otro empleado activo. Elige un PIN distinto.");
  }
  await db.execute(
    "UPDATE users SET name = $1, pin = $2, role = $3, permissions = $4, is_master = $5 WHERE id = $6",
    [user.name, hashedPin, user.role, user.permissions || null, user.is_master ? 1 : 0, id]
  );
  if (userId) {
    await logAction(userId, "EMPLEADO ACTUALIZADO", `Se modificó el empleado con ID ${id} (${user.name})`);
  }
}

export async function deleteUser(id: number, userId?: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1",
    [id]
  );
  if (userId) {
    await logAction(userId, "EMPLEADO ELIMINADO", `Se eliminó (lógicamente) el empleado con ID ${id}`);
  }
}

// El fallback "cashbox_id IS NULL" cubre el turno legado que pudo haber quedado abierto
// justo en el momento en que la instalación recibió la migración multi-caja.
export async function getCurrentShift(cashboxId?: number): Promise<any> {
  const db = await getDb();
  // Se incluye warehouse_id/default_customer_id resueltos (turno -> caja -> sucursal) para que
  // App.tsx pueda cargar el catálogo con el stock del almacén correcto sin una consulta aparte.
  const baseQuery = `
    SELECT sh.*, b.warehouse_id, cb.default_customer_id
    FROM shifts sh
    LEFT JOIN cashboxes cb ON sh.cashbox_id = cb.id
    LEFT JOIN branches b ON cb.branch_id = b.id
    WHERE sh.status = 'open'
  `;
  const rows = cashboxId
    ? await db.select(baseQuery + " AND (sh.cashbox_id = $1 OR sh.cashbox_id IS NULL) ORDER BY sh.id DESC LIMIT 1", [cashboxId])
    : await db.select(baseQuery + " ORDER BY sh.id DESC LIMIT 1");
  if ((rows as any[]).length > 0) return (rows as any[])[0];
  return null;
}

export async function openShift(initialAmount: number, userId: number | undefined, cashboxId: number): Promise<void> {
  const db = await getDb();
  const already = await getCurrentShift(cashboxId);
  if (already) throw new Error("Esta caja ya tiene un turno abierto");
  await db.execute(
    "INSERT INTO shifts (initial_amount, uuid_global, cashbox_id, user_id) VALUES ($1, hex(randomblob(16)), $2, $3)",
    [initialAmount, cashboxId, userId || null]
  );
  if (userId) {
    await logAction(userId, "APERTURA CAJA", `Caja abierta con fondo inicial de $${initialAmount.toFixed(2)}`);
  }
}

export async function closeShift(shiftId: number, expected: number, actual: number, userId?: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE shifts SET status = 'closed', end_time = CURRENT_TIMESTAMP, expected_amount = $1, actual_amount = $2 WHERE id = $3",
    [expected, actual, shiftId]
  );
  if (userId) {
    await logAction(userId, "CIERRE CAJA", `Caja cerrada. Esperado: $${expected.toFixed(2)}, Real: $${actual.toFixed(2)}`);
  }
}

export async function getShiftSales(shiftId: number): Promise<any[]> {
  const db = await getDb();
  return await db.select("SELECT * FROM sales WHERE shift_id = $1", [shiftId]);
}

export async function getNextFolio(): Promise<number> {
  const db = await getDb();
  const rows = await db.select("SELECT MAX(id) as lastId FROM sales");
  const lastId = (rows as any[])[0]?.lastId || 0;
  return Number(lastId) + 1;
}

export async function getKardexSales(searchTerm?: string, warehouseIds?: number[]): Promise<any[]> {
  const db = await getDb();
  let query = `
    SELECT s.id, s.total, s.created_at, s.status, u.name as cashier_name, s.shift_id, s.payment_method, s.cash_received, s.cash_change,
      s.subtotal, s.tax, s.courtesy_reason, s.courtesy_authorized_by, ua.name as courtesy_authorized_by_name,
      w.name as warehouse_name, s.requires_invoice, s.customer_id,
      c.name as customer_name, c.rfc as customer_rfc, c.email as customer_email, c.phone as customer_phone,
      c.postal_code as customer_postal_code, c.tax_regime as customer_tax_regime, c.cfdi_use as customer_cfdi_use
    FROM sales s
    LEFT JOIN users u ON s.user_id = u.id
    LEFT JOIN users ua ON s.courtesy_authorized_by = ua.id
    LEFT JOIN warehouses w ON s.warehouse_id = w.id
    LEFT JOIN customers c ON s.customer_id = c.id
  `;
  const conditions: string[] = [];
  const params: any[] = [];
  if (searchTerm && searchTerm.trim() !== "") {
    const term = `%${searchTerm.trim()}%`;
    params.push(term);
    conditions.push(`(s.id LIKE $${params.length} OR u.name LIKE $${params.length} OR CAST(s.total AS TEXT) LIKE $${params.length}
      OR s.id IN (SELECT si.sale_id FROM sale_items si JOIN products p ON si.product_id = p.id WHERE p.name LIKE $${params.length}))`);
  }
  if (warehouseIds && warehouseIds.length > 0) {
    const placeholders = warehouseIds.map(wid => { params.push(wid); return `$${params.length}`; }).join(',');
    conditions.push(`s.warehouse_id IN (${placeholders})`);
  }
  if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
  query += ` ORDER BY s.id DESC LIMIT 100`;
  const sales = await db.select(query, params);
  return sales as any[];
}

export async function getSalePayments(saleId: number): Promise<any[]> {
  const db = await getDb();
  return (await db.select(`
    SELECT sp.*, ci.name as bank_name
    FROM sale_payments sp
    LEFT JOIN card_institutions ci ON sp.bank_institution_id = ci.id
    WHERE sp.sale_id = $1
    ORDER BY sp.id
  `, [saleId])) as any[];
}

// Desglose de cobro por método para un turno — usado por el corte de caja. Consulta híbrida:
// para ventas 'cash'/'card' de ANTES de esta migración (turnos que ya estaban abiertos cuando
// se desplegó sale_payments) no hay filas en sale_payments, así que se cae de vuelta a
// sales.total/sales.payment_method para no perder esas ventas del efectivo esperado.
export async function getShiftPaymentBreakdown(shiftId: number): Promise<{
  cash: number; cardDebito: number; cardCredito: number; cortesiaTotal: number; cortesiaCount: number;
}> {
  const db = await getDb();
  const rows: any[] = await db.select(`
    SELECT s.id, s.total, s.payment_method,
      sp.method as sp_method, sp.amount as sp_amount, sp.card_type as sp_card_type,
      (SELECT COUNT(*) FROM sale_payments WHERE sale_id = s.id) as sp_count
    FROM sales s
    LEFT JOIN sale_payments sp ON sp.sale_id = s.id
    WHERE s.shift_id = $1
  `, [shiftId]);

  let cash = 0, cardDebito = 0, cardCredito = 0, cortesiaTotal = 0;
  const cortesiaSaleIds = new Set<number>();
  const legacySaleIds = new Set<number>();

  for (const r of rows) {
    if (r.payment_method === 'cortesia') {
      if (!cortesiaSaleIds.has(r.id)) { cortesiaTotal += Number(r.total) || 0; cortesiaSaleIds.add(r.id); }
      continue;
    }
    if (Number(r.sp_count) === 0) {
      // Venta anterior a sale_payments: no se puede desglosar, cae a la columna legacy.
      if (!legacySaleIds.has(r.id)) {
        legacySaleIds.add(r.id);
        if (r.payment_method === 'cash') cash += Number(r.total) || 0;
        // 'card' legacy no distinguía débito/crédito: se ignora del desglose por tipo,
        // ya se refleja en el total de ventas general.
      }
      continue;
    }
    if (r.sp_method === 'cash') cash += Number(r.sp_amount) || 0;
    else if (r.sp_method === 'card') {
      if (r.sp_card_type === 'credito') cardCredito += Number(r.sp_amount) || 0;
      else cardDebito += Number(r.sp_amount) || 0;
    }
  }

  return { cash, cardDebito, cardCredito, cortesiaTotal, cortesiaCount: cortesiaSaleIds.size };
}

export async function getSaleDetails(saleId: number): Promise<any[]> {
  const db = await getDb();
  const query = `
    SELECT si.quantity, si.price, p.name as product_name
    FROM sale_items si
    LEFT JOIN products p ON si.product_id = p.id
    WHERE si.sale_id = $1
  `;
  const items = await db.select(query, [saleId]);
  return items as any[];
}

// ==================== INGREDIENTES ====================

export async function getIngredients(): Promise<any[]> {
  const db = await getDb();
  return (await db.select("SELECT * FROM ingredients WHERE deleted_at IS NULL ORDER BY name")) as any[];
}

export async function createIngredient(i: any): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO ingredients (name, unit, stock, min_stock, cost_per_unit, uuid_global) VALUES ($1, $2, $3, $4, $5, hex(randomblob(16)))",
    [i.name, i.unit, i.stock || 0, i.min_stock || 0, i.cost_per_unit || 0]
  );
}

export async function updateIngredient(id: number, i: any): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE ingredients SET name=$1, unit=$2, min_stock=$3, cost_per_unit=$4, updated_at=CURRENT_TIMESTAMP WHERE id=$5",
    [i.name, i.unit, i.min_stock, i.cost_per_unit, id]
  );
}

export async function deleteIngredient(id: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE ingredients SET deleted_at=CURRENT_TIMESTAMP WHERE id=$1", [id]);
}

// ==================== ALMACENES ====================

export async function getWarehouses(): Promise<any[]> {
  const db = await getDb();
  return (await db.select("SELECT * FROM warehouses WHERE deleted_at IS NULL ORDER BY name")) as any[];
}

export async function createWarehouse(w: { name: string; address?: string; phone?: string }, userId?: number): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO warehouses (name, address, phone) VALUES ($1, $2, $3)",
    [w.name, w.address || null, w.phone || null]
  );
  if (userId) await logAction(userId, "ALMACÉN CREADO", `Se creó el almacén ${w.name}`);
  return Number(result.lastInsertId);
}

export async function updateWarehouse(id: number, w: { name: string; address?: string; phone?: string }, userId?: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE warehouses SET name=$1, address=$2, phone=$3 WHERE id=$4",
    [w.name, w.address || null, w.phone || null, id]
  );
  if (userId) await logAction(userId, "ALMACÉN ACTUALIZADO", `Se modificó el almacén con ID ${id} (${w.name})`);
}

export async function deleteWarehouse(id: number, userId?: number): Promise<void> {
  const db = await getDb();
  const branchUsing: any[] = await db.select("SELECT COUNT(*) as count FROM branches WHERE warehouse_id = $1 AND deleted_at IS NULL", [id]);
  if (Number(branchUsing[0]?.count) > 0) {
    throw new Error("No se puede eliminar un almacén asignado como almacén de venta de una sucursal");
  }
  const stockRows: any[] = await db.select("SELECT COALESCE(SUM(stock), 0) as total FROM warehouse_stock WHERE warehouse_id = $1", [id]);
  if (Number(stockRows[0]?.total) !== 0) {
    throw new Error("No se puede eliminar un almacén con existencias distintas de cero");
  }
  await db.execute("UPDATE warehouses SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
  if (userId) await logAction(userId, "ALMACÉN ELIMINADO", `Se eliminó (lógicamente) el almacén con ID ${id}`);
}

// ==================== INSTITUCIONES BANCARIAS (cobro con tarjeta) ====================

export async function getCardInstitutions(): Promise<any[]> {
  const db = await getDb();
  return (await db.select("SELECT * FROM card_institutions WHERE deleted_at IS NULL ORDER BY is_general DESC, name")) as any[];
}

export async function createCardInstitution(name: string, userId?: number): Promise<number> {
  const db = await getDb();
  const result = await db.execute("INSERT INTO card_institutions (name) VALUES ($1)", [name]);
  if (userId) await logAction(userId, "INSTITUCIÓN BANCARIA CREADA", `Se creó la institución ${name}`);
  return Number(result.lastInsertId);
}

export async function updateCardInstitution(id: number, name: string, userId?: number): Promise<void> {
  const db = await getDb();
  await db.execute("UPDATE card_institutions SET name=$1 WHERE id=$2", [name, id]);
  if (userId) await logAction(userId, "INSTITUCIÓN BANCARIA ACTUALIZADA", `Se modificó la institución con ID ${id} (${name})`);
}

export async function deleteCardInstitution(id: number, userId?: number): Promise<void> {
  const db = await getDb();
  const rows: any[] = await db.select("SELECT name, is_general FROM card_institutions WHERE id = $1", [id]);
  if (rows.length === 0) throw new Error("Institución no encontrada");
  if (Number(rows[0].is_general) === 1) {
    throw new Error("No se puede eliminar la institución 'General / Otro'");
  }
  await db.execute("UPDATE card_institutions SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
  if (userId) await logAction(userId, "INSTITUCIÓN BANCARIA ELIMINADA", `Se eliminó (lógicamente) la institución "${rows[0].name}"`);
}

// ==================== STOCK POR ALMACÉN ====================
// warehouse_stock es la única fuente de verdad de existencias desde la Fase 1 multi-almacén.
// products.stock / ingredients.stock quedan obsoletas (ver comentarios en initDb()).

export async function getWarehouseStock(warehouseId: number, itemType?: 'product' | 'ingredient'): Promise<any[]> {
  const db = await getDb();
  let query = `
    SELECT ws.*, CASE WHEN ws.item_type='product' THEN p.name WHEN ws.item_type='ingredient' THEN i.name END as item_name
    FROM warehouse_stock ws
    LEFT JOIN products p ON ws.item_type='product' AND ws.item_id=p.id
    LEFT JOIN ingredients i ON ws.item_type='ingredient' AND ws.item_id=i.id
    WHERE ws.warehouse_id = $1
  `;
  const params: any[] = [warehouseId];
  if (itemType) {
    query += " AND ws.item_type = $2";
    params.push(itemType);
  }
  return (await db.select(query, params)) as any[];
}

export async function getStockForItem(warehouseId: number, itemType: 'product' | 'ingredient', itemId: number): Promise<number> {
  const db = await getDb();
  const rows: any[] = await db.select(
    "SELECT stock FROM warehouse_stock WHERE warehouse_id = $1 AND item_type = $2 AND item_id = $3",
    [warehouseId, itemType, itemId]
  );
  return rows.length > 0 ? Number(rows[0].stock) || 0 : 0;
}

// El costo (products.cost / ingredients.cost_per_unit) es un atributo GLOBAL, no por almacén,
// así que el promedio ponderado de costo debe basarse en el stock total, no en el de un solo
// almacén — de lo contrario, con existencias en más de un almacén, el promedio queda sesgado.
export async function getTotalStock(itemType: 'product' | 'ingredient', itemId: number): Promise<number> {
  const db = await getDb();
  const rows: any[] = await db.select(
    "SELECT COALESCE(SUM(stock), 0) as total FROM warehouse_stock WHERE item_type = $1 AND item_id = $2",
    [itemType, itemId]
  );
  return Number(rows[0]?.total) || 0;
}

// Upsert atómico de una sola sentencia (INSERT ... ON CONFLICT DO UPDATE): evita el patrón
// leer-luego-escribir en dos pasos que causó el bug de conexiones cruzadas del pool ya
// corregido en el commit 9228393 ("remove dangerous manual transactions").
export async function adjustWarehouseStock(warehouseId: number, itemType: 'product' | 'ingredient', itemId: number, delta: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `INSERT INTO warehouse_stock (warehouse_id, item_type, item_id, stock, updated_at)
     VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
     ON CONFLICT(warehouse_id, item_type, item_id)
     DO UPDATE SET stock = stock + $4, updated_at = CURRENT_TIMESTAMP`,
    [warehouseId, itemType, itemId, delta]
  );
}

export async function getProductsWithStock(warehouseId: number): Promise<any[]> {
  const db = await getDb();
  return (await db.select(`
    SELECT p.*, COALESCE(ws.stock, 0) as stock
    FROM products p
    LEFT JOIN warehouse_stock ws ON ws.item_type = 'product' AND ws.item_id = p.id AND ws.warehouse_id = $1
    WHERE p.deleted_at IS NULL
  `, [warehouseId])) as any[];
}

export async function getIngredientsWithStock(warehouseId: number): Promise<any[]> {
  const db = await getDb();
  return (await db.select(`
    SELECT i.*, COALESCE(ws.stock, 0) as stock
    FROM ingredients i
    LEFT JOIN warehouse_stock ws ON ws.item_type = 'ingredient' AND ws.item_id = i.id AND ws.warehouse_id = $1
    WHERE i.deleted_at IS NULL
    ORDER BY i.name
  `, [warehouseId])) as any[];
}

// ==================== SUCURSALES ====================

export async function getBranches(): Promise<any[]> {
  const db = await getDb();
  return (await db.select(`
    SELECT b.*, w.name as warehouse_name FROM branches b
    LEFT JOIN warehouses w ON b.warehouse_id = w.id
    WHERE b.deleted_at IS NULL ORDER BY b.name
  `)) as any[];
}

interface BranchPayload {
  name: string; address?: string; phone?: string; email?: string; warehouse_id: number;
  raw_material_warehouse_id?: number; wip_warehouse_id?: number; finished_goods_warehouse_id?: number;
  transit_warehouse_id?: number; auto_confirm_production?: boolean;
}

export async function createBranch(b: BranchPayload, userId?: number): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO branches (name, address, phone, email, warehouse_id, raw_material_warehouse_id, wip_warehouse_id, finished_goods_warehouse_id, transit_warehouse_id, auto_confirm_production)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [b.name, b.address || null, b.phone || null, b.email || null, b.warehouse_id,
      b.raw_material_warehouse_id || null, b.wip_warehouse_id || null, b.finished_goods_warehouse_id || null,
      b.transit_warehouse_id || null, b.auto_confirm_production ? 1 : 0]
  );
  if (userId) await logAction(userId, "SUCURSAL CREADA", `Se creó la sucursal ${b.name}`);
  return Number(result.lastInsertId);
}

export async function updateBranch(id: number, b: BranchPayload, userId?: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    `UPDATE branches SET name=$1, address=$2, phone=$3, email=$4, warehouse_id=$5,
       raw_material_warehouse_id=$6, wip_warehouse_id=$7, finished_goods_warehouse_id=$8,
       transit_warehouse_id=$9, auto_confirm_production=$10
     WHERE id=$11`,
    [b.name, b.address || null, b.phone || null, b.email || null, b.warehouse_id,
      b.raw_material_warehouse_id || null, b.wip_warehouse_id || null, b.finished_goods_warehouse_id || null,
      b.transit_warehouse_id || null, b.auto_confirm_production ? 1 : 0, id]
  );
  if (userId) await logAction(userId, "SUCURSAL ACTUALIZADA", `Se modificó la sucursal con ID ${id} (${b.name})`);
}

export async function deleteBranch(id: number, userId?: number): Promise<void> {
  const db = await getDb();
  const activeCount: any[] = await db.select("SELECT COUNT(*) as count FROM branches WHERE deleted_at IS NULL");
  if (Number(activeCount[0]?.count) <= 1) {
    throw new Error("No se puede eliminar la única sucursal activa");
  }
  const cashboxCount: any[] = await db.select("SELECT COUNT(*) as count FROM cashboxes WHERE branch_id = $1 AND deleted_at IS NULL", [id]);
  if (Number(cashboxCount[0]?.count) > 0) {
    throw new Error("No se puede eliminar una sucursal con cajas activas");
  }
  await db.execute("UPDATE branches SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
  if (userId) await logAction(userId, "SUCURSAL ELIMINADA", `Se eliminó (lógicamente) la sucursal con ID ${id}`);
}

// ==================== CLIENTES ====================

export async function getCustomers(): Promise<any[]> {
  const db = await getDb();
  return (await db.select("SELECT * FROM customers WHERE deleted_at IS NULL ORDER BY is_default DESC, name")) as any[];
}

export interface CustomerPayload {
  name: string;
  email?: string;
  phone?: string;
  rfc?: string;
  postal_code?: string;
  tax_regime?: string;
  cfdi_use?: string;
}

export async function createCustomer(c: CustomerPayload, userId?: number): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO customers (name, email, phone, rfc, postal_code, tax_regime, cfdi_use) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [c.name, c.email || null, c.phone || null, c.rfc || null, c.postal_code || null, c.tax_regime || null, c.cfdi_use || null]
  );
  if (userId) await logAction(userId, "CLIENTE CREADO", `Se creó el cliente ${c.name}`);
  return Number(result.lastInsertId);
}

export async function updateCustomer(id: number, c: CustomerPayload, userId?: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE customers SET name=$1, email=$2, phone=$3, rfc=$4, postal_code=$5, tax_regime=$6, cfdi_use=$7 WHERE id=$8",
    [c.name, c.email || null, c.phone || null, c.rfc || null, c.postal_code || null, c.tax_regime || null, c.cfdi_use || null, id]
  );
  if (userId) await logAction(userId, "CLIENTE ACTUALIZADO", `Se modificó el cliente con ID ${id} (${c.name})`);
}

export async function deleteCustomer(id: number, userId?: number): Promise<void> {
  const db = await getDb();
  const rows: any[] = await db.select("SELECT is_default FROM customers WHERE id = $1", [id]);
  if (rows.length > 0 && Number(rows[0].is_default) === 1) {
    throw new Error("No se puede eliminar el cliente por defecto (Público en General)");
  }
  await db.execute("UPDATE customers SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
  if (userId) await logAction(userId, "CLIENTE ELIMINADO", `Se eliminó (lógicamente) el cliente con ID ${id}`);
}

// ==================== CAJAS Y ASIGNACIÓN DE CAJEROS ====================

export async function getCashboxes(branchId?: number): Promise<any[]> {
  const db = await getDb();
  let query = `
    SELECT c.*, b.name as branch_name, cu.name as default_customer_name
    FROM cashboxes c
    LEFT JOIN branches b ON c.branch_id = b.id
    LEFT JOIN customers cu ON c.default_customer_id = cu.id
    WHERE c.deleted_at IS NULL
  `;
  const params: any[] = [];
  if (branchId) {
    query += " AND c.branch_id = $1";
    params.push(branchId);
  }
  query += " ORDER BY b.name, c.name";
  return (await db.select(query, params)) as any[];
}

export async function createCashbox(cb: { name: string; branch_id: number; default_customer_id?: number }, userId?: number): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    "INSERT INTO cashboxes (name, branch_id, default_customer_id) VALUES ($1, $2, $3)",
    [cb.name, cb.branch_id, cb.default_customer_id || null]
  );
  if (userId) await logAction(userId, "CAJA CREADA", `Se creó la caja ${cb.name}`);
  return Number(result.lastInsertId);
}

export async function updateCashbox(id: number, cb: { name: string; branch_id: number; default_customer_id?: number }, userId?: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "UPDATE cashboxes SET name=$1, branch_id=$2, default_customer_id=$3 WHERE id=$4",
    [cb.name, cb.branch_id, cb.default_customer_id || null, id]
  );
  if (userId) await logAction(userId, "CAJA ACTUALIZADA", `Se modificó la caja con ID ${id} (${cb.name})`);
}

export async function deleteCashbox(id: number, userId?: number): Promise<void> {
  const db = await getDb();
  const openShiftRows: any[] = await db.select("SELECT COUNT(*) as count FROM shifts WHERE cashbox_id = $1 AND status = 'open'", [id]);
  if (Number(openShiftRows[0]?.count) > 0) {
    throw new Error("No se puede eliminar una caja con un turno abierto");
  }
  await db.execute("UPDATE cashboxes SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
  if (userId) await logAction(userId, "CAJA ELIMINADA", `Se eliminó (lógicamente) la caja con ID ${id}`);
}

export async function getUserCashboxes(userId: number): Promise<any[]> {
  const db = await getDb();
  return (await db.select(`
    SELECT c.* FROM cashboxes c
    JOIN cashier_cashboxes cc ON cc.cashbox_id = c.id
    WHERE cc.user_id = $1 AND c.deleted_at IS NULL
    ORDER BY c.name
  `, [userId])) as any[];
}

export async function getCashboxUsers(cashboxId: number): Promise<any[]> {
  const db = await getDb();
  return (await db.select(`
    SELECT u.id, u.name FROM users u
    JOIN cashier_cashboxes cc ON cc.user_id = u.id
    WHERE cc.cashbox_id = $1 AND u.deleted_at IS NULL
    ORDER BY u.name
  `, [cashboxId])) as any[];
}

export async function setCashboxUsers(cashboxId: number, userIds: number[], userId?: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM cashier_cashboxes WHERE cashbox_id = $1", [cashboxId]);
  for (const uid of userIds) {
    await db.execute("INSERT INTO cashier_cashboxes (user_id, cashbox_id) VALUES ($1, $2)", [uid, cashboxId]);
  }
  if (userId) {
    await logAction(userId, "ASIGNACIÓN DE CAJA ACTUALIZADA", `Caja ID ${cashboxId}: ${userIds.length} cajero(s) asignado(s)`);
  }
}

// Igual que setCashboxUsers pero desde el lado del cajero (usado en Gestión de Cajeros,
// espejo del control que ya existe en Configuración > Ventas > Cajas).
export async function setUserCashboxes(targetUserId: number, cashboxIds: number[], userId?: number): Promise<void> {
  const db = await getDb();
  await db.execute("DELETE FROM cashier_cashboxes WHERE user_id = $1", [targetUserId]);
  for (const cbId of cashboxIds) {
    await db.execute("INSERT INTO cashier_cashboxes (user_id, cashbox_id) VALUES ($1, $2)", [targetUserId, cbId]);
  }
  if (userId) {
    await logAction(userId, "ASIGNACIÓN DE CAJA ACTUALIZADA", `Cajero ID ${targetUserId}: ${cashboxIds.length} caja(s) asignada(s)`);
  }
}

// ==================== MOVIMIENTOS DE INVENTARIO ====================

export async function addInventoryMovement(itemType: 'product' | 'ingredient', itemId: number, movementType: 'entry' | 'exit', quantity: number, reason: string, warehouseId: number, userId?: number): Promise<void> {
  const db = await getDb();
  const delta = movementType === 'entry' ? quantity : -quantity;

  await db.execute(
    "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id, warehouse_id) VALUES ($1, $2, $3, $4, $5, $6, $7)",
    [itemType, itemId, movementType, quantity, reason, userId || null, warehouseId]
  );
  await adjustWarehouseStock(warehouseId, itemType, itemId, delta);
}

export async function getInventoryMovements(itemType?: string, itemId?: number, warehouseId?: number): Promise<any[]> {
  const db = await getDb();
  let query = `
    SELECT im.*, CASE WHEN im.item_type='product' THEN p.name WHEN im.item_type='ingredient' THEN i.name END as item_name,
      w.name as warehouse_name
    FROM inventory_movements im
    LEFT JOIN products p ON im.item_type='product' AND im.item_id=p.id
    LEFT JOIN ingredients i ON im.item_type='ingredient' AND im.item_id=i.id
    LEFT JOIN warehouses w ON im.warehouse_id = w.id
  `;
  const conditions: string[] = [];
  const params: any[] = [];
  if (itemType && itemId) {
    params.push(itemType, itemId);
    conditions.push(`im.item_type=$${params.length - 1} AND im.item_id=$${params.length}`);
  }
  if (warehouseId) {
    params.push(warehouseId);
    conditions.push(`im.warehouse_id=$${params.length}`);
  }
  if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY im.created_at DESC LIMIT 200";
  return (await db.select(query, params)) as any[];
}

// ==================== AJUSTES DE INVENTARIO (ENTAJ / SALAJ) ====================
// Las funciones "legacy" de abajo (getAdjustments/cancelAdjustment) siguen operando sobre
// la tabla "adjustments" original de un solo producto por folio, para no perder el historial
// ya generado. Las entradas/salidas nuevas se crean como documentos multi-producto.

export async function getNextAdjustmentDocFolio(type: 'ENTAJ' | 'SALAJ'): Promise<string> {
  const db = await getDb();
  const [legacyRows, docRows] = await Promise.all([
    db.select("SELECT folio FROM adjustments WHERE type = $1", [type]) as Promise<any[]>,
    db.select("SELECT folio FROM adjustment_documents WHERE type = $1", [type]) as Promise<any[]>,
  ]);
  let next = 1;
  for (const row of [...legacyRows, ...docRows]) {
    const match = String(row.folio).match(/(\d+)$/);
    if (match) next = Math.max(next, parseInt(match[1], 10) + 1);
  }
  return `${type}-${String(next).padStart(6, '0')}`;
}

export async function createAdjustmentDocument(
  params: {
    type: 'ENTAJ' | 'SALAJ';
    items: { productId: number; quantity: number; unitCost: number }[];
    notes?: string;
    warehouseId: number;
  },
  userId?: number
): Promise<string> {
  const db = await getDb();
  const { type, items, notes, warehouseId } = params;
  if (items.length === 0) throw new Error("Agrega al menos un producto");
  if (!warehouseId) throw new Error("Selecciona un almacén");

  const folio = await getNextAdjustmentDocFolio(type);
  const lines: string[] = [];

  // await db.execute("BEGIN");
  try {
    const docResult = await db.execute(
      `INSERT INTO adjustment_documents (folio, type, status, notes, user_id, warehouse_id) VALUES ($1, $2, 'Realizada', $3, $4, $5)`,
      [folio, type, notes || null, userId || null, warehouseId]
    );
    const documentId = docResult.lastInsertId;

    for (const item of items) {
      const products: any[] = await db.select("SELECT * FROM products WHERE id = $1", [item.productId]);
      if (products.length === 0) continue;
      const product = products[0];
      // previousStock/newStock documentan el efecto en ESTE almacén (para el detalle del
      // documento); el promedio de costo (global) se pondera contra el stock TOTAL del
      // producto en todos los almacenes, no solo este, para no sesgar el costo.
      const previousStock = await getStockForItem(warehouseId, 'product', item.productId);
      const previousCost = Number(product.cost) || 0;
      const globalPreviousStock = await getTotalStock('product', item.productId);
      let newStock: number, newAvgCost: number, delta: number;
      if (type === 'ENTAJ') {
        newStock = previousStock + item.quantity;
        const globalNewStock = globalPreviousStock + item.quantity;
        newAvgCost = globalNewStock > 0
          ? ((globalPreviousStock * previousCost) + (item.quantity * item.unitCost)) / globalNewStock
          : previousCost;
        delta = item.quantity;
      } else {
        newStock = previousStock - item.quantity;
        newAvgCost = previousCost;
        delta = -item.quantity;
      }

      await db.execute(
        `INSERT INTO adjustment_document_items
          (document_id, product_id, quantity, unit_cost, previous_stock, new_stock, previous_cost, new_avg_cost)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [documentId, item.productId, item.quantity, item.unitCost, previousStock, newStock, previousCost, newAvgCost]
      );
      await adjustWarehouseStock(warehouseId, 'product', item.productId, delta);
      await db.execute(
        "UPDATE products SET cost = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [newAvgCost, item.productId]
      );
      lines.push(`${product.name} ${type === 'ENTAJ' ? '+' : '-'}${item.quantity}`);
    }
    // await db.execute("COMMIT");
  } catch (err) {
    // ROLLBACK
    throw err;
  }

  if (userId) {
    await logAction(
      userId,
      type === 'ENTAJ' ? "AJUSTE ENTRADA (ENTAJ)" : "AJUSTE SALIDA (SALAJ)",
      `Folio ${folio}: ${lines.join(', ')}`
    );
  }

  return folio;
}

export async function cancelAdjustmentDocument(id: number, userId?: number): Promise<void> {
  const db = await getDb();
  const rows: any[] = await db.select("SELECT * FROM adjustment_documents WHERE id = $1", [id]);
  if (rows.length === 0) throw new Error("Documento no encontrado");
  const doc = rows[0];
  if (doc.status === 'Cancelada') throw new Error("Este documento ya fue cancelado");

  const items: any[] = await db.select("SELECT * FROM adjustment_document_items WHERE document_id = $1", [id]);

  // await db.execute("BEGIN");
  try {
    for (const item of items) {
      // Se revierte el delta exacto que aplicó este documento (new_stock - previous_stock), no
      // un valor absoluto: warehouse_stock es compartido y pudo haberse tocado después por otra
      // operación (venta, otro ajuste) sobre el mismo producto/almacén.
      if (doc.warehouse_id) {
        const appliedDelta = Number(item.new_stock) - Number(item.previous_stock);
        await adjustWarehouseStock(doc.warehouse_id, 'product', item.product_id, -appliedDelta);
      }
      await db.execute(
        "UPDATE products SET cost = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [item.previous_cost, item.product_id]
      );
    }
    await db.execute("UPDATE adjustment_documents SET status = 'Cancelada' WHERE id = $1", [id]);
    // await db.execute("COMMIT");
  } catch (err) {
    // ROLLBACK
    throw err;
  }

  if (userId) {
    await logAction(userId, "AJUSTE CANCELADO", `Se canceló el documento ${doc.folio}, revirtiendo ${items.length} producto(s)`);
  }
}

export async function getAdjustmentDocuments(warehouseIds?: number[]): Promise<any[]> {
  const db = await getDb();
  let query = `
    SELECT d.*, u.name as user_name, w.name as warehouse_name FROM adjustment_documents d
    LEFT JOIN users u ON d.user_id = u.id
    LEFT JOIN warehouses w ON d.warehouse_id = w.id
  `;
  const params: any[] = [];
  if (warehouseIds && warehouseIds.length > 0) {
    const placeholders = warehouseIds.map(wid => { params.push(wid); return `$${params.length}`; }).join(',');
    query += ` WHERE d.warehouse_id IN (${placeholders})`;
  }
  query += " ORDER BY d.id DESC LIMIT 300";
  const docs: any[] = await db.select(query, params);
  const items: any[] = await db.select(`
    SELECT i.*, p.name as product_name, p.img as product_img FROM adjustment_document_items i
    LEFT JOIN products p ON i.product_id = p.id
  `);
  return docs.map(d => ({ ...d, items: items.filter(i => i.document_id === d.id) }));
}

export async function cancelAdjustment(id: number, userId?: number): Promise<void> {
  const db = await getDb();
  const rows: any[] = await db.select("SELECT * FROM adjustments WHERE id = $1", [id]);
  if (rows.length === 0) throw new Error("Ajuste no encontrado");
  const adj = rows[0];
  if (adj.status === 'Cancelada') throw new Error("Este ajuste ya fue cancelado");

  // Los ajustes legacy son anteriores a multi-almacén: todo su stock heredado quedó en el
  // almacén por defecto (el más antiguo) durante la migración, así que se revierten ahí.
  const defaultWh: any[] = await db.select("SELECT id FROM warehouses ORDER BY id ASC LIMIT 1");
  const warehouseId = defaultWh[0]?.id;
  if (warehouseId) {
    const appliedDelta = Number(adj.new_stock) - Number(adj.previous_stock);
    await adjustWarehouseStock(warehouseId, 'product', adj.product_id, -appliedDelta);
  }
  await db.execute(
    "UPDATE products SET cost = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
    [adj.previous_cost, adj.product_id]
  );

  await db.execute("UPDATE adjustments SET status = 'Cancelada' WHERE id = $1", [id]);

  if (userId) {
    await logAction(
      userId,
      "AJUSTE CANCELADO",
      `Se canceló el ajuste ${adj.folio}, revirtiendo stock a ${adj.previous_stock} y costo a $${Number(adj.previous_cost).toFixed(2)}`
    );
  }
}

export async function getAdjustments(): Promise<any[]> {
  const db = await getDb();
  const query = `
    SELECT a.*, p.name as product_name, p.img as product_img, u.name as user_name
    FROM adjustments a
    LEFT JOIN products p ON a.product_id = p.id
    LEFT JOIN users u ON a.user_id = u.id
    ORDER BY a.id DESC
    LIMIT 300
  `;
  return await db.select(query);
}

// ==================== RECETAS ====================

export async function getRecipes(): Promise<any[]> {
  const db = await getDb();
  return (await db.select(`
    SELECT r.*, p.name as product_name, p.img as product_img
    FROM recipes r
    JOIN products p ON r.product_id = p.id
    WHERE p.deleted_at IS NULL
    ORDER BY p.name
  `)) as any[];
}

export async function getRecipeItems(recipeId: number): Promise<any[]> {
  const db = await getDb();
  return (await db.select(`
    SELECT ri.*, i.name as ingredient_name, i.unit as ingredient_unit, (i.deleted_at IS NOT NULL) as is_deleted
    FROM recipe_items ri
    JOIN ingredients i ON ri.ingredient_id = i.id
    WHERE ri.recipe_id = $1
  `, [recipeId])) as any[];
}

export async function saveRecipe(productId: number, yieldQty: number, notes: string, items: { ingredient_id: number, quantity: number }[], userId?: number): Promise<void> {
  const db = await getDb();
  let recipeId: number;
  let actionDetails = "";

  // await db.execute("BEGIN");
  try {
    // Upsert recipe
    const existing: any[] = await db.select("SELECT id FROM recipes WHERE product_id=$1", [productId]);
    if (existing.length > 0) {
      recipeId = existing[0].id;
      await db.execute("UPDATE recipes SET yield_qty=$1, notes=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$3", [yieldQty, notes, recipeId]);
      await db.execute("DELETE FROM recipe_items WHERE recipe_id=$1", [recipeId]);
      actionDetails = `Actualizada receta ID ${recipeId} (Rendimiento: ${yieldQty} piezas) para producto ID ${productId}`;
    } else {
      const result = await db.execute("INSERT INTO recipes (product_id, yield_qty, notes) VALUES ($1, $2, $3)", [productId, yieldQty, notes]);
      recipeId = result.lastInsertId as number;
      actionDetails = `Creada nueva receta ID ${recipeId} (Rendimiento: ${yieldQty} piezas) para producto ID ${productId}`;
    }
    for (const item of items) {
      await db.execute("INSERT INTO recipe_items (recipe_id, ingredient_id, quantity) VALUES ($1, $2, $3)", [recipeId, item.ingredient_id, item.quantity]);
    }
    // await db.execute("COMMIT");
  } catch (err) {
    // ROLLBACK
    throw err;
  }

  if (userId) {
    await logAction(userId, "RECETA GUARDADA", actionDetails);
  }
}

export async function getRecipeUsageCount(recipeId: number): Promise<number> {
  const db = await getDb();
  const rows: any[] = await db.select("SELECT COUNT(*) as count FROM production_document_items WHERE recipe_id = $1", [recipeId]);
  return Number(rows[0]?.count) || 0;
}

export async function deleteRecipe(recipeId: number, userId?: number): Promise<void> {
  const db = await getDb();
  // await db.execute("BEGIN");
  try {
    await db.execute("DELETE FROM recipe_items WHERE recipe_id=$1", [recipeId]);
    await db.execute("DELETE FROM recipes WHERE id=$1", [recipeId]);
    // await db.execute("COMMIT");
  } catch (err) {
    // ROLLBACK
    throw err;
  }
  if (userId) {
    await logAction(userId, "RECETA ELIMINADA", `Eliminada receta ID ${recipeId}`);
  }
}

// ==================== ENTRADAS DE PRODUCCIÓN CON FOLIO (ENTOP) ====================

// Folio literal de la orden ("Producción N") — única excepción a la convención
// PREFIJO-NNNNNN del resto de documentos, por pedido explícito del dueño del negocio.
export async function getNextProductionOrderLabel(): Promise<string> {
  const db = await getDb();
  const rows: any[] = await db.select("SELECT folio FROM production_documents");
  let next = 1;
  for (const row of rows) {
    const match = String(row.folio).match(/(\d+)$/);
    if (match) next = Math.max(next, parseInt(match[1], 10) + 1);
  }
  return `Producción ${next}`;
}

// TRASP (traspaso general) y TRINS (traspaso de insumos de producción) comparten tabla,
// cada tipo cuenta su propia serie de folios.
export async function getNextTransferFolio(type: 'TRASP' | 'TRINS'): Promise<string> {
  const db = await getDb();
  const rows: any[] = await db.select("SELECT folio FROM warehouse_transfers WHERE type = $1", [type]);
  let next = 1;
  for (const row of rows) {
    const match = String(row.folio).match(/(\d+)$/);
    if (match) next = Math.max(next, parseInt(match[1], 10) + 1);
  }
  return `${type}-${String(next).padStart(6, '0')}`;
}

// SALPROD (consumo de insumos) vive como una segunda identidad sobre la misma fila de
// production_receipts que ya generó su folio ENTOP (recepción de producto terminado).
export async function getNextSalprodFolio(): Promise<string> {
  const db = await getDb();
  const rows: any[] = await db.select("SELECT salprod_folio FROM production_receipts WHERE salprod_folio IS NOT NULL");
  let next = 1;
  for (const row of rows) {
    const match = String(row.salprod_folio).match(/(\d+)$/);
    if (match) next = Math.max(next, parseInt(match[1], 10) + 1);
  }
  return `SALPROD-${String(next).padStart(6, '0')}`;
}

// Crea la orden: solo reserva QUÉ se va a producir (líneas + snapshot de insumos
// necesarios por receta). No mueve stock — eso ocurre por separado con un Traspaso de
// Insumos (TRINS, ver createInsumoTransfer) que hay que crear y confirmar aparte, salvo
// que la sucursal tenga encendida la bandera de traspasos/recepción automáticos.
export async function createProductionOrder(
  params: { branchId: number; items: { recipeId: number; batches: number }[]; notes?: string },
  userId?: number
): Promise<string> {
  const db = await getDb();
  const { branchId, items, notes } = params;
  if (items.length === 0) throw new Error("Agrega al menos una receta");

  const branches: any[] = await db.select("SELECT * FROM branches WHERE id = $1", [branchId]);
  if (branches.length === 0) throw new Error("Sucursal no encontrada");
  const branch = branches[0];
  const rawMaterialWarehouseId = branch.raw_material_warehouse_id;
  const wipWarehouseId = branch.wip_warehouse_id;
  if (!rawMaterialWarehouseId || !wipWarehouseId) {
    throw new Error("Esta sucursal no tiene configurado su almacén de materia prima y/o almacén en proceso (Configuración > Producción)");
  }
  const autoConfirm = Number(branch.auto_confirm_production) === 1;
  if (autoConfirm && !branch.transit_warehouse_id) {
    throw new Error("Esta sucursal tiene activados los traspasos automáticos pero no tiene configurado su almacén de Mercancía en Tránsito (Configuración > Producción)");
  }

  const folio = await getNextProductionOrderLabel();
  const lines: string[] = [];

  const docResult = await db.execute(
    `INSERT INTO production_documents (folio, status, notes, user_id, source_warehouse_id, wip_warehouse_id, dest_warehouse_id, branch_id)
     VALUES ($1, 'Abierta', $2, $3, $4, $5, $6, $7)`,
    [folio, notes || null, userId || null, rawMaterialWarehouseId, wipWarehouseId, branch.finished_goods_warehouse_id || null, branchId]
  );
  const documentId = docResult.lastInsertId;

  for (const { recipeId, batches } of items) {
    const recipes: any[] = await db.select("SELECT * FROM recipes WHERE id=$1", [recipeId]);
    if (recipes.length === 0) continue;
    const recipe = recipes[0];

    const recipeItems: any[] = await db.select(
      `SELECT ri.*, i.cost_per_unit FROM recipe_items ri JOIN ingredients i ON ri.ingredient_id = i.id WHERE ri.recipe_id = $1`,
      [recipeId]
    );

    const products: any[] = await db.select("SELECT * FROM products WHERE id=$1", [recipe.product_id]);
    if (products.length === 0) continue;
    const product = products[0];

    const totalYield = Number(recipe.yield_qty) * batches;
    // La orden no impacta producto terminado: previous_stock/new_stock y
    // previous_cost/new_avg_cost quedan como snapshot sin cambio (columnas NOT NULL
    // heredadas de Fase 1). El impacto real ocurre en receiveProductionUnits.
    const currentGlobalStock = await getTotalStock('product', recipe.product_id);
    const currentCost = Number(product.cost) || 0;

    const itemResult = await db.execute(
      `INSERT INTO production_document_items
        (document_id, recipe_id, product_id, batches, yield_qty, received_qty, previous_stock, new_stock, previous_cost, new_avg_cost)
       VALUES ($1, $2, $3, $4, $5, 0, $6, $6, $7, $7)`,
      [documentId, recipeId, recipe.product_id, batches, totalYield, currentGlobalStock, currentCost]
    );
    const documentItemId = itemResult.lastInsertId;

    // Snapshot de insumos necesarios — sin mover stock todavía; lo lee createInsumoTransfer.
    for (const ri of recipeItems) {
      const qty = Number(ri.quantity) * batches;
      await db.execute(
        `INSERT INTO production_document_ingredients (document_item_id, ingredient_id, quantity, unit_cost) VALUES ($1, $2, $3, $4)`,
        [documentItemId, ri.ingredient_id, qty, Number(ri.cost_per_unit) || 0]
      );
    }

    lines.push(`${product.name} x${totalYield} pza(s) pendiente(s)`);
  }

  if (userId) {
    await logAction(userId, "ORDEN DE PRODUCCIÓN CREADA", `Folio ${folio}: ${lines.join(', ')}`);
  }

  if (autoConfirm) {
    const transferFolio = await createInsumoTransfer({ productionDocumentId: Number(documentId) }, userId);
    const transferRows: any[] = await db.select("SELECT id FROM warehouse_transfers WHERE folio = $1", [transferFolio]);
    if (transferRows.length > 0) {
      await confirmWarehouseTransfer(Number(transferRows[0].id), userId);
    }
  }

  return folio;
}

// ==================== TRASPASOS (TRASP general / TRINS insumos de producción) ====================

// TRINS: mueve los insumos ya reservados por una orden (snapshot en production_document_ingredients)
// de Materia Prima -> Mercancía en Tránsito de la sucursal. La orden sigue "Abierta" hasta que
// este traspaso se confirme (confirmWarehouseTransfer), momento en el que pasa a "En Proceso".
export async function createInsumoTransfer(
  params: { productionDocumentId: number },
  userId?: number
): Promise<string> {
  const db = await getDb();
  const { productionDocumentId } = params;

  const orders: any[] = await db.select("SELECT * FROM production_documents WHERE id = $1", [productionDocumentId]);
  if (orders.length === 0) throw new Error("Orden de producción no encontrada");
  const order = orders[0];
  if (order.status !== 'Abierta') {
    throw new Error(`Solo se puede generar el traspaso de insumos de una orden 'Abierta' (esta está '${order.status}')`);
  }

  const branches: any[] = await db.select("SELECT * FROM branches WHERE id = $1", [order.branch_id]);
  if (branches.length === 0) throw new Error("Sucursal de la orden no encontrada");
  const branch = branches[0];
  const rawMaterialWarehouseId = branch.raw_material_warehouse_id;
  const wipWarehouseId = branch.wip_warehouse_id;
  const transitWarehouseId = branch.transit_warehouse_id;
  if (!rawMaterialWarehouseId || !wipWarehouseId || !transitWarehouseId) {
    throw new Error("Esta sucursal no tiene configurados sus 3 almacenes de producción, incluyendo Mercancía en Tránsito (Configuración > Producción)");
  }

  // Agrega insumos de todas las líneas de la orden — costo ponderado por si el mismo insumo
  // aparece en más de una línea/receta con costos ligeramente distintos.
  const aggregated: any[] = await db.select(`
    SELECT pdi.ingredient_id,
      SUM(pdi.quantity) as quantity,
      SUM(pdi.quantity * pdi.unit_cost) / SUM(pdi.quantity) as unit_cost
    FROM production_document_ingredients pdi
    JOIN production_document_items items ON pdi.document_item_id = items.id
    WHERE items.document_id = $1
    GROUP BY pdi.ingredient_id
  `, [productionDocumentId]);
  if (aggregated.length === 0) throw new Error("Esta orden no tiene insumos configurados (revisa la receta de los productos programados)");

  // Ya existe un TRINS activo para esta orden (índice único parcial de la tabla) — mensaje
  // amigable en vez del error crudo de SQLite si alguien lo intenta dos veces.
  const existing: any[] = await db.select(
    "SELECT id FROM warehouse_transfers WHERE production_document_id = $1 AND type = 'TRINS' AND status != 'Cancelado'",
    [productionDocumentId]
  );
  if (existing.length > 0) throw new Error("Esta orden ya tiene un traspaso de insumos activo");

  const folio = await getNextTransferFolio('TRINS');
  const transferResult = await db.execute(
    `INSERT INTO warehouse_transfers (type, folio, status, source_warehouse_id, dest_warehouse_id, transit_warehouse_id, production_document_id, branch_id, user_id)
     VALUES ('TRINS', $1, 'Pendiente', $2, $3, $4, $5, $6, $7)`,
    [folio, rawMaterialWarehouseId, wipWarehouseId, transitWarehouseId, productionDocumentId, order.branch_id, userId || null]
  );
  const transferId = transferResult.lastInsertId;

  for (const ing of aggregated) {
    const qty = Number(ing.quantity);
    const unitCost = Number(ing.unit_cost) || 0;
    await db.execute(
      "INSERT INTO warehouse_transfer_items (transfer_id, item_type, item_id, quantity, unit_cost) VALUES ($1, 'ingredient', $2, $3, $4)",
      [transferId, ing.ingredient_id, qty, unitCost]
    );
    await adjustWarehouseStock(rawMaterialWarehouseId, 'ingredient', ing.ingredient_id, -qty);
    await db.execute(
      "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id, warehouse_id) VALUES ('ingredient', $1, 'exit', $2, $3, $4, $5)",
      [ing.ingredient_id, qty, `Traspaso de insumos ${folio} (orden ${order.folio})`, userId || null, rawMaterialWarehouseId]
    );
    await adjustWarehouseStock(transitWarehouseId, 'ingredient', ing.ingredient_id, qty);
    await db.execute(
      "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id, warehouse_id) VALUES ('ingredient', $1, 'entry', $2, $3, $4, $5)",
      [ing.ingredient_id, qty, `Traspaso de insumos ${folio} (orden ${order.folio}, en tránsito)`, userId || null, transitWarehouseId]
    );
  }

  if (userId) {
    await logAction(userId, "TRASPASO DE INSUMOS CREADO (TRINS)", `Folio ${folio} para la orden ${order.folio}`);
  }

  return folio;
}

// TRASP: traspaso genérico entre cualquier par de almacenes (insumos o producto terminado),
// no ligado a ninguna orden de producción. Usa el almacén de tránsito global (no por sucursal),
// porque puede mover mercancía entre almacenes de sucursales distintas.
export async function createGeneralTransfer(
  params: {
    sourceWarehouseId: number; destWarehouseId: number;
    items: { itemType: 'product' | 'ingredient'; itemId: number; quantity: number }[];
    notes?: string;
  },
  userId?: number
): Promise<string> {
  const db = await getDb();
  const { sourceWarehouseId, destWarehouseId, items, notes } = params;
  if (sourceWarehouseId === destWarehouseId) throw new Error("El almacén de origen y destino no pueden ser el mismo");
  if (items.length === 0) throw new Error("Agrega al menos un producto o insumo al traspaso");

  const settings = await getSettings();
  const transitWarehouseId = Number(settings.trasp_transit_warehouse_id) || 0;
  if (!transitWarehouseId) {
    throw new Error("No hay un almacén de tránsito configurado para traspasos generales (Configuración > Inventario)");
  }

  const folio = await getNextTransferFolio('TRASP');
  const transferResult = await db.execute(
    `INSERT INTO warehouse_transfers (type, folio, status, source_warehouse_id, dest_warehouse_id, transit_warehouse_id, notes, user_id)
     VALUES ('TRASP', $1, 'Pendiente', $2, $3, $4, $5, $6)`,
    [folio, sourceWarehouseId, destWarehouseId, transitWarehouseId, notes || null, userId || null]
  );
  const transferId = transferResult.lastInsertId;

  for (const item of items) {
    if (!item.quantity || item.quantity <= 0) continue;
    await db.execute(
      "INSERT INTO warehouse_transfer_items (transfer_id, item_type, item_id, quantity) VALUES ($1, $2, $3, $4)",
      [transferId, item.itemType, item.itemId, item.quantity]
    );
    await adjustWarehouseStock(sourceWarehouseId, item.itemType, item.itemId, -item.quantity);
    await db.execute(
      "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id, warehouse_id) VALUES ($1, $2, 'exit', $3, $4, $5, $6)",
      [item.itemType, item.itemId, item.quantity, `Traspaso ${folio}`, userId || null, sourceWarehouseId]
    );
    await adjustWarehouseStock(transitWarehouseId, item.itemType, item.itemId, item.quantity);
    await db.execute(
      "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id, warehouse_id) VALUES ($1, $2, 'entry', $3, $4, $5, $6)",
      [item.itemType, item.itemId, item.quantity, `Traspaso ${folio} (en tránsito)`, userId || null, transitWarehouseId]
    );
  }

  if (userId) {
    await logAction(userId, "TRASPASO CREADO (TRASP)", `Folio ${folio}: ${sourceWarehouseId} → ${destWarehouseId}`);
  }

  return folio;
}

// Confirma un traspaso pendiente (TRASP o TRINS): mueve tránsito -> destino. Si es TRINS,
// además pasa la orden de producción ligada de 'Abierta' a 'En Proceso'.
export async function confirmWarehouseTransfer(id: number, userId?: number): Promise<void> {
  const db = await getDb();
  const rows: any[] = await db.select("SELECT * FROM warehouse_transfers WHERE id = $1", [id]);
  if (rows.length === 0) throw new Error("Traspaso no encontrado");
  const transfer = rows[0];
  if (transfer.status !== 'Pendiente') {
    throw new Error(`Este traspaso ya fue ${transfer.status === 'Confirmado' ? 'confirmado' : 'cancelado'}`);
  }

  // A prueba de carrera: si otra confirmación/cancelación ganó primero, rowsAffected da 0.
  const updateResult = await db.execute(
    "UPDATE warehouse_transfers SET status='Confirmado', confirmed_at=CURRENT_TIMESTAMP, confirmed_by_user_id=$1 WHERE id=$2 AND status='Pendiente'",
    [userId || null, id]
  );
  if (Number(updateResult.rowsAffected) === 0) {
    throw new Error("Este traspaso ya fue confirmado o cancelado por alguien más. Actualiza la pantalla.");
  }

  const items: any[] = await db.select("SELECT * FROM warehouse_transfer_items WHERE transfer_id = $1", [id]);
  for (const item of items) {
    await adjustWarehouseStock(transfer.transit_warehouse_id, item.item_type, item.item_id, -item.quantity);
    await db.execute(
      "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id, warehouse_id) VALUES ($1, $2, 'exit', $3, $4, $5, $6)",
      [item.item_type, item.item_id, item.quantity, `Confirmación traspaso ${transfer.folio}`, userId || null, transfer.transit_warehouse_id]
    );
    await adjustWarehouseStock(transfer.dest_warehouse_id, item.item_type, item.item_id, item.quantity);
    await db.execute(
      "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id, warehouse_id) VALUES ($1, $2, 'entry', $3, $4, $5, $6)",
      [item.item_type, item.item_id, item.quantity, `Confirmación traspaso ${transfer.folio}`, userId || null, transfer.dest_warehouse_id]
    );
  }

  if (transfer.type === 'TRINS' && transfer.production_document_id) {
    await db.execute(
      "UPDATE production_documents SET status = 'En Proceso' WHERE id = $1 AND status = 'Abierta'",
      [transfer.production_document_id]
    );
  }

  if (userId) {
    await logAction(userId, "TRASPASO CONFIRMADO", `Folio ${transfer.folio}`);
  }
}

// Cancela un traspaso todavía Pendiente (revierte tránsito -> origen). No soporta revertir uno
// ya Confirmado — para TRINS esa reversión ya ocurre vía cancelProductionOrder; para un TRASP
// confirmado, se necesita un traspaso inverso manual.
export async function cancelWarehouseTransfer(id: number, userId?: number): Promise<void> {
  const db = await getDb();
  const rows: any[] = await db.select("SELECT * FROM warehouse_transfers WHERE id = $1", [id]);
  if (rows.length === 0) throw new Error("Traspaso no encontrado");
  const transfer = rows[0];
  if (transfer.status === 'Cancelado') throw new Error("Este traspaso ya fue cancelado");
  if (transfer.status === 'Confirmado') throw new Error("No se puede cancelar un traspaso ya confirmado");

  const updateResult = await db.execute(
    "UPDATE warehouse_transfers SET status='Cancelado' WHERE id=$1 AND status='Pendiente'",
    [id]
  );
  if (Number(updateResult.rowsAffected) === 0) {
    throw new Error("Este traspaso ya fue confirmado o cancelado por alguien más. Actualiza la pantalla.");
  }

  const items: any[] = await db.select("SELECT * FROM warehouse_transfer_items WHERE transfer_id = $1", [id]);
  for (const item of items) {
    await adjustWarehouseStock(transfer.transit_warehouse_id, item.item_type, item.item_id, -item.quantity);
    await db.execute(
      "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id, warehouse_id) VALUES ($1, $2, 'exit', $3, $4, $5, $6)",
      [item.item_type, item.item_id, item.quantity, `Cancelación traspaso ${transfer.folio}`, userId || null, transfer.transit_warehouse_id]
    );
    await adjustWarehouseStock(transfer.source_warehouse_id, item.item_type, item.item_id, item.quantity);
    await db.execute(
      "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id, warehouse_id) VALUES ($1, $2, 'entry', $3, $4, $5, $6)",
      [item.item_type, item.item_id, item.quantity, `Cancelación traspaso ${transfer.folio}`, userId || null, transfer.source_warehouse_id]
    );
  }

  if (userId) {
    await logAction(userId, "TRASPASO CANCELADO", `Folio ${transfer.folio}`);
  }
}

export async function getWarehouseTransfers(filters?: { type?: 'TRASP' | 'TRINS'; status?: string; warehouseIds?: number[] }): Promise<any[]> {
  const db = await getDb();
  let query = `
    SELECT t.*, sw.name as source_warehouse_name, dw.name as dest_warehouse_name, tw.name as transit_warehouse_name,
      b.name as branch_name, u.name as user_name, cu.name as confirmed_by_name, pd.folio as order_folio
    FROM warehouse_transfers t
    LEFT JOIN warehouses sw ON t.source_warehouse_id = sw.id
    LEFT JOIN warehouses dw ON t.dest_warehouse_id = dw.id
    LEFT JOIN warehouses tw ON t.transit_warehouse_id = tw.id
    LEFT JOIN branches b ON t.branch_id = b.id
    LEFT JOIN users u ON t.user_id = u.id
    LEFT JOIN users cu ON t.confirmed_by_user_id = cu.id
    LEFT JOIN production_documents pd ON t.production_document_id = pd.id
  `;
  const conditions: string[] = [];
  const params: any[] = [];
  if (filters?.type) {
    params.push(filters.type);
    conditions.push(`t.type = $${params.length}`);
  }
  if (filters?.status) {
    params.push(filters.status);
    conditions.push(`t.status = $${params.length}`);
  }
  if (filters?.warehouseIds && filters.warehouseIds.length > 0) {
    const placeholders = filters.warehouseIds.map(id => { params.push(id); return `$${params.length}`; }).join(',');
    conditions.push(`(t.source_warehouse_id IN (${placeholders}) OR t.dest_warehouse_id IN (${placeholders}) OR t.transit_warehouse_id IN (${placeholders}))`);
  }
  if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY t.created_at DESC";
  return (await db.select(query, params)) as any[];
}

export async function getWarehouseTransferItems(transferId: number): Promise<any[]> {
  const db = await getDb();
  return (await db.select(`
    SELECT ti.*,
      p.name as product_name, i.name as ingredient_name, i.unit as ingredient_unit
    FROM warehouse_transfer_items ti
    LEFT JOIN products p ON ti.item_type = 'product' AND ti.item_id = p.id
    LEFT JOIN ingredients i ON ti.item_type = 'ingredient' AND ti.item_id = i.id
    WHERE ti.transfer_id = $1
  `, [transferId])) as any[];
}

// Cancela SOLO la porción pendiente (no recibida) de cada línea de la orden: lo ya recibido
// por FIFO se queda intacto en el almacén de venta, solo se libera el insumo reservado en el
// almacén en proceso correspondiente a lo que faltaba, de regreso a materia prima.
export async function cancelProductionOrder(id: number, userId?: number): Promise<void> {
  const db = await getDb();
  const rows: any[] = await db.select("SELECT * FROM production_documents WHERE id = $1", [id]);
  if (rows.length === 0) throw new Error("Orden de producción no encontrada");
  const doc = rows[0];
  if (doc.status === 'Cancelada') throw new Error("Esta orden ya fue cancelada");
  if (doc.status === 'Finalizada') throw new Error("Esta orden ya se recibió por completo, no queda nada pendiente que cancelar");

  // Si hay un traspaso de insumos (TRINS) todavía pendiente de confirmar, se cancela primero
  // para no dejar insumos varados en Mercancía en Tránsito sin una orden dueña.
  const pendingTrins: any[] = await db.select(
    "SELECT id FROM warehouse_transfers WHERE production_document_id = $1 AND type = 'TRINS' AND status = 'Pendiente'",
    [id]
  );
  for (const trins of pendingTrins) {
    await cancelWarehouseTransfer(Number(trins.id), userId);
  }

  const items: any[] = await db.select("SELECT * FROM production_document_items WHERE document_id = $1", [id]);
  const releasedLines: string[] = [];

  // Solo hay algo que revertir de Proceso -> Materia Prima si la orden de verdad llegó a "En
  // Proceso" (tuvo un TRINS Confirmado); si sigue "Abierta", nunca hubo insumos en Proceso.
  if (doc.status === 'En Proceso') {
    for (const item of items) {
      const pending = Number(item.yield_qty) - Number(item.received_qty);
      if (pending <= 0) continue;
      const ratio = pending / Number(item.yield_qty);
      const ingredients: any[] = await db.select(
        "SELECT * FROM production_document_ingredients WHERE document_item_id = $1",
        [item.id]
      );
      for (const ing of ingredients) {
        const pendingIngredientQty = Number(ing.quantity) * ratio;
        if (pendingIngredientQty <= 0) continue;
        if (doc.wip_warehouse_id) {
          await adjustWarehouseStock(doc.wip_warehouse_id, 'ingredient', ing.ingredient_id, -pendingIngredientQty);
          await db.execute(
            "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id, warehouse_id) VALUES ('ingredient', $1, 'exit', $2, $3, $4, $5)",
            [ing.ingredient_id, pendingIngredientQty, `Cancelación (pendiente) orden ${doc.folio}`, userId || null, doc.wip_warehouse_id]
          );
        }
        if (doc.source_warehouse_id) {
          await adjustWarehouseStock(doc.source_warehouse_id, 'ingredient', ing.ingredient_id, pendingIngredientQty);
          await db.execute(
            "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id, warehouse_id) VALUES ('ingredient', $1, 'entry', $2, $3, $4, $5)",
            [ing.ingredient_id, pendingIngredientQty, `Cancelación (pendiente) orden ${doc.folio}`, userId || null, doc.source_warehouse_id]
          );
        }
      }
      releasedLines.push(`producto ID ${item.product_id}: ${pending} pza(s) pendiente(s) liberada(s)`);
    }
  }
  await db.execute("UPDATE production_documents SET status = 'Cancelada' WHERE id = $1", [id]);

  if (userId) {
    await logAction(userId, "ORDEN DE PRODUCCIÓN CANCELADA", `Se canceló lo pendiente de la orden ${doc.folio}. ${releasedLines.join('; ') || 'Nada pendiente (ya todo recibido).'}`);
  }
}

export async function getProductionDocuments(warehouseIds?: number[]): Promise<any[]> {
  const db = await getDb();
  let query = `
    SELECT d.*, u.name as user_name, b.name as branch_name,
      sw.name as source_warehouse_name, dw.name as dest_warehouse_name, ww.name as wip_warehouse_name
    FROM production_documents d
    LEFT JOIN users u ON d.user_id = u.id
    LEFT JOIN branches b ON d.branch_id = b.id
    LEFT JOIN warehouses sw ON d.source_warehouse_id = sw.id
    LEFT JOIN warehouses dw ON d.dest_warehouse_id = dw.id
    LEFT JOIN warehouses ww ON d.wip_warehouse_id = ww.id
  `;
  const params: any[] = [];
  if (warehouseIds && warehouseIds.length > 0) {
    const placeholders = warehouseIds.map(wid => { params.push(wid); return `$${params.length}`; }).join(',');
    query += ` WHERE (d.source_warehouse_id IN (${placeholders}) OR d.dest_warehouse_id IN (${placeholders}) OR d.wip_warehouse_id IN (${placeholders}))`;
  }
  query += " ORDER BY d.id DESC LIMIT 300";
  const docs: any[] = await db.select(query, params);
  const items: any[] = await db.select(`
    SELECT i.*, p.name as product_name, p.img as product_img FROM production_document_items i
    LEFT JOIN products p ON i.product_id = p.id
  `);
  return docs.map(d => ({ ...d, items: items.filter(i => i.document_id === d.id) }));
}

// ==================== RECEPCIÓN DE PRODUCCIÓN (Fase 2, Etapa B — FIFO) ====================

// ENTOP (recepción de producto terminado) — antes RECOP.
export async function getNextProductionReceiptFolio(): Promise<string> {
  const db = await getDb();
  const rows: any[] = await db.select("SELECT folio FROM production_receipts");
  let next = 1;
  for (const row of rows) {
    const match = String(row.folio).match(/(\d+)$/);
    if (match) next = Math.max(next, parseInt(match[1], 10) + 1);
  }
  return `ENTOP-${String(next).padStart(6, '0')}`;
}

// Líneas de orden "En Proceso" para un producto, más antiguas primero (FIFO). Solo cuentan
// órdenes cuyo TRINS ya se confirmó (los insumos ya están físicamente en Proceso) — una orden
// "Abierta" (sin traspaso confirmado) no tiene nada real que recibir todavía.
export async function getOpenProductionOrderLinesForProduct(productId: number, wipWarehouseId: number): Promise<any[]> {
  const db = await getDb();
  return (await db.select(`
    SELECT pdi.*, pd.folio, pd.created_at as order_created_at
    FROM production_document_items pdi
    JOIN production_documents pd ON pdi.document_id = pd.id
    WHERE pdi.product_id = $1
      AND pd.status = 'En Proceso'
      AND pd.wip_warehouse_id = $2
      AND (pdi.yield_qty - pdi.received_qty) > 0
    ORDER BY pd.created_at ASC, pd.id ASC, pdi.id ASC
  `, [productId, wipWarehouseId])) as any[];
}

// Productos con algo pendiente de recibir en la sucursal, con el total pendiente agregado —
// alimenta la pantalla de Recepción de Producción (qué mostrar para elegir).
export async function getProductsPendingReceipt(branchId: number): Promise<any[]> {
  const db = await getDb();
  const branches: any[] = await db.select("SELECT wip_warehouse_id FROM branches WHERE id = $1", [branchId]);
  const wipWarehouseId = branches[0]?.wip_warehouse_id;
  if (!wipWarehouseId) return [];
  return (await db.select(`
    SELECT p.id as product_id, p.name as product_name, p.category as product_category, p.img as product_img,
      SUM(pdi.yield_qty - pdi.received_qty) as pending
    FROM production_document_items pdi
    JOIN production_documents pd ON pdi.document_id = pd.id
    JOIN products p ON pdi.product_id = p.id
    WHERE pd.status = 'En Proceso' AND pd.wip_warehouse_id = $1
      AND (pdi.yield_qty - pdi.received_qty) > 0
    GROUP BY p.id
    ORDER BY p.name
  `, [wipWarehouseId])) as any[];
}

export async function receiveProductionUnits(
  params: { branchId: number; lines: { productId: number; quantity: number }[]; notes?: string },
  userId?: number
): Promise<string> {
  const db = await getDb();
  const { branchId, lines, notes } = params;
  if (lines.length === 0) throw new Error("Agrega al menos un producto recibido");

  const branches: any[] = await db.select("SELECT * FROM branches WHERE id = $1", [branchId]);
  if (branches.length === 0) throw new Error("Sucursal no encontrada");
  const branch = branches[0];
  const wipWarehouseId = branch.wip_warehouse_id;
  const finishedGoodsWarehouseId = branch.finished_goods_warehouse_id;
  const saleWarehouseId = branch.warehouse_id;
  if (!wipWarehouseId || !finishedGoodsWarehouseId || !saleWarehouseId) {
    throw new Error("Esta sucursal no tiene configurados sus almacenes de producción (Configuración > Producción)");
  }

  // --- Validación completa antes de escribir nada (no hay transacciones reales) ---
  const candidatesByProduct = new Map<number, any[]>();
  for (const line of lines) {
    if (!line.quantity || line.quantity <= 0) throw new Error("Cantidad inválida en una de las líneas");
    const candidates = await getOpenProductionOrderLinesForProduct(line.productId, wipWarehouseId);
    const totalPending = candidates.reduce((sum, c) => sum + (Number(c.yield_qty) - Number(c.received_qty)), 0);
    if (line.quantity > totalPending) {
      const products: any[] = await db.select("SELECT name FROM products WHERE id = $1", [line.productId]);
      const productName = products[0]?.name || `producto ID ${line.productId}`;
      throw new Error(`Solo hay ${totalPending} pza(s) pendiente(s) de "${productName}" en órdenes abiertas; ajusta la cantidad o crea/completa una orden antes de recibir ${line.quantity}.`);
    }
    candidatesByProduct.set(line.productId, candidates);
  }

  // --- Ejecución, ya validado todo ---
  const folio = await getNextProductionReceiptFolio();
  const salprodFolio = await getNextSalprodFolio();
  const receiptResult = await db.execute(
    "INSERT INTO production_receipts (folio, salprod_folio, branch_id, notes, user_id) VALUES ($1, $2, $3, $4, $5)",
    [folio, salprodFolio, branchId, notes || null, userId || null]
  );
  const receiptId = receiptResult.lastInsertId;
  const affectedDocumentIds = new Set<number>();
  const summaryLines: string[] = [];

  for (const line of lines) {
    let remaining = line.quantity;
    const candidates = candidatesByProduct.get(line.productId) || [];
    let totalIngredientCost = 0;
    const lineAllocations: { documentItemId: number; qtyTaken: number; ingredientCost: number }[] = [];

    const products: any[] = await db.select("SELECT * FROM products WHERE id = $1", [line.productId]);
    const product = products[0];
    const previousStockVenta = await getStockForItem(saleWarehouseId, 'product', line.productId);
    const previousCost = Number(product?.cost) || 0;
    const globalPreviousStock = await getTotalStock('product', line.productId);

    for (const candidate of candidates) {
      if (remaining <= 0) break;
      let take = Math.min(remaining, Number(candidate.yield_qty) - Number(candidate.received_qty));
      if (take <= 0) continue;

      // Consumo FIFO a prueba de carrera: UPDATE condicional en vez de leer-luego-escribir.
      const updateResult = await db.execute(
        "UPDATE production_document_items SET received_qty = received_qty + $1 WHERE id = $2 AND (yield_qty - received_qty) >= $1",
        [take, candidate.id]
      );
      if (Number(updateResult.rowsAffected) === 0) {
        const fresh: any[] = await db.select("SELECT yield_qty, received_qty FROM production_document_items WHERE id = $1", [candidate.id]);
        const freshPending = fresh.length > 0 ? Number(fresh[0].yield_qty) - Number(fresh[0].received_qty) : 0;
        take = Math.min(take, freshPending);
        if (take <= 0) continue;
        await db.execute(
          "UPDATE production_document_items SET received_qty = received_qty + $1 WHERE id = $2 AND (yield_qty - received_qty) >= $1",
          [take, candidate.id]
        );
      }

      const ingredientRows: any[] = await db.select(
        "SELECT * FROM production_document_ingredients WHERE document_item_id = $1",
        [candidate.id]
      );
      let ingredientCostForTake = 0;
      for (const ing of ingredientRows) {
        const portionQty = Number(ing.quantity) * (take / Number(candidate.yield_qty));
        const portionCost = portionQty * (Number(ing.unit_cost) || 0);
        ingredientCostForTake += portionCost;
        if (portionQty > 0) {
          await adjustWarehouseStock(wipWarehouseId, 'ingredient', ing.ingredient_id, -portionQty);
          await db.execute(
            "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id, warehouse_id) VALUES ('ingredient', $1, 'exit', $2, $3, $4, $5)",
            [ing.ingredient_id, portionQty, `Recepción ${folio} (orden ${candidate.folio})`, userId || null, wipWarehouseId]
          );
          // SALPROD: detalle de consumo de insumos de esta recepción (una fila por porción
          // tomada; la pantalla de detalle agrupa por insumo al mostrarlo).
          await db.execute(
            "INSERT INTO production_receipt_ingredient_consumption (receipt_id, ingredient_id, quantity, unit_cost) VALUES ($1, $2, $3, $4)",
            [receiptId, ing.ingredient_id, portionQty, Number(ing.unit_cost) || 0]
          );
        }
      }

      totalIngredientCost += ingredientCostForTake;
      remaining -= take;
      lineAllocations.push({ documentItemId: candidate.id, qtyTaken: take, ingredientCost: ingredientCostForTake });
      affectedDocumentIds.add(candidate.document_id);
    }

    if (remaining > 0.0001) {
      // Ya se validó arriba que había suficiente pendiente; si una recepción concurrente lo
      // consumió mientras tanto, se aborta esta línea antes de tocar producto/almacén de venta.
      throw new Error(`No se pudo completar la recepción de "${product?.name || line.productId}": otra recepción concurrente consumió el pendiente disponible. Intenta de nuevo.`);
    }

    const unitCostResult = line.quantity > 0 ? totalIngredientCost / line.quantity : 0;
    const globalNewStock = globalPreviousStock + line.quantity;
    const newAvgCost = globalNewStock > 0
      ? ((globalPreviousStock * previousCost) + (line.quantity * unitCostResult)) / globalNewStock
      : previousCost;
    await db.execute("UPDATE products SET cost = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [newAvgCost, line.productId]);

    // Entrada a producto terminado + traspaso automático a venta: secuencia fija de 3 ajustes,
    // el neto queda correcto sea o no el mismo almacén configurado como producto terminado y venta.
    await adjustWarehouseStock(finishedGoodsWarehouseId, 'product', line.productId, line.quantity);
    await db.execute(
      "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id, warehouse_id) VALUES ('product', $1, 'entry', $2, $3, $4, $5)",
      [line.productId, line.quantity, `Recepción de producción ${folio}`, userId || null, finishedGoodsWarehouseId]
    );
    await adjustWarehouseStock(finishedGoodsWarehouseId, 'product', line.productId, -line.quantity);
    await db.execute(
      "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id, warehouse_id) VALUES ('product', $1, 'exit', $2, $3, $4, $5)",
      [line.productId, line.quantity, `Traspaso automático a venta ${folio}`, userId || null, finishedGoodsWarehouseId]
    );
    await adjustWarehouseStock(saleWarehouseId, 'product', line.productId, line.quantity);
    await db.execute(
      "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id, warehouse_id) VALUES ('product', $1, 'entry', $2, $3, $4, $5)",
      [line.productId, line.quantity, `Traspaso automático desde producción ${folio}`, userId || null, saleWarehouseId]
    );

    const newStockVenta = previousStockVenta + line.quantity;
    const itemResult = await db.execute(
      `INSERT INTO production_receipt_items (receipt_id, product_id, quantity, previous_stock, new_stock, previous_cost, new_avg_cost)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [receiptId, line.productId, line.quantity, previousStockVenta, newStockVenta, previousCost, newAvgCost]
    );
    const receiptItemId = itemResult.lastInsertId;

    for (const alloc of lineAllocations) {
      await db.execute(
        "INSERT INTO production_receipt_allocations (receipt_item_id, document_item_id, qty_taken, ingredient_cost) VALUES ($1, $2, $3, $4)",
        [receiptItemId, alloc.documentItemId, alloc.qtyTaken, alloc.ingredientCost]
      );
    }

    summaryLines.push(`${product?.name || line.productId} +${line.quantity} pza(s)`);
  }

  for (const documentId of affectedDocumentIds) {
    const docItems: any[] = await db.select("SELECT yield_qty, received_qty FROM production_document_items WHERE document_id = $1", [documentId]);
    const allComplete = docItems.every(it => Number(it.received_qty) >= Number(it.yield_qty));
    await db.execute(
      "UPDATE production_documents SET status = $1 WHERE id = $2 AND status != 'Cancelada'",
      [allComplete ? 'Finalizada' : 'En Proceso', documentId]
    );
  }

  if (userId) {
    await logAction(userId, "RECEPCIÓN DE PRODUCCIÓN (ENTOP/SALPROD)", `Folio ${folio} / ${salprodFolio}: ${summaryLines.join(', ')}`);
  }

  return folio;
}

export async function cancelProductionReceipt(id: number, userId?: number): Promise<void> {
  const db = await getDb();
  const rows: any[] = await db.select("SELECT * FROM production_receipts WHERE id = $1", [id]);
  if (rows.length === 0) throw new Error("Recepción no encontrada");
  const receipt = rows[0];
  if (receipt.status === 'Cancelada') throw new Error("Esta recepción ya fue cancelada");

  const branches: any[] = await db.select("SELECT * FROM branches WHERE id = $1", [receipt.branch_id]);
  const branch = branches[0];

  const receiptItems: any[] = await db.select("SELECT * FROM production_receipt_items WHERE receipt_id = $1", [id]);
  const affectedDocumentIds = new Set<number>();

  for (const item of receiptItems) {
    // Revierte el delta exacto de esta recepción (new_stock - previous_stock) en el almacén de
    // venta, y da marcha atrás a los 3 ajustes de producto terminado/traspaso en sentido inverso.
    const appliedDelta = Number(item.new_stock) - Number(item.previous_stock);
    if (branch?.warehouse_id) {
      await adjustWarehouseStock(branch.warehouse_id, 'product', item.product_id, -appliedDelta);
    }
    await db.execute(
      "UPDATE products SET cost = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [item.previous_cost, item.product_id]
    );

    const allocations: any[] = await db.select(
      "SELECT * FROM production_receipt_allocations WHERE receipt_item_id = $1",
      [item.id]
    );
    for (const alloc of allocations) {
      await db.execute(
        "UPDATE production_document_items SET received_qty = received_qty - $1 WHERE id = $2",
        [alloc.qty_taken, alloc.document_item_id]
      );
      const docItemRows: any[] = await db.select(
        "SELECT * FROM production_document_items WHERE id = $1",
        [alloc.document_item_id]
      );
      const docItem = docItemRows[0];
      if (docItem && branch?.wip_warehouse_id) {
        const ingredientRows: any[] = await db.select(
          "SELECT * FROM production_document_ingredients WHERE document_item_id = $1",
          [alloc.document_item_id]
        );
        for (const ing of ingredientRows) {
          const portionQty = Number(ing.quantity) * (Number(alloc.qty_taken) / Number(docItem.yield_qty));
          if (portionQty > 0) await adjustWarehouseStock(branch.wip_warehouse_id, 'ingredient', ing.ingredient_id, portionQty);
        }
      }
      if (docItem) affectedDocumentIds.add(docItem.document_id);
    }
  }

  await db.execute("UPDATE production_receipts SET status = 'Cancelada' WHERE id = $1", [id]);

  for (const documentId of affectedDocumentIds) {
    const rowsDoc: any[] = await db.select("SELECT status FROM production_documents WHERE id = $1", [documentId]);
    if (rowsDoc.length === 0 || rowsDoc[0].status === 'Cancelada') continue;
    const docItems: any[] = await db.select("SELECT yield_qty, received_qty FROM production_document_items WHERE document_id = $1", [documentId]);
    const allComplete = docItems.every(it => Number(it.received_qty) >= Number(it.yield_qty));
    // Los insumos de esta orden siguen físicamente en Proceso (su TRINS sigue Confirmado)
    // sin importar cuánto se haya des-recibido — nunca vuelve a 'Abierta' desde aquí.
    await db.execute(
      "UPDATE production_documents SET status = $1 WHERE id = $2",
      [allComplete ? 'Finalizada' : 'En Proceso', documentId]
    );
  }

  if (userId) {
    await logAction(userId, "RECEPCIÓN DE PRODUCCIÓN CANCELADA (ENTOP/SALPROD)", `Se canceló la recepción ${receipt.folio} / ${receipt.salprod_folio || ''}, revirtiendo ${receiptItems.length} producto(s)`);
  }
}

export async function getProductionReceipts(branchId?: number, warehouseIds?: number[]): Promise<any[]> {
  const db = await getDb();
  let query = `
    SELECT r.*, u.name as user_name, b.name as branch_name
    FROM production_receipts r
    LEFT JOIN users u ON r.user_id = u.id
    LEFT JOIN branches b ON r.branch_id = b.id
  `;
  const conditions: string[] = [];
  const params: any[] = [];
  if (branchId) {
    params.push(branchId);
    conditions.push(`r.branch_id = $${params.length}`);
  }
  if (warehouseIds && warehouseIds.length > 0) {
    const placeholders = warehouseIds.map(wid => { params.push(wid); return `$${params.length}`; }).join(',');
    conditions.push(`(b.warehouse_id IN (${placeholders}) OR b.wip_warehouse_id IN (${placeholders}) OR b.finished_goods_warehouse_id IN (${placeholders}))`);
  }
  if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
  query += " ORDER BY r.id DESC LIMIT 300";
  const receipts: any[] = await db.select(query, params);
  const items: any[] = await db.select(`
    SELECT i.*, p.name as product_name, p.img as product_img FROM production_receipt_items i
    LEFT JOIN products p ON i.product_id = p.id
  `);
  return receipts.map(r => ({ ...r, items: items.filter(i => i.receipt_id === r.id) }));
}

export async function getProductionReceiptDetail(receiptId: number): Promise<any[]> {
  const db = await getDb();
  return (await db.select(`
    SELECT a.*, ri.product_id, pd.folio as order_folio
    FROM production_receipt_allocations a
    JOIN production_receipt_items ri ON a.receipt_item_id = ri.id
    JOIN production_document_items pdi ON a.document_item_id = pdi.id
    JOIN production_documents pd ON pdi.document_id = pd.id
    WHERE ri.receipt_id = $1
    ORDER BY a.id ASC
  `, [receiptId])) as any[];
}

// SALPROD: detalle de insumos consumidos en una recepción (agrupado por insumo, ya que
// production_receipt_ingredient_consumption guarda una fila por porción/orden de origen).
export async function getSalprodDetail(receiptId: number): Promise<any[]> {
  const db = await getDb();
  return (await db.select(`
    SELECT c.ingredient_id, i.name as ingredient_name, i.unit as ingredient_unit,
      SUM(c.quantity) as quantity, SUM(c.quantity * c.unit_cost) / SUM(c.quantity) as unit_cost
    FROM production_receipt_ingredient_consumption c
    JOIN ingredients i ON c.ingredient_id = i.id
    WHERE c.receipt_id = $1
    GROUP BY c.ingredient_id
    ORDER BY i.name
  `, [receiptId])) as any[];
}

// ==================== CONFIGURACIONES ====================

export async function getSettings(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.select("SELECT * FROM settings");
  const settings: Record<string, string> = {};
  for (const row of (rows as any[])) {
    settings[row.key] = row.value;
  }
  return settings;
}

export async function saveSettings(settings: Record<string, string>): Promise<void> {
  const db = await getDb();
  // await db.execute("BEGIN");
  try {
    for (const [key, value] of Object.entries(settings)) {
      // Evitar que pasemos 'undefined' a Tauri, lo cual rompe la serialización IPC
      const safeValue = value === undefined ? null : value;
      await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)", [key, safeValue]);
    }
    // await db.execute("COMMIT");
  } catch (err) {
    console.error("Error en saveSettings:", err);
    // ROLLBACK
    throw err;
  }
}

// ==================== ANALISTICA Y REPORTES ====================

export async function getDailySalesAnalytics(): Promise<any[]> {
  const db = await getDb();
  // Obtiene los totales vendidos por día en los últimos 30 días en hora local
  const query = `
    SELECT date(created_at, 'localtime') as date, SUM(total) as total
    FROM sales
    WHERE created_at >= datetime('now', '-30 days', 'localtime')
    GROUP BY date(created_at, 'localtime')
    ORDER BY date ASC
  `;
  return await db.select(query);
}

export async function getTopProductsAnalytics(): Promise<any[]> {
  const db = await getDb();
  // Obtiene los 10 productos más vendidos
  const query = `
    SELECT p.name, SUM(si.quantity) as total_qty, SUM(si.quantity * si.price) as revenue
    FROM sale_items si
    JOIN products p ON si.product_id = p.id
    GROUP BY p.id
    ORDER BY total_qty DESC
    LIMIT 10
  `;
  return await db.select(query);
}

export async function getSalesKPIs(): Promise<any> {
    const db = await getDb();
    
    // Ventas hoy (ajustado a zona horaria local de la máquina)
    const todayQuery = `SELECT SUM(total) as total FROM sales WHERE date(created_at, 'localtime') = date('now', 'localtime')`;
    const todayRes: any[] = await db.select(todayQuery);
    
    // Ventas mes (ajustado a zona horaria local de la máquina)
    const monthQuery = `SELECT SUM(total) as total FROM sales WHERE strftime('%m', created_at, 'localtime') = strftime('%m', 'now', 'localtime') AND strftime('%Y', created_at, 'localtime') = strftime('%Y', 'now', 'localtime')`;
    const monthRes: any[] = await db.select(monthQuery);
    
    // Ticket promedio
    const avgQuery = `SELECT AVG(total) as average FROM sales`;
    const avgRes: any[] = await db.select(avgQuery);

    return {
        today: todayRes[0]?.total || 0,
        month: monthRes[0]?.total || 0,
        average: avgRes[0]?.average || 0
    };
}

export async function logAction(userId: number, action: string, details: string): Promise<void> {
  try {
    const db = await getDb();
    await db.execute(
      "INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)",
      [userId, action, details]
    );
  } catch (err) {
    console.error("Error al registrar bitácora:", err);
  }
}

export async function getAuditLogs(): Promise<any[]> {
  const db = await getDb();
  const query = `
    SELECT al.id, al.action, al.details, al.created_at, u.name as user_name
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.id DESC
    LIMIT 500
  `;
  return await db.select(query);
}

export async function getSalesReportByPaymentMethod(startDate: string, endDate: string): Promise<any[]> {
  const db = await getDb();
  const query = `
    SELECT payment_method, COUNT(*) as count, SUM(total) as total
    FROM sales
    WHERE date(created_at, 'localtime') BETWEEN $1 AND $2
    GROUP BY payment_method
  `;
  return await db.select(query, [startDate, endDate]);
}

export async function getSalesReportByCashier(startDate: string, endDate: string): Promise<any[]> {
  const db = await getDb();
  const query = `
    SELECT u.name as cashier_name, COUNT(s.id) as count, SUM(s.total) as total
    FROM sales s
    LEFT JOIN users u ON s.user_id = u.id
    WHERE date(s.created_at, 'localtime') BETWEEN $1 AND $2
    GROUP BY s.user_id
  `;
  return await db.select(query, [startDate, endDate]);
}

export async function getSalesReportByProduct(startDate: string, endDate: string): Promise<any[]> {
  const db = await getDb();
  const query = `
    SELECT p.name, SUM(si.quantity) as qty, SUM(si.quantity * si.price) as revenue,
           SUM(si.quantity * (si.price - IFNULL(p.cost, 0))) as profit
    FROM sale_items si
    JOIN sales s ON si.sale_id = s.id
    JOIN products p ON si.product_id = p.id
    WHERE date(s.created_at, 'localtime') BETWEEN $1 AND $2
    GROUP BY p.id
    ORDER BY qty DESC
  `;
  return await db.select(query, [startDate, endDate]);
}

// Total across TODOS los almacenes (Fase 1 no trae selector de almacén en Reportes).
export async function getInventoryValuation(): Promise<any[]> {
  const db = await getDb();
  const query = `
    SELECT p.name, p.category, COALESCE(SUM(ws.stock), 0) as stock, p.cost, p.price,
      (COALESCE(SUM(ws.stock), 0) * IFNULL(p.cost, 0)) as valuation
    FROM products p
    LEFT JOIN warehouse_stock ws ON ws.item_type = 'product' AND ws.item_id = p.id
    WHERE p.deleted_at IS NULL
    GROUP BY p.id
    HAVING stock > 0
    ORDER BY p.category, p.name
  `;
  return await db.select(query);
}

export async function getShiftsReport(startDate: string, endDate: string): Promise<any[]> {
  const db = await getDb();
  const query = `
    SELECT 
      sh.id, 
      COALESCE(
        (SELECT u.name FROM sales s JOIN users u ON s.user_id = u.id WHERE s.shift_id = sh.id LIMIT 1),
        'Administrador Maestro'
      ) as cashier_name,
      sh.initial_amount, 
      sh.expected_amount, 
      sh.actual_amount, 
      (sh.actual_amount - sh.expected_amount) as difference, 
      sh.start_time, 
      sh.end_time
    FROM shifts sh
    WHERE date(sh.start_time, 'localtime') BETWEEN $1 AND $2
    ORDER BY sh.id DESC
  `;
  return await db.select(query, [startDate, endDate]);
}
