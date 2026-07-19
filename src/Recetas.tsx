import { useState, useEffect, useRef } from "react";
import { getProducts, getIngredients, getRecipes, getRecipeItems, saveRecipe, deleteRecipe, produceRecipe, createIngredient, updateIngredient } from "./db";
import { BookOpen, Plus, Trash2, ChefHat, Play, Upload, Download } from "lucide-react";
import * as XLSX from "xlsx";

import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { notify, confirmAction } from "./lib/dialogs";
import { iconGlyph } from "./lib/iconLibrary";
import ProductIcon from "./components/ProductIcon";

export default function Recetas({ currentUser }: { currentUser: any }) {
    const [recipes, setRecipes] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [ingredients, setIngredients] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Detalle
    const [selectedRecipe, setSelectedRecipe] = useState<any>(null);
    const [recipeItems, setRecipeItems] = useState<any[]>([]);

    // Modal creación/edición
    const [showModal, setShowModal] = useState(false);
    const [formProductId, setFormProductId] = useState<number>(0);
    const [formYield, setFormYield] = useState("1");
    const [formNotes, setFormNotes] = useState("");
    const [formItems, setFormItems] = useState<{ ingredient_id: number; quantity: number }[]>([]);

    // Modal producción
    const [showProdModal, setShowProdModal] = useState(false);
    const [prodRecipeId, setProdRecipeId] = useState<number>(0);
    const [prodBatches, setProdBatches] = useState("1");
    const [prodRecipeItems, setProdRecipeItems] = useState<any[]>([]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [r, p, i] = await Promise.all([getRecipes(), getProducts(), getIngredients()]);
            setRecipes(r);
            setProducts(p);
            setIngredients(i);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => { loadData(); }, []);

    const viewRecipe = async (recipe: any) => {
        setSelectedRecipe(recipe);
        const items = await getRecipeItems(recipe.id);
        setRecipeItems(items);
    };

    const openCreateModal = () => {
        setFormProductId(products.length > 0 ? products[0].id : 0);
        setFormYield("1"); setFormNotes(""); setFormItems([]);
        setShowModal(true);
    };

    const openEditModal = async (recipe: any) => {
        setFormProductId(recipe.product_id);
        setFormYield(String(recipe.yield_qty));
        setFormNotes(recipe.notes || "");
        const items = await getRecipeItems(recipe.id);
        setFormItems(items.map((it: any) => ({ ingredient_id: it.ingredient_id, quantity: it.quantity })));
        setShowModal(true);
    };

    const addFormItem = () => {
        if (ingredients.length === 0) {
            notify("Primero registra ingredientes en el módulo de Inventario.", 'warning');
            return;
        }
        setFormItems([...formItems, { ingredient_id: ingredients[0].id, quantity: 0 }]);
    };

    const updateFormItem = (idx: number, field: string, value: any) => {
        const updated = [...formItems];
        (updated[idx] as any)[field] = field === 'quantity' ? Number(value) : Number(value);
        setFormItems(updated);
    };

    const removeFormItem = (idx: number) => {
        setFormItems(formItems.filter((_, i) => i !== idx));
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formProductId) return notify("Selecciona un producto", 'warning');
        if (formItems.length === 0) return notify("Agrega al menos un ingrediente", 'warning');
        await saveRecipe(formProductId, Number(formYield), formNotes, formItems, currentUser?.id);
        setShowModal(false);
        setSelectedRecipe(null);
        loadData();
    };

    const handleDelete = async (recipeId: number) => {
        if (await confirmAction("¿Eliminar esta receta?")) {
            await deleteRecipe(recipeId, currentUser?.id);
            setSelectedRecipe(null);
            loadData();
        }
    };

    const openProduce = async (recipeId: number) => {
        setProdRecipeId(recipeId);
        setProdBatches("1");
        try {
            const items = await getRecipeItems(recipeId);
            setProdRecipeItems(items);
        } catch (e) {
            console.error("Error loading recipe items for production:", e);
            setProdRecipeItems([]);
        }
        setShowProdModal(true);
    };

    const handleProduce = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await produceRecipe(prodRecipeId, Number(prodBatches), currentUser?.id);
            await notify("¡Producción registrada! Se descontaron ingredientes y se agregó stock al producto.", 'info');
            setShowProdModal(false);
            loadData();
        } catch (err: any) {
            await notify("Error al producir: " + err.message, 'error');
        }
    };

    const fileInputRef = useRef<HTMLInputElement>(null);

    // ===== Descargar Plantilla Excel (con dialógo nativo de Tauri) =====
    const downloadTemplate = async () => {
        const wsData = [
            ["PLANTILLA DE CARGA DE RECETAS - POS PRO PANADERÍA"],
            [],
            ["INSTRUCCIONES:"],
            ["1. Cada fila representa UN ingrediente dentro de UNA receta."],
            ["2. Si un producto lleva 3 ingredientes, habrá 3 filas con el mismo 'Producto'."],
            ["3. El nombre del Producto debe coincidir EXACTAMENTE con el catálogo."],
            ["4. Si el ingrediente no existe, se creará automáticamente."],
            ["5. Rendimiento = cuántas piezas salen de esa receta."],
            [],
            ["Producto", "Rendimiento", "Ingrediente", "Cantidad", "Unidad", "Costo por Unidad", "Notas"],
            ["Concha de Vainilla", 50, "Harina de trigo", 5, "kg", 12.50, "Receta clásica"],
            ["Concha de Vainilla", 50, "Azúcar", 1.5, "kg", 18.00, ""],
            ["Concha de Vainilla", 50, "Mantequilla", 1, "kg", 55.00, ""],
            ["Concha de Vainilla", 50, "Huevo", 20, "pz", 3.50, ""],
            ["Concha de Vainilla", 50, "Levadura", 0.1, "kg", 80.00, ""],
            ["Bolillo", 100, "Harina de trigo", 10, "kg", 12.50, "Receta básica"],
            ["Bolillo", 100, "Sal", 0.2, "kg", 8.00, ""],
            ["Bolillo", 100, "Levadura", 0.15, "kg", 80.00, ""],
            ["Bolillo", 100, "Agua", 6, "lt", 0, ""],
        ];

        const ws = XLSX.utils.aoa_to_sheet(wsData);
        ws['!cols'] = [
            { wch: 25 }, { wch: 14 }, { wch: 22 }, { wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 25 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Recetas");

        // Generar como Uint8Array
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

        try {
            // Abrir diálogo nativo "Guardar como..."
            const filePath = await save({
                title: "Guardar Plantilla de Recetas",
                defaultPath: "plantilla_recetas.xlsx",
                filters: [{ name: "Excel", extensions: ["xlsx"] }]
            });

            if (filePath) {
                await writeFile(filePath, new Uint8Array(wbout));
                await notify("Plantilla guardada exitosamente en:\n" + filePath, 'info');
            }
        } catch (err) {
            console.error("Error guardando plantilla:", err);
            await notify("Error al guardar la plantilla: " + err, 'error');
        }
    };

    // ===== Cargar Recetas desde Excel =====
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            // Buscar la fila de encabezado
            let headerIdx = rows.findIndex(r =>
                r[0]?.toString().toLowerCase().includes('producto') &&
                r[2]?.toString().toLowerCase().includes('ingrediente')
            );
            if (headerIdx === -1) {
                await notify("No se encontró la fila de encabezados (Producto, Rendimiento, Ingrediente, Cantidad, Unidad, Notas). Usa la plantilla proporcionada.", 'warning');
                return;
            }

            const dataRows = rows.slice(headerIdx + 1).filter(r => r[0] && r[2]);

            if (dataRows.length === 0) {
                await notify("No se encontraron filas de datos válidas en el archivo.", 'warning');
                return;
            }

            // Agrupar por producto — col[5]=Costo por Unidad, col[6]=Notas
            const recipeMap: Record<string, { yield: number; notes: string; items: { name: string; qty: number; unit: string; cost: number }[] }> = {};

            for (const row of dataRows) {
                const productName    = String(row[0]).trim();
                const yieldQty       = Number(row[1]) || 1;
                const ingredientName = String(row[2]).trim();
                const qty            = Number(row[3]) || 0;
                const unit           = String(row[4] || 'kg').trim();
                const cost           = Number(row[5]) || 0;
                const notes          = String(row[6] || '').trim();

                if (!recipeMap[productName]) {
                    recipeMap[productName] = { yield: yieldQty, notes, items: [] };
                }
                recipeMap[productName].items.push({ name: ingredientName, qty, unit, cost });
            }

            const freshProducts = await getProducts();
            let freshIngredients = await getIngredients();

            let created = 0;
            let skipped = 0;
            let ingredientsCreated = 0;
            let ingredientsUpdated = 0;

            for (const [productName, recipe] of Object.entries(recipeMap)) {
                const product = freshProducts.find((p: any) => p.name.toLowerCase() === productName.toLowerCase());
                if (!product) {
                    console.warn(`Producto "${productName}" no encontrado en catálogo, saltando...`);
                    skipped++;
                    continue;
                }

                const resolvedItems: { ingredient_id: number; quantity: number }[] = [];
                for (const item of recipe.items) {
                    let ingredient = freshIngredients.find((i: any) => i.name.toLowerCase() === item.name.toLowerCase());
                    if (!ingredient) {
                        await createIngredient({ name: item.name, unit: item.unit, stock: 0, min_stock: 0, cost_per_unit: item.cost });
                        freshIngredients = await getIngredients();
                        ingredient = freshIngredients.find((i: any) => i.name.toLowerCase() === item.name.toLowerCase());
                        ingredientsCreated++;
                    } else if (item.cost > 0) {
                        // Actualiza costo si viene en el archivo
                        await updateIngredient(ingredient.id, {
                            name: ingredient.name,
                            unit: ingredient.unit,
                            min_stock: ingredient.min_stock,
                            cost_per_unit: item.cost,
                        });
                        freshIngredients = await getIngredients();
                        ingredient = freshIngredients.find((i: any) => i.id === ingredient.id);
                        ingredientsUpdated++;
                    }
                    if (ingredient) {
                        resolvedItems.push({ ingredient_id: ingredient.id, quantity: item.qty });
                    }
                }

                if (resolvedItems.length > 0) {
                    await saveRecipe(product.id, recipe.yield, recipe.notes, resolvedItems, currentUser?.id);
                    created++;
                }
            }

            await notify(`Importación completada:\n- ${created} recetas creadas/actualizadas\n- ${ingredientsCreated} ingredientes nuevos\n- ${ingredientsUpdated} costos de ingredientes actualizados\n- ${skipped} productos no encontrados (saltados)`, 'info');
            loadData();
        } catch (err) {
            console.error("Error importando recetas:", err);
            await notify("Error al leer el archivo Excel. Verifica que sea un formato válido.", 'error');
        }

        // Reset file input
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    if (loading) return <div style={{ padding: '2rem' }}>Cargando recetas...</div>;

    return (
        <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h2 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <BookOpen size={28} /> Recetas de Producción
                </h2>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <button onClick={downloadTemplate}
                        style={{ padding: '0.7rem 1rem', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>
                        <Download size={16} /> Plantilla Excel
                    </button>
                    <input type="file" ref={fileInputRef} accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={handleFileUpload} />
                    <button onClick={() => fileInputRef.current?.click()}
                        style={{ padding: '0.7rem 1rem', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.85rem', fontWeight: 600 }}>
                        <Upload size={16} /> Importar Recetas
                    </button>
                    <button onClick={openCreateModal} className="pay-btn" style={{ width: 'auto', padding: '0.7rem 1.2rem', display: 'flex', gap: '0.5rem' }}>
                        <Plus size={18} /> Nueva Receta
                    </button>
                </div>
            </div>

            {recipes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
                    <BookOpen size={48} style={{ marginBottom: '1rem', opacity: 0.4 }} />
                    <p style={{ fontSize: '1.1rem' }}>Aún no tienes recetas. Crea una para vincular ingredientes con tus productos.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
                    {recipes.map(r => (
                        <div key={r.id} style={{
                            background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', padding: '1.5rem',
                            border: selectedRecipe?.id === r.id ? '2px solid var(--accent-primary)' : '1px solid var(--border-light)',
                            cursor: 'pointer', transition: 'all 0.2s'
                        }} onClick={() => viewRecipe(r)}>
                            <div style={{ marginBottom: '0.5rem' }}><ProductIcon icon={r.product_img} size="2rem" /></div>
                            <h3 style={{ margin: '0 0 0.3rem' }}>{r.product_name}</h3>
                            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>Rinde: {r.yield_qty} piezas</p>
                            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
                                <button onClick={(e) => { e.stopPropagation(); openProduce(r.id); }}
                                    style={{ flex: 1, padding: '0.5rem', backgroundColor: 'green', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem', fontSize: '0.85rem' }}>
                                    <Play size={14} /> Producir
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); openEditModal(r); }}
                                    style={{ padding: '0.5rem 0.8rem', backgroundColor: 'var(--bg-tertiary)', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                    Editar
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleDelete(r.id); }}
                                    style={{ padding: '0.5rem 0.8rem', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: 'var(--danger)' }}>
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Detalle de Receta Seleccionada */}
            {selectedRecipe && recipeItems.length > 0 && (
                <div style={{ marginTop: '2rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', padding: '1.5rem' }}>
                    <h3 style={{ marginBottom: '1rem' }}>📋 Ingredientes de: {selectedRecipe.product_name}</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ borderBottom: '2px solid var(--bg-tertiary)' }}>
                                <th style={{ textAlign: 'left', padding: '0.5rem' }}>Ingrediente</th>
                                <th style={{ textAlign: 'center', padding: '0.5rem' }}>Cantidad</th>
                                <th style={{ textAlign: 'center', padding: '0.5rem' }}>Unidad</th>
                            </tr>
                        </thead>
                        <tbody>
                            {recipeItems.map((ri, idx) => (
                                <tr key={idx} style={{ borderBottom: '1px dashed var(--bg-tertiary)' }}>
                                    <td style={{ padding: '0.5rem' }}>{ri.ingredient_name}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center', fontWeight: 600 }}>{ri.quantity}</td>
                                    <td style={{ padding: '0.5rem', textAlign: 'center' }}>{ri.ingredient_unit}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {selectedRecipe.notes && <p style={{ marginTop: '1rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Nota: {selectedRecipe.notes}</p>}
                </div>
            )}

            {/* Modal Crear/Editar Receta */}
            {showModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--bg-primary)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '500px', maxHeight: '85vh', overflowY: 'auto' }}>
                        <h3 style={{ marginBottom: '1.5rem' }}>Configurar Receta</h3>
                        <form onSubmit={handleSave}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Producto Final</label>
                                <select value={formProductId} onChange={e => setFormProductId(Number(e.target.value))}
                                    style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)' }}>
                                    {products.map(p => <option key={p.id} value={p.id}>{iconGlyph(p.img)} {p.name}</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Rendimiento (piezas)</label>
                                    <input type="number" value={formYield} onChange={e => setFormYield(e.target.value)} min="1" step="1"
                                        style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>Notas</label>
                                    <input type="text" value={formNotes} onChange={e => setFormNotes(e.target.value)} placeholder="Opcional..."
                                        style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                                </div>
                            </div>

                            <div style={{ marginBottom: '1rem' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                                    <label style={{ fontWeight: 600 }}>Ingredientes</label>
                                    <button type="button" onClick={addFormItem}
                                        style={{ padding: '0.3rem 0.8rem', backgroundColor: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                        + Agregar
                                    </button>
                                </div>
                                {formItems.map((fi, idx) => (
                                    <div key={idx} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem', alignItems: 'center' }}>
                                        <select value={fi.ingredient_id} onChange={e => updateFormItem(idx, 'ingredient_id', e.target.value)}
                                            style={{ flex: 2, padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }}>
                                            {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                                        </select>
                                        <input type="number" value={fi.quantity} onChange={e => updateFormItem(idx, 'quantity', e.target.value)}
                                            placeholder="Cant." step="0.01" min="0.01"
                                            style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-light)' }} />
                                        <button type="button" onClick={() => removeFormItem(idx)}
                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={16} /></button>
                                    </div>
                                ))}
                                {formItems.length === 0 && <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin ingredientes. Presiona "+ Agregar".</p>}
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginTop: '1.5rem' }}>
                                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '0.7rem 1.2rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                                <button type="submit" style={{ padding: '0.7rem 1.2rem', backgroundColor: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Guardar Receta</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Producción */}
            {showProdModal && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div style={{ backgroundColor: 'var(--bg-primary)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '380px' }}>
                        <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <ChefHat size={24} /> Registrar Producción
                        </h3>
                        <form onSubmit={handleProduce}>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.3rem', fontWeight: 600 }}>¿Cuántos lotes / tandas?</label>
                                <input type="number" value={prodBatches} onChange={e => setProdBatches(e.target.value)} min="1" step="1"
                                    style={{ width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)' }} />
                                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>Se descontarán los ingredientes y se sumará la producción al stock del producto.</p>
                            </div>

                            {/* Análisis de ingredientes e inventario disponible */}
                            {prodRecipeItems.length > 0 && (
                                <div style={{ marginBottom: '1.5rem', maxHeight: '180px', overflowY: 'auto', background: 'var(--bg-secondary)', padding: '1rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}>
                                    <h4 style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem', color: 'var(--text-muted)' }}>Ingredientes (Requerido / Disponible):</h4>
                                    {prodRecipeItems.map((item, idx) => {
                                        const ing = ingredients.find(i => i.id === item.ingredient_id);
                                        const available = ing ? ing.stock : 0;
                                        const required = item.quantity * (Number(prodBatches) || 1);
                                        const isShort = available < required;
                                        return (
                                            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '0.4rem', color: isShort ? 'var(--danger)' : 'var(--text-main)' }}>
                                                <span style={{ fontWeight: isShort ? 700 : 500 }}>
                                                    {item.ingredient_name} {isShort && "⚠️"}
                                                </span>
                                                <span>
                                                    {required.toFixed(2)} / {available.toFixed(2)} {item.ingredient_unit}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {prodRecipeItems.some(item => {
                                const ing = ingredients.find(i => i.id === item.ingredient_id);
                                return (ing ? ing.stock : 0) < (item.quantity * (Number(prodBatches) || 1));
                            }) && (
                                <p style={{ fontSize: '0.85rem', color: 'var(--danger)', fontWeight: 700, margin: '0 0 1.2rem 0' }}>
                                    ⚠️ Atención: No hay suficiente stock de algunos ingredientes en el inventario.
                                </p>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button type="button" onClick={() => setShowProdModal(false)} style={{ padding: '0.7rem 1.2rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                                <button type="submit" style={{ padding: '0.7rem 1.2rem', backgroundColor: 'green', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Producir</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
