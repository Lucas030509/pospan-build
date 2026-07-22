import { useState, useEffect } from "react";
import {
    getKardexSales, getSaleDetails, getAdjustmentDocuments, getProductionDocuments,
    cancelAdjustmentDocument, cancelProductionOrder, getAdjustments, cancelAdjustment,
    getWarehouses, getProductionReceipts, cancelProductionReceipt, getProductionReceiptDetail
} from "./db";
import { Receipt, Search, Eye, Printer, XCircle, Warehouse } from "lucide-react";
import { buildSaleTicketText, getTicketWidth, withPrinterStyle } from "./lib/ticketFormat";
import { hasPermission } from "./App";
import { notify, confirmAction } from "./lib/dialogs";
import ProductIcon from "./components/ProductIcon";
import { REGIMEN_FISCAL_OPTIONS, USO_CFDI_OPTIONS } from "./lib/satCatalogs";

interface KardexProps {
    currentUser: any;
    isPrinterConfigured: boolean;
    printerPort?: string;
    onPreviewTicket: (ticket: string) => void;
}

type MovementKind = 'VENTA' | 'ENTAJ' | 'SALAJ' | 'ENTOP' | 'RECOP';
type TypeFilter = 'TODOS' | 'ENTAJ' | 'SALAJ' | 'VENTA' | 'ENTOP' | 'RECOP';

interface MovementRow {
    key: string;
    kind: MovementKind;
    refId: number;
    folio: string;
    created_at: string;
    user_name: string | null;
    status: string;
    summary: string;
    raw: any;
    /** Documento de ajuste de un solo producto, previo al rediseño multi-producto (tabla "adjustments"). */
    legacy?: boolean;
}

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
    { value: 'TODOS', label: 'Todos' },
    { value: 'ENTAJ', label: 'Entradas' },
    { value: 'SALAJ', label: 'Salidas' },
    { value: 'VENTA', label: 'Ventas' },
    { value: 'ENTOP', label: 'Órdenes de Producción' },
    { value: 'RECOP', label: 'Recepciones de Producción' },
];

const KIND_BADGE: Record<MovementKind, { label: string; bg: string; color: string }> = {
    VENTA: { label: '💰 Venta', bg: '#cce5ff', color: '#004085' },
    ENTAJ: { label: '▲ Entrada', bg: '#d4edda', color: '#155724' },
    SALAJ: { label: '▼ Salida', bg: '#f8d7da', color: '#721c24' },
    ENTOP: { label: '🧑‍🍳 Orden de Producción', bg: '#d4edda', color: '#155724' },
    RECOP: { label: '📦 Recepción', bg: '#e2d4f8', color: '#4b1f8e' },
};

export default function Kardex({ currentUser, isPrinterConfigured, printerPort, onPreviewTicket }: KardexProps) {
    const [rows, setRows] = useState<MovementRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('TODOS');
    const [appSettings, setAppSettings] = useState<Record<string, string>>({});
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [warehouseFilter, setWarehouseFilter] = useState<number | 'TODOS'>('TODOS');

    // Modal Detalle
    const [selectedRow, setSelectedRow] = useState<MovementRow | null>(null);
    const [saleItems, setSaleItems] = useState<any[]>([]);
    const [receiptAllocations, setReceiptAllocations] = useState<any[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const { getSettings } = await import("./db");
                const settings = await getSettings();
                setAppSettings(settings);
            } catch (err) {
                console.error("Error al cargar configuraciones:", err);
            }
        };
        loadSettings();
        getWarehouses().then(setWarehouses).catch(err => console.error("Error al cargar almacenes:", err));
    }, []);

    const loadData = async (search: string, warehouseId?: number) => {
        setLoading(true);
        try {
            const [sales, adjDocs, prodDocs, legacyAdj, receipts] = await Promise.all([
                getKardexSales(search, warehouseId),
                getAdjustmentDocuments(warehouseId),
                getProductionDocuments(warehouseId),
                // Los ajustes legacy son anteriores a multi-almacén (sin warehouse_id): solo se
                // muestran cuando no hay un almacén específico seleccionado.
                warehouseId ? Promise.resolve([]) : getAdjustments(),
                // Las recepciones tocan 3 almacenes a la vez (en proceso/terminado/venta); igual
                // que los ajustes legacy, solo se muestran sin filtro de almacén específico.
                warehouseId ? Promise.resolve([]) : getProductionReceipts(),
            ]);

            const saleRows: MovementRow[] = sales.map((s: any) => ({
                key: `venta-${s.id}`, kind: 'VENTA', refId: s.id,
                folio: `VENTA-${String(s.id).padStart(6, '0')}`,
                created_at: s.created_at, user_name: s.cashier_name,
                status: s.status === 'pending_sync' ? 'Local' : 'Sincronizado',
                summary: `$${Number(s.total).toFixed(2)}${s.requires_invoice ? ' 🧾' : ''}`, raw: s,
            }));

            const adjRows: MovementRow[] = adjDocs.map((d: any) => ({
                key: `${d.type}-${d.id}`, kind: d.type, refId: d.id,
                folio: d.folio, created_at: d.created_at, user_name: d.user_name,
                status: d.status, summary: `${d.items.length} producto(s)`, raw: d,
            }));

            const prodRows: MovementRow[] = prodDocs.map((d: any) => ({
                key: `ENTOP-${d.id}`, kind: 'ENTOP', refId: d.id,
                folio: d.folio, created_at: d.created_at, user_name: d.user_name,
                status: d.status, summary: `${d.items.length} producto(s)`, raw: d,
            }));

            // Ajustes de un solo producto anteriores al rediseño multi-producto (tabla
            // "adjustments"). Se normalizan al mismo formato de documento (un solo ítem
            // sintético) para que se vean y se puedan cancelar igual que los nuevos.
            const legacyRows: MovementRow[] = legacyAdj.map((a: any) => ({
                key: `legacy-${a.type}-${a.id}`, kind: a.type, refId: a.id,
                folio: a.folio, created_at: a.created_at, user_name: a.user_name,
                status: a.status, summary: `1 producto (${a.product_name || 'N/A'})`,
                legacy: true,
                raw: {
                    ...a,
                    items: [{
                        id: a.id, product_name: a.product_name, product_img: a.product_img,
                        quantity: a.quantity, unit_cost: a.unit_cost,
                        previous_stock: a.previous_stock, new_stock: a.new_stock, new_avg_cost: a.new_avg_cost,
                    }],
                },
            }));

            const recopRows: MovementRow[] = receipts.map((r: any) => ({
                key: `RECOP-${r.id}`, kind: 'RECOP', refId: r.id,
                folio: r.folio, created_at: r.created_at, user_name: r.user_name,
                status: r.status, summary: `${r.items.length} producto(s) recibido(s)`, raw: r,
            }));

            let combined = [...saleRows, ...adjRows, ...prodRows, ...legacyRows, ...recopRows];

            const term = search.trim().toLowerCase();
            if (term) {
                combined = combined.filter(r =>
                    r.kind === 'VENTA' ||
                    r.folio.toLowerCase().includes(term) ||
                    (r.raw.items || []).some((it: any) => it.product_name?.toLowerCase().includes(term))
                );
            }

            combined.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            setRows(combined.slice(0, 300));
        } catch (err) {
            console.error("Error al cargar historial:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const delayDebounce = setTimeout(() => {
            loadData(searchTerm, warehouseFilter === 'TODOS' ? undefined : warehouseFilter);
        }, 300);
        return () => clearTimeout(delayDebounce);
    }, [searchTerm, warehouseFilter]);

    const filteredRows = typeFilter === 'TODOS' ? rows : rows.filter(r => r.kind === typeFilter);

    const warehouseLabel = (row: MovementRow): string => {
        if (row.legacy) return '—';
        if (row.kind === 'RECOP') return row.raw.branch_name ? `Sucursal: ${row.raw.branch_name}` : '—';
        if (row.kind === 'ENTOP') {
            const src = row.raw.source_warehouse_name, wip = row.raw.wip_warehouse_name;
            if (!src && !wip) return '—';
            return `${src || '?'} → ${wip || '?'}`;
        }
        return row.raw.warehouse_name || '—';
    };

    const handleViewDetails = async (row: MovementRow) => {
        setSelectedRow(row);
        setSaleItems([]);
        setReceiptAllocations([]);
        if (row.kind === 'VENTA') {
            setLoadingDetails(true);
            try {
                const items = await getSaleDetails(row.refId);
                setSaleItems(items);
            } catch (err) {
                console.error("Error al cargar detalles de la venta:", err);
            } finally {
                setLoadingDetails(false);
            }
        } else if (row.kind === 'RECOP') {
            setLoadingDetails(true);
            try {
                const allocations = await getProductionReceiptDetail(row.refId);
                setReceiptAllocations(allocations);
            } catch (err) {
                console.error("Error al cargar trazabilidad de la recepción:", err);
            } finally {
                setLoadingDetails(false);
            }
        }
    };

    const handleReprint = async () => {
        if (!selectedRow || selectedRow.kind !== 'VENTA' || saleItems.length === 0) return;
        const sale = selectedRow.raw;

        const taxRate = parseFloat(appSettings.tax_rate || "16") / 100;
        const totalVal = Number(sale.total) || 0;
        const subtotal = Math.round((totalVal / (1 + taxRate)) * 100) / 100;
        const tax = Math.round((totalVal - subtotal) * 100) / 100;

        const ticketText = buildSaleTicketText({
            settings: appSettings,
            width: getTicketWidth(appSettings),
            folioLabel: `FOLIO VENTA: ${String(sale.id).padStart(6, '0')} (COPIA)`,
            cashierName: sale.cashier_name || '',
            dateStr: new Date(sale.created_at).toLocaleString(),
            items: saleItems.map(t => ({ quantity: t.quantity, name: t.product_name, lineTotal: t.price * t.quantity })),
            subtotal, tax, total: totalVal,
            paid: Number(sale.cash_received || totalVal),
            change: Number(sale.cash_change || 0),
        });

        setSelectedRow(null);
        if (isPrinterConfigured) {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("print_receipt", { portName: printerPort, receiptData: withPrinterStyle(ticketText, appSettings) });
        } else {
            onPreviewTicket(ticketText);
        }
    };

    const canCancelDocuments = hasPermission(currentUser, 'inventory');

    const handleCancelDocument = async () => {
        if (!selectedRow || selectedRow.kind === 'VENTA') return;
        const proceed = await confirmAction(`¿Cancelar el documento ${selectedRow.folio}? Esto revertirá las existencias de los productos incluidos.`);
        if (!proceed) return;
        try {
            if (selectedRow.legacy) await cancelAdjustment(selectedRow.refId, currentUser?.id);
            else if (selectedRow.kind === 'ENTOP') await cancelProductionOrder(selectedRow.refId, currentUser?.id);
            else if (selectedRow.kind === 'RECOP') await cancelProductionReceipt(selectedRow.refId, currentUser?.id);
            else await cancelAdjustmentDocument(selectedRow.refId, currentUser?.id);
            setSelectedRow(null);
            loadData(searchTerm, warehouseFilter === 'TODOS' ? undefined : warehouseFilter);
        } catch (err: any) {
            await notify("No se pudo cancelar: " + (err.message || err), 'error');
        }
    };

    if (loading) return <div style={{ padding: '2rem' }}>Cargando historial...</div>;

    return (
        <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h2 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                    <Receipt size={28} /> Kardex de Movimientos
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {warehouses.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <Warehouse size={16} color="var(--text-muted)" />
                            <select
                                value={warehouseFilter}
                                onChange={(e) => setWarehouseFilter(e.target.value === 'TODOS' ? 'TODOS' : Number(e.target.value))}
                                style={{ padding: '0.5rem 0.7rem', borderRadius: '8px', border: '1px solid var(--border-light)' }}
                            >
                                <option value="TODOS">Todos los almacenes</option>
                                {warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)', padding: '0.5rem 1rem', border: '1px solid var(--border-light)', width: '300px' }}>
                        <Search size={18} color="var(--text-muted)" />
                        <input
                            type="text"
                            placeholder="Buscar producto, folio, ticket, cajero..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ border: 'none', background: 'transparent', outline: 'none', marginLeft: '0.5rem', width: '100%' }}
                        />
                    </div>
                </div>
            </div>

            <div className="categories-scroll" style={{ marginBottom: '1.5rem' }}>
                {TYPE_FILTERS.map(tf => (
                    <button key={tf.value} className={`category-pill ${typeFilter === tf.value ? 'active' : ''}`} onClick={() => setTypeFilter(tf.value)}>
                        {tf.label}
                    </button>
                ))}
            </div>

            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-light)' }}>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>Folio</th>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>Fecha / Hora</th>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>Tipo</th>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>Cajero</th>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>Resumen</th>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>Almacén</th>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>Estado</th>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRows.map((row) => {
                            const badge = KIND_BADGE[row.kind];
                            return (
                                <tr key={row.key} style={{ borderBottom: '1px solid var(--border-light)', opacity: row.status === 'Cancelada' ? 0.5 : 1 }}>
                                    <td style={{ padding: '1rem 1.5rem', fontWeight: 600, fontFamily: 'monospace' }}>{row.folio}</td>
                                    <td style={{ padding: '1rem 1.5rem' }}>{new Date(row.created_at).toLocaleString()}</td>
                                    <td style={{ padding: '1rem 1.5rem' }}>
                                        <span style={{ padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 700, backgroundColor: badge.bg, color: badge.color }}>
                                            {badge.label}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem' }}>{row.user_name || 'N/A'}</td>
                                    <td style={{ padding: '1rem 1.5rem', fontWeight: 600 }}>{row.summary}</td>
                                    <td style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{warehouseLabel(row)}</td>
                                    <td style={{ padding: '1rem 1.5rem' }}>
                                        <span style={{
                                            backgroundColor: row.status === 'Cancelada' ? 'var(--bg-tertiary)' : (row.status === 'pending_sync' ? 'var(--bg-tertiary)' : 'var(--success, var(--accent-primary))'),
                                            color: row.status === 'Cancelada' || row.status === 'pending_sync' ? 'var(--text-main)' : 'white',
                                            padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600
                                        }}>
                                            {row.status === 'pending_sync' ? 'Local' : row.status}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                        <button
                                            onClick={() => handleViewDetails(row)}
                                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                                            title="Ver Detalles"
                                        >
                                            <Eye size={20} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {filteredRows.length === 0 && (
                            <tr>
                                <td colSpan={8} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    No se encontraron movimientos.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal Detalle Venta */}
            {selectedRow && selectedRow.kind === 'VENTA' && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: 'var(--bg-secondary)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '450px',
                        boxShadow: 'var(--shadow-md)', maxHeight: '80vh', display: 'flex', flexDirection: 'column'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1.5rem', margin: 0 }}>Ticket #{selectedRow.raw.id}</h3>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{new Date(selectedRow.created_at).toLocaleString()}</span>
                        </div>

                        {!!selectedRow.raw.requires_invoice && (
                            <div style={{
                                background: 'rgba(109, 83, 58, 0.08)', border: '1px solid var(--accent-primary)',
                                borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.85rem'
                            }}>
                                <strong>🧾 Requiere factura</strong>
                                <div style={{ marginTop: '0.25rem' }}>
                                    Cliente: {selectedRow.raw.customer_name || 'N/A'}
                                    {selectedRow.raw.customer_rfc && ` — RFC: ${selectedRow.raw.customer_rfc}`}
                                </div>
                                {selectedRow.raw.customer_email && <div>Email: {selectedRow.raw.customer_email}</div>}
                                {selectedRow.raw.customer_phone && <div>Tel: {selectedRow.raw.customer_phone}</div>}
                                {selectedRow.raw.customer_postal_code && <div>C.P. Fiscal: {selectedRow.raw.customer_postal_code}</div>}
                                {selectedRow.raw.customer_tax_regime && (
                                    <div>Régimen: {selectedRow.raw.customer_tax_regime} {REGIMEN_FISCAL_OPTIONS.find(r => r.code === selectedRow.raw.customer_tax_regime)?.label || ''}</div>
                                )}
                                {selectedRow.raw.customer_cfdi_use && (
                                    <div>Uso CFDI: {selectedRow.raw.customer_cfdi_use} {USO_CFDI_OPTIONS.find(u => u.code === selectedRow.raw.customer_cfdi_use)?.label || ''}</div>
                                )}
                            </div>
                        )}

                        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1.5rem' }}>
                            {loadingDetails ? (
                                <p style={{ textAlign: 'center' }}>Cargando detalles...</p>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--bg-tertiary)' }}>
                                            <th style={{ textAlign: 'left', paddingBottom: '0.5rem' }}>Cant</th>
                                            <th style={{ textAlign: 'left', paddingBottom: '0.5rem' }}>Producto</th>
                                            <th style={{ textAlign: 'right', paddingBottom: '0.5rem' }}>Importe</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {saleItems.map((item, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px dashed var(--bg-tertiary)' }}>
                                                <td style={{ padding: '0.5rem 0' }}>{item.quantity}x</td>
                                                <td style={{ padding: '0.5rem 0' }}>{item.product_name}</td>
                                                <td style={{ padding: '0.5rem 0', textAlign: 'right' }}>${(item.price * item.quantity).toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div style={{ borderTop: '2px dashed var(--border-light)', paddingTop: '1rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '1.2rem', fontWeight: 600 }}>
                            <span>Total Págado:</span>
                            <span style={{ color: 'var(--accent-primary)' }}>${Number(selectedRow.raw.total).toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                            <span>Método: {selectedRow.raw.payment_method === 'card' ? 'TARJETA' : 'EFECTIVO'}</span>
                            {selectedRow.raw.payment_method === 'cash' && (
                                <span>Cambio: ${Number(selectedRow.raw.cash_change).toFixed(2)}</span>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                            <button
                                onClick={() => setSelectedRow(null)}
                                style={{ flex: 1, padding: '0.8rem 1.5rem', backgroundColor: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Cerrar
                            </button>
                            <button
                                onClick={handleReprint}
                                style={{ flex: 1, padding: '0.8rem 1.5rem', backgroundColor: 'var(--accent-primary)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                            >
                                <Printer size={18} /> Reimprimir
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Detalle Documento (ENTAJ / SALAJ / ENTOP) */}
            {selectedRow && selectedRow.kind !== 'VENTA' && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: 'var(--bg-secondary)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '550px',
                        boxShadow: 'var(--shadow-md)', maxHeight: '85vh', display: 'flex', flexDirection: 'column'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h3 style={{ fontSize: '1.5rem', margin: 0, fontFamily: 'monospace' }}>{selectedRow.folio}</h3>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{new Date(selectedRow.created_at).toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                            <span>Cajero: {selectedRow.user_name || 'N/A'}</span>
                            <span>Estado: {selectedRow.status}</span>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1.5rem' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--bg-tertiary)' }}>
                                        <th style={{ textAlign: 'left', paddingBottom: '0.5rem' }}>Producto</th>
                                        <th style={{ textAlign: 'center', paddingBottom: '0.5rem' }}>{selectedRow.kind === 'ENTOP' ? 'Lotes / Piezas' : 'Cant.'}</th>
                                        <th style={{ textAlign: 'center', paddingBottom: '0.5rem' }}>Stock (prev → nuevo)</th>
                                        <th style={{ textAlign: 'right', paddingBottom: '0.5rem' }}>{selectedRow.kind === 'ENTOP' ? 'Costo Prod.' : 'Costo Unit.'}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(selectedRow.raw.items || []).map((it: any) => (
                                        <tr key={it.id} style={{ borderBottom: '1px dashed var(--bg-tertiary)' }}>
                                            <td style={{ padding: '0.5rem 0' }}>
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
                                                    <ProductIcon icon={it.product_img} size="1.2rem" />{it.product_name}
                                                </span>
                                            </td>
                                            <td style={{ padding: '0.5rem 0', textAlign: 'center' }}>
                                                {selectedRow.kind === 'ENTOP'
                                                    ? `${it.batches} lote(s) → ${it.yield_qty} pz (recibido: ${it.received_qty ?? 0}, pendiente: ${Number(it.yield_qty) - Number(it.received_qty ?? 0)})`
                                                    : it.quantity}
                                            </td>
                                            <td style={{ padding: '0.5rem 0', textAlign: 'center' }}>{it.previous_stock} → <strong>{it.new_stock}</strong></td>
                                            <td style={{ padding: '0.5rem 0', textAlign: 'right' }}>${Number(it.unit_cost ?? it.new_avg_cost).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {selectedRow.kind === 'RECOP' && (
                                <div style={{ marginTop: '1rem' }}>
                                    <h4 style={{ fontSize: '0.9rem', marginBottom: '0.5rem' }}>Trazabilidad FIFO (de qué orden(es) vino)</h4>
                                    {loadingDetails ? (
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Cargando...</p>
                                    ) : receiptAllocations.length === 0 ? (
                                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Sin detalle disponible.</p>
                                    ) : (
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                            <thead>
                                                <tr style={{ borderBottom: '1px solid var(--bg-tertiary)', color: 'var(--text-muted)' }}>
                                                    <th style={{ textAlign: 'left', padding: '0.3rem 0' }}>Orden origen</th>
                                                    <th style={{ textAlign: 'center', padding: '0.3rem 0' }}>Cantidad tomada</th>
                                                    <th style={{ textAlign: 'right', padding: '0.3rem 0' }}>Costo insumos</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {receiptAllocations.map((a: any) => (
                                                    <tr key={a.id} style={{ borderBottom: '1px dashed var(--bg-tertiary)' }}>
                                                        <td style={{ padding: '0.3rem 0', fontFamily: 'monospace' }}>{a.order_folio}</td>
                                                        <td style={{ padding: '0.3rem 0', textAlign: 'center' }}>{a.qty_taken}</td>
                                                        <td style={{ padding: '0.3rem 0', textAlign: 'right' }}>${Number(a.ingredient_cost).toFixed(2)}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            )}
                            {selectedRow.raw.notes && (
                                <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    Notas: {selectedRow.raw.notes}
                                </p>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                            <button
                                onClick={() => setSelectedRow(null)}
                                style={{ flex: 1, padding: '0.8rem 1.5rem', backgroundColor: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Cerrar
                            </button>
                            {['Realizada', 'Abierta', 'Parcial'].includes(selectedRow.status) && canCancelDocuments && (
                                <button
                                    onClick={handleCancelDocument}
                                    style={{ flex: 1, padding: '0.8rem 1.5rem', backgroundColor: 'var(--danger)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <XCircle size={18} /> {selectedRow.kind === 'RECOP' ? 'Cancelar Recepción' : selectedRow.kind === 'ENTOP' ? 'Cancelar Pendiente' : 'Cancelar Documento'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
