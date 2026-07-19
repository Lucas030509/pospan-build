import { useState, useEffect } from "react";
import {
    getProducts, getIngredients, createIngredient, updateIngredient, deleteIngredient,
    addInventoryMovement,
    getAdjustments, createAdjustment, cancelAdjustment
} from "./db";
import { Package, Plus, Edit2, Trash2, ArrowUpCircle, ArrowDownCircle, AlertTriangle, Search, XCircle, Layers } from "lucide-react";
import Inventario from "./Inventario";
import { notify, confirmAction } from "./lib/dialogs";
import ProductIcon from "./components/ProductIcon";

type TabType = 'catalogo' | 'existencias' | 'ingredientes' | 'movimientos';

const PRODUCT_CATEGORIES = ["Pan Dulce", "Bolillo y Telera", "Pasteles", "Bebidas", "Postres", "Galletas", "Especialidades", "Abarrotes"];

export default function Stock({ currentUser }: { currentUser: any }) {
    const [tab, setTab] = useState<TabType>('catalogo');
    const [products, setProducts] = useState<any[]>([]);
    const [ingredients, setIngredients] = useState<any[]>([]);
    const [adjustments, setAdjustments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    // Existencias: autocompletado y categorías
    const [existSearch, setExistSearch] = useState("");
    const [existShowSuggestions, setExistShowSuggestions] = useState(false);
    const [existCategory, setExistCategory] = useState<string | null>(null);

    // Modal de Ajuste con Folio (ENTAJ / SALAJ)
    const [showAdjModal, setShowAdjModal] = useState(false);
    const [adjType, setAdjType] = useState<'ENTAJ' | 'SALAJ'>('ENTAJ');
    const [adjProductSearch, setAdjProductSearch] = useState("");
    const [adjShowSuggestions, setAdjShowSuggestions] = useState(false);
    const [adjProduct, setAdjProduct] = useState<any | null>(null);
    const [adjQty, setAdjQty] = useState("");
    const [adjUnitCost, setAdjUnitCost] = useState("");
    const [adjNotes, setAdjNotes] = useState("");
    const [savingAdj, setSavingAdj] = useState(false);

    // Modal para ingrediente
    const [showIngModal, setShowIngModal] = useState(false);
    const [editIngId, setEditIngId] = useState<number | null>(null);
    const [ingName, setIngName] = useState("");
    const [ingUnit, setIngUnit] = useState("kg");
    const [ingMinStock, setIngMinStock] = useState("0");
    const [ingCost, setIngCost] = useState("0");

    // Modal para movimiento
    const [showMovModal, setShowMovModal] = useState(false);
    const [movItemType, setMovItemType] = useState<'product' | 'ingredient'>('product');
    const [movItemId, setMovItemId] = useState<number>(0);
    const [movType, setMovType] = useState<'entry' | 'exit'>('entry');
    const [movQty, setMovQty] = useState("");
    const [movReason, setMovReason] = useState("");

    const loadData = async () => {
        setLoading(true);
        try {
            const [p, i, a] = await Promise.all([getProducts(), getIngredients(), getAdjustments()]);
            setProducts(p);
            setIngredients(i);
            setAdjustments(a);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadData(); }, []);

    // === Ingredientes CRUD ===
    const openIngModal = (ing?: any) => {
        if (ing) {
            setEditIngId(ing.id);
            setIngName(ing.name);
            setIngUnit(ing.unit);
            setIngMinStock(String(ing.min_stock));
            setIngCost(String(ing.cost_per_unit));
        } else {
            setEditIngId(null); setIngName(""); setIngUnit("kg"); setIngMinStock("0"); setIngCost("0");
        }
        setShowIngModal(true);
    };

    const saveIng = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!ingName) return notify("Nombre requerido", 'warning');
        if (editIngId) {
            await updateIngredient(editIngId, { name: ingName, unit: ingUnit, min_stock: Number(ingMinStock), cost_per_unit: Number(ingCost) });
        } else {
            await createIngredient({ name: ingName, unit: ingUnit, stock: 0, min_stock: Number(ingMinStock), cost_per_unit: Number(ingCost) });
        }
        setShowIngModal(false);
        loadData();
    };

    const delIng = async (id: number) => {
        if (await confirmAction("¿Eliminar este ingrediente?")) { await deleteIngredient(id); loadData(); }
    };

    // === Movimientos ===
    const openMovModal = (itemType: 'product' | 'ingredient', itemId: number, type: 'entry' | 'exit') => {
        setMovItemType(itemType); setMovItemId(itemId); setMovType(type);
        setMovQty(""); setMovReason("");
        setShowMovModal(true);
    };

    const saveMov = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!movQty || Number(movQty) <= 0) return notify("Cantidad inválida", 'warning');
        await addInventoryMovement(movItemType, movItemId, movType, Number(movQty), movReason || (movType === 'entry' ? 'Entrada manual' : 'Salida manual'), currentUser?.id);
        setShowMovModal(false);
        loadData();
    };

    const filtered = (arr: any[]) => {
        if (!searchTerm) return arr;
        return arr.filter(i => i.name?.toLowerCase().includes(searchTerm.toLowerCase()) || i.item_name?.toLowerCase().includes(searchTerm.toLowerCase()));
    };

    // === Existencias: autocompletado y categorías ===
    const existSuggestions = existSearch.trim()
        ? products.filter(p => p.name.toLowerCase().includes(existSearch.trim().toLowerCase())).slice(0, 8)
        : [];

    const categorySummaries = PRODUCT_CATEGORIES.map(cat => {
        const items = products.filter(p => p.category === cat);
        return {
            category: cat,
            count: items.length,
            valuation: items.reduce((sum, p) => sum + ((p.stock || 0) * (p.cost || 0)), 0),
        };
    });
    const totalValuation = products.reduce((sum, p) => sum + ((p.stock || 0) * (p.cost || 0)), 0);

    const existDetailProducts = existCategory
        ? products
            .filter(p => existCategory === 'Todas' || p.category === existCategory)
            .filter(p => !existSearch.trim() || p.name.toLowerCase().includes(existSearch.trim().toLowerCase()))
        : [];

    const selectExistSuggestion = (p: any) => {
        setExistSearch(p.name);
        setExistShowSuggestions(false);
        setExistCategory('Todas');
    };

    // === Ajustes con Folio (ENTAJ / SALAJ) ===
    const adjSuggestions = adjProductSearch.trim()
        ? products.filter(p => p.name.toLowerCase().includes(adjProductSearch.trim().toLowerCase())).slice(0, 8)
        : [];

    const openAdjModal = (type: 'ENTAJ' | 'SALAJ') => {
        setAdjType(type);
        setAdjProduct(null);
        setAdjProductSearch("");
        setAdjShowSuggestions(false);
        setAdjQty("");
        setAdjUnitCost("");
        setAdjNotes("");
        setShowAdjModal(true);
    };

    const selectAdjProduct = (p: any) => {
        setAdjProduct(p);
        setAdjProductSearch(p.name);
        setAdjShowSuggestions(false);
        setAdjUnitCost(String(p.cost || 0));
    };

    const adjPreview = (() => {
        if (!adjProduct || !adjQty || Number(adjQty) <= 0) return null;
        const qty = Number(adjQty);
        const previousStock = Number(adjProduct.stock) || 0;
        const previousCost = Number(adjProduct.cost) || 0;
        const unitCost = Number(adjUnitCost) || 0;
        const newStock = adjType === 'ENTAJ' ? previousStock + qty : previousStock - qty;
        const newAvgCost = adjType === 'ENTAJ'
            ? (newStock > 0 ? ((previousStock * previousCost) + (qty * unitCost)) / newStock : previousCost)
            : previousCost;
        return { previousStock, previousCost, newStock, newAvgCost };
    })();

    const saveAdjustment = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!adjProduct) return notify("Selecciona un producto", 'warning');
        if (!adjQty || Number(adjQty) <= 0) return notify("Cantidad inválida", 'warning');
        if (adjType === 'SALAJ' && Number(adjQty) > (Number(adjProduct.stock) || 0)) {
            const proceed = await confirmAction(`El producto solo tiene ${adjProduct.stock || 0} en existencia. ¿Continuar de todos modos (stock negativo)?`);
            if (!proceed) return;
        }
        setSavingAdj(true);
        try {
            await createAdjustment({
                productId: adjProduct.id,
                type: adjType,
                quantity: Number(adjQty),
                unitCost: Number(adjUnitCost) || 0,
                notes: adjNotes,
            }, currentUser?.id);
            setShowAdjModal(false);
            loadData();
        } catch (err: any) {
            await notify("No se pudo registrar el ajuste: " + (err.message || err), 'error');
        } finally {
            setSavingAdj(false);
        }
    };

    const doCancelAdjustment = async (adj: any) => {
        const proceed = await confirmAction(`¿Cancelar el ajuste ${adj.folio}? Esto revertirá las existencias del producto.`);
        if (!proceed) return;
        try {
            await cancelAdjustment(adj.id, currentUser?.id);
            loadData();
        } catch (err: any) {
            await notify("No se pudo cancelar el ajuste: " + (err.message || err), 'error');
        }
    };

    if (loading) return <div style={{ padding: '2rem' }}>Cargando inventario...</div>;

    const tabStyle = (t: TabType) => ({
        padding: '0.7rem 1.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem',
        borderBottom: tab === t ? '3px solid var(--accent-primary)' : '3px solid transparent',
        color: tab === t ? 'var(--accent-primary)' : 'var(--text-muted)',
        background: 'transparent', border: 'none', borderBottomStyle: 'solid' as const,
    });

    return (
        <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <Package size={28} color="var(--accent-primary)" /> Gestión de Productos
                </h2>
                {(tab === 'ingredientes' || tab === 'movimientos') && (
                    <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)', padding: '0.4rem 1rem', border: '1px solid var(--border-light)', width: '250px' }}>
                        <Search size={16} color="var(--text-muted)" />
                        <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                            style={{ border: 'none', background: 'transparent', outline: 'none', marginLeft: '0.5rem', width: '100%' }} />
                    </div>
                )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-light)', marginBottom: '1.5rem' }}>
                <button style={tabStyle('catalogo')} onClick={() => setTab('catalogo')}>
                    Catálogo
                </button>
                <button style={tabStyle('existencias')} onClick={() => setTab('existencias')}>
                    Existencias ({products.length})
                </button>
                <button style={tabStyle('ingredientes')} onClick={() => setTab('ingredientes')}>
                    Ingredientes ({ingredients.length})
                </button>
                <button style={tabStyle('movimientos')} onClick={() => setTab('movimientos')}>
                    Movimientos
                </button>
            </div>

            {/* TAB: Catálogo (Alta/Edición) */}
            {tab === 'catalogo' && (
                <div style={{ animation: 'fadeIn 0.3s ease' }}>
                    <Inventario currentUser={currentUser} />
                </div>
            )}

            {/* TAB: Existencias (Autocompletado + Categorías) */}
            {tab === 'existencias' && (
                <div>
                    {/* Autocompletado */}
                    <div style={{ position: 'relative', marginBottom: '1.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)', padding: '0.6rem 1.2rem', border: '1px solid var(--border-light)' }}>
                            <Search size={18} color="var(--text-muted)" />
                            <input
                                type="text"
                                placeholder="Buscar producto por nombre..."
                                value={existSearch}
                                onChange={e => { setExistSearch(e.target.value); setExistShowSuggestions(true); }}
                                onFocus={() => setExistShowSuggestions(true)}
                                onBlur={() => setTimeout(() => setExistShowSuggestions(false), 150)}
                                style={{ border: 'none', background: 'transparent', outline: 'none', marginLeft: '0.6rem', width: '100%', fontSize: '1rem' }}
                            />
                        </div>
                        {existShowSuggestions && existSuggestions.length > 0 && (
                            <div style={{
                                position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 20,
                                background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
                                boxShadow: 'var(--shadow-md)', overflow: 'hidden'
                            }}>
                                {existSuggestions.map(p => (
                                    <div key={p.id} onMouseDown={() => selectExistSuggestion(p)}
                                        style={{ padding: '0.7rem 1.2rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', borderBottom: '1px solid var(--border-light)' }}>
                                        <ProductIcon icon={p.img} size="1.2rem" />
                                        <span style={{ flex: 1 }}>{p.name}</span>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{p.category}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Tarjetas de Categoría */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                        <div
                            onClick={() => { setExistCategory('Todas'); setExistSearch(""); }}
                            style={{
                                background: existCategory === 'Todas' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                                color: existCategory === 'Todas' ? 'white' : 'var(--text-main)',
                                border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
                                padding: '1rem', cursor: 'pointer', transition: 'all 0.15s'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, marginBottom: '0.4rem' }}>
                                <Layers size={16} /> Todas
                            </div>
                            <div style={{ fontSize: '0.85rem', opacity: 0.85 }}>{products.length} productos</div>
                            <div style={{ fontSize: '0.85rem', opacity: 0.85 }}>${totalValuation.toFixed(2)}</div>
                        </div>
                        {categorySummaries.map(cs => (
                            <div
                                key={cs.category}
                                onClick={() => { setExistCategory(cs.category); setExistSearch(""); }}
                                style={{
                                    background: existCategory === cs.category ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                                    color: existCategory === cs.category ? 'white' : 'var(--text-main)',
                                    border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)',
                                    padding: '1rem', cursor: 'pointer', transition: 'all 0.15s'
                                }}
                            >
                                <div style={{ fontWeight: 700, marginBottom: '0.4rem' }}>{cs.category}</div>
                                <div style={{ fontSize: '0.85rem', opacity: 0.85 }}>{cs.count} productos</div>
                                <div style={{ fontSize: '0.85rem', opacity: 0.85 }}>${cs.valuation.toFixed(2)}</div>
                            </div>
                        ))}
                    </div>

                    {/* Detalle por Categoría */}
                    {existCategory ? (
                        <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-light)' }}>
                                        <th style={{ padding: '0.8rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Producto</th>
                                        <th style={{ padding: '0.8rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Categoría</th>
                                        <th style={{ padding: '0.8rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Stock</th>
                                        <th style={{ padding: '0.8rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Costo Prom.</th>
                                        <th style={{ padding: '0.8rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Precio Venta</th>
                                        <th style={{ padding: '0.8rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Valorización</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {existDetailProducts.map(p => (
                                        <tr key={p.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                            <td style={{ padding: '0.8rem 1rem' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <ProductIcon icon={p.img} size="1.2rem" />{p.name}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.8rem 1rem', color: 'var(--text-muted)' }}>{p.category}</td>
                                            <td style={{ padding: '0.8rem 1rem', textAlign: 'center', fontWeight: 700, color: (p.stock || 0) <= 0 ? 'var(--danger)' : 'var(--text-main)' }}>
                                                {p.stock || 0}
                                                {(p.stock || 0) <= 0 && <AlertTriangle size={14} color="var(--danger)" style={{ marginLeft: 4, verticalAlign: 'middle' }} />}
                                            </td>
                                            <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>${Number(p.cost || 0).toFixed(2)}</td>
                                            <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>${Number(p.price).toFixed(2)}</td>
                                            <td style={{ padding: '0.8rem 1rem', textAlign: 'center', fontWeight: 600 }}>${((p.stock || 0) * (p.cost || 0)).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                    {existDetailProducts.length === 0 && (
                                        <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No hay productos que coincidan.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                            Selecciona una categoría o busca un producto para ver el detalle de existencias.
                        </div>
                    )}
                </div>
            )}

            {/* TAB: Ingredientes */}
            {tab === 'ingredientes' && (
                <>
                    <button onClick={() => openIngModal()} className="pay-btn" style={{ width: 'auto', padding: '0.7rem 1.2rem', marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
                        <Plus size={18} /> Nuevo Ingrediente
                    </button>
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-light)' }}>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Ingrediente</th>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Stock</th>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Mínimo</th>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Unidad</th>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Costo/U</th>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'right', color: 'var(--text-muted)' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered(ingredients).map(i => (
                                    <tr key={i.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                        <td style={{ padding: '0.8rem 1rem', fontWeight: 600 }}>{i.name}</td>
                                        <td style={{ padding: '0.8rem 1rem', textAlign: 'center', fontWeight: 700, color: i.stock <= i.min_stock ? 'var(--danger)' : 'var(--text-main)' }}>
                                            {i.stock} {i.unit}
                                            {i.stock <= i.min_stock && <AlertTriangle size={14} color="var(--danger)" style={{ marginLeft: 4, verticalAlign: 'middle' }} />}
                                        </td>
                                        <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>{i.min_stock} {i.unit}</td>
                                        <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>{i.unit}</td>
                                        <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>${Number(i.cost_per_unit).toFixed(2)}</td>
                                        <td style={{ padding: '0.8rem 1rem', textAlign: 'right' }}>
                                            <button onClick={() => openMovModal('ingredient', i.id, 'entry')} title="Entrada" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'green', marginRight: '0.5rem' }}><ArrowUpCircle size={18} /></button>
                                            <button onClick={() => openMovModal('ingredient', i.id, 'exit')} title="Salida" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)', marginRight: '0.5rem' }}><ArrowDownCircle size={18} /></button>
                                            <button onClick={() => openIngModal(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginRight: '0.5rem' }}><Edit2 size={18} /></button>
                                            <button onClick={() => delIng(i.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                ))}
                                {ingredients.length === 0 && (
                                    <tr><td colSpan={6} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Aún no hay ingredientes registrados.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* TAB: Movimientos (Ajustes con Folio ENTAJ / SALAJ) */}
            {tab === 'movimientos' && (
                <div>
                    <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
                        <button onClick={() => openAdjModal('ENTAJ')} className="pay-btn"
                            style={{ width: 'auto', padding: '0.7rem 1.2rem', display: 'flex', gap: '0.5rem', backgroundColor: 'green' }}>
                            <Plus size={18} /> Nuevo Ajuste (ENTAJ / SALAJ)
                        </button>
                    </div>
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', overflow: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-light)' }}>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Folio</th>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Fecha</th>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Producto</th>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cant.</th>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Costo Unit.</th>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Stock (prev → nuevo)</th>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Costo Prom.</th>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Cajero</th>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>Estatus</th>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'right', color: 'var(--text-muted)' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered(adjustments).map(a => (
                                    <tr key={a.id} style={{ borderBottom: '1px solid var(--border-light)', opacity: a.status === 'Cancelada' ? 0.5 : 1 }}>
                                        <td style={{ padding: '0.8rem 1rem', fontWeight: 700, fontFamily: 'monospace' }}>{a.folio}</td>
                                        <td style={{ padding: '0.8rem 1rem', fontSize: '0.85rem' }}>{new Date(a.created_at).toLocaleString()}</td>
                                        <td style={{ padding: '0.8rem 1rem' }}>
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <ProductIcon icon={a.product_img} size="1.2rem" />{a.product_name}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                                            <span style={{
                                                padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600,
                                                backgroundColor: a.type === 'ENTAJ' ? '#d4edda' : '#f8d7da',
                                                color: a.type === 'ENTAJ' ? '#155724' : '#721c24'
                                            }}>{a.type === 'ENTAJ' ? '▲' : '▼'} {a.quantity}</span>
                                        </td>
                                        <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>${Number(a.unit_cost).toFixed(2)}</td>
                                        <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>{a.previous_stock} → <strong>{a.new_stock}</strong></td>
                                        <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>${Number(a.new_avg_cost).toFixed(2)}</td>
                                        <td style={{ padding: '0.8rem 1rem' }}>{a.user_name || '—'}</td>
                                        <td style={{ padding: '0.8rem 1rem', textAlign: 'center' }}>
                                            <span style={{
                                                padding: '0.2rem 0.6rem', borderRadius: 'var(--radius-full)', fontSize: '0.8rem', fontWeight: 600,
                                                backgroundColor: a.status === 'Realizada' ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                                                color: a.status === 'Realizada' ? 'white' : 'var(--text-muted)'
                                            }}>{a.status}</span>
                                        </td>
                                        <td style={{ padding: '0.8rem 1rem', textAlign: 'right' }}>
                                            {a.status === 'Realizada' && (
                                                <button onClick={() => doCancelAdjustment(a)} title="Cancelar ajuste"
                                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>
                                                    <XCircle size={20} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {adjustments.length === 0 && (
                                    <tr><td colSpan={10} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Sin ajustes registrados.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal Ingrediente */}
            {showIngModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--bg-primary)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '400px' }}>
                        <h3 style={{ marginBottom: '1.5rem' }}>{editIngId ? "Editar Ingrediente" : "Nuevo Ingrediente"}</h3>
                        <form onSubmit={saveIng}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Nombre</label>
                                <input type="text" value={ingName} onChange={e => setIngName(e.target.value)} required placeholder="Ej: Harina de trigo"
                                    style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Unidad</label>
                                    <select value={ingUnit} onChange={e => setIngUnit(e.target.value)} style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                                        <option value="kg">Kilogramos (kg)</option>
                                        <option value="g">Gramos (g)</option>
                                        <option value="lt">Litros (lt)</option>
                                        <option value="ml">Mililitros (ml)</option>
                                        <option value="pz">Piezas (pz)</option>
                                    </select>
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Stock Mínimo</label>
                                    <input type="number" value={ingMinStock} onChange={e => setIngMinStock(e.target.value)} step="0.01"
                                        style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                                </div>
                            </div>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Costo por Unidad ($)</label>
                                <input type="number" value={ingCost} onChange={e => setIngCost(e.target.value)} step="0.01"
                                    style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button type="button" onClick={() => setShowIngModal(false)} style={{ padding: '0.7rem 1.2rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                                <button type="submit" style={{ padding: '0.7rem 1.2rem', backgroundColor: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Movimiento */}
            {showMovModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--bg-primary)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '400px' }}>
                        <h3 style={{ marginBottom: '1.5rem', color: movType === 'entry' ? 'green' : 'var(--danger)' }}>
                            {movType === 'entry' ? '▲ Registrar Entrada' : '▼ Registrar Salida / Merma'}
                        </h3>
                        <form onSubmit={saveMov}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Cantidad</label>
                                <input type="number" value={movQty} onChange={e => setMovQty(e.target.value)} required min="0.01" step="0.01" placeholder="Ej: 10"
                                    style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                            </div>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Razón / Nota</label>
                                <input type="text" value={movReason} onChange={e => setMovReason(e.target.value)} placeholder="Ej: Compra proveedor, Merma por caducidad..."
                                    style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button type="button" onClick={() => setShowMovModal(false)} style={{ padding: '0.7rem 1.2rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                                <button type="submit" style={{ padding: '0.7rem 1.2rem', backgroundColor: movType === 'entry' ? 'green' : 'var(--danger)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                                    {movType === 'entry' ? 'Registrar Entrada' : 'Registrar Salida'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Ajuste con Folio (ENTAJ / SALAJ) */}
            {showAdjModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--bg-primary)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '460px' }}>
                        <h3 style={{ marginBottom: '1.5rem', color: adjType === 'ENTAJ' ? 'green' : 'var(--danger)' }}>
                            {adjType === 'ENTAJ' ? '▲ Nueva Entrada de Ajuste (ENTAJ)' : '▼ Nueva Salida de Ajuste (SALAJ)'}
                        </h3>
                        <form onSubmit={saveAdjustment}>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                                <button type="button" onClick={() => setAdjType('ENTAJ')}
                                    style={{ flex: 1, padding: '0.6rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, border: '1px solid var(--border-light)', backgroundColor: adjType === 'ENTAJ' ? 'green' : 'transparent', color: adjType === 'ENTAJ' ? 'white' : 'var(--text-main)' }}>
                                    ENTAJ (Entrada)
                                </button>
                                <button type="button" onClick={() => setAdjType('SALAJ')}
                                    style={{ flex: 1, padding: '0.6rem', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, border: '1px solid var(--border-light)', backgroundColor: adjType === 'SALAJ' ? 'var(--danger)' : 'transparent', color: adjType === 'SALAJ' ? 'white' : 'var(--text-main)' }}>
                                    SALAJ (Salida)
                                </button>
                            </div>

                            <div style={{ marginBottom: '1rem', position: 'relative' }}>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Producto</label>
                                <input type="text" value={adjProductSearch} placeholder="Buscar producto por nombre..."
                                    onChange={e => { setAdjProductSearch(e.target.value); setAdjProduct(null); setAdjShowSuggestions(true); }}
                                    onFocus={() => setAdjShowSuggestions(true)}
                                    onBlur={() => setTimeout(() => setAdjShowSuggestions(false), 150)}
                                    required
                                    style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                                {adjShowSuggestions && adjSuggestions.length > 0 && (
                                    <div style={{
                                        position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 10,
                                        background: 'var(--bg-secondary)', border: '1px solid var(--border-light)', borderRadius: '6px',
                                        boxShadow: 'var(--shadow-md)', overflow: 'hidden', maxHeight: '180px', overflowY: 'auto'
                                    }}>
                                        {adjSuggestions.map(p => (
                                            <div key={p.id} onMouseDown={() => selectAdjProduct(p)}
                                                style={{ padding: '0.6rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', borderBottom: '1px solid var(--border-light)' }}>
                                                <ProductIcon icon={p.img} size="1.2rem" />
                                                <span style={{ flex: 1 }}>{p.name}</span>
                                                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Stock: {p.stock || 0}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Cantidad</label>
                                    <input type="number" value={adjQty} onChange={e => setAdjQty(e.target.value)} required min="0.01" step="0.01" placeholder="Ej: 10"
                                        style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Costo Unitario ($)</label>
                                    <input type="number" value={adjUnitCost} onChange={e => setAdjUnitCost(e.target.value)} min="0" step="0.01"
                                        disabled={adjType === 'SALAJ'}
                                        style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)', opacity: adjType === 'SALAJ' ? 0.6 : 1 }} />
                                </div>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Notas</label>
                                <input type="text" value={adjNotes} onChange={e => setAdjNotes(e.target.value)} placeholder="Ej: Compra proveedor, Merma por caducidad..."
                                    style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                            </div>

                            {adjPreview && (
                                <div style={{ background: 'var(--bg-tertiary)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                        <span>Stock actual</span><strong>{adjPreview.previousStock}</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                        <span>Nuevo stock</span><strong>{adjPreview.newStock}</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                                        <span>Costo promedio actual</span><strong>${adjPreview.previousCost.toFixed(2)}</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <span>Nuevo costo promedio</span><strong style={{ color: 'var(--accent-primary)' }}>${adjPreview.newAvgCost.toFixed(2)}</strong>
                                    </div>
                                </div>
                            )}

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button type="button" onClick={() => setShowAdjModal(false)} style={{ padding: '0.7rem 1.2rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                                <button type="submit" disabled={savingAdj} style={{ padding: '0.7rem 1.2rem', backgroundColor: adjType === 'ENTAJ' ? 'green' : 'var(--danger)', color: 'white', border: 'none', borderRadius: '6px', cursor: savingAdj ? 'not-allowed' : 'pointer', fontWeight: 600, opacity: savingAdj ? 0.6 : 1 }}>
                                    {savingAdj ? 'Guardando...' : (adjType === 'ENTAJ' ? 'Registrar Entrada' : 'Registrar Salida')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
