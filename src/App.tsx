import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { initDb, getProducts, getProductsWithStock, saveSale, getCurrentShift, getNextFolio, logAction } from "./db";
import { notify } from "./lib/dialogs";
import { buildSaleTicketText, getTicketWidth, withPrinterStyle } from "./lib/ticketFormat";
import Cortes from "./Cortes";
import Usuarios from "./Usuarios";
import Kardex from "./Kardex";
import Stock from "./Stock";
import Recetas from "./Recetas";
import SettingsView from "./Settings";
import Reportes from "./Reportes";
import Dashboard from "./Dashboard";
import Bitacora from "./Bitacora";
import TicketModal from "./components/TicketModal";
import PaymentModal from "./components/PaymentModal";
import { isImageIcon } from "./lib/iconLibrary";
import Login from "./Login";
import "./App.css";
import {
  Store,
  Search,
  ShoppingCart,
  Settings,
  LogOut,
  ChevronRight,
  Plus,
  Minus,
  Trash2,
  UserCircle,
  Users,
  Receipt,
  Package,
  BookOpen,
  Monitor,
  ClipboardList,
  LayoutDashboard,
  FileSpreadsheet
} from "lucide-react";

// Categorías base (podrán venir de BD en un futuro)
const CATEGORIES = ["Todos", "Pan Dulce", "Bolillo y Telera", "Pasteles", "Bebidas", "Postres", "Galletas", "Especialidades", "Abarrotes"];

interface Product {
  id: number;
  name: string;
  category: string;
  price: number;
  img: string;
}

interface TicketItem {
  product: Product;
  quantity: number;
}

export function hasPermission(user: any, permissionKey: string): boolean {
  if (!user) return false;
  if (user.role === 'admin') return true;
  if (!user.permissions) {
    return user.role === 'admin';
  }
  try {
    const perms = JSON.parse(user.permissions);
    return !!perms[permissionKey];
  } catch {
    return false;
  }
}

function App() {
  const [activeCategory, setActiveCategory] = useState("Todos");
  const [search, setSearch] = useState("");
  const [ticket, setTicket] = useState<TicketItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Navegación (Router Simple), Turno Actual e Impresora Mocks
  const [currentView, setCurrentView] = useState<"dashboard" | "pos" | "usuarios" | "kardex" | "stock" | "recetas" | "settings" | "reportes" | "bitacora">("dashboard");
  const [posTab, setPosTab] = useState<"venta" | "cortes">("venta");
  const [currentShift, setCurrentShift] = useState<any>(null);
  const [currentUser, setCurrentUser] = useState<any>(null); 
  const [appSettings, setAppSettings] = useState<Record<string, string>>({});
  const [nextFolio, setNextFolio] = useState<number>(1);

  const isPrinterConfigured = !!(appSettings.printer_port && appSettings.printer_port !== "" && appSettings.printer_port !== "SIMULATOR");
  const [ticketToPrint, setTicketToPrint] = useState<string>(""); // Guarda el ticket para el modal
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [inactivityLocked, setInactivityLocked] = useState(false);

  const handleLogout = async (reason = "Cierre de sesión manual") => {
    if (currentUser) {
      await logAction(currentUser.id, "LOGOUT", reason);
    }
    setCurrentUser(null);
  };

  async function loadData() {
    try {
      await initDb();
      const shift = await getCurrentShift();
      // El catálogo se carga con el stock del almacén de venta de la caja activa (turno ->
      // caja -> sucursal). Sin turno abierto no se puede vender de todas formas, así que el
      // fallback a getProducts() (sin stock por almacén) solo aplica antes de abrir caja.
      const loadedProducts = shift?.warehouse_id ? await getProductsWithStock(shift.warehouse_id) : await getProducts();
      const folio = await getNextFolio();
      const settings = await (async () => {
        const { getSettings } = await import("./db");
        return await getSettings();
      })();

      setProducts(loadedProducts);
      setNextFolio(folio);
      setCurrentShift(shift);
      setAppSettings(settings);

      // El administrador maestro necesita acceso libre (dar de alta usuarios, configurar
      // el sistema, revisar stock, etc.) sin tener que abrir turno primero. Los cajeros
      // normales sí quedan forzados a abrir caja antes de navegar a cualquier otra pantalla.
      const isAdmin = currentUser?.role === 'admin';
      if (!isAdmin) {
        if (!shift && currentView !== "pos" && currentView !== "settings") {
          setCurrentView("pos");
          setPosTab("cortes");
        } else if (!shift && currentView === "pos" && posTab !== "cortes") {
          setPosTab("cortes");
        }
      }

      // Respaldo automático silencioso (no bloquea el arranque si falla)
      import("./lib/backup").then(({ maybeAutoBackup }) => maybeAutoBackup()).catch(err => console.error("Error en respaldo automático:", err));
    } catch (error: any) {
      console.error("Error al inicializar la base de datos:", error);
      setErrorMsg(error.message || String(error));
    }
  }

  useEffect(() => {
    loadData();
  }, [currentView, posTab]);

  // Temporizador de cierre de sesión automático por inactividad
  useEffect(() => {
    if (!currentUser) return;
    
    const timeoutMins = parseInt(appSettings.lock_timeout_mins || "5") || 0;
    if (timeoutMins <= 0) return; // 0 significa desactivado

    let timer: any;

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        console.log("Cerrando sesión por inactividad...");
        handleLogout("Sesión cerrada automáticamente por inactividad.");
        setInactivityLocked(true);
      }, timeoutMins * 60 * 1000);
    };

    // Eventos de interacción del usuario
    const events = ["mousemove", "mousedown", "click", "scroll", "keypress", "touchstart"];
    
    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    // Iniciar temporizador al montar/loguear
    resetTimer();

    return () => {
      if (timer) clearTimeout(timer);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [currentUser, appSettings.lock_timeout_mins]);

  // Atajos rápidos: ESC para bloquear la caja, Ctrl+5 para abrir visor de cliente
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (currentUser) {
        if (e.key === "Escape") {
          console.log("Bloqueando pantalla por atajo de teclado (ESC)...");
          handleLogout("Pantalla bloqueada por atajo de teclado (ESC).");
        } else if ((e.ctrlKey || e.metaKey) && e.key === "5") {
          e.preventDefault();
          console.log("Reabriendo visor de cliente por atajo (Ctrl+5)...");
          handleReopenVisor();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentUser]);



  const filteredProducts = products.filter(p => {
    const matchesCategory = activeCategory === "Todos" || p.category === activeCategory;
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const addToTicket = async (product: Product) => {
    const stock = (product as any).stock || 0;
    const currentInTicket = ticket.find(item => item.product.id === product.id);
    const qtyInTicket = currentInTicket ? currentInTicket.quantity : 0;

    const allowNegative = appSettings.allow_negative_stock !== 'false';
    if (!allowNegative && (qtyInTicket + 1 > stock)) {
      await notify(`Sin stock suficiente de "${product.name}". Disponible: ${stock}, en ticket: ${qtyInTicket}.`, 'warning');
      return;
    }

    setTicket(prev => {
      const existing = prev.find(item => item.product.id === product.id);
      if (existing) {
        return prev.map(item =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [{ product, quantity: 1 }, ...prev];
    });
  };

  const updateQuantity = async (productId: number, delta: number) => {
    if (delta > 0) {
      const item = ticket.find(i => i.product.id === productId);
      if (item) {
        const stock = (item.product as any).stock || 0;
        const allowNegative = appSettings.allow_negative_stock !== 'false';
        if (!allowNegative && (item.quantity + delta > stock)) {
          await notify(`Sin stock suficiente. Disponible: ${stock}`, 'warning');
          return;
        }
      }
    }
    setTicket(prev => prev
      .map(item => item.product.id === productId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item)
      .filter(item => item.quantity > 0));
  };

  const taxRate = parseFloat(appSettings.tax_rate || "16") / 100;
  const rawTotal = ticket.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  const total = Math.round(rawTotal * 100) / 100;
  const subtotal = Math.round((total / (1 + taxRate)) * 100) / 100;
  const tax = Math.round((total - subtotal) * 100) / 100;

  // Sincronizar con el Visor de Cliente (Doble Display)
  useEffect(() => {
    emit("cart-update", { ticket, total, subtotal, tax });
  }, [ticket, total, subtotal, tax]);

  const handleCheckout = async () => {
    if (ticket.length === 0) return;
    if (!currentShift) {
      await notify("¡No puedes cobrar! Debes Abrir Caja (Fondo Inicial) antes de realizar una venta.", 'warning');
      setCurrentView("pos");
      setPosTab("cortes");
      return;
    }
    setShowPaymentModal(true);
  };

  const handleReopenVisor = async () => {
    try {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const label = "customer-display";
      
      // Intentar obtener la ventana por su etiqueta
      const win = await WebviewWindow.getByLabel(label);
      
      if (win) {
        // Si ya existe, nos aseguramos de que sea visible y tenga foco
        await win.show();
        await win.unminimize();
        await win.setFocus();
      } else {
        // Si no existe (fue cerrada), creamos una nueva instancia
        new WebviewWindow(label, {
          url: "index.html",
          title: "Visor de Cliente",
          width: 1366,
          height: 768,
          maximized: true,
          resizable: true,
          // En Tauri v2 es recomendable especificar que queremos que se centre o aparezca en algún monitor
          center: true
        });
      }
    } catch (e) {
      console.error("Error al intentar abrir el visor:", e);
      // Alertamos al usuario en caso de error crítico
      await notify("No se pudo abrir el visor: " + e, 'error');
    }
  };

  const handlePrintFromPreview = async () => {
    try {
      await invoke("print_receipt", { portName: appSettings.printer_port, receiptData: withPrinterStyle(ticketToPrint, appSettings), openDrawer: true });
      await notify("Ticket enviado a la impresora.", 'info');
    } catch (e) {
      await notify("No se pudo imprimir: " + e, 'error');
    }
  };

  const onPaymentConfirm = async (paymentData: { method: 'cash' | 'card', received: number, change: number, requiresInvoice: boolean, invoiceCustomerId?: number }) => {
    setIsProcessing(true);
    setShowPaymentModal(false);

    // 1. Parte crítica: guardar la venta (incluye descuento de stock) en una sola transacción.
    // Si esto falla, la venta de verdad no se registró.
    let saleFolio: number;
    try {
      saleFolio = await saveSale(
        total,
        ticket,
        currentShift.id,
        currentUser?.id,
        paymentData.method,
        paymentData.received,
        paymentData.change,
        paymentData.requiresInvoice,
        paymentData.invoiceCustomerId
      );
    } catch (error) {
      console.error("Error guardando la venta:", error);
      await notify("No se pudo registrar la venta: " + error, 'error');
      setIsProcessing(false);
      return;
    }

    // La venta ya quedó guardada: limpiar el ticket y refrescar folio pase lo que pase después.
    const ticketSnapshot = ticket;
    setTicket([]);
    try {
      const nFolio = await getNextFolio();
      setNextFolio(nFolio);
    } catch (err) {
      console.error("Error actualizando folio:", err);
    }

    // 2. Parte no crítica: imprimir y abrir cajón. Un fallo aquí NUNCA debe leerse como
    // que la venta no se hizo — ya está guardada y cobrada.
    try {
      const ticketWidth = getTicketWidth(appSettings);
      const ticketText = buildSaleTicketText({
        settings: appSettings,
        width: ticketWidth,
        folioLabel: `FOLIO VENTA: ${String(saleFolio).padStart(6, '0')}`,
        cashierName: currentUser?.name || '',
        items: ticketSnapshot.map(t => ({ quantity: t.quantity, name: t.product.name, lineTotal: t.product.price * t.quantity })),
        subtotal, tax, total,
        paid: paymentData.received,
        change: paymentData.change,
      });

      // Verificamos si hay impresora conectada y si el modo de impresión es automático
      const autoPrint = isPrinterConfigured && appSettings.print_mode !== 'preview';
      if (autoPrint) {
        // El cajón se abre como parte de la misma impresión (ver print_receipt en Rust);
        // ya no se llama open_cash_drawer aparte, porque reabrir el puerto justo después
        // de que print_receipt lo cierra es lo que fallaba.
        await invoke("print_receipt", { portName: appSettings.printer_port, receiptData: withPrinterStyle(ticketText, appSettings), openDrawer: true });
      } else {
        await invoke("open_cash_drawer", { portName: appSettings.printer_port });
        setTicketToPrint(ticketText);
      }
    } catch (error) {
      console.error("Error imprimiendo/abriendo cajón:", error);
      await notify(`Venta registrada (Folio #${String(saleFolio).padStart(6, '0')}), pero no se pudo imprimir/abrir el cajón: ${error}`, 'warning');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!currentUser) {
    return <Login onLogin={setCurrentUser} inactivityLocked={inactivityLocked} onClearInactivity={() => setInactivityLocked(false)} />;
  }

  return (
    <div className="pos-layout">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        {hasPermission(currentUser, 'reports') && (
          <button
            className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentView('dashboard')}
          >
            <LayoutDashboard size={24} />
            <span className="tooltip-text">📊 Dashboard</span>
          </button>
        )}

        {hasPermission(currentUser, 'sales') && (
          <button
            className={`nav-item ${currentView === 'pos' ? 'active' : ''}`}
            onClick={() => setCurrentView('pos')}
          >
            <Store size={24} />
            <span className="tooltip-text">🏪 Punto de Venta (POS)</span>
          </button>
        )}

        {hasPermission(currentUser, 'reports') && (
          <button 
            className={`nav-item ${currentView === 'reportes' ? 'active' : ''}`}
            onClick={() => setCurrentView('reportes')}
          >
            <FileSpreadsheet size={24} />
            <span className="tooltip-text">📁 Centro de Reportes</span>
          </button>
        )}

        {hasPermission(currentUser, 'sales') && (
          <button
            className={`nav-item ${currentView === 'kardex' ? 'active' : ''}`}
            onClick={() => setCurrentView('kardex')}
          >
            <Receipt size={24} />
            <span className="tooltip-text">🧾 Kardex / Tickets</span>
          </button>
        )}

        {hasPermission(currentUser, 'inventory') && (
          <button
            className={`nav-item ${currentView === 'stock' ? 'active' : ''}`}
            onClick={() => setCurrentView('stock')}
          >
            <Package size={24} />
            <span className="tooltip-text">📦 Gestión de Productos</span>
          </button>
        )}

        {hasPermission(currentUser, 'recipes') && (
          <button
            className={`nav-item ${currentView === 'recetas' ? 'active' : ''}`}
            onClick={() => setCurrentView('recetas')}
          >
            <BookOpen size={24} />
            <span className="tooltip-text">📖 Recetas de Producción</span>
          </button>
        )}

        {hasPermission(currentUser, 'users') && (
          <>
            <button
              className={`nav-item ${currentView === 'usuarios' ? 'active' : ''}`}
              onClick={() => setCurrentView('usuarios')}
            >
              <Users size={24} />
              <span className="tooltip-text">👥 Gestión de Cajeros</span>
            </button>
            <button
              className={`nav-item ${currentView === 'bitacora' ? 'active' : ''}`}
              onClick={() => setCurrentView('bitacora')}
              style={{ color: '#673AB7' }}
            >
              <ClipboardList size={24} />
              <span className="tooltip-text">📋 Bitácora de Auditoría</span>
            </button>
          </>
        )}
        <div style={{ flex: 1 }}></div>
        <button
          className="nav-item"
          onClick={() => handleLogout("Bloqueó la caja (botón rápido)")}
        >
          <UserCircle size={24} />
          <span className="tooltip-text">🔒 Bloquear Caja</span>
        </button>
        {hasPermission(currentUser, 'settings') && (
          <button 
            className={`nav-item ${currentView === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentView('settings')}
          >
            <Settings size={24} />
            <span className="tooltip-text">⚙️ Configuración</span>
          </button>
        )}
        <button className="nav-item" style={{ color: 'var(--danger)' }} onClick={() => handleLogout("Cerró sesión")}>
          <LogOut size={24} />
          <span className="tooltip-text">🚪 Cerrar Sesión</span>
        </button>
      </aside>

      {/* Visor de Ticket Térmico en Pantalla Simulada (Solo se abre cuando no hay hardware físico) */}
      <TicketModal
        show={ticketToPrint !== ""}
        ticketData={ticketToPrint}
        logo={appSettings.biz_logo_img}
        onClose={() => setTicketToPrint("")}
        isPrinterConfigured={isPrinterConfigured}
        onPrint={handlePrintFromPreview}
      />

      <PaymentModal
        show={showPaymentModal}
        total={total}
        userId={currentUser?.id}
        onClose={() => setShowPaymentModal(false)}
        onConfirm={onPaymentConfirm}
      />

      {/* Ruteador de Vistas */}
      {(currentView === 'dashboard' && hasPermission(currentUser, 'reports')) ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Dashboard />
        </div>
      ) : (currentView === 'kardex' && hasPermission(currentUser, 'sales')) ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Kardex
            currentUser={currentUser}
            isPrinterConfigured={isPrinterConfigured}
            printerPort={appSettings.printer_port}
            onPreviewTicket={setTicketToPrint}
          />
        </div>
      ) : (currentView === 'stock' && hasPermission(currentUser, 'inventory')) ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Stock currentUser={currentUser} />
        </div>
      ) : (currentView === 'recetas' && hasPermission(currentUser, 'recipes')) ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Recetas currentUser={currentUser} />
        </div>
      ) : (currentView === 'usuarios' && hasPermission(currentUser, 'users')) ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Usuarios currentUser={currentUser} />
        </div>
      ) : (currentView === 'settings' && hasPermission(currentUser, 'settings')) ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <SettingsView currentUser={currentUser} />
        </div>
      ) : (currentView === 'reportes' && hasPermission(currentUser, 'reports')) ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Reportes />
        </div>
      ) : (currentView === 'bitacora' && hasPermission(currentUser, 'users')) ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Bitacora />
        </div>
      ) : (
        <>
          {posTab === 'venta' ? (
            <>
              {/* Main Container - Products (POS) */}
              <main className="main-area">
                <header className="top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div className="search-bar">
                    <Search size={20} color="var(--text-muted)" />
                    <input
                      type="text"
                      placeholder="Buscar pan, código de barras..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </div>

                  {/* Tab Selector inside POS Header */}
                  <div style={{ display: 'flex', gap: '0.25rem', backgroundColor: 'var(--bg-tertiary)', padding: '0.25rem', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                    <button
                      onClick={() => setPosTab('venta')}
                      style={{
                        padding: '0.5rem 1.2rem', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
                        backgroundColor: 'white', color: 'var(--text-main)', boxShadow: 'var(--shadow-sm)'
                      }}
                    >
                      🛒 Venta
                    </button>
                    <button
                      onClick={() => setPosTab('cortes')}
                      style={{
                        padding: '0.5rem 1.2rem', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
                        backgroundColor: 'transparent', color: 'var(--text-muted)'
                      }}
                    >
                      🔑 Arqueo de Caja
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                      onClick={handleReopenVisor}
                      title="Reabrir Visor de Cliente (Ctrl+5)"
                      style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.5rem 1.2rem', border: '1px solid var(--border-light)',
                        borderRadius: '8px', backgroundColor: 'var(--bg-secondary)',
                        color: 'var(--text-main)', cursor: 'pointer', fontWeight: 600,
                        transition: 'all 0.2s', fontSize: '0.9rem', boxShadow: 'var(--shadow-sm)'
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                    >
                      <Monitor size={16} /> Visor (Ctrl+5)
                    </button>
                    <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      POS PRO v3.0 <span style={{ color: 'var(--accent-primary)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>OFFLINE</span>
                    </div>
                  </div>
                </header>

                {/* Categorías */}
                <section className="categories-scroll">
                  {CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      className={`category-pill ${activeCategory === cat ? 'active' : ''}`}
                      onClick={() => setActiveCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </section>

                {/* Catálogo de Productos */}
                <section className="products-grid">
                  {errorMsg && (
                    <div style={{ gridColumn: '1 / -1', padding: '2rem', backgroundColor: '#ffebee', color: '#c62828', borderRadius: '12px' }}>
                      <strong>Error de Base de Datos:</strong><br />
                      {errorMsg}
                    </div>
                  )}

                  {!errorMsg && filteredProducts.map(product => {
                    const stock = (product as any).stock || 0;
                    const allowNegative = appSettings.allow_negative_stock !== 'false';
                    const outOfStock = !allowNegative && stock <= 0;
                    return (
                      <div
                        key={product.id}
                        className="product-card"
                        onClick={() => {
                          if (outOfStock) return;
                          addToTicket(product);
                        }}
                        style={{ opacity: outOfStock ? 0.45 : 1, cursor: outOfStock ? 'not-allowed' : 'pointer', position: 'relative' }}
                      >
                        {/* Badge de stock */}
                        <div style={{
                          position: 'absolute', top: '0.5rem', right: '0.5rem',
                          backgroundColor: stock <= 0 ? 'var(--danger)' : (stock <= 5 ? '#ff9800' : 'var(--accent-primary)'),
                          color: 'white', borderRadius: 'var(--radius-full)', padding: '0.15rem 0.5rem',
                          fontSize: '0.7rem', fontWeight: 700
                        }}>
                          {stock <= 0 ? (allowNegative ? `Stock: ${stock}` : 'AGOTADO') : stock}
                        </div>
                        <div className="product-image-wrap" style={{ fontSize: '4rem' }}>
                          {isImageIcon(product.img) ? (
                            <img src={product.img} alt="" />
                          ) : (
                            product.img
                          )}
                        </div>
                        <h3 className="product-name">{product.name}</h3>
                        <div className="product-price">${product.price.toFixed(2)}</div>
                      </div>
                    );
                  })}
                  {!errorMsg && filteredProducts.length === 0 && (
                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                      No se encontraron productos...
                    </div>
                  )}
                </section>
              </main>

              {/* Ticket Panel */}
              <aside className="ticket-panel">
                <header className="ticket-header">
                  <h2>
                    Folio: {String(nextFolio).padStart(6, '0')}
                    <span className="status">Caja 01</span>
                  </h2>
                </header>

                <div className="ticket-body">
                  {ticket.length === 0 ? (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem' }}>
                      <ShoppingCart size={48} style={{ opacity: 0.2, margin: '0 auto 1rem' }} />
                      <p>Ticket vacío. Selecciona productos para iniciar la venta.</p>
                    </div>
                  ) : (
                    ticket.map((item) => (
                      <div className="ticket-item" key={item.product.id}>
                        <div className="item-info">
                          <span className="item-name">{item.product.name}</span>
                          <span className="item-price">${item.product.price.toFixed(2)} c/u</span>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                          <div className="item-quantity">
                            <button className="qty-btn" onClick={() => updateQuantity(item.product.id, -1)}>
                              {item.quantity === 1 ? <Trash2 size={14} color="var(--danger)" /> : <Minus size={14} />}
                            </button>
                            <span style={{ width: '20px', textAlign: 'center', fontWeight: 'bold' }}>{item.quantity}</span>
                            <button className="qty-btn" onClick={() => updateQuantity(item.product.id, 1)}>
                              <Plus size={14} />
                            </button>
                          </div>
                          <div className="item-total">
                            ${(item.product.price * item.quantity).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <footer className="ticket-footer">
                  <div className="totals">
                    <div className="total-row">
                      <span>Subtotal</span>
                      <span>${subtotal.toFixed(2)}</span>
                    </div>
                    <div className="total-row">
                      <span>IVA (16%)</span>
                      <span>${tax.toFixed(2)}</span>
                    </div>
                    <div className="total-row grand-total">
                      <span>Total</span>
                      <span>${total.toFixed(2)}</span>
                    </div>
                  </div>

                  <button
                    className="pay-btn"
                    disabled={ticket.length === 0 || isProcessing}
                    style={{ opacity: (ticket.length === 0 || isProcessing) ? 0.5 : 1, cursor: (ticket.length === 0 || isProcessing) ? 'not-allowed' : 'pointer' }}
                    onClick={handleCheckout}
                  >
                    {isProcessing ? "Procesando..." : "COBRAR"}
                    <ChevronRight size={24} />
                  </button>
                </footer>
              </aside>
            </>
          ) : (
            <main className="main-area" style={{ flex: 1, padding: '2rem', display: 'flex', flexDirection: 'column' }}>
              <header className="top-bar" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)' }}>🔑 Control de Turno y Arqueo</div>

                {/* Tab Selector inside POS Header */}
                <div style={{ display: 'flex', gap: '0.25rem', backgroundColor: 'var(--bg-tertiary)', padding: '0.25rem', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
                  <button
                    onClick={() => setPosTab('venta')}
                    style={{
                      padding: '0.5rem 1.2rem', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
                      backgroundColor: 'transparent', color: 'var(--text-muted)'
                    }}
                  >
                    🛒 Venta
                  </button>
                  <button
                    onClick={() => setPosTab('cortes')}
                    style={{
                      padding: '0.5rem 1.2rem', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer',
                      backgroundColor: 'white', color: 'var(--text-main)', boxShadow: 'var(--shadow-sm)'
                    }}
                  >
                    🔑 Arqueo de Caja
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                  <button
                    onClick={handleReopenVisor}
                    title="Reabrir Visor de Cliente (Ctrl+5)"
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.5rem',
                      padding: '0.5rem 1.2rem', border: '1px solid var(--border-light)',
                      borderRadius: '8px', backgroundColor: 'var(--bg-secondary)',
                      color: 'var(--text-main)', cursor: 'pointer', fontWeight: 600,
                      transition: 'all 0.2s', fontSize: '0.9rem', boxShadow: 'var(--shadow-sm)'
                    }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                  >
                    <Monitor size={16} /> Visor (Ctrl+5)
                  </button>
                  <div style={{ fontSize: '1.2rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    POS PRO v3.0 <span style={{ color: 'var(--accent-primary)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>OFFLINE</span>
                  </div>
                </div>
              </header>

              <div style={{ flex: 1, overflowY: 'auto' }}>
                <Cortes shift={currentShift} onShiftChange={loadData} isPrinterConfigured={isPrinterConfigured} printerPort={appSettings.printer_port} onPreviewTicket={setTicketToPrint} currentUser={currentUser} />
              </div>
            </main>
          )}
        </>
      )}
    </div>
  );
}

export default App;
