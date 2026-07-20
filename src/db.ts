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

    // Intentamos agregar llaves foraneas a ventas de forma no destructiva
    try {
      await db.execute('ALTER TABLE sales ADD COLUMN shift_id INTEGER REFERENCES shifts(id)');
    } catch (e) { /* Columna ya existe */ }

    try {
      await db.execute('ALTER TABLE sales ADD COLUMN user_id INTEGER REFERENCES users(id)');
    } catch (e) { /* Columna ya existe */ }

    try {
      await db.execute('ALTER TABLE sales ADD COLUMN payment_method TEXT DEFAULT "cash"');
    } catch (e) { /* Columna ya existe */ }

    try {
      await db.execute('ALTER TABLE sales ADD COLUMN cash_received REAL DEFAULT 0');
    } catch (e) { /* Columna ya existe */ }

    try {
      await db.execute('ALTER TABLE sales ADD COLUMN cash_change REAL DEFAULT 0');
    } catch (e) { /* Columna ya existe */ }

    // Stock en productos
    try {
      await db.execute('ALTER TABLE products ADD COLUMN stock REAL DEFAULT 0');
    } catch (e) { /* Columna ya existe */ }

    // Costo unitario de producción
    try {
      await db.execute('ALTER TABLE products ADD COLUMN cost REAL DEFAULT 0');
    } catch (e) { /* Columna ya existe */ }

    // Permisos en usuarios (por si la tabla users ya existía en versiones previas)
    try {
      await db.execute('ALTER TABLE users ADD COLUMN permissions TEXT DEFAULT NULL');
    } catch (e) { /* Columna ya existe */ }

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
        stock REAL DEFAULT 0,
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
          ['biz_logo', '🍦'],
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

export async function saveSale(
  total: number,
  items: any[],
  shiftId?: number,
  userId?: number,
  paymentMethod: string = 'cash',
  cashReceived: number = 0,
  cashChange: number = 0
): Promise<number> {
  const db = await getDb();
  await db.execute("BEGIN");
  try {
    // Crear venta vinculada al turno y al cajero
    const result = await db.execute(
      'INSERT INTO sales (total, uuid_global, shift_id, user_id, payment_method, cash_received, cash_change) VALUES ($1, hex(randomblob(16)), $2, $3, $4, $5, $6)',
      [total, shiftId || null, userId || null, paymentMethod, cashReceived, cashChange]
    );

    const saleId = result.lastInsertId;
    if (!saleId) throw new Error("No se pudo obtener el ID de la venta");

    for (const item of items) {
      await db.execute(
        'INSERT INTO sale_items (sale_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)',
        [saleId, item.product.id, item.quantity, item.product.price]
      );

      // Descontar stock del producto y dejar rastro en el kardex de movimientos,
      // dentro de la misma transacción que la venta (antes vivía en un loop aparte
      // en App.tsx, sin ninguna garantía de que se aplicara completo).
      await db.execute(
        "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id) VALUES ('product', $1, 'exit', $2, $3, $4)",
        [item.product.id, item.quantity, `Venta en caja #${shiftId || ''}`, userId || null]
      );
      await db.execute(
        "UPDATE products SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
        [item.quantity, item.product.id]
      );
    }

    // Registrar en bitácora de auditoría dentro de la base de datos
    await db.execute(
      "INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)",
      [userId || null, "VENTA REGISTRADA", `Ticket #${saleId} registrado por un total de $${total.toFixed(2)} (${paymentMethod})`]
    );

    await db.execute("COMMIT");
    return Number(saleId);
  } catch (err) {
    try {
      try { await db.execute("ROLLBACK"); } catch (e) { console.warn("Rollback error:", e); }
    } catch (rollbackErr) {
      console.warn("Error doing rollback (maybe transaction already aborted):", rollbackErr);
    }
    throw err;
  }
}

export async function getUserByPin(pin: string): Promise<any> {
  const db = await getDb();
  const hashed = await hashPin(pin);
  const users = await db.select("SELECT * FROM users WHERE deleted_at IS NULL");
  const match = (users as any[]).find(u => String(u.pin) === String(hashed));
  return match || null;
}

export async function getUsers(): Promise<any[]> {
  const db = await getDb();
  const users = await db.select("SELECT * FROM users WHERE deleted_at IS NULL");
  return users as any[];
}

export async function createUser(user: Omit<any, 'id'>, userId?: number): Promise<void> {
  const db = await getDb();
  const hashedPin = await hashPin(user.pin);
  await db.execute(
    "INSERT INTO users (name, pin, role, permissions, uuid_global) VALUES ($1, $2, $3, $4, hex(randomblob(16)))",
    [user.name, hashedPin, user.role, user.permissions || null]
  );
  if (userId) {
    await logAction(userId, "EMPLEADO CREADO", `Se creó el empleado ${user.name} con rol ${user.role}`);
  }
}

export async function updateUser(id: number, user: Partial<any>, userId?: number): Promise<void> {
  const db = await getDb();
  const hashedPin = await hashPin(user.pin);
  await db.execute(
    "UPDATE users SET name = $1, pin = $2, role = $3, permissions = $4 WHERE id = $5",
    [user.name, hashedPin, user.role, user.permissions || null, id]
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

export async function getCurrentShift(): Promise<any> {
  const db = await getDb();
  const rows = await db.select("SELECT * FROM shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1");
  if ((rows as any[]).length > 0) return (rows as any[])[0];
  return null;
}

export async function openShift(initialAmount: number, userId?: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "INSERT INTO shifts (initial_amount, uuid_global) VALUES ($1, hex(randomblob(16)))",
    [initialAmount]
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

export async function getKardexSales(searchTerm?: string): Promise<any[]> {
  const db = await getDb();
  let query = `
    SELECT s.id, s.total, s.created_at, s.status, u.name as cashier_name, s.shift_id, s.payment_method, s.cash_received, s.cash_change
    FROM sales s
    LEFT JOIN users u ON s.user_id = u.id
  `;
  const params: any[] = [];
  if (searchTerm && searchTerm.trim() !== "") {
    const term = `%${searchTerm.trim()}%`;
    query += ` WHERE s.id LIKE $1 OR u.name LIKE $1 OR CAST(s.total AS TEXT) LIKE $1
      OR s.id IN (SELECT si.sale_id FROM sale_items si JOIN products p ON si.product_id = p.id WHERE p.name LIKE $1)`;
    params.push(term);
  }
  query += ` ORDER BY s.id DESC LIMIT 100`;
  const sales = await db.select(query, params);
  return sales as any[];
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

// ==================== MOVIMIENTOS DE INVENTARIO ====================

export async function addInventoryMovement(itemType: string, itemId: number, movementType: string, quantity: number, reason: string, userId?: number): Promise<void> {
  const db = await getDb();
  const table = itemType === 'product' ? 'products' : 'ingredients';
  const sign = movementType === 'entry' ? '+' : '-';

  await db.execute("BEGIN");
  try {
    await db.execute(
      "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id) VALUES ($1, $2, $3, $4, $5, $6)",
      [itemType, itemId, movementType, quantity, reason, userId || null]
    );
    // Actualizar el stock del item
    await db.execute(`UPDATE ${table} SET stock = stock ${sign} $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [quantity, itemId]);
    await db.execute("COMMIT");
  } catch (err) {
    try { await db.execute("ROLLBACK"); } catch (e) { console.warn("Rollback error:", e); }
    throw err;
  }
}

export async function getInventoryMovements(itemType?: string, itemId?: number): Promise<any[]> {
  const db = await getDb();
  let query = "SELECT im.*, CASE WHEN im.item_type='product' THEN p.name WHEN im.item_type='ingredient' THEN i.name END as item_name FROM inventory_movements im LEFT JOIN products p ON im.item_type='product' AND im.item_id=p.id LEFT JOIN ingredients i ON im.item_type='ingredient' AND im.item_id=i.id";
  const params: any[] = [];
  if (itemType && itemId) {
    query += " WHERE im.item_type=$1 AND im.item_id=$2";
    params.push(itemType, itemId);
  }
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
  },
  userId?: number
): Promise<string> {
  const db = await getDb();
  const { type, items, notes } = params;
  if (items.length === 0) throw new Error("Agrega al menos un producto");

  const folio = await getNextAdjustmentDocFolio(type);
  const lines: string[] = [];

  await db.execute("BEGIN");
  try {
    const docResult = await db.execute(
      `INSERT INTO adjustment_documents (folio, type, status, notes, user_id) VALUES ($1, $2, 'Realizada', $3, $4)`,
      [folio, type, notes || null, userId || null]
    );
    const documentId = docResult.lastInsertId;

    for (const item of items) {
      const products: any[] = await db.select("SELECT * FROM products WHERE id = $1", [item.productId]);
      if (products.length === 0) continue;
      const product = products[0];
      const previousStock = Number(product.stock) || 0;
      const previousCost = Number(product.cost) || 0;
      let newStock: number, newAvgCost: number;
      if (type === 'ENTAJ') {
        newStock = previousStock + item.quantity;
        newAvgCost = newStock > 0
          ? ((previousStock * previousCost) + (item.quantity * item.unitCost)) / newStock
          : previousCost;
      } else {
        newStock = previousStock - item.quantity;
        newAvgCost = previousCost;
      }

      await db.execute(
        `INSERT INTO adjustment_document_items
          (document_id, product_id, quantity, unit_cost, previous_stock, new_stock, previous_cost, new_avg_cost)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [documentId, item.productId, item.quantity, item.unitCost, previousStock, newStock, previousCost, newAvgCost]
      );
      await db.execute(
        "UPDATE products SET stock = $1, cost = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
        [newStock, newAvgCost, item.productId]
      );
      lines.push(`${product.name} ${type === 'ENTAJ' ? '+' : '-'}${item.quantity}`);
    }
    await db.execute("COMMIT");
  } catch (err) {
    try { await db.execute("ROLLBACK"); } catch (e) { console.warn("Rollback error:", e); }
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

  await db.execute("BEGIN");
  try {
    for (const item of items) {
      await db.execute(
        "UPDATE products SET stock = $1, cost = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
        [item.previous_stock, item.previous_cost, item.product_id]
      );
    }
    await db.execute("UPDATE adjustment_documents SET status = 'Cancelada' WHERE id = $1", [id]);
    await db.execute("COMMIT");
  } catch (err) {
    try { await db.execute("ROLLBACK"); } catch (e) { console.warn("Rollback error:", e); }
    throw err;
  }

  if (userId) {
    await logAction(userId, "AJUSTE CANCELADO", `Se canceló el documento ${doc.folio}, revirtiendo ${items.length} producto(s)`);
  }
}

export async function getAdjustmentDocuments(): Promise<any[]> {
  const db = await getDb();
  const docs: any[] = await db.select(`
    SELECT d.*, u.name as user_name FROM adjustment_documents d
    LEFT JOIN users u ON d.user_id = u.id
    ORDER BY d.id DESC LIMIT 300
  `);
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

  await db.execute(
    "UPDATE products SET stock = $1, cost = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
    [adj.previous_stock, adj.previous_cost, adj.product_id]
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

  await db.execute("BEGIN");
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
    await db.execute("COMMIT");
  } catch (err) {
    try { await db.execute("ROLLBACK"); } catch (e) { console.warn("Rollback error:", e); }
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
  await db.execute("BEGIN");
  try {
    await db.execute("DELETE FROM recipe_items WHERE recipe_id=$1", [recipeId]);
    await db.execute("DELETE FROM recipes WHERE id=$1", [recipeId]);
    await db.execute("COMMIT");
  } catch (err) {
    try { await db.execute("ROLLBACK"); } catch (e) { console.warn("Rollback error:", e); }
    throw err;
  }
  if (userId) {
    await logAction(userId, "RECETA ELIMINADA", `Eliminada receta ID ${recipeId}`);
  }
}

// ==================== ENTRADAS DE PRODUCCIÓN CON FOLIO (ENTOP) ====================

export async function getNextProductionFolio(): Promise<string> {
  const db = await getDb();
  const rows: any[] = await db.select("SELECT folio FROM production_documents");
  let next = 1;
  for (const row of rows) {
    const match = String(row.folio).match(/(\d+)$/);
    if (match) next = Math.max(next, parseInt(match[1], 10) + 1);
  }
  return `ENTOP-${String(next).padStart(6, '0')}`;
}

export async function createProductionDocument(
  params: { items: { recipeId: number; batches: number }[]; notes?: string },
  userId?: number
): Promise<string> {
  const db = await getDb();
  const { items, notes } = params;
  if (items.length === 0) throw new Error("Agrega al menos una receta");

  const folio = await getNextProductionFolio();
  const lines: string[] = [];

  await db.execute("BEGIN");
  try {
    const docResult = await db.execute(
      `INSERT INTO production_documents (folio, status, notes, user_id) VALUES ($1, 'Realizada', $2, $3)`,
      [folio, notes || null, userId || null]
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
      const previousStock = Number(product.stock) || 0;
      const previousCost = Number(product.cost) || 0;

      let totalIngredientCost = 0;
      for (const ri of recipeItems) {
        totalIngredientCost += Number(ri.quantity) * batches * (Number(ri.cost_per_unit) || 0);
      }

      const producedUnitCost = totalYield > 0 ? totalIngredientCost / totalYield : 0;
      const newStock = previousStock + totalYield;
      const newAvgCost = newStock > 0
        ? ((previousStock * previousCost) + (totalYield * producedUnitCost)) / newStock
        : previousCost;

      const itemResult = await db.execute(
        `INSERT INTO production_document_items
          (document_id, recipe_id, product_id, batches, yield_qty, previous_stock, new_stock, previous_cost, new_avg_cost)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [documentId, recipeId, recipe.product_id, batches, totalYield, previousStock, newStock, previousCost, newAvgCost]
      );
      const documentItemId = itemResult.lastInsertId;

      for (const ri of recipeItems) {
        const qty = Number(ri.quantity) * batches;
        await db.execute(
          `INSERT INTO production_document_ingredients (document_item_id, ingredient_id, quantity, unit_cost) VALUES ($1, $2, $3, $4)`,
          [documentItemId, ri.ingredient_id, qty, Number(ri.cost_per_unit) || 0]
        );
        await db.execute(
          "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id) VALUES ('ingredient', $1, 'exit', $2, $3, $4)",
          [ri.ingredient_id, qty, `Producción ${folio}`, userId || null]
        );
        await db.execute(
          "UPDATE ingredients SET stock = stock - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
          [qty, ri.ingredient_id]
        );
      }

      await db.execute(
        "UPDATE products SET stock = $1, cost = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
        [newStock, newAvgCost, recipe.product_id]
      );
      await db.execute(
        "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id) VALUES ('product', $1, 'entry', $2, $3, $4)",
        [recipe.product_id, totalYield, `Producción ${folio}`, userId || null]
      );

      lines.push(`${product.name} +${totalYield} pzas`);
    }
    await db.execute("COMMIT");
  } catch (err) {
    try { await db.execute("ROLLBACK"); } catch (e) { console.warn("Rollback error:", e); }
    throw err;
  }

  if (userId) {
    await logAction(userId, "PRODUCCIÓN REGISTRADA (ENTOP)", `Folio ${folio}: ${lines.join(', ')}`);
  }

  return folio;
}

export async function cancelProductionDocument(id: number, userId?: number): Promise<void> {
  const db = await getDb();
  const rows: any[] = await db.select("SELECT * FROM production_documents WHERE id = $1", [id]);
  if (rows.length === 0) throw new Error("Documento de producción no encontrado");
  const doc = rows[0];
  if (doc.status === 'Cancelada') throw new Error("Esta producción ya fue cancelada");

  const items: any[] = await db.select("SELECT * FROM production_document_items WHERE document_id = $1", [id]);

  await db.execute("BEGIN");
  try {
    for (const item of items) {
      const ingredients: any[] = await db.select(
        "SELECT * FROM production_document_ingredients WHERE document_item_id = $1",
        [item.id]
      );
      for (const ing of ingredients) {
        await db.execute(
          "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id) VALUES ('ingredient', $1, 'entry', $2, $3, $4)",
          [ing.ingredient_id, ing.quantity, `Cancelación producción ${doc.folio}`, userId || null]
        );
        await db.execute(
          "UPDATE ingredients SET stock = stock + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
          [ing.quantity, ing.ingredient_id]
        );
      }
      await db.execute(
        "UPDATE products SET stock = $1, cost = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3",
        [item.previous_stock, item.previous_cost, item.product_id]
      );
      await db.execute(
        "INSERT INTO inventory_movements (item_type, item_id, movement_type, quantity, reason, user_id) VALUES ('product', $1, 'exit', $2, $3, $4)",
        [item.product_id, item.yield_qty, `Cancelación producción ${doc.folio}`, userId || null]
      );
    }
    await db.execute("UPDATE production_documents SET status = 'Cancelada' WHERE id = $1", [id]);
    await db.execute("COMMIT");
  } catch (err) {
    try { await db.execute("ROLLBACK"); } catch (e) { console.warn("Rollback error:", e); }
    throw err;
  }

  if (userId) {
    await logAction(userId, "PRODUCCIÓN CANCELADA (ENTOP)", `Se canceló la producción ${doc.folio}, revirtiendo ${items.length} producto(s)`);
  }
}

export async function getProductionDocuments(): Promise<any[]> {
  const db = await getDb();
  const docs: any[] = await db.select(`
    SELECT d.*, u.name as user_name FROM production_documents d
    LEFT JOIN users u ON d.user_id = u.id
    ORDER BY d.id DESC LIMIT 300
  `);
  const items: any[] = await db.select(`
    SELECT i.*, p.name as product_name, p.img as product_img FROM production_document_items i
    LEFT JOIN products p ON i.product_id = p.id
  `);
  return docs.map(d => ({ ...d, items: items.filter(i => i.document_id === d.id) }));
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
  await db.execute("BEGIN");
  try {
    for (const [key, value] of Object.entries(settings)) {
      // Evitar que pasemos 'undefined' a Tauri, lo cual rompe la serialización IPC
      const safeValue = value === undefined ? null : value;
      await db.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ($1, $2)", [key, safeValue]);
    }
    await db.execute("COMMIT");
  } catch (err) {
    console.error("Error en saveSettings:", err);
    try { await db.execute("ROLLBACK"); } catch (e) { console.warn("Rollback error:", e); }
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

export async function getInventoryValuation(): Promise<any[]> {
  const db = await getDb();
  const query = `
    SELECT name, category, stock, cost, price, (stock * IFNULL(cost, 0)) as valuation
    FROM products
    WHERE deleted_at IS NULL AND stock > 0
    ORDER BY category, name
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
