import { useState, useEffect } from "react";
import { getBranches, updateBranch, getWarehouses } from "../db";
import { notify } from "../lib/dialogs";
import { ChefHat, Save } from "lucide-react";
import { cardStyle, inputStyle, labelStyle } from "../lib/formStyles";

export default function ProduccionSettings({ currentUser }: { currentUser?: any }) {
    const [branches, setBranches] = useState<any[]>([]);
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedBranchId, setSelectedBranchId] = useState<number | "">("");

    const [rawMaterialWarehouseId, setRawMaterialWarehouseId] = useState<number | "">("");
    const [wipWarehouseId, setWipWarehouseId] = useState<number | "">("");
    const [finishedGoodsWarehouseId, setFinishedGoodsWarehouseId] = useState<number | "">("");
    const [finishedGoodsSameAsSale, setFinishedGoodsSameAsSale] = useState(true);
    const [transitWarehouseId, setTransitWarehouseId] = useState<number | "">("");
    const [autoConfirmProduction, setAutoConfirmProduction] = useState(false);
    const [saving, setSaving] = useState(false);

    const loadAll = async () => {
        setLoading(true);
        try {
            const [b, w] = await Promise.all([getBranches(), getWarehouses()]);
            setBranches(b);
            setWarehouses(w);
            setSelectedBranchId(prev => (prev && b.some((br: any) => br.id === prev)) ? prev : (b[0]?.id || ""));
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadAll(); }, []);

    // Recarga el formulario cada vez que cambia la sucursal seleccionada
    useEffect(() => {
        const b = branches.find(br => br.id === selectedBranchId);
        if (!b) return;
        setRawMaterialWarehouseId(b.raw_material_warehouse_id || "");
        setWipWarehouseId(b.wip_warehouse_id || "");
        setFinishedGoodsWarehouseId(b.finished_goods_warehouse_id || "");
        setFinishedGoodsSameAsSale(!b.finished_goods_warehouse_id || b.finished_goods_warehouse_id === b.warehouse_id);
        setTransitWarehouseId(b.transit_warehouse_id || "");
        setAutoConfirmProduction(Number(b.auto_confirm_production) === 1);
    }, [selectedBranchId, branches]);

    const handleSave = async () => {
        const branch = branches.find(b => b.id === selectedBranchId);
        if (!branch) return;
        setSaving(true);
        try {
            await updateBranch(branch.id, {
                // Se preservan los datos propios de la sucursal (no editables aquí, viven en Ventas > Sucursales)
                name: branch.name, address: branch.address, phone: branch.phone, email: branch.email,
                warehouse_id: branch.warehouse_id,
                raw_material_warehouse_id: rawMaterialWarehouseId ? Number(rawMaterialWarehouseId) : undefined,
                wip_warehouse_id: wipWarehouseId ? Number(wipWarehouseId) : undefined,
                finished_goods_warehouse_id: finishedGoodsSameAsSale
                    ? branch.warehouse_id
                    : (finishedGoodsWarehouseId ? Number(finishedGoodsWarehouseId) : undefined),
                transit_warehouse_id: transitWarehouseId ? Number(transitWarehouseId) : undefined,
                auto_confirm_production: autoConfirmProduction,
            }, currentUser?.id);
            await notify("Almacenes de producción actualizados.", 'info');
            loadAll();
        } catch (err: any) {
            notify("No se pudo guardar: " + (err.message || err), 'error');
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Cargando configuración de producción...</div>;

    if (branches.length === 0) {
        return (
            <section style={cardStyle}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                    <ChefHat size={22} /> Almacenes de Producción
                </h3>
                <p style={{ color: 'var(--text-muted)' }}>
                    Aún no hay sucursales creadas. Crea al menos una en Configuración &gt; Ventas &gt; Sucursales antes de poder configurar sus almacenes de producción.
                </p>
            </section>
        );
    }

    return (
        <div>
            <section style={cardStyle}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <ChefHat size={22} /> Almacenes de Producción
                </h3>

                {branches.length > 1 && (
                    <div style={{ marginBottom: '1.5rem' }}>
                        <label style={labelStyle}>Sucursal</label>
                        <select value={selectedBranchId} onChange={e => setSelectedBranchId(Number(e.target.value))} style={inputStyle}>
                            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                        </select>
                    </div>
                )}

                <div style={{ marginBottom: '1rem' }}>
                    <label style={labelStyle}>Almacén de materia prima</label>
                    <select value={rawMaterialWarehouseId} onChange={e => setRawMaterialWarehouseId(Number(e.target.value) || "")} style={inputStyle}>
                        <option value="">-- Ninguno --</option>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                        De donde se descuentan los insumos al crear una orden de producción.
                    </small>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <label style={labelStyle}>Almacén en proceso</label>
                    <select value={wipWarehouseId} onChange={e => setWipWarehouseId(Number(e.target.value) || "")} style={inputStyle}>
                        <option value="">-- Ninguno --</option>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                        Donde quedan los insumos mientras se hornea, hasta que se reciba el producto terminado.
                    </small>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: finishedGoodsSameAsSale ? '1rem' : '0.75rem' }}>
                    <input type="checkbox" id="finished-same-as-sale" checked={finishedGoodsSameAsSale}
                        onChange={e => setFinishedGoodsSameAsSale(e.target.checked)} style={{ width: '18px', height: '18px' }} />
                    <label htmlFor="finished-same-as-sale" style={{ cursor: 'pointer' }}>Usar almacén de venta como producto terminado</label>
                </div>
                {!finishedGoodsSameAsSale && (
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={labelStyle}>Almacén de producto terminado</label>
                        <select value={finishedGoodsWarehouseId} onChange={e => setFinishedGoodsWarehouseId(Number(e.target.value) || "")} style={inputStyle}>
                            <option value="">-- Ninguno --</option>
                            {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                        </select>
                    </div>
                )}
                <div style={{ marginBottom: '1.5rem' }}>
                    <label style={labelStyle}>Almacén de Mercancía en Tránsito</label>
                    <select value={transitWarehouseId} onChange={e => setTransitWarehouseId(Number(e.target.value) || "")} style={inputStyle}>
                        <option value="">-- Ninguno --</option>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                    <small style={{ color: 'var(--text-muted)', display: 'block', marginTop: '0.3rem' }}>
                        Donde queda la mercancía de un Traspaso de Insumos (TRINS) mientras no se confirme. Requerido para poder generar traspasos de insumos.
                    </small>
                </div>

                <hr style={{ margin: '1.5rem 0', opacity: 0.1 }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <input type="checkbox" id="auto-confirm-production" checked={autoConfirmProduction}
                        onChange={e => setAutoConfirmProduction(e.target.checked)} style={{ width: '18px', height: '18px' }} />
                    <label htmlFor="auto-confirm-production" style={{ cursor: 'pointer', fontWeight: 600 }}>Traspasar y confirmar insumos automáticamente</label>
                </div>
                <small style={{ color: 'var(--text-muted)', display: 'block', marginBottom: '1.5rem' }}>
                    Al crear una Orden de Producción, se genera y confirma el Traspaso de Insumos (TRINS) en automático — la orden queda directo en "En Proceso", sin el paso manual de tránsito. Requiere tener configurado el almacén de Mercancía en Tránsito.
                </small>

                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="pay-btn"
                    style={{ width: 'auto', padding: '0.7rem 1.5rem', display: 'flex', gap: '0.5rem', marginTop: '0.5rem', opacity: saving ? 0.6 : 1 }}
                >
                    <Save size={18} /> {saving ? "Guardando..." : "Guardar"}
                </button>
            </section>
        </div>
    );
}
