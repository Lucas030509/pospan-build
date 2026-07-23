import { useState, useEffect } from "react";
import { getWarehouses, createWarehouse, updateWarehouse, deleteWarehouse, getSettings, saveSettings } from "../db";
import { notify, confirmAction } from "../lib/dialogs";
import { Warehouse, Plus, Edit2, Trash2, ArrowRightLeft } from "lucide-react";
import TransferInbox from "./TransferInbox";
import { cardStyle, inputStyle, labelStyle, modalOverlay, modalBox } from "../lib/formStyles";

export default function InventarioSettings({ currentUser }: { currentUser?: any }) {
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [showWhModal, setShowWhModal] = useState(false);
    const [editWhId, setEditWhId] = useState<number | null>(null);
    const [whName, setWhName] = useState("");
    const [whAddress, setWhAddress] = useState("");
    const [whPhone, setWhPhone] = useState("");

    const [traspTransitWarehouseId, setTraspTransitWarehouseId] = useState<number | "">("");
    const [savingTransit, setSavingTransit] = useState(false);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [wh, settings] = await Promise.all([getWarehouses(), getSettings()]);
            setWarehouses(wh);
            setTraspTransitWarehouseId(settings.trasp_transit_warehouse_id ? Number(settings.trasp_transit_warehouse_id) : "");
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const saveTraspTransitWarehouse = async () => {
        setSavingTransit(true);
        try {
            await saveSettings({ trasp_transit_warehouse_id: traspTransitWarehouseId ? String(traspTransitWarehouseId) : "" });
            await notify("Almacén de tránsito de traspasos actualizado.", 'info');
        } catch (err: any) {
            notify("No se pudo guardar: " + (err.message || err), 'error');
        } finally {
            setSavingTransit(false);
        }
    };

    useEffect(() => { loadAll(); }, []);

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
            loadAll();
        } catch (err: any) {
            notify("No se pudo guardar el almacén: " + (err.message || err), 'error');
        }
    };

    const delWh = async (id: number) => {
        if (!(await confirmAction("¿Eliminar este almacén?"))) return;
        try {
            await deleteWarehouse(id, currentUser?.id);
            loadAll();
        } catch (err: any) {
            notify("No se pudo eliminar: " + (err.message || err), 'error');
        }
    };

    if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Cargando almacenes...</div>;

    return (
        <div>
            <section style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <Warehouse size={22} /> Almacenes
                    </h3>
                    <button onClick={() => openWhModal()} className="pay-btn" style={{ width: 'auto', padding: '0.6rem 1.1rem', display: 'flex', gap: '0.4rem' }}>
                        <Plus size={16} /> Nuevo Almacén
                    </button>
                </div>
                <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-light)' }}>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Nombre</th>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Domicilio</th>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Teléfono</th>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'right', color: 'var(--text-muted)' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {warehouses.map(w => (
                                <tr key={w.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                    <td style={{ padding: '0.7rem 1rem', fontWeight: 600 }}>{w.name}</td>
                                    <td style={{ padding: '0.7rem 1rem', color: 'var(--text-muted)' }}>{w.address || '—'}</td>
                                    <td style={{ padding: '0.7rem 1rem', color: 'var(--text-muted)' }}>{w.phone || '—'}</td>
                                    <td style={{ padding: '0.7rem 1rem', textAlign: 'right' }}>
                                        <button onClick={() => openWhModal(w)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginRight: '0.5rem' }}><Edit2 size={16} /></button>
                                        <button onClick={() => delWh(w.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            ))}
                            {warehouses.length === 0 && (
                                <tr><td colSpan={4} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Aún no hay almacenes registrados.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section style={cardStyle}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <ArrowRightLeft size={22} /> Traspasos Generales (TRASP)
                </h3>
                <div style={{ marginBottom: '1rem' }}>
                    <label style={labelStyle}>Almacén de tránsito</label>
                    <select value={traspTransitWarehouseId} onChange={e => setTraspTransitWarehouseId(Number(e.target.value) || "")} style={inputStyle}>
                        <option value="">-- Ninguno --</option>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                        Único para todo el negocio (no por sucursal) — usado por cualquier traspaso general (TRASP) mientras no se confirme. Requerido para poder crear traspasos.
                    </small>
                </div>
                <button
                    onClick={saveTraspTransitWarehouse}
                    disabled={savingTransit}
                    className="pay-btn"
                    style={{ width: 'auto', padding: '0.7rem 1.5rem', opacity: savingTransit ? 0.6 : 1 }}
                >
                    {savingTransit ? "Guardando..." : "Guardar"}
                </button>
            </section>

            <TransferInbox currentUser={currentUser} />

            {showWhModal && (
                <div style={modalOverlay}>
                    <div style={modalBox}>
                        <h3 style={{ marginBottom: '1.5rem' }}>{editWhId ? "Editar Almacén" : "Nuevo Almacén"}</h3>
                        <form onSubmit={saveWh}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={labelStyle}>Nombre</label>
                                <input type="text" value={whName} onChange={e => setWhName(e.target.value)} required placeholder="Ej: Almacén de Producción" style={inputStyle} />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={labelStyle}>Domicilio</label>
                                <input type="text" value={whAddress} onChange={e => setWhAddress(e.target.value)} style={inputStyle} />
                            </div>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={labelStyle}>Teléfono</label>
                                <input type="text" value={whPhone} onChange={e => setWhPhone(e.target.value)} style={inputStyle} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button type="button" onClick={() => setShowWhModal(false)} style={{ padding: '0.7rem 1.2rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                                <button type="submit" style={{ padding: '0.7rem 1.2rem', backgroundColor: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
