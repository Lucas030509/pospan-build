import { useState, useEffect } from "react";
import {
    getProductsWithStock, getIngredientsWithStock, createIngredient, updateIngredient, deleteIngredient,
    addInventoryMovement,
    createAdjustmentDocument, createProductionOrder, getRecipes,
    getWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, getBranches
} from "./db";
import { Package, Plus, Edit2, Trash2, ArrowUpCircle, ArrowDownCircle, AlertTriangle, Search, Layers, ChefHat, Warehouse, PackageCheck } from "lucide-react";
import Inventario from "./Inventario";
import { notify, confirmAction } from "./lib/dialogs";
import ProductIcon from "./components/ProductIcon";
import EntryCaptureScreen, { EligibleProduct } from "./components/EntryCaptureScreen";
import ProductionReceiptScreen from "./components/ProductionReceiptScreen";

type TabType = 'catalogo' | 'existencias' | 'ingredientes' | 'movimientos' | 'almacenes';
type EntryMode = 'ENTAJ' | 'SALAJ' | 'ENTOP' | 'RECOP' | null;

const PRODUCT_CATEGORIES = ["Pan Dulce", "Bolillo y Telera", "Pasteles", "Bebidas", "Postres", "Galletas", "Especialidades", "Abarrotes"];

export default function Stock({ currentUser }: { currentUser: any }) {
    const [tab, setTab] = useState<TabType>('catalogo');
    const [products, setProducts] = useState<any[]>([]);
    const [ingredients, setIngredients] = useState<any[]>([]);
    const [recipes, setRecipes] = useState<any[]>([]);
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
    const [branches, setBranches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    // Pantalla de captura (Nueva Entrada / Salida / Producción)
    const [entryMode, setEntryMode] = useState<EntryMode>(null);

    // Modal de almacén
    const [showWhModal, setShowWhModal] = useState(false);
    const [editWhId, setEditWhId] = useState<number | null>(null);
    const [whName, setWhName] = useState("");
    const [whAddress, setWhAddress] = useState("");
    const [whPhone, setWhPhone] = useState("");

    // Existencias: autocompletado y categorías
    const [existSearch, setExistSearch] = useState("");
    const [existShowSuggestions, setExistShowSuggestions] = useState(false);
    const [existCategory, setExistCategory] = useState<string | null>(null);

    // Modal para ingrediente
    const [showIngModal, setShowIngModal] = useState(false);
    const [editIngId, setEditIngId] = useState<number | null>(null);
    const [ingName, setIngName] = useState("");
    const [ingUnit, setIngUnit] = useState("kg");
    const [ingMinStock, setIngMinStock] = useState("0");
    const [ingCost, setIngCost] = useState("0");

    // Modal para movimiento de ingrediente (entrada/salida simple)
    const [showMovModal, setShowMovModal] = useState(false);
    const [movItemType, setMovItemType] = useState<'product' | 'ingredient'>('product');
    const [movItemId, setMovItemId] = useState<number>(0);
    const [movType, setMovType] = useState<'entry' | 'exit'>('entry');
    const [movQty, setMovQty] = useState("");
    const [movReason, setMovReason] = useState("");

    const loadData = async (warehouseIdOverride?: number) => {
        setLoading(true);
        try {
            const wh = await getWarehouses();
            setWarehouses(wh);
            const warehouseId = warehouseIdOverride ?? selectedWarehouseId ?? wh[0]?.id ?? null;
            setSelectedWarehouseId(warehouseId);

            const [p, i, r, b] = await Promise.all([
                warehouseId ? getProductsWithStock(warehouseId) : Promise.resolve([]),
                warehouseId ? getIngredientsWithStock(warehouseId) : Promise.resolve([]),
                getRecipes(),
                getBranches(),
            ]);
            setProducts(p);
            setIngredients(i);
            setRecipes(r);
            setBranches(b);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadData(); }, []);

    const handleWarehouseChange = (id: number) => {
        loadData(id);
    };

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

    // === Movimientos simples de ingredientes ===
    const openMovModal = (itemType: 'product' | 'ingredient', itemId: number, type: 'entry' | 'exit') => {
        setMovItemType(itemType); setMovItemId(itemId); setMovType(type);
        setMovQty(""); setMovReason("");
        setShowMovModal(true);
    };

    const saveMov = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!movQty || Number(movQty) <= 0) return notify("Cantidad inválida", 'warning');
        if (!selectedWarehouseId) return notify("Selecciona primero un almacén", 'warning');
        await addInventoryMovement(movItemType, movItemId, movType, Number(movQty), movReason || (movType === 'entry' ? 'Entrada manual' : 'Salida manual'), selectedWarehouseId, currentUser?.id);
        setShowMovModal(false);
        loadData();
    };

    // === Almacenes CRUD ===
    const openWhModal = (wh?: any) => {
        if (wh) {
            setEditWhId(wh.id); setWhName(wh.name); setWhAddress(wh.address || ""); setWhPhone(wh.phone || "");
        } else {
            setEditWhId(null); setWhName(""); setWhAddress(""); setWhPhone("");
        }
        setShowWhModal(true);
    };

    const saveWh = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!whName) return notify("Nombre requerido", 'warning');
        try {
            if (editWhId) {
                await updateWarehouse(editWhId, { name: whName, address: whAddress, phone: whPhone }, currentUser?.id);
            } else {
                await createWarehouse({ name: whName, address: whAddress, phone: whPhone }, currentUser?.id);
            }
            setShowWhModal(false);
            loadData();
        } catch (err: any) {
            notify("No se pudo guardar el almacén: " + (err.message || err), 'error');
        }
    };

    const delWh = async (id: number) => {
        if (!(await confirmAction("¿Eliminar este almacén?"))) return;
        try {
            await deleteWarehouse(id, currentUser?.id);
            loadData();
        } catch (err: any) {
            notify("No se pudo eliminar: " + (err.message || err), 'error');
        }
    };

    const filtered = (arr: any[]) => {
        if (!searchTerm) return arr;
        const t = searchTerm.toLowerCase();
        return arr.filter(i => i.name?.toLowerCase().includes(t) || i.item_name?.toLowerCase().includes(t) || i.product_name?.toLowerCase().includes(t));
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

    // === Entradas/Salidas (ENTAJ / SALAJ) — documentos multi-producto ===
    const eligibleForAdjustment: EligibleProduct[] = products.map(p => ({
        id: p.id, name: p.name, category: p.category, img: p.img, stock: Number(p.stock) || 0, cost: Number(p.cost) || 0,
    }));

    const handleAdjSubmit = async (lines: any[], notes: string, wh: { warehouseId?: number }) => {
        if (!wh.warehouseId) throw new Error("Selecciona un almacén");
        const folio = await createAdjustmentDocument({
            type: entryMode as 'ENTAJ' | 'SALAJ',
            items: lines.map(l => ({ productId: l.productId, quantity: l.quantity, unitCost: l.unitCost })),
            notes,
            warehouseId: wh.warehouseId,
        }, currentUser?.id);
        await loadData(wh.warehouseId);
        return folio;
    };

    // === Producción (ENTOP) — documentos multi-receta ===
    const recipeByProductId = new Map(recipes.map(r => [r.product_id, r]));
    const eligibleForProduction: EligibleProduct[] = products
        .filter(p => recipeByProductId.has(p.id))
        .map(p => {
            const r = recipeByProductId.get(p.id);
            return { id: p.id, name: p.name, category: p.category, img: p.img, stock: Number(p.stock) || 0, cost: Number(p.cost) || 0, recipe_id: r.id, yield_qty: Number(r.yield_qty) || 1 };
        });

    const handleProdSubmit = async (lines: any[], notes: string, wh: { branchId?: number }) => {
        if (!wh.branchId) throw new Error("Selecciona una sucursal");
        const folio = await createProductionOrder({
            branchId: wh.branchId,
            items: lines.map(l => ({ recipeId: l.recipeId, batches: l.quantity })),
            notes,
        }, currentUser?.id);
        await loadData();
        return folio;
    };

    if (loading) return <div style={{ padding: '2rem' }}>Cargando inventario...</div>;

    const tabStyle = (t: TabType) => ({
        padding: '0.7rem 1.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem',
        borderBottom: tab === t ? '3px solid var(--accent-primary)' : '3px solid transparent',
        color: tab === t ? 'var(--accent-primary)' : 'var(--text-muted)',
        background: 'transparent', border: 'none', borderBottomStyle: 'solid' as const,
    });

    return (
        <div style={{ padding: '2rem', maxWidth: entryMode ? '1400px' : '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h2 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
                    <Package size={28} color="var(--accent-primary)" /> Gestión de Productos
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {!entryMode && (tab === 'existencias' || tab === 'ingredientes' || tab === 'movimientos') && warehouses.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.9rem' }}>
                            <Warehouse size={16} color="var(--text-muted)" />
                            <select value={selectedWarehouseId ?? ''} onChange={e => handleWarehouseChange(Number(e.target.value))}
                                style={{ padding: '0.5rem 0.7rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </div>
                    )}
                    {!entryMode && (tab === 'ingredientes' || tab === 'movimientos') && (
                        <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)', padding: '0.4rem 1rem', border: '1px solid var(--border-light)', width: '250px' }}>
                            <Search size={16} color="var(--text-muted)" />
                            <input type="text" placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                style={{ border: 'none', background: 'transparent', outline: 'none', marginLeft: '0.5rem', width: '100%' }} />
                        </div>
                    )}
                </div>
            </div>

            {/* Tabs */}
            {!entryMode && (
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
                    <button style={tabStyle('almacenes')} onClick={() => setTab('almacenes')}>
                        Almacenes ({warehouses.length})
                    </button>
                </div>
            )}

            {/* TAB: Catálogo (Alta/Edición) */}
            {!entryMode && tab === 'catalogo' && (
                <div style={{ animation: 'fadeIn 0.3s ease' }}>
                    <Inventario currentUser={currentUser} />
                </div>
            )}

            {/* TAB: Existencias (Autocompletado + Categorías) */}
            {!entryMode && tab === 'existencias' && (
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
            {!entryMode && tab === 'ingredientes' && (
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

            {/* TAB: Movimientos (Documentos ENTAJ / SALAJ / ENTOP) — solo creación, el historial vive en Kardex */}
            {tab === 'movimientos' && (
                entryMode === 'ENTAJ' || entryMode === 'SALAJ' ? (
                    <EntryCaptureScreen
                        mode={entryMode}
                        title={entryMode === 'ENTAJ' ? '▲ Nueva Entrada (ENTAJ)' : '▼ Nueva Salida (SALAJ)'}
                        accentColor={entryMode === 'ENTAJ' ? 'green' : 'var(--danger)'}
                        categories={PRODUCT_CATEGORIES}
                        eligibleProducts={eligibleForAdjustment}
                        warehouses={warehouses}
                        defaultWarehouseId={selectedWarehouseId ?? undefined}
                        onBack={() => setEntryMode(null)}
                        onSubmit={handleAdjSubmit}
                    />
                ) : entryMode === 'ENTOP' ? (
                    <EntryCaptureScreen
                        mode="ENTOP"
                        title="🧑‍🍳 Nueva Orden de Producción"
                        accentColor="var(--accent-primary)"
                        categories={PRODUCT_CATEGORIES}
                        eligibleProducts={eligibleForProduction}
                        warehouses={warehouses}
                        branches={branches}
                        defaultBranchId={branches[0]?.id ?? undefined}
                        onBack={() => setEntryMode(null)}
                        onSubmit={handleProdSubmit}
                    />
                ) : entryMode === 'RECOP' ? (
                    <ProductionReceiptScreen
                        branchId={branches[0]?.id}
                        userId={currentUser?.id}
                        onBack={() => { setEntryMode(null); loadData(); }}
                    />
                ) : (
                    <div>
                        <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                            <button onClick={() => setEntryMode('ENTAJ')} className="pay-btn"
                                style={{ width: '110px', height: '110px', padding: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', backgroundColor: 'green', borderRadius: '16px' }}>
                                <Plus size={28} /> Entrada
                            </button>
                            <button onClick={() => setEntryMode('SALAJ')} className="pay-btn"
                                style={{ width: '110px', height: '110px', padding: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', backgroundColor: 'var(--danger)', borderRadius: '16px' }}>
                                <Plus size={28} /> Salida
                            </button>
                            <button onClick={() => setEntryMode('ENTOP')} className="pay-btn"
                                style={{ width: '110px', height: '110px', padding: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', borderRadius: '16px', textAlign: 'center' }} disabled={branches.length === 0}>
                                <Plus size={28} /> Orden de Producción
                            </button>
                            <button onClick={() => setEntryMode('RECOP')} className="pay-btn"
                                style={{ width: '110px', height: '110px', padding: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', backgroundColor: '#8e44ad', borderRadius: '16px', textAlign: 'center' }} disabled={branches.length === 0}>
                                <PackageCheck size={28} /> Recepción de Producción
                            </button>
                        </div>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <ChefHat size={16} /> Producción solo muestra productos con receta configurada. Consulta el historial completo de entradas, salidas, producción y ventas en <strong>Kardex</strong>.
                        </p>
                    </div>
                )
            )}

            {/* TAB: Almacenes */}
            {!entryMode && tab === 'almacenes' && (
                <>
                    <button onClick={() => openWhModal()} className="pay-btn" style={{ width: 'auto', padding: '0.7rem 1.2rem', marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
                        <Plus size={18} /> Nuevo Almacén
                    </button>
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-light)' }}>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Nombre</th>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Domicilio</th>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Teléfono</th>
                                    <th style={{ padding: '0.8rem 1rem', textAlign: 'right', color: 'var(--text-muted)' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {warehouses.map(w => (
                                    <tr key={w.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                        <td style={{ padding: '0.8rem 1rem', fontWeight: 600 }}>{w.name}</td>
                                        <td style={{ padding: '0.8rem 1rem', color: 'var(--text-muted)' }}>{w.address || '—'}</td>
                                        <td style={{ padding: '0.8rem 1rem', color: 'var(--text-muted)' }}>{w.phone || '—'}</td>
                                        <td style={{ padding: '0.8rem 1rem', textAlign: 'right' }}>
                                            <button onClick={() => openWhModal(w)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginRight: '0.5rem' }}><Edit2 size={18} /></button>
                                            <button onClick={() => delWh(w.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={18} /></button>
                                        </td>
                                    </tr>
                                ))}
                                {warehouses.length === 0 && (
                                    <tr><td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Aún no hay almacenes registrados.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* Modal Almacén */}
            {showWhModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--bg-primary)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '400px' }}>
                        <h3 style={{ marginBottom: '1.5rem' }}>{editWhId ? "Editar Almacén" : "Nuevo Almacén"}</h3>
                        <form onSubmit={saveWh}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Nombre</label>
                                <input type="text" value={whName} onChange={e => setWhName(e.target.value)} required placeholder="Ej: Almacén de Producción"
                                    style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Domicilio</label>
                                <input type="text" value={whAddress} onChange={e => setWhAddress(e.target.value)}
                                    style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                            </div>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Teléfono</label>
                                <input type="text" value={whPhone} onChange={e => setWhPhone(e.target.value)}
                                    style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button type="button" onClick={() => setShowWhModal(false)} style={{ padding: '0.7rem 1.2rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                                <button type="submit" style={{ padding: '0.7rem 1.2rem', backgroundColor: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Guardar</button>
                            </div>
                        </form>
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

            {/* Modal Movimiento (ingredientes) */}
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
        </div>
    );
}
