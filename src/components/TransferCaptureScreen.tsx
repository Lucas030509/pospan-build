import { useState, useRef } from "react";
import { ArrowLeft, Search, Trash2, Minus, Plus, Check, Package, Wheat } from "lucide-react";
import { notify } from "../lib/dialogs";
import { isImageIcon } from "../lib/iconLibrary";
import { createGeneralTransfer } from "../db";
import { makeTapHandlers } from "../lib/touch";

interface CatalogItem {
    id: number;
    name: string;
    img?: string;
    unit?: string;
}

interface CartLine {
    itemType: 'product' | 'ingredient';
    itemId: number;
    name: string;
    unit?: string;
    quantity: number;
}

interface WarehouseOption {
    id: number;
    name: string;
}

interface TransferCaptureScreenProps {
    warehouses: WarehouseOption[];
    products: CatalogItem[];
    ingredients: CatalogItem[];
    userId?: number;
    onBack: () => void;
    onDone: () => void;
}

export default function TransferCaptureScreen({ warehouses, products, ingredients, userId, onBack, onDone }: TransferCaptureScreenProps) {
    const [itemType, setItemType] = useState<'product' | 'ingredient'>('product');
    const [search, setSearch] = useState("");
    const [cart, setCart] = useState<CartLine[]>([]);
    const [notes, setNotes] = useState("");
    const [sourceWarehouseId, setSourceWarehouseId] = useState<number | "">("");
    const [destWarehouseId, setDestWarehouseId] = useState<number | "">("");
    const [saving, setSaving] = useState(false);
    const dragStart = useRef<{ x: number; y: number } | null>(null);

    const catalog = itemType === 'product' ? products : ingredients;
    const filtered = catalog.filter(i => !search.trim() || i.name.toLowerCase().includes(search.trim().toLowerCase()));

    const addToCart = (item: CatalogItem) => {
        setCart(prev => {
            const idx = prev.findIndex(l => l.itemType === itemType && l.itemId === item.id);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
                return next;
            }
            return [...prev, { itemType, itemId: item.id, name: item.name, unit: item.unit, quantity: 1 }];
        });
    };

    const updateQty = (itemType: 'product' | 'ingredient', itemId: number, delta: number) => {
        setCart(prev => prev
            .map(l => (l.itemType === itemType && l.itemId === itemId) ? { ...l, quantity: l.quantity + delta } : l)
            .filter(l => l.quantity > 0));
    };

    const removeLine = (itemType: 'product' | 'ingredient', itemId: number) => {
        setCart(prev => prev.filter(l => !(l.itemType === itemType && l.itemId === itemId)));
    };

    const handleSubmit = async () => {
        if (cart.length === 0) return notify("Agrega al menos un producto o insumo al traspaso.", 'warning');
        if (!sourceWarehouseId || !destWarehouseId) return notify("Selecciona almacén de origen y destino.", 'warning');
        if (sourceWarehouseId === destWarehouseId) return notify("El origen y el destino no pueden ser el mismo almacén.", 'warning');
        setSaving(true);
        try {
            const folio = await createGeneralTransfer({
                sourceWarehouseId: Number(sourceWarehouseId),
                destWarehouseId: Number(destWarehouseId),
                items: cart.map(l => ({ itemType: l.itemType, itemId: l.itemId, quantity: l.quantity })),
                notes,
            }, userId);
            await notify(`Traspaso registrado. Folio ${folio}. Queda pendiente de confirmar en Recepción de Traspasos.`, 'info');
            setCart([]);
            setNotes("");
            onDone();
        } catch (err: any) {
            await notify("No se pudo registrar el traspaso: " + (err.message || err), 'error');
        } finally {
            setSaving(false);
        }
    };

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
                    <h3 style={{ margin: 0, color: 'var(--accent-primary)' }}>🔀 Nuevo Traspaso</h3>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                        <label style={{ fontWeight: 600 }}>Origen:</label>
                        <select value={sourceWarehouseId} onChange={e => setSourceWarehouseId(Number(e.target.value) || "")}
                            style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                            <option value="">-- Selecciona --</option>
                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem' }}>
                        <label style={{ fontWeight: 600 }}>Destino:</label>
                        <select value={destWarehouseId} onChange={e => setDestWarehouseId(Number(e.target.value) || "")}
                            style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                            <option value="">-- Selecciona --</option>
                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                    </div>

                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)', padding: '0.5rem 1rem', border: '1px solid var(--border-light)', width: '220px' }}>
                        <Search size={16} color="var(--text-muted)" />
                        <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
                            style={{ border: 'none', background: 'transparent', outline: 'none', marginLeft: '0.5rem', width: '100%' }} />
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                    <button onClick={() => setItemType('product')} className={`category-pill ${itemType === 'product' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Package size={14} /> Productos
                    </button>
                    <button onClick={() => setItemType('ingredient')} className={`category-pill ${itemType === 'ingredient' ? 'active' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Wheat size={14} /> Insumos
                    </button>
                </div>

                <section className="products-grid">
                    {filtered.map(item => (
                        <div key={item.id} className="product-card" {...makeTapHandlers(dragStart, () => addToCart(item))} style={{ cursor: 'pointer', position: 'relative' }}>
                            <div className="product-image-wrap" style={{ fontSize: '1.5rem' }}>
                                {itemType === 'product' && isImageIcon(item.img) ? <img src={item.img} alt="" /> : (item.img || (itemType === 'product' ? '📦' : '🌾'))}
                            </div>
                            <h3 className="product-name">{item.name}</h3>
                            {item.unit && <div className="product-price">{item.unit}</div>}
                        </div>
                    ))}
                    {filtered.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            No se encontraron {itemType === 'product' ? 'productos' : 'insumos'}.
                        </div>
                    )}
                </section>
            </div>

            <aside className="ticket-panel" style={{ flexShrink: 0 }}>
                <header className="ticket-header">
                    <h2>Traspaso</h2>
                </header>

                <div className="ticket-body">
                    {cart.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem' }}>
                            <p>Toca productos o insumos para agregarlos al traspaso.</p>
                        </div>
                    ) : (
                        cart.map(line => (
                            <div className="ticket-item" key={`${line.itemType}-${line.itemId}`}>
                                <div className="item-info">
                                    <span className="item-name">{line.name}</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{line.itemType === 'product' ? 'Producto' : 'Insumo'}</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div className="item-quantity">
                                        <button className="qty-btn" onClick={() => updateQty(line.itemType, line.itemId, -1)}>
                                            {line.quantity === 1 ? <Trash2 size={14} color="var(--danger)" /> : <Minus size={14} />}
                                        </button>
                                        <span style={{ width: '24px', textAlign: 'center', fontWeight: 'bold' }}>{line.quantity}</span>
                                        <button className="qty-btn" onClick={() => updateQty(line.itemType, line.itemId, 1)}>
                                            <Plus size={14} />
                                        </button>
                                    </div>
                                    <button onClick={() => removeLine(line.itemType, line.itemId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
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
                    <button
                        className="pay-btn"
                        disabled={saving || cart.length === 0 || !sourceWarehouseId || !destWarehouseId}
                        onClick={handleSubmit}
                        style={{ width: '100%', opacity: (saving || cart.length === 0) ? 0.6 : 1 }}
                    >
                        <Check size={20} /> {saving ? 'Guardando...' : 'Registrar Traspaso'}
                    </button>
                </footer>
            </aside>
        </div>
    );
}
