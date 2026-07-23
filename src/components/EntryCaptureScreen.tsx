import { useRef, useState } from "react";
import { ArrowLeft, Search, Upload, Download, Trash2, Minus, Plus, Check } from "lucide-react";
import * as XLSX from "xlsx";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { notify } from "../lib/dialogs";
import { isImageIcon } from "../lib/iconLibrary";

export type EntryMode = 'ENTAJ' | 'SALAJ' | 'PRODORD';

export interface EligibleProduct {
    id: number;
    name: string;
    category: string;
    img: string;
    stock: number;
    cost: number;
    recipe_id?: number;
    yield_qty?: number;
}

interface CartLine {
    productId: number;
    recipeId?: number;
    name: string;
    img: string;
    quantity: number;
    unitCost: number;
    currentStock: number;
    yieldQty?: number;
}

export interface WarehouseOption {
    id: number;
    name: string;
}

export interface WarehouseSelection {
    warehouseId?: number;
    branchId?: number;
}

interface EntryCaptureScreenProps {
    mode: EntryMode;
    title: string;
    accentColor: string;
    categories: string[];
    eligibleProducts: EligibleProduct[];
    warehouses: WarehouseOption[];
    defaultWarehouseId?: number;
    /** Solo se usa en modo ENTOP: sucursal cuya cocina crea la orden (resuelve sus propios
     * almacenes de materia prima/en proceso internamente, no se eligen aquí). */
    branches?: WarehouseOption[];
    defaultBranchId?: number;
    onBack: () => void;
    onSubmit: (lines: CartLine[], notes: string, warehouseSelection: WarehouseSelection) => Promise<string>;
}

export default function EntryCaptureScreen({
    mode, title, accentColor, categories, eligibleProducts, warehouses,
    defaultWarehouseId, branches, defaultBranchId,
    onBack, onSubmit,
}: EntryCaptureScreenProps) {
    const [activeCategory, setActiveCategory] = useState("Todas");
    const [search, setSearch] = useState("");
    const [cart, setCart] = useState<CartLine[]>([]);
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const [warehouseId, setWarehouseId] = useState<number | undefined>(defaultWarehouseId);
    const [branchId, setBranchId] = useState<number | undefined>(defaultBranchId);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const requireUnitCost = mode === 'ENTAJ';
    const qtyLabel = mode === 'PRODORD' ? 'Lotes' : 'Cantidad';

    const filteredProducts = eligibleProducts.filter(p => {
        const matchesCategory = activeCategory === "Todas" || p.category === activeCategory;
        const matchesSearch = !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const addToCart = (p: EligibleProduct, qty: number = 1) => {
        setCart(prev => {
            const idx = prev.findIndex(l => l.productId === p.id);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
                return next;
            }
            return [...prev, {
                productId: p.id,
                recipeId: p.recipe_id,
                name: p.name,
                img: p.img,
                quantity: qty,
                unitCost: Number(p.cost) || 0,
                currentStock: Number(p.stock) || 0,
                yieldQty: p.yield_qty,
            }];
        });
    };

    const updateLineQty = (productId: number, delta: number) => {
        setCart(prev => prev
            .map(l => l.productId === productId ? { ...l, quantity: l.quantity + delta } : l)
            .filter(l => l.quantity > 0));
    };

    const updateLineCost = (productId: number, unitCost: number) => {
        setCart(prev => prev.map(l => l.productId === productId ? { ...l, unitCost } : l));
    };

    const removeLine = (productId: number) => {
        setCart(prev => prev.filter(l => l.productId !== productId));
    };

    const shortStockWarning = mode === 'SALAJ' && cart.some(l => l.quantity > l.currentStock);

    const handleSubmit = async () => {
        if (cart.length === 0) return notify("Agrega al menos un producto al documento.", 'warning');
        if (mode === 'PRODORD') {
            if (!branchId) return notify("Selecciona una sucursal.", 'warning');
        } else if (!warehouseId) {
            return notify("Selecciona un almacén.", 'warning');
        }
        setSaving(true);
        try {
            const folio = await onSubmit(cart, notes, mode === 'PRODORD' ? { branchId } : { warehouseId });
            await notify(`Documento registrado. Folio ${folio}.`, 'info');
            setCart([]);
            setNotes("");
            onBack();
        } catch (err: any) {
            await notify("No se pudo registrar el documento: " + (err.message || err), 'error');
        } finally {
            setSaving(false);
        }
    };

    const downloadTemplate = async () => {
        const rows = mode === 'PRODORD'
            ? [{ Producto: eligibleProducts[0]?.name || "Nombre del producto", Lotes: 1 }]
            : requireUnitCost
                ? [{ Producto: eligibleProducts[0]?.name || "Nombre del producto", Cantidad: 1, "Costo Unitario": 0 }]
                : [{ Producto: eligibleProducts[0]?.name || "Nombre del producto", Cantidad: 1 }];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [{ wch: 32 }, { wch: 12 }, { wch: 16 }];
        XLSX.utils.book_append_sheet(wb, ws, "Layout");
        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
        try {
            const filePath = await save({
                defaultPath: `layout_${mode.toLowerCase()}.xlsx`,
                filters: [{ name: "Excel", extensions: ["xlsx"] }],
            });
            if (filePath) await writeFile(filePath, new Uint8Array(wbout));
        } catch {
            const blob = new Blob([wbout], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `layout_${mode.toLowerCase()}.xlsx`;
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json<any>(worksheet);

            const byName = new Map<string, EligibleProduct>();
            const duplicateNames = new Set<string>();
            for (const p of eligibleProducts) {
                const key = p.name.trim().toLowerCase();
                if (byName.has(key)) duplicateNames.add(p.name.trim());
                byName.set(key, p);
            }

            const notFound: string[] = [];
            const skipped: string[] = [];
            let added = 0;
            for (const row of rows) {
                const rowName = row["Producto"] || row["producto"] || row["Nombre"];
                const rawQty = mode === 'PRODORD' ? (row["Lotes"] ?? row["lotes"]) : (row["Cantidad"] ?? row["cantidad"]);
                if (!rowName || rawQty == null) {
                    if (rowName) skipped.push(`${rowName} (falta cantidad)`);
                    continue;
                }
                const product = byName.get(String(rowName).trim().toLowerCase());
                if (!product) { notFound.push(String(rowName)); continue; }
                const qty = parseFloat(String(rawQty));
                if (isNaN(qty) || qty <= 0) {
                    skipped.push(`${rowName} (cantidad inválida)`);
                    continue;
                }
                addToCart(product, qty);
                if (requireUnitCost) {
                    const rawCost = row["Costo Unitario"] ?? row["costo unitario"];
                    if (rawCost != null) {
                        const cost = parseFloat(String(rawCost));
                        if (!isNaN(cost)) updateLineCost(product.id, cost);
                    }
                }
                added++;
            }

            const summary = [`Líneas agregadas: ${added}`];
            if (notFound.length > 0) summary.push(`No encontrados: ${notFound.join(", ")}`);
            if (skipped.length > 0) summary.push(`Omitidas: ${skipped.join(", ")}`);
            if (duplicateNames.size > 0) summary.push(`⚠️ Nombres duplicados en catálogo (verifica cuál se usó): ${Array.from(duplicateNames).join(", ")}`);
            const hasIssues = notFound.length > 0 || skipped.length > 0 || duplicateNames.size > 0;
            await notify(summary.join(" · "), hasIssues ? 'warning' : 'info');
        } catch (err) {
            console.error("Error leyendo archivo:", err);
            await notify("El archivo no es un Excel válido o está dañado.", 'error');
        } finally {
            if (fileInputRef.current) fileInputRef.current.value = "";
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
                    <h3 style={{ margin: 0, color: accentColor }}>{title}</h3>

                    {mode === 'PRODORD' ? (
                        (branches && branches.length > 1) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                                <label style={{ fontWeight: 600 }}>Sucursal:</label>
                                <select value={branchId ?? ''} onChange={e => setBranchId(Number(e.target.value) || undefined)}
                                    style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                                    <option value="">-- Selecciona --</option>
                                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>
                        )
                    ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
                            <label style={{ fontWeight: 600 }}>Almacén:</label>
                            <select value={warehouseId ?? ''} onChange={e => setWarehouseId(Number(e.target.value) || undefined)}
                                style={{ padding: '0.5rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                                <option value="">-- Selecciona --</option>
                                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </div>
                    )}

                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)', padding: '0.5rem 1rem', border: '1px solid var(--border-light)', width: '220px' }}>
                            <Search size={16} color="var(--text-muted)" />
                            <input type="text" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)}
                                style={{ border: 'none', background: 'transparent', outline: 'none', marginLeft: '0.5rem', width: '100%' }} />
                        </div>
                        <input ref={fileInputRef} type="file" accept=".xlsx, .xls, .csv" style={{ display: 'none' }} onChange={handleFileUpload} />
                        <button onClick={downloadTemplate} title="Descargar plantilla" style={{
                            padding: '0.6rem', border: '1px dashed var(--border-light)', borderRadius: '8px',
                            background: 'var(--bg-secondary)', cursor: 'pointer', display: 'flex'
                        }}>
                            <Download size={18} />
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} title="Cargar desde Excel" style={{
                            padding: '0.6rem 1rem', display: 'flex', gap: '0.4rem', alignItems: 'center',
                            border: 'none', borderRadius: '8px', background: accentColor, color: 'white', cursor: 'pointer', fontWeight: 600
                        }}>
                            <Upload size={18} /> Cargar Excel
                        </button>
                    </div>
                </div>

                <section className="categories-scroll">
                    <button className={`category-pill ${activeCategory === 'Todas' ? 'active' : ''}`} onClick={() => setActiveCategory('Todas')}>
                        Todas
                    </button>
                    {categories.map(cat => (
                        <button key={cat} className={`category-pill ${activeCategory === cat ? 'active' : ''}`} onClick={() => setActiveCategory(cat)}>
                            {cat}
                        </button>
                    ))}
                </section>

                <section className="products-grid">
                    {filteredProducts.map(p => (
                        <div key={p.id} className="product-card" onClick={() => addToCart(p)} style={{ cursor: 'pointer', position: 'relative' }}>
                            <div className="product-image-wrap" style={{ fontSize: '4rem' }}>
                                {isImageIcon(p.img) ? <img src={p.img} alt="" /> : p.img}
                            </div>
                            <h3 className="product-name">{p.name}</h3>
                            <div className="product-price">{mode === 'PRODORD' ? `Rinde ${p.yield_qty}` : `Stock: ${p.stock}`}</div>
                        </div>
                    ))}
                    {filteredProducts.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            {mode === 'PRODORD' ? 'No hay productos con receta configurada en esta categoría.' : 'No se encontraron productos.'}
                        </div>
                    )}
                </section>
            </div>

            <aside className="ticket-panel" style={{ flexShrink: 0 }}>
                <header className="ticket-header">
                    <h2>{title}</h2>
                </header>

                <div className="ticket-body">
                    {cart.length === 0 ? (
                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '2rem' }}>
                            <p>Toca productos del catálogo para agregarlos aquí.</p>
                        </div>
                    ) : (
                        cart.map(line => (
                            <div className="ticket-item" key={line.productId}>
                                <div className="item-info">
                                    <span className="item-name">{line.name}</span>
                                    {requireUnitCost && (
                                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                                            Costo: $
                                            <input type="number" value={line.unitCost} min="0" step="0.01"
                                                onChange={e => updateLineCost(line.productId, Number(e.target.value) || 0)}
                                                style={{ width: '70px', padding: '0.2rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} />
                                        </span>
                                    )}
                                    {mode === 'SALAJ' && line.quantity > line.currentStock && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--danger)', fontWeight: 700 }}>⚠️ Excede stock ({line.currentStock})</span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                    <div className="item-quantity">
                                        <button className="qty-btn" onClick={() => updateLineQty(line.productId, -1)}>
                                            {line.quantity === 1 ? <Trash2 size={14} color="var(--danger)" /> : <Minus size={14} />}
                                        </button>
                                        <span style={{ width: '24px', textAlign: 'center', fontWeight: 'bold' }}>{line.quantity}</span>
                                        <button className="qty-btn" onClick={() => updateLineQty(line.productId, 1)}>
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
                        <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder={`${qtyLabel} totales: ${cart.reduce((s, l) => s + l.quantity, 0)}`}
                            style={{ width: '100%', padding: '0.6rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                    </div>
                    {shortStockWarning && (
                        <p style={{ fontSize: '0.8rem', color: 'var(--danger)', fontWeight: 700, marginBottom: '0.75rem' }}>
                            ⚠️ Alguna línea excede el stock disponible.
                        </p>
                    )}
                    <button
                        className="pay-btn"
                        disabled={saving || cart.length === 0 || (mode === 'PRODORD' ? !branchId : !warehouseId)}
                        onClick={handleSubmit}
                        style={{ width: '100%', backgroundColor: accentColor, opacity: (saving || cart.length === 0) ? 0.6 : 1 }}
                    >
                        <Check size={20} /> {saving ? 'Guardando...' : 'Registrar Documento'}
                    </button>
                </footer>
            </aside>
        </div>
    );
}
