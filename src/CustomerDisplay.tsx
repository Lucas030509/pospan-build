import { useState, useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { ShoppingCart, Store } from "lucide-react";
import "./App.css"; // Reuse existing design system
import ProductIcon from "./components/ProductIcon";

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

interface CartEvent {
  ticket: TicketItem[];
  total: number;
  subtotal: number;
  tax: number;
}

export default function CustomerDisplay() {
  const [cart, setCart] = useState<TicketItem[]>([]);
  const [total, setTotal] = useState(0);
  const [subtotal, setSubtotal] = useState(0);
  const [tax, setTax] = useState(0);
  const [paymentInfo, setPaymentInfo] = useState<{
    isOpen: boolean, method: string, total: number,
    received?: number, change?: number, cashAmount?: number, cardAmount?: number
  } | null>(null);

  const [settings, setSettings] = useState<Record<string, string>>({});
  const cartScrollRef = useRef<HTMLDivElement>(null);

  // Conforme se agregan productos el visor del cliente debe bajar solo hasta el último
  // renglón, para que la persona vea aparecer cada producto sin tener que scrollear a mano.
  useEffect(() => {
    const el = cartScrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [cart]);

  useEffect(() => {
    // Cargar configuraciones iniciales
    const loadSettings = async () => {
        const { getSettings } = await import("./db");
        const s = await getSettings();
        setSettings(s);
    };
    loadSettings();

    const unlisten = listen<CartEvent>("cart-update", (event) => {
      const { ticket, total, subtotal, tax } = event.payload;
      setCart(ticket);
      setTotal(total);
      setSubtotal(subtotal);
      setTax(tax);
    });

    const unlistenPayment = listen<any>("payment-sync", (event) => {
        setPaymentInfo(event.payload);
    });

    return () => {
      unlisten.then((fn) => fn());
      unlistenPayment.then((fn) => fn());
    };
  }, []);

  return (
    <div className="customer-display-layout" style={{ 
      height: '100vh', 
      width: '100vw', 
      background: 'linear-gradient(135deg, var(--bg-primary) 0%, #FAF1E6 100%)',
      display: 'flex',
      flexDirection: 'column',
      padding: '2rem'
    }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {settings.biz_logo_img ? (
            <img src={settings.biz_logo_img} alt="Logo" style={{ height: '60px', width: 'auto', objectFit: 'contain' }} />
          ) : (
            <Store size={48} color="var(--accent-primary)" />
          )}
          <h1 style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-main)' }}>{settings.biz_name || 'POS PRO'} <span style={{ color: 'var(--accent-primary)' }}>{settings.biz_subtitle || 'PANADERÍA'}</span></h1>
        </div>
        <div style={{ padding: '0.5rem 1.5rem', background: 'white', borderRadius: 'var(--radius-full)', border: '1px solid var(--border-light)', fontWeight: 600 }}>
          Atendiéndole con gusto
        </div>
      </header>

      <div style={{ display: 'flex', flex: 1, gap: '2rem', overflow: 'hidden' }}>
        {/* Cart Contents */}
        <div style={{ 
          flex: 1, 
          background: 'white', 
          borderRadius: 'var(--radius-lg)', 
          boxShadow: 'var(--shadow-md)',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <h2 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <ShoppingCart size={28} /> Su Carrito
          </h2>

          <div ref={cartScrollRef} style={{ flex: 1, overflowY: 'auto', paddingRight: '0.5rem' }}>
            {cart.length === 0 ? (
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)' }}>
                <ShoppingCart size={80} style={{ opacity: 0.1, marginBottom: '1rem' }} />
                <p style={{ fontSize: '1.2rem' }}>Seleccionamos el mejor pan para usted...</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {cart.map((item) => (
                  <div key={item.product.id} className="customer-ticket-item" style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    padding: '1rem',
                    background: 'var(--bg-primary)',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-light)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <ProductIcon icon={item.product.img} size="2.5rem" />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '1.4rem' }}>{item.product.name}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                          {item.quantity} x ${item.product.price.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontWeight: 800, fontSize: '1.6rem', color: 'var(--accent-primary)' }}>
                      ${(item.product.price * item.quantity).toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Pricing Summary */}
        <div style={{ 
          width: '350px', 
          background: 'var(--text-main)', 
          color: 'white', 
          borderRadius: 'var(--radius-lg)', 
          padding: '2rem',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <h2 style={{ fontSize: '2rem', marginBottom: '2rem', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '1rem' }}>Resumen</h2>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem' }}>
              <span style={{ opacity: 0.7 }}>Subtotal</span>
              <span>${subtotal.toFixed(2)}</span>
            </div>
             {settings.tax_enabled !== 'false' && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem' }}>
                <span style={{ opacity: 0.7 }}>IVA ({settings.tax_rate || '16'}%)</span>
                <span>${tax.toFixed(2)}</span>
              </div>
             )}

            <div style={{ flex: 1 }}></div>

            <div style={{ 
              background: 'rgba(255,255,255,0.05)', 
              padding: '1.5rem', 
              borderRadius: 'var(--radius-md)',
              border: '1px solid rgba(255,255,255,0.1)',
              marginTop: 'auto'
            }}>
              <div style={{ opacity: 0.7, fontSize: '1rem', marginBottom: '0.5rem' }}>TOTAL A PAGAR</div>
              <div style={{ fontSize: '4rem', fontWeight: 900, color: 'var(--warning)', textAlign: 'right' }}>
                ${total.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Payment Overlay */}
      {paymentInfo?.isOpen && (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'var(--bg-primary)', zIndex: 100,
            display: 'flex', flexDirection: 'column', padding: '3rem',
            animation: 'fadeIn 0.3s ease'
        }}>
            {paymentInfo.method === 'cortesia' ? (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: '6rem', marginBottom: '1rem' }}>🎁</div>
                    <h1 style={{ fontSize: '3.5rem', fontWeight: 900, color: 'var(--accent-primary)', marginBottom: '1rem' }}>CORTESÍA DE LA CASA</h1>
                    <p style={{ fontSize: '1.3rem', color: 'var(--text-muted)' }}>Este pedido no tiene costo.</p>
                </div>
            ) : (
                <>
                    <header style={{ textAlign: 'center', marginBottom: '4rem' }}>
                        <h1 style={{ fontSize: '3rem', fontWeight: 900, color: 'var(--accent-primary)' }}>PAGO EN PROCESO</h1>
                        <p style={{ fontSize: '1.2rem', color: 'var(--text-muted)' }}>Por favor, verifique el monto de su compra.</p>
                    </header>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', flex: 1 }}>
                        {/* Total Detail */}
                        <div style={{ background: 'white', borderRadius: '24px', padding: '2.5rem', boxShadow: '0 10px 30px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <div style={{ fontSize: '1.5rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>TOTAL A PAGAR</div>
                            <div style={{ fontSize: '6rem', fontWeight: 900, color: 'var(--text-main)', letterSpacing: '-2px' }}>
                                ${(paymentInfo.total || total).toFixed(2)}
                            </div>
                            {paymentInfo.method === 'card' && (
                                <div style={{ marginTop: '2rem', display: 'flex', alignItems: 'center', gap: '1rem', color: 'var(--accent-primary)', fontSize: '1.2rem', fontWeight: 600 }}>
                                    💳 Pago con Tarjeta en terminal externa
                                </div>
                            )}
                        </div>

                        {/* Dynamics (Received & Change / Desglose mixto) */}
                        {paymentInfo.method === 'cash' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <div style={{ background: 'var(--text-main)', color: 'white', borderRadius: '24px', padding: '2.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <div style={{ opacity: 0.7, fontSize: '1.5rem', marginBottom: '0.5rem' }}>ENTREGADO</div>
                                    <div style={{ fontSize: '5rem', fontWeight: 900, color: 'var(--warning)' }}>
                                        ${(paymentInfo.received || 0).toFixed(2)}
                                    </div>
                                </div>

                                <div style={{ background: 'var(--success)', color: 'white', borderRadius: '24px', padding: '2.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <div style={{ opacity: 0.8, fontSize: '1.5rem', marginBottom: '0.5rem' }}>SU CAMBIO</div>
                                    <div style={{ fontSize: '5rem', fontWeight: 900 }}>
                                        ${(paymentInfo.change || 0).toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        )}

                        {paymentInfo.method === 'mixed' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                                <div style={{ background: 'var(--text-main)', color: 'white', borderRadius: '24px', padding: '2.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <div style={{ opacity: 0.7, fontSize: '1.5rem', marginBottom: '0.5rem' }}>💵 EN EFECTIVO</div>
                                    <div style={{ fontSize: '5rem', fontWeight: 900, color: 'var(--warning)' }}>
                                        ${(paymentInfo.cashAmount || 0).toFixed(2)}
                                    </div>
                                </div>

                                <div style={{ background: 'var(--accent-primary)', color: 'white', borderRadius: '24px', padding: '2.5rem', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                    <div style={{ opacity: 0.85, fontSize: '1.5rem', marginBottom: '0.5rem' }}>💳 EN TARJETA</div>
                                    <div style={{ fontSize: '5rem', fontWeight: 900 }}>
                                        ${(paymentInfo.cardAmount || 0).toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            )}

            <style dangerouslySetInnerHTML={{__html: `
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}} />
        </div>
      )}
    </div>
  );
}
