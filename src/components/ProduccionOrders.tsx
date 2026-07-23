import { useState, useEffect } from "react";
import {
    getBranches, getWarehouses, getRecipes, getProducts,
    getProductionDocuments, getWarehouseTransfers,
    createProductionOrder, createInsumoTransfer, cancelProductionOrder,
} from "../db";
import { notify, confirmAction } from "../lib/dialogs";
import { ChefHat, Plus, ArrowRightLeft, PackageCheck, XCircle, AlertTriangle } from "lucide-react";
import EntryCaptureScreen, { EligibleProduct } from "./EntryCaptureScreen";
import ProductionReceiptScreen from "./ProductionReceiptScreen";
import TransferInbox from "./TransferInbox";

const PRODUCT_CATEGORIES = ["Pan Dulce", "Bolillo y Telera", "Pasteles", "Bebidas", "Postres", "Galletas", "Especialidades", "Abarrotes"];

const STATUS_BADGE: Record<string, { bg: string; color: string }> = {
    'Abierta': { bg: '#fff3cd', color: '#856404' },
    'En Proceso': { bg: '#cce5ff', color: '#004085' },
    'Finalizada': { bg: '#d4edda', color: '#155724' },
    'Cancelada': { bg: 'var(--bg-tertiary)', color: 'var(--text-muted)' },
};

export default function ProduccionOrders({ currentUser }: { currentUser?: any }) {
    const [branches, setBranches] = useState<any[]>([]);
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [recipes, setRecipes] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [orders, setOrders] = useState<any[]>([]);
    const [activeTrinsByOrder, setActiveTrinsByOrder] = useState<Map<number, any>>(new Map());
    const [loading, setLoading] = useState(true);
    const [entryMode, setEntryMode] = useState<'PRODORD' | 'RECOP' | null>(null);

    const loadData = async () => {
        setLoading(true);
        try {
            const [b, w, r, p, docs, trins] = await Promise.all([
                getBranches(), getWarehouses(), getRecipes(), getProducts(),
                getProductionDocuments(), getWarehouseTransfers({ type: 'TRINS' }),
            ]);
            setBranches(b);
            setWarehouses(w);
            setRecipes(r);
            setProducts(p);
            setOrders(docs.sort((x: any, y: any) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime()));
            const map = new Map<number, any>();
            for (const t of trins) {
                if (t.status !== 'Cancelado' && t.production_document_id) map.set(t.production_document_id, t);
            }
            setActiveTrinsByOrder(map);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const recipeByProductId = new Map(recipes.map((r: any) => [r.product_id, r]));
    const eligibleForProduction: EligibleProduct[] = products
        .filter((p: any) => recipeByProductId.has(p.id))
        .map((p: any) => {
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

    const handleCreateTrins = async (orderId: number) => {
        try {
            const folio = await createInsumoTransfer({ productionDocumentId: orderId }, currentUser?.id);
            await notify(`Traspaso de insumos generado. Folio ${folio}. Confírmalo en "Recepción de Traspasos" para pasar la orden a En Proceso.`, 'info');
            loadData();
        } catch (err: any) {
            notify("No se pudo generar el traspaso: " + (err.message || err), 'error');
        }
    };

    const handleCancelOrder = async (orderId: number, folio: string) => {
        if (!(await confirmAction(`¿Cancelar la orden "${folio}"? Se liberará lo que esté pendiente.`))) return;
        try {
            await cancelProductionOrder(orderId, currentUser?.id);
            loadData();
        } catch (err: any) {
            notify("No se pudo cancelar: " + (err.message || err), 'error');
        }
    };

    if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Cargando producción...</div>;

    if (entryMode === 'PRODORD') {
        return (
            <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
                <EntryCaptureScreen
                    mode="PRODORD"
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
            </div>
        );
    }

    if (entryMode === 'RECOP') {
        return (
            <div style={{ padding: '2rem', maxWidth: '1400px', margin: '0 auto' }}>
                <ProductionReceiptScreen
                    branchId={branches[0]?.id}
                    userId={currentUser?.id}
                    onBack={() => { setEntryMode(null); loadData(); }}
                />
            </div>
        );
    }

    return (
        <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                <button onClick={() => setEntryMode('PRODORD')} className="pay-btn"
                    style={{ width: '110px', height: '110px', padding: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', borderRadius: '16px', textAlign: 'center' }}
                    disabled={branches.length === 0}>
                    <Plus size={28} /> Orden de Producción
                </button>
                <button onClick={() => setEntryMode('RECOP')} className="pay-btn"
                    style={{ width: '110px', height: '110px', padding: '0.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', backgroundColor: '#8e44ad', borderRadius: '16px', textAlign: 'center' }}
                    disabled={branches.length === 0}>
                    <PackageCheck size={28} /> Recibir Producción
                </button>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '1.5rem' }}>
                <ChefHat size={16} /> Solo se pueden programar productos con receta configurada. Consulta el historial completo en <strong>Kardex</strong>.
            </p>

            <section style={{ backgroundColor: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border-light)', marginBottom: '2rem' }}>
                <h3 style={{ marginBottom: '1.5rem' }}>Órdenes de Producción</h3>
                <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-light)' }}>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Folio</th>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Sucursal</th>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Productos</th>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Estado</th>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'right', color: 'var(--text-muted)' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orders.map(o => {
                                const badge = STATUS_BADGE[o.status] || STATUS_BADGE['Abierta'];
                                const pendingTrins = activeTrinsByOrder.get(o.id);
                                const summary = (o.items || []).map((it: any) => `${it.product_name} (${it.received_qty}/${it.yield_qty})`).join(', ');
                                return (
                                    <tr key={o.id} style={{ borderBottom: '1px solid var(--border-light)', opacity: o.status === 'Cancelada' ? 0.5 : 1 }}>
                                        <td style={{ padding: '0.7rem 1rem', fontWeight: 600 }}>{o.folio}</td>
                                        <td style={{ padding: '0.7rem 1rem', color: 'var(--text-muted)' }}>{o.branch_name || '—'}</td>
                                        <td style={{ padding: '0.7rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{summary || '—'}</td>
                                        <td style={{ padding: '0.7rem 1rem' }}>
                                            <span style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700, backgroundColor: badge.bg, color: badge.color }}>
                                                {o.status}
                                            </span>
                                            {o.status === 'Abierta' && pendingTrins?.status === 'Pendiente' && (
                                                <div style={{ fontSize: '0.75rem', color: 'var(--warning, #856404)', display: 'flex', alignItems: 'center', gap: '0.2rem', marginTop: '0.2rem' }}>
                                                    <AlertTriangle size={12} /> Traspaso pendiente de confirmar
                                                </div>
                                            )}
                                        </td>
                                        <td style={{ padding: '0.7rem 1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                            {o.status === 'Abierta' && !pendingTrins && (
                                                <button onClick={() => handleCreateTrins(o.id)} title="Generar traspaso de insumos"
                                                    style={{ background: 'transparent', border: '1px solid var(--accent-primary)', borderRadius: '6px', padding: '0.4rem 0.7rem', cursor: 'pointer', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.8rem' }}>
                                                    <ArrowRightLeft size={14} /> Traspaso de Insumos
                                                </button>
                                            )}
                                            {(o.status === 'Abierta' || o.status === 'En Proceso') && (
                                                <button onClick={() => handleCancelOrder(o.id, o.folio)} title="Cancelar orden"
                                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}>
                                                    <XCircle size={18} />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {orders.length === 0 && (
                                <tr><td colSpan={5} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Aún no hay órdenes de producción.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <TransferInbox currentUser={currentUser} typeFilter="TRINS" />
        </div>
    );
}
