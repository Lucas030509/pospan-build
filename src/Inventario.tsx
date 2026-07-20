import { useState, useEffect, useRef } from "react";
import { getProducts, createProduct, updateProduct, deleteProduct, initDb } from "./db";
import { notify, confirmAction } from "./lib/dialogs";
import { guessProductIcon } from "./lib/productIcons";
import { Plus, Edit2, Trash2, Upload, Download, Search } from "lucide-react";
import * as XLSX from 'xlsx';
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import IconPickerModal from "./components/IconPickerModal";
import ProductIcon from "./components/ProductIcon";
import { ICON_LIBRARY } from "./lib/iconLibrary";

interface InventarioProps {
    currentUser: any;
}

export default function Inventario({ currentUser }: InventarioProps) {
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [showIconPicker, setShowIconPicker] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");

    // Form state
    const [name, setName] = useState("");
    const [category, setCategory] = useState("Pan Dulce");
    const [price, setPrice] = useState("");
    const [cost, setCost] = useState("");
    const [img, setImg] = useState("🥐");

    const targetFileRef = useRef<HTMLInputElement>(null);

    const categories = ["Pan Dulce", "Bolillo y Telera", "Pasteles", "Bebidas", "Postres", "Galletas", "Especialidades", "Abarrotes"];

    const loadData = async () => {
        setLoading(true);
        const data = await getProducts();
        setProducts(data);
        setLoading(false);
    };

    useEffect(() => {
        loadData();
    }, []);

    const resetForm = () => {
        setName("");
        setCategory("Pan Dulce");
        setPrice("");
        setCost("");
        setImg("🥐");
        setEditingId(null);
    };

    const handleOpenModal = (prod: any = null) => {
        if (prod) {
            setEditingId(prod.id);
            setName(prod.name);
            setCategory(prod.category);
            setPrice(prod.price.toString());
            setCost(prod.cost != null ? prod.cost.toString() : "");
            setImg(prod.img);
        } else {
            resetForm();
        }
        setShowModal(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name || !price) return;

        const parsedPrice = parseFloat(price);
        if (isNaN(parsedPrice) || parsedPrice <= 0) {
            await notify("Precio inválido", 'warning');
            return;
        }

        const parsedCost = parseFloat(cost) || 0;

        try {
            if (editingId) {
                await updateProduct(editingId, { name, category, price: parsedPrice, cost: parsedCost, img }, currentUser?.id);
            } else {
                await createProduct({ name, category, price: parsedPrice, cost: parsedCost, img }, currentUser?.id);
            }
            setShowModal(false);
            resetForm();
            loadData();
        } catch (err) {
            console.error("Error saving product:", err);
            await notify("No se pudo guardar el producto.", 'error');
        }
    };

    const handleDelete = async (id: number) => {
        if (await confirmAction("¿Seguro que deseas eliminar este producto del menú?")) {
            try {
                await deleteProduct(id, currentUser?.id);
                loadData();
            } catch (err) {
                console.error("Error deleting product", err);
            }
        }
    };

    const handleDownloadLayout = async () => {
        const exampleRows = [
            { Icono: "🥐", Nombre: "Cuerno de Mantequilla", Categoria: "Pan Dulce", "Precio de Venta MXN": 12.00, "Costo de Producción MXN": 4.50 },
            { Icono: "🥖", Nombre: "Bolillo",               Categoria: "Bolillo y Telera", "Precio de Venta MXN": 3.50,  "Costo de Producción MXN": 1.20 },
            { Icono: "🍰", Nombre: "Pastel de Fresa Chico", Categoria: "Pasteles", "Precio de Venta MXN": 150.00, "Costo de Producción MXN": 60.00 },
            { Icono: "☕", Nombre: "Café Americano",        Categoria: "Bebidas",  "Precio de Venta MXN": 25.00,  "Costo de Producción MXN": 8.00 },
        ];

        const refRows = categories.map(c => ({ "Categorías Válidas": c }));
        const iconRows = ICON_LIBRARY.map(i => ({ Icono: i.emoji, Nombre: i.label }));

        const wb = XLSX.utils.book_new();
        const wsCatalog = XLSX.utils.json_to_sheet(exampleRows);
        const wsRef = XLSX.utils.json_to_sheet(refRows);
        const wsIcons = XLSX.utils.json_to_sheet(iconRows);

        // Ajustar ancho de columnas en la hoja principal
        wsCatalog["!cols"] = [{ wch: 8 }, { wch: 35 }, { wch: 22 }, { wch: 20 }, { wch: 24 }];
        wsRef["!cols"] = [{ wch: 25 }];
        wsIcons["!cols"] = [{ wch: 8 }, { wch: 32 }];

        XLSX.utils.book_append_sheet(wb, wsCatalog, "Catálogo");
        XLSX.utils.book_append_sheet(wb, wsRef, "Categorías Válidas");
        XLSX.utils.book_append_sheet(wb, wsIcons, "Iconos Disponibles");

        const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });

        try {
            const filePath = await save({
                defaultPath: "layout_catalogo_productos.xlsx",
                filters: [{ name: "Excel", extensions: ["xlsx"] }],
            });
            if (filePath) {
                await writeFile(filePath, new Uint8Array(wbout));
            }
        } catch {
            // Si el diálogo nativo falla (ej. en modo web), descarga directamente
            const blob = new Blob([wbout], { type: "application/octet-stream" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = "layout_catalogo_productos.xlsx";
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Garantiza que la migración de columnas haya corrido (necesario tras hot-reload)
        await initDb();

        let workbook: XLSX.WorkBook;
        let jsonData: any[];

        try {
            const data = await file.arrayBuffer();
            workbook = XLSX.read(data);
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            jsonData = XLSX.utils.sheet_to_json<any>(worksheet);
        } catch (err) {
            console.error("Error parseando el archivo Excel:", err);
            await notify("El archivo no es un Excel válido o está dañado. Verifica el formato (.xlsx / .xls).", 'error');
            if (targetFileRef.current) targetFileRef.current.value = "";
            return;
        }

        setLoading(true);

        // Índice por nombre normalizado para detección de duplicados
        const existingByName = new Map<string, any>();
        const duplicateCatalogNames = new Set<string>();
        for (const p of products) {
            const key = p.name.trim().toLowerCase();
            if (existingByName.has(key)) duplicateCatalogNames.add(p.name.trim());
            existingByName.set(key, p);
        }

        let createdCount = 0;
        let updatedCount = 0;
        const errors: string[] = [];
        const skipped: string[] = [];

        for (const row of jsonData) {
            const rowLabel = String(row["Nombre"] || row["name"] || row["Producto"] || "Fila sin nombre");
            try {
                const rowName = row["Nombre"] || row["name"] || row["Producto"];
                const rawPrice = row["Precio de Venta MXN"] ?? row["Precio"] ?? row["price"] ?? row["Monto"];
                const rawCost  = row["Costo de Producción MXN"] ?? row["Costo"] ?? row["cost"] ?? null;
                const rowCat   = row["Categoria"] || row["category"] || row["Categoría"] || "Pan Dulce";
                const rawIcon  = row["Icono"] || row["Icon"] || row["Emoji"];
                const rowIcon  = rawIcon ? String(rawIcon).trim() : "";

                if (!rowName || rawPrice == null) {
                    skipped.push(`${rowLabel} (falta nombre o precio)`);
                    continue;
                }

                const cleanName = String(rowName).trim();
                const parsedPrice = parseFloat(rawPrice.toString().replace(/[^0-9.-]+/g, ""));
                if (isNaN(parsedPrice) || parsedPrice <= 0) {
                    skipped.push(`${rowLabel} (precio inválido)`);
                    continue;
                }

                const parsedCost = rawCost != null ? parseFloat(rawCost.toString().replace(/[^0-9.-]+/g, "")) : 0;
                const safeCost = isNaN(parsedCost) ? 0 : parsedCost;

                const existing = existingByName.get(cleanName.toLowerCase());

                if (existing) {
                    // Producto ya existe → actualiza precio, costo, y el ícono si viene especificado
                    await updateProduct(existing.id, {
                        name: existing.name,
                        category: existing.category,
                        img: rowIcon || existing.img,
                        price: parsedPrice,
                        cost: safeCost,
                    }, currentUser?.id);
                    existing.price = parsedPrice;
                    existing.cost = safeCost;
                    if (rowIcon) existing.img = rowIcon;
                    updatedCount++;
                } else {
                    // Producto nuevo → crea con todos los campos, usando el ícono de la columna si viene, o adivinándolo por nombre
                    const iconMatch = rowIcon || guessProductIcon(cleanName, String(rowCat));
                    const newId = await createProduct({
                        name: cleanName,
                        category: String(rowCat).trim(),
                        price: parsedPrice,
                        cost: safeCost,
                        img: iconMatch,
                    }, currentUser?.id);
                    // Se agrega al índice en memoria para que filas siguientes con el mismo
                    // nombre (duplicados dentro del mismo archivo) actualicen en vez de
                    // volver a crear un producto distinto.
                    existingByName.set(cleanName.toLowerCase(), {
                        id: newId, name: cleanName, category: String(rowCat).trim(), price: parsedPrice, cost: safeCost, img: iconMatch,
                    });
                    createdCount++;
                }
            } catch (rowErr) {
                console.error("Error importando fila:", row, rowErr);
                errors.push(rowLabel);
            }
        }

        await loadData();

        const summary = [`Nuevos: ${createdCount}`, `Actualizados: ${updatedCount}`];
        if (skipped.length > 0) summary.push(`Omitidas: ${skipped.length} (${skipped.join(", ")})`);
        if (errors.length > 0) summary.push(`Errores: ${errors.join(", ")}`);
        if (duplicateCatalogNames.size > 0) summary.push(`⚠️ Ya tenías productos duplicados en catálogo antes de importar (verifica): ${Array.from(duplicateCatalogNames).join(", ")}`);
        const hasIssues = skipped.length > 0 || errors.length > 0 || duplicateCatalogNames.size > 0;
        await notify(`Importación completada.\n${summary.join(" · ")}`, hasIssues ? 'warning' : 'info');


        if (targetFileRef.current) targetFileRef.current.value = "";
    };

    if (loading) return <div style={{ padding: '2rem' }}>Cargando inventario...</div>;

    const filteredProducts = searchTerm.trim()
        ? products.filter(p => p.name.toLowerCase().includes(searchTerm.trim().toLowerCase()))
        : products;

    return (
        <div style={{ padding: '0', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>

                <div style={{ display: 'flex', gap: '1rem' }}>
                    {/* Campo oculto para seleccionar archivo EXCEL */}
                    <input
                        type="file"
                        accept=".xlsx, .xls, .csv"
                        ref={targetFileRef}
                        style={{ display: 'none' }}
                        onChange={handleFileUpload}
                    />
                    <button
                        onClick={handleDownloadLayout}
                        style={{
                            padding: '0.8rem 1.5rem',
                            display: 'flex', gap: '0.5rem',
                            backgroundColor: 'var(--bg-secondary)',
                            color: 'var(--text-muted)',
                            border: '1px dashed var(--border-light)',
                            borderRadius: 'var(--radius-lg)',
                            cursor: 'pointer',
                            fontWeight: 600,
                            alignItems: 'center'
                        }}
                    >
                        <Download size={20} /> Bajar Layout
                    </button>
                    <button
                        onClick={() => targetFileRef.current?.click()}
                        style={{
                            padding: '0.8rem 1.5rem',
                            display: 'flex', gap: '0.5rem',
                            backgroundColor: 'var(--bg-secondary)',
                            color: 'var(--text-main)',
                            border: '1px solid var(--border-light)',
                            borderRadius: 'var(--radius-lg)',
                            cursor: 'pointer',
                            fontWeight: 600,
                            alignItems: 'center'
                        }}
                    >
                        <Upload size={20} /> Importar Excel
                    </button>
                    <button
                        onClick={() => handleOpenModal()}
                        className="pay-btn"
                        style={{ width: 'auto', padding: '0.8rem 1.5rem', display: 'flex', gap: '0.5rem' }}
                    >
                        <Plus size={20} /> Nuevo Producto
                    </button>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)', padding: '0.6rem 1.2rem', border: '1px solid var(--border-light)', marginBottom: '1.5rem' }}>
                <Search size={18} color="var(--text-muted)" />
                <input
                    type="text"
                    placeholder="Buscar producto por nombre..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ border: 'none', background: 'transparent', outline: 'none', marginLeft: '0.6rem', width: '100%', fontSize: '1rem' }}
                />
            </div>

            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead style={{ backgroundColor: 'var(--border-light)' }}>
                        <tr>
                            <th style={{ padding: '1rem' }}>Icono</th>
                            <th style={{ padding: '1rem' }}>Nombre del Pan</th>
                            <th style={{ padding: '1rem' }}>Categoría</th>
                            <th style={{ padding: '1rem' }}>Precio Venta</th>
                            <th style={{ padding: '1rem' }}>Costo Unit.</th>
                            <th style={{ padding: '1rem', textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredProducts.map((p) => (
                            <tr key={p.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                <td style={{ padding: '1rem' }}><ProductIcon icon={p.img} size="1.5rem" /></td>
                                <td style={{ padding: '1rem', fontWeight: 600 }}>{p.name}</td>
                                <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>{p.category}</td>
                                <td style={{ padding: '1rem' }}>${p.price.toFixed(2)}</td>
                                <td style={{ padding: '1rem', color: 'var(--text-muted)' }}>
                                    {p.cost > 0 ? `$${Number(p.cost).toFixed(2)}` : '—'}
                                </td>
                                <td style={{ padding: '1rem', textAlign: 'right' }}>
                                    <button
                                        onClick={() => handleOpenModal(p)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-main)', marginRight: '1rem' }}
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(p.id)}
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {filteredProducts.length === 0 && (
                            <tr>
                                <td colSpan={6} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    {products.length === 0
                                        ? "El menú está vacío. Registra tu primer producto."
                                        : `No se encontraron productos que coincidan con "${searchTerm}".`}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <form
                        onSubmit={handleSave}
                        style={{ backgroundColor: 'white', padding: '2rem', borderRadius: '12px', width: '100%', maxWidth: '400px', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                    >
                        <h3 style={{ marginBottom: '1.5rem', fontSize: '1.3rem' }}>{editingId ? 'Editar Producto' : 'Crear Producto'}</h3>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Icono/Emoji representativo</label>
                            <button
                                type="button"
                                onClick={() => setShowIconPicker(true)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '0.75rem', width: '100%',
                                    padding: '0.6rem 1rem', border: '1px solid var(--border-light)', borderRadius: '8px',
                                    backgroundColor: 'var(--bg-tertiary)', cursor: 'pointer'
                                }}
                            >
                                <ProductIcon icon={img} size="1.8rem" />
                                <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Cambiar ícono...</span>
                            </button>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Nombre</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                            />
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Categoría</label>
                            <select
                                value={category}
                                onChange={e => setCategory(e.target.value)}
                                style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}
                            >
                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '2rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Precio de Venta (MXN)</label>
                                <input
                                    type="number"
                                    step="0.50"
                                    value={price}
                                    onChange={e => setPrice(e.target.value)}
                                    required
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', boxSizing: 'border-box' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Costo Unitario (MXN)</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="0.00"
                                    value={cost}
                                    onChange={e => setCost(e.target.value)}
                                    style={{ width: '100%', padding: '0.8rem', borderRadius: '6px', border: '1px solid var(--border-light)', boxSizing: 'border-box' }}
                                />
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                onClick={() => setShowModal(false)}
                                style={{ padding: '0.8rem 1.5rem', background: 'none', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer' }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                style={{ padding: '0.8rem 1.5rem', backgroundColor: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Guardar
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <IconPickerModal
                show={showIconPicker}
                currentIcon={img}
                onSelect={setImg}
                onClose={() => setShowIconPicker(false)}
            />
        </div>
    );
}
