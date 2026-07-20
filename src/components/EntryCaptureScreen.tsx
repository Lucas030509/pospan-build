import { useRef, useState } from "react";
import { ArrowLeft, Search, Upload, Download, Trash2, Minus, Plus, Check } from "lucide-react";
import * as XLSX from "xlsx";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { notify } from "../lib/dialogs";
import { isImageIcon } from "../lib/iconLibrary";

export type EntryMode = 'ENTAJ' | 'SALAJ' | 'ENTOP';

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

interface EntryCaptureScreenProps {
    mode: EntryMode;
    title: string;
    accentColor: string;
    categories: string[];
    eligibleProducts: EligibleProduct[];
    onBack: () => void;
    onSubmit: (lines: CartLine[], notes: string) => Promise<string>;
}

export default function EntryCaptureScreen({ mode, title, accentColor, categories, eligibleProducts, onBack, onSubmit }: EntryCaptureScreenProps) {
    const [activeCategory, setActiveCategory] = useState("Todas");
    const [search, setSearch] = useState("");
    const [cart, setCart] = useState<CartLine[]>([]);
    const [notes, setNotes] = useState("");
    const [saving, setSaving] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const requireUnitCost = mode === 'ENTAJ';
    const qtyLabel = mode === 'ENTOP' ? 'Lotes' : 'Cantidad';

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
        setSaving(true);
        try {
            const folio = await onSubmit(cart, notes);
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
        const rows = mode === 'ENTOP'
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
            for (const p of eligibleProducts) byName.set(p.name.trim().toLowerCase(), p);

            const notFound: string[] = [];
            let added = 0;
            for (const row of rows) {
                const rowName = row["Producto"] || row["producto"] || row["Nombre"];
                const rawQty = mode === 'ENTOP' ? (row["Lotes"] ?? row["lotes"]) : (row["Cantidad"] ?? row["cantidad"]);
                if (!rowName || rawQty == null) continue;
                const product = byName.get(String(rowName).trim().toLowerCase());
                if (!product) { notFound.push(String(rowName)); continue; }
                const qty = parseFloat(String(rawQty));
                if (isNaN(qty) || qty <= 0) continue;
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
            await notify(summary.join(" · "), notFound.length > 0 ? 'warning' : 'info');
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
                            <div className="product-price">{mode === 'ENTOP' ? `Rinde ${p.yield_qty}` : `Stock: ${p.stock}`}</div>
                        </div>
                    ))}
                    {filteredProducts.length === 0 && (
                        <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                            {mode === 'ENTOP' ? 'No hay productos con receta configurada en esta categoría.' : 'No se encontraron productos.'}
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
                        disabled={saving || cart.length === 0}
                        onClick={handleSubmit}
                        style={{ width: '100%', backgroundColor: accentColor, opacity: saving || cart.length === 0 ? 0.6 : 1 }}
                    >
                        <Check size={20} /> {saving ? 'Guardando...' : 'Registrar Documento'}
                    </button>
                </footer>
            </aside>
        </div>
    );
}
