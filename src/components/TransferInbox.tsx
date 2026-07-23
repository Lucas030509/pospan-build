import { useState, useEffect, Fragment } from "react";
import { getWarehouseTransfers, getWarehouseTransferItems, confirmWarehouseTransfer, cancelWarehouseTransfer } from "../db";
import { notify, confirmAction } from "../lib/dialogs";
import { ArrowRightLeft, Check, X, Eye } from "lucide-react";

interface TransferInboxProps {
    currentUser?: any;
    typeFilter?: 'TRINS';
}

export default function TransferInbox({ currentUser, typeFilter }: TransferInboxProps) {
    const [transfers, setTransfers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [expandedItems, setExpandedItems] = useState<any[]>([]);

    const load = async () => {
        setLoading(true);
        try {
            const rows = await getWarehouseTransfers({ status: 'Pendiente', type: typeFilter });
            setTransfers(rows);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [typeFilter]);

    const toggleExpand = async (t: any) => {
        if (expandedId === t.id) {
            setExpandedId(null);
            return;
        }
        setExpandedId(t.id);
        try {
            setExpandedItems(await getWarehouseTransferItems(t.id));
        } catch (err) {
            console.error(err);
            setExpandedItems([]);
        }
    };

    const handleConfirm = async (id: number) => {
        try {
            await confirmWarehouseTransfer(id, currentUser?.id);
            await notify("Traspaso confirmado.", 'info');
            load();
        } catch (err: any) {
            notify("No se pudo confirmar: " + (err.message || err), 'error');
        }
    };

    const handleCancel = async (id: number) => {
        if (!(await confirmAction("¿Cancelar este traspaso pendiente? Se revertirá lo que ya salió del almacén de origen."))) return;
        try {
            await cancelWarehouseTransfer(id, currentUser?.id);
            await notify("Traspaso cancelado.", 'info');
            load();
        } catch (err: any) {
            notify("No se pudo cancelar: " + (err.message || err), 'error');
        }
    };

    if (loading) return <div style={{ padding: '1rem', color: 'var(--text-muted)' }}>Cargando traspasos pendientes...</div>;

    return (
        <section style={{ backgroundColor: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <ArrowRightLeft size={22} /> Recepción de Traspasos{typeFilter === 'TRINS' ? ' de Insumos' : ''}
            </h3>
            {transfers.length === 0 ? (
                <p style={{ color: 'var(--text-muted)' }}>No hay traspasos pendientes de confirmar.</p>
            ) : (
                <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-light)' }}>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Folio</th>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Tipo</th>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Origen → Destino</th>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Orden</th>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'right', color: 'var(--text-muted)' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {transfers.map(t => (
                                <Fragment key={t.id}>
                                    <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                                        <td style={{ padding: '0.7rem 1rem', fontWeight: 600, fontFamily: 'monospace' }}>{t.folio}</td>
                                        <td style={{ padding: '0.7rem 1rem' }}>
                                            <span style={{
                                                padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700,
                                                backgroundColor: t.type === 'TRINS' ? '#e0d4f7' : '#d4e7f7', color: t.type === 'TRINS' ? '#5b21b6' : '#1e40af'
                                            }}>
                                                {t.type === 'TRINS' ? '🔄 Insumos' : '🔀 General'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.7rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            {t.source_warehouse_name || '?'} → {t.dest_warehouse_name || '?'}
                                        </td>
                                        <td style={{ padding: '0.7rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                                            {t.order_folio || '—'}
                                        </td>
                                        <td style={{ padding: '0.7rem 1rem', textAlign: 'right', display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                                            <button onClick={() => toggleExpand(t)} title="Ver detalle"
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                                                <Eye size={18} />
                                            </button>
                                            <button onClick={() => handleConfirm(t.id)} title="Confirmar"
                                                style={{ background: 'var(--success, #4CAF50)', border: 'none', borderRadius: '6px', padding: '0.4rem 0.7rem', cursor: 'pointer', color: 'white', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                                                <Check size={16} />
                                            </button>
                                            <button onClick={() => handleCancel(t.id)} title="Cancelar"
                                                style={{ background: 'transparent', border: '1px solid var(--danger)', borderRadius: '6px', padding: '0.4rem 0.7rem', cursor: 'pointer', color: 'var(--danger)' }}>
                                                <X size={16} />
                                            </button>
                                        </td>
                                    </tr>
                                    {expandedId === t.id && (
                                        <tr>
                                            <td colSpan={5} style={{ padding: '0.75rem 1.5rem', backgroundColor: 'var(--bg-secondary)' }}>
                                                {expandedItems.length === 0 ? (
                                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin ítems.</span>
                                                ) : (
                                                    <ul style={{ margin: 0, paddingLeft: '1.2rem', fontSize: '0.85rem' }}>
                                                        {expandedItems.map((it: any) => (
                                                            <li key={it.id}>
                                                                {it.item_type === 'product' ? it.product_name : it.ingredient_name} — {it.quantity} {it.ingredient_unit || 'pza(s)'}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
