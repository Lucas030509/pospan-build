import { useState, useEffect } from "react";
import {
    getBranches, createBranch, updateBranch, deleteBranch,
    getCustomers, createCustomer, updateCustomer, deleteCustomer,
    getCashboxes, createCashbox, updateCashbox, deleteCashbox,
    getWarehouses, getUsers, getCashboxUsers, setCashboxUsers,
} from "../db";
import { notify, confirmAction } from "../lib/dialogs";
import { Building2, Users, Wallet, Plus, Edit2, Trash2, UserCheck } from "lucide-react";

const cardStyle: React.CSSProperties = { backgroundColor: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border-light)', marginBottom: '2rem' };
const inputStyle: React.CSSProperties = { width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)' };
const labelStyle: React.CSSProperties = { display: 'block', marginBottom: '0.3rem', fontWeight: 600 };
const modalOverlay: React.CSSProperties = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
const modalBox: React.CSSProperties = { backgroundColor: 'var(--bg-primary)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '420px', maxHeight: '85vh', overflowY: 'auto' };

export default function VentasSettings({ currentUser }: { currentUser?: any }) {
    const [branches, setBranches] = useState<any[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [cashboxes, setCashboxes] = useState<any[]>([]);
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [cashiers, setCashiers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [b, c, cb, w, u] = await Promise.all([
                getBranches(), getCustomers(), getCashboxes(), getWarehouses(), getUsers(),
            ]);
            setBranches(b);
            setCustomers(c);
            setCashboxes(cb);
            setWarehouses(w);
            setCashiers(u.filter((usr: any) => usr.role === 'cashier'));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadAll(); }, []);

    // === Sucursales ===
    const [showBranchModal, setShowBranchModal] = useState(false);
    const [editBranchId, setEditBranchId] = useState<number | null>(null);
    const [branchName, setBranchName] = useState("");
    const [branchAddress, setBranchAddress] = useState("");
    const [branchPhone, setBranchPhone] = useState("");
    const [branchEmail, setBranchEmail] = useState("");
    const [branchWarehouseId, setBranchWarehouseId] = useState<number | "">("");
    const [branchRawMaterialWarehouseId, setBranchRawMaterialWarehouseId] = useState<number | "">("");
    const [branchWipWarehouseId, setBranchWipWarehouseId] = useState<number | "">("");
    const [branchFinishedGoodsWarehouseId, setBranchFinishedGoodsWarehouseId] = useState<number | "">("");
    const [finishedGoodsSameAsSale, setFinishedGoodsSameAsSale] = useState(true);

    const openBranchModal = (b?: any) => {
        if (b) {
            setEditBranchId(b.id); setBranchName(b.name); setBranchAddress(b.address || "");
            setBranchPhone(b.phone || ""); setBranchEmail(b.email || ""); setBranchWarehouseId(b.warehouse_id || "");
            setBranchRawMaterialWarehouseId(b.raw_material_warehouse_id || "");
            setBranchWipWarehouseId(b.wip_warehouse_id || "");
            setBranchFinishedGoodsWarehouseId(b.finished_goods_warehouse_id || "");
            setFinishedGoodsSameAsSale(!b.finished_goods_warehouse_id || b.finished_goods_warehouse_id === b.warehouse_id);
        } else {
            setEditBranchId(null); setBranchName(""); setBranchAddress(""); setBranchPhone(""); setBranchEmail("");
            setBranchWarehouseId(warehouses[0]?.id || "");
            setBranchRawMaterialWarehouseId(""); setBranchWipWarehouseId(""); setBranchFinishedGoodsWarehouseId("");
            setFinishedGoodsSameAsSale(true);
        }
        setShowBranchModal(true);
    };

    const saveBranch = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!branchName) return notify("Nombre requerido", 'warning');
        if (!branchWarehouseId) return notify("Selecciona el almacén de venta de esta sucursal", 'warning');
        try {
            const payload = {
                name: branchName, address: branchAddress, phone: branchPhone, email: branchEmail,
                warehouse_id: Number(branchWarehouseId),
                raw_material_warehouse_id: branchRawMaterialWarehouseId ? Number(branchRawMaterialWarehouseId) : undefined,
                wip_warehouse_id: branchWipWarehouseId ? Number(branchWipWarehouseId) : undefined,
                finished_goods_warehouse_id: finishedGoodsSameAsSale
                    ? Number(branchWarehouseId)
                    : (branchFinishedGoodsWarehouseId ? Number(branchFinishedGoodsWarehouseId) : undefined),
            };
            if (editBranchId) await updateBranch(editBranchId, payload, currentUser?.id);
            else await createBranch(payload, currentUser?.id);
            setShowBranchModal(false);
            loadAll();
        } catch (err: any) {
            notify("No se pudo guardar la sucursal: " + (err.message || err), 'error');
        }
    };

    const delBranch = async (id: number) => {
        if (!(await confirmAction("¿Eliminar esta sucursal?"))) return;
        try { await deleteBranch(id, currentUser?.id); loadAll(); }
        catch (err: any) { notify("No se pudo eliminar: " + (err.message || err), 'error'); }
    };

    // === Clientes ===
    const [showCustomerModal, setShowCustomerModal] = useState(false);
    const [editCustomerId, setEditCustomerId] = useState<number | null>(null);
    const [customerName, setCustomerName] = useState("");
    const [customerEmail, setCustomerEmail] = useState("");
    const [customerPhone, setCustomerPhone] = useState("");
    const [customerRfc, setCustomerRfc] = useState("");

    const openCustomerModal = (c?: any) => {
        if (c) {
            setEditCustomerId(c.id); setCustomerName(c.name); setCustomerEmail(c.email || "");
            setCustomerPhone(c.phone || ""); setCustomerRfc(c.rfc || "");
        } else {
            setEditCustomerId(null); setCustomerName(""); setCustomerEmail(""); setCustomerPhone(""); setCustomerRfc("");
        }
        setShowCustomerModal(true);
    };

    const saveCustomer = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!customerName) return notify("Nombre requerido", 'warning');
        try {
            const payload = { name: customerName, email: customerEmail, phone: customerPhone, rfc: customerRfc };
            if (editCustomerId) await updateCustomer(editCustomerId, payload, currentUser?.id);
            else await createCustomer(payload, currentUser?.id);
            setShowCustomerModal(false);
            loadAll();
        } catch (err: any) {
            notify("No se pudo guardar el cliente: " + (err.message || err), 'error');
        }
    };

    const delCustomer = async (id: number) => {
        if (!(await confirmAction("¿Eliminar este cliente?"))) return;
        try { await deleteCustomer(id, currentUser?.id); loadAll(); }
        catch (err: any) { notify("No se pudo eliminar: " + (err.message || err), 'error'); }
    };

    // === Cajas ===
    const [showCashboxModal, setShowCashboxModal] = useState(false);
    const [editCashboxId, setEditCashboxId] = useState<number | null>(null);
    const [cashboxName, setCashboxName] = useState("");
    const [cashboxBranchId, setCashboxBranchId] = useState<number | "">("");
    const [cashboxCustomerId, setCashboxCustomerId] = useState<number | "">("");

    const openCashboxModal = (cb?: any) => {
        if (cb) {
            setEditCashboxId(cb.id); setCashboxName(cb.name); setCashboxBranchId(cb.branch_id);
            setCashboxCustomerId(cb.default_customer_id || "");
        } else {
            setEditCashboxId(null); setCashboxName(""); setCashboxBranchId(branches[0]?.id || "");
            setCashboxCustomerId(customers.find(c => c.is_default)?.id || "");
        }
        setShowCashboxModal(true);
    };

    const saveCashbox = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!cashboxName) return notify("Nombre requerido", 'warning');
        if (!cashboxBranchId) return notify("Selecciona la sucursal de esta caja", 'warning');
        try {
            const payload = { name: cashboxName, branch_id: Number(cashboxBranchId), default_customer_id: cashboxCustomerId ? Number(cashboxCustomerId) : undefined };
            if (editCashboxId) await updateCashbox(editCashboxId, payload, currentUser?.id);
            else await createCashbox(payload, currentUser?.id);
            setShowCashboxModal(false);
            loadAll();
        } catch (err: any) {
            notify("No se pudo guardar la caja: " + (err.message || err), 'error');
        }
    };

    const delCashbox = async (id: number) => {
        if (!(await confirmAction("¿Eliminar esta caja?"))) return;
        try { await deleteCashbox(id, currentUser?.id); loadAll(); }
        catch (err: any) { notify("No se pudo eliminar: " + (err.message || err), 'error'); }
    };

    // === Asignación de cajeros a caja ===
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [assignCashboxId, setAssignCashboxId] = useState<number | null>(null);
    const [assignCashboxName, setAssignCashboxName] = useState("");
    const [assignedUserIds, setAssignedUserIds] = useState<Set<number>>(new Set());

    const openAssignModal = async (cb: any) => {
        setAssignCashboxId(cb.id);
        setAssignCashboxName(cb.name);
        try {
            const current = await getCashboxUsers(cb.id);
            setAssignedUserIds(new Set(current.map((u: any) => u.id)));
        } catch (err) {
            console.error(err);
            setAssignedUserIds(new Set());
        }
        setShowAssignModal(true);
    };

    const toggleAssignedUser = (id: number) => {
        setAssignedUserIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const saveAssignment = async () => {
        if (!assignCashboxId) return;
        try {
            await setCashboxUsers(assignCashboxId, Array.from(assignedUserIds), currentUser?.id);
            setShowAssignModal(false);
        } catch (err: any) {
            notify("No se pudo guardar la asignación: " + (err.message || err), 'error');
        }
    };

    if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Cargando datos de ventas...</div>;

    return (
        <div>
            {/* Sucursales */}
            <section style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <Building2 size={22} /> Sucursales
                    </h3>
                    <button onClick={() => openBranchModal()} className="pay-btn" style={{ width: 'auto', padding: '0.6rem 1.1rem', display: 'flex', gap: '0.4rem' }}>
                        <Plus size={16} /> Nueva Sucursal
                    </button>
                </div>
                <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-light)' }}>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Nombre</th>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Almacén de venta</th>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'right', color: 'var(--text-muted)' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {branches.map(b => (
                                <tr key={b.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                    <td style={{ padding: '0.7rem 1rem', fontWeight: 600 }}>{b.name}</td>
                                    <td style={{ padding: '0.7rem 1rem', color: 'var(--text-muted)' }}>{b.warehouse_name || '—'}</td>
                                    <td style={{ padding: '0.7rem 1rem', textAlign: 'right' }}>
                                        <button onClick={() => openBranchModal(b)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginRight: '0.5rem' }}><Edit2 size={16} /></button>
                                        <button onClick={() => delBranch(b.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            ))}
                            {branches.length === 0 && (
                                <tr><td colSpan={3} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Aún no hay sucursales.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Clientes */}
            <section style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <Users size={22} /> Clientes
                    </h3>
                    <button onClick={() => openCustomerModal()} className="pay-btn" style={{ width: 'auto', padding: '0.6rem 1.1rem', display: 'flex', gap: '0.4rem' }}>
                        <Plus size={16} /> Nuevo Cliente
                    </button>
                </div>
                <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-light)' }}>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Nombre</th>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Teléfono</th>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'right', color: 'var(--text-muted)' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {customers.map(c => (
                                <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                    <td style={{ padding: '0.7rem 1rem', fontWeight: 600 }}>
                                        {c.name} {c.is_default === 1 && <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>(por defecto)</span>}
                                    </td>
                                    <td style={{ padding: '0.7rem 1rem', color: 'var(--text-muted)' }}>{c.phone || '—'}</td>
                                    <td style={{ padding: '0.7rem 1rem', textAlign: 'right' }}>
                                        <button onClick={() => openCustomerModal(c)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginRight: '0.5rem' }}><Edit2 size={16} /></button>
                                        {c.is_default !== 1 && (
                                            <button onClick={() => delCustomer(c.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={16} /></button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Cajas */}
            <section style={cardStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                        <Wallet size={22} /> Cajas
                    </h3>
                    <button onClick={() => openCashboxModal()} className="pay-btn" style={{ width: 'auto', padding: '0.6rem 1.1rem', display: 'flex', gap: '0.4rem' }} disabled={branches.length === 0}>
                        <Plus size={16} /> Nueva Caja
                    </button>
                </div>
                {branches.length === 0 && (
                    <p style={{ color: 'var(--text-muted)', marginBottom: '1rem' }}>Crea primero al menos una sucursal para poder dar de alta cajas.</p>
                )}
                <div style={{ background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-light)' }}>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Nombre</th>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Sucursal</th>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'left', color: 'var(--text-muted)' }}>Cliente por defecto</th>
                                <th style={{ padding: '0.7rem 1rem', textAlign: 'right', color: 'var(--text-muted)' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {cashboxes.map(cb => (
                                <tr key={cb.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                    <td style={{ padding: '0.7rem 1rem', fontWeight: 600 }}>{cb.name}</td>
                                    <td style={{ padding: '0.7rem 1rem', color: 'var(--text-muted)' }}>{cb.branch_name || '—'}</td>
                                    <td style={{ padding: '0.7rem 1rem', color: 'var(--text-muted)' }}>{cb.default_customer_name || '—'}</td>
                                    <td style={{ padding: '0.7rem 1rem', textAlign: 'right' }}>
                                        <button onClick={() => openAssignModal(cb)} title="Asignar cajeros" style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--accent-primary)', marginRight: '0.5rem' }}><UserCheck size={16} /></button>
                                        <button onClick={() => openCashboxModal(cb)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', marginRight: '0.5rem' }}><Edit2 size={16} /></button>
                                        <button onClick={() => delCashbox(cb.id)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--danger)' }}><Trash2 size={16} /></button>
                                    </td>
                                </tr>
                            ))}
                            {cashboxes.length === 0 && (
                                <tr><td colSpan={4} style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>Aún no hay cajas.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            {/* Modal Sucursal */}
            {showBranchModal && (
                <div style={modalOverlay}>
                    <div style={modalBox}>
                        <h3 style={{ marginBottom: '1.5rem' }}>{editBranchId ? "Editar Sucursal" : "Nueva Sucursal"}</h3>
                        <form onSubmit={saveBranch}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={labelStyle}>Nombre</label>
                                <input type="text" value={branchName} onChange={e => setBranchName(e.target.value)} required style={inputStyle} />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={labelStyle}>Domicilio</label>
                                <input type="text" value={branchAddress} onChange={e => setBranchAddress(e.target.value)} style={inputStyle} />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={labelStyle}>Teléfono</label>
                                <input type="text" value={branchPhone} onChange={e => setBranchPhone(e.target.value)} style={inputStyle} />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={labelStyle}>Email</label>
                                <input type="email" value={branchEmail} onChange={e => setBranchEmail(e.target.value)} style={inputStyle} />
                            </div>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={labelStyle}>Almacén de venta</label>
                                <select value={branchWarehouseId} onChange={e => setBranchWarehouseId(Number(e.target.value))} required style={inputStyle}>
                                    <option value="">-- Selecciona --</option>
                                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                </select>
                                <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                                    Todas las cajas de esta sucursal venden contra este almacén.
                                </small>
                            </div>

                            <fieldset style={{ border: '1px solid var(--border-light)', borderRadius: '8px', padding: '1rem', marginBottom: '1.5rem' }}>
                                <legend style={{ padding: '0 0.4rem', fontWeight: 600, fontSize: '0.9rem' }}>Almacenes de producción</legend>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={labelStyle}>Almacén de materia prima</label>
                                    <select value={branchRawMaterialWarehouseId} onChange={e => setBranchRawMaterialWarehouseId(Number(e.target.value) || "")} style={inputStyle}>
                                        <option value="">-- Ninguno --</option>
                                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                    </select>
                                </div>
                                <div style={{ marginBottom: '1rem' }}>
                                    <label style={labelStyle}>Almacén en proceso</label>
                                    <select value={branchWipWarehouseId} onChange={e => setBranchWipWarehouseId(Number(e.target.value) || "")} style={inputStyle}>
                                        <option value="">-- Ninguno --</option>
                                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                    </select>
                                    <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                                        Donde quedan los insumos mientras se hornea, hasta que se reciba el producto terminado.
                                    </small>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: finishedGoodsSameAsSale ? 0 : '0.75rem' }}>
                                    <input type="checkbox" id="finished-same-as-sale" checked={finishedGoodsSameAsSale}
                                        onChange={e => setFinishedGoodsSameAsSale(e.target.checked)} style={{ width: '18px', height: '18px' }} />
                                    <label htmlFor="finished-same-as-sale" style={{ cursor: 'pointer' }}>Usar almacén de venta como producto terminado</label>
                                </div>
                                {!finishedGoodsSameAsSale && (
                                    <div>
                                        <label style={labelStyle}>Almacén de producto terminado</label>
                                        <select value={branchFinishedGoodsWarehouseId} onChange={e => setBranchFinishedGoodsWarehouseId(Number(e.target.value) || "")} style={inputStyle}>
                                            <option value="">-- Ninguno --</option>
                                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                                        </select>
                                    </div>
                                )}
                            </fieldset>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button type="button" onClick={() => setShowBranchModal(false)} style={{ padding: '0.7rem 1.2rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                                <button type="submit" style={{ padding: '0.7rem 1.2rem', backgroundColor: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Cliente */}
            {showCustomerModal && (
                <div style={modalOverlay}>
                    <div style={modalBox}>
                        <h3 style={{ marginBottom: '1.5rem' }}>{editCustomerId ? "Editar Cliente" : "Nuevo Cliente"}</h3>
                        <form onSubmit={saveCustomer}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={labelStyle}>Nombre</label>
                                <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} required style={inputStyle} />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={labelStyle}>Teléfono</label>
                                <input type="text" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} style={inputStyle} />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={labelStyle}>Email</label>
                                <input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} style={inputStyle} />
                            </div>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={labelStyle}>RFC</label>
                                <input type="text" value={customerRfc} onChange={e => setCustomerRfc(e.target.value)} style={inputStyle} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button type="button" onClick={() => setShowCustomerModal(false)} style={{ padding: '0.7rem 1.2rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                                <button type="submit" style={{ padding: '0.7rem 1.2rem', backgroundColor: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Caja */}
            {showCashboxModal && (
                <div style={modalOverlay}>
                    <div style={modalBox}>
                        <h3 style={{ marginBottom: '1.5rem' }}>{editCashboxId ? "Editar Caja" : "Nueva Caja"}</h3>
                        <form onSubmit={saveCashbox}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={labelStyle}>Nombre</label>
                                <input type="text" value={cashboxName} onChange={e => setCashboxName(e.target.value)} required placeholder="Ej: Caja 1" style={inputStyle} />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={labelStyle}>Sucursal</label>
                                <select value={cashboxBranchId} onChange={e => setCashboxBranchId(Number(e.target.value))} required style={inputStyle}>
                                    <option value="">-- Selecciona --</option>
                                    {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                                </select>
                            </div>
                            <div style={{ marginBottom: '1.5rem' }}>
                                <label style={labelStyle}>Cliente por defecto</label>
                                <select value={cashboxCustomerId} onChange={e => setCashboxCustomerId(Number(e.target.value))} style={inputStyle}>
                                    <option value="">-- Ninguno --</option>
                                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                                <button type="button" onClick={() => setShowCashboxModal(false)} style={{ padding: '0.7rem 1.2rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                                <button type="submit" style={{ padding: '0.7rem 1.2rem', backgroundColor: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Guardar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Asignar Cajeros */}
            {showAssignModal && (
                <div style={modalOverlay}>
                    <div style={modalBox}>
                        <h3 style={{ marginBottom: '0.5rem' }}>Cajeros de "{assignCashboxName}"</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                            Solo los cajeros marcados podrán abrir turno en esta caja.
                        </p>
                        <div style={{ marginBottom: '1.5rem', maxHeight: '300px', overflowY: 'auto' }}>
                            {cashiers.map(u => (
                                <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0', cursor: 'pointer' }}>
                                    <input type="checkbox" checked={assignedUserIds.has(u.id)} onChange={() => toggleAssignedUser(u.id)} style={{ width: '18px', height: '18px' }} />
                                    {u.name}
                                </label>
                            ))}
                            {cashiers.length === 0 && (
                                <p style={{ color: 'var(--text-muted)' }}>No hay cajeros registrados todavía.</p>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                            <button type="button" onClick={() => setShowAssignModal(false)} style={{ padding: '0.7rem 1.2rem', background: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer' }}>Cancelar</button>
                            <button type="button" onClick={saveAssignment} style={{ padding: '0.7rem 1.2rem', backgroundColor: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>Guardar</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
