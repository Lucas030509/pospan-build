import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Search, Minus, Plus, Trash2, Check } from "lucide-react";
import { getProductsPendingReceipt, receiveProductionUnits } from "../db";
import { notify } from "../lib/dialogs";
import { isImageIcon } from "../lib/iconLibrary";
import { makeTapHandlers } from "../lib/touch";

interface PendingProduct {
    product_id: number;
    product_name: string;
    product_category: string;
    product_img: string;
    pending: number;
}

interface ReceiptLine {
    productId: number;
    name: string;
    img: string;
    pending: number;
    quantity: number;
}

interface ProductionReceiptScreenProps {
    branchId: number;
    userId?: number;
    onBack: () => void;
}

export default function ProductionReceiptScreen({ branchId, userId, onBack }: ProductionReceiptScreenProps) {
    const [pendingProducts, setPendingProducts] = useState<PendingProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [cart, setCart] = useState<ReceiptLine[]>([]);
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const dragStart = useRef<{ x: number; y: number } | null>(null);

    const loadPending = async () => {
        setLoading(true);
        try {
            const rows = await getProductsPendingReceipt(branchId);
            setPendingProducts(rows);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadPending(); }, [branchId]);

    const filtered = pendingProducts.filter(p =>
        !search.trim() || p.product_name.toLowerCase().includes(search.trim().toLowerCase())
    );

    const addToCart = (p: PendingProduct) => {
        setCart(prev => {
            const idx = prev.findIndex(l => l.productId === p.product_id);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
                return next;
            }
            return [...prev, { productId: p.product_id, name: p.product_name, img: p.product_img, pending: Number(p.pending), quantity: 1 }];
        });
    };

    const updateQty = (productId: number, delta: number) => {
        setCart(prev => prev
            .map(l => l.productId === productId ? { ...l, quantity: l.quantity + delta } : l)
            .filter(l => l.quantity > 0));
    };

    const removeLine = (productId: number) => {
        setCart(prev => prev.filter(l => l.productId !== productId));
    };

    const exceedsPending = cart.some(l => l.quantity > l.pending);

    const handleSubmit = async () => {
        if (cart.length === 0) return notify("Agrega al menos un producto recibido.", 'warning');
        setSaving(true);
        try {
            const folio = await receiveProductionUnits({
                branchId,
                lines: cart.map(l => ({ productId: l.productId, quantity: l.quantity })),
                notes,
            }, userId);
            await notify(`Recepción registrada. Folio ${folio}.`, 'info');
            setCart([]);
            setNotes("");
            onBack();
        } catch (err: any) {
            await notify("No se pudo registrar la recepción: " + (err.message || err), 'error');
            await loadPending();
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={{ padding: '2rem' }}>Cargando pendientes de producción...</div>;

    return (
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                    <button onClick={onBack} style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem', padding: '0.6rem 1rem',
                        border: '1px solid var(--border-light)', borderRadius: '8px', background: 'var(--bg-secondary)', cursor: 'pointer', fontWeight: 600
                    }}>
                        <ArrowLeft size={18} /> Volver
                    </button>
                    <h3 style={{ margin: 0, color: 'var(--accent-primary)' }}>📦 Recepción de Producción</h3>

                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)', padding: '0.5rem 1rem', border: '1px solid var(--border-light)', width: '220px' }}>
                        <Search size={16} color="var(--text-muted)" />
                        <input type="text" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)}
                            style={{ border: 'none', background: 'transparent', outline: 'none', marginLeft: '0.5rem', width: '100%' }} />
                    </div>
                </div>

                <section className="products-grid">
                    {filtered.map(p => (
                        <div key={p.product_id} className="product-card" {...makeTapHandlers(dragStart, () => addToCart(p))} style={{ cursor: 'pointer', position: 'relative' }}>
                            <div className="product-image-wrap" style={{ fontSize: '2rem' }}>
                                {isImageIcon(p.product_img) ? <img src={p.product_img} alt="" /> : p.product_img}
                            </div>
                            <h3 className="product-name">{p.product_name}</h3>
                            <div className="product-price">Pendiente: {p.pending}</div>
                        </div>
                    ))}
                    {filtered.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            No hay productos con órdenes de producción pendientes de recibir en esta sucursal.
                        </div>
                    )}
                </section>
            </div>

            <aside className="ticket-panel" style={{ flexShrink: 0 }}>
                <header className="ticket-header">
                    <h2>Recepción</h2>
                </header>

                <div className="ticket-body">
                    {cart.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem' }}>
                            <p>Toca productos pendientes para registrar cuánto llegó.</p>
                        </div>
                    ) : (
                        cart.map(line => (
                            <div className="ticket-item" key={line.productId}>
                                <div className="item-info">
                                    <span className="item-name">{line.name}</span>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Pendiente: {line.pending}</span>
                                    {line.quantity > line.pending && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 700 }}>⚠️ Excede lo pendiente ({line.pending})</span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div className="item-quantity">
                                        <button className="qty-btn" onClick={() => updateQty(line.productId, -1)}>
                                            {line.quantity === 1 ? <Trash2 size={14} color="var(--danger)" /> : <Minus size={14} />}
                                        </button>
                                        <span style={{ width: '24px', textAlign: 'center', fontWeight: 'bold' }}>{line.quantity}</span>
                                        <button className="qty-btn" onClick={() => updateQty(line.productId, 1)}>
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                    <button onClick={() => removeLine(line.productId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                <footer className="ticket-footer">
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600, fontSize: '0.85rem' }}>Notas (opcional)</label>
                        <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                    </div>
                    {exceedsPending && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--danger)', fontWeight: 700, marginBottom: '0.75rem' }}>
                            ⚠️ Alguna línea excede lo pendiente; el sistema la rechazará al guardar.
                        </p>
                    )}
                    <button
                        className="pay-btn"
                        disabled={saving || cart.length === 0}
                        onClick={handleSubmit}
                        style={{ width: '100%', opacity: (saving || cart.length === 0) ? 0.6 : 1 }}
                    >
                        <Check size={20} /> {saving ? 'Guardando...' : 'Registrar Recepción'}
                    </button>
                </footer>
            </aside>
        </div>
    );
}
