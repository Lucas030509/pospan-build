import { useState, useEffect } from "react";
import {
    getKardexSales, getSaleDetails, getAdjustmentDocuments, getProductionDocuments,
    cancelAdjustmentDocument, cancelProductionOrder, getAdjustments, cancelAdjustment,
    getWarehouses, getProductionReceipts, cancelProductionReceipt, getProductionReceiptDetail,
    getSalprodDetail, getWarehouseTransfers, getWarehouseTransferItems, cancelWarehouseTransfer,
    getSalePayments,
} from "./db";
import { Receipt, Search, Eye, Printer, XCircle, Warehouse } from "lucide-react";
import { buildSaleTicketText, getTicketWidth, withPrinterStyle, getLogoPrintOptions } from "./lib/ticketFormat";
import { hasPermission } from "./App";
import { notify, confirmAction } from "./lib/dialogs";
import ProductIcon from "./components/ProductIcon";
import { REGIMEN_FISCAL_OPTIONS, USO_CFDI_OPTIONS } from "./lib/satCatalogs";
import MultiSelectDropdown from "./components/MultiSelectDropdown";

interface KardexProps {
    currentUser: any;
    isPrinterConfigured: boolean;
    printerPort?: string;
    onPreviewTicket: (ticket: string) => void;
}

type MovementKind = 'VENTA' | 'ENTAJ' | 'SALAJ' | 'PRODORD' | 'ENTOP' | 'SALPROD' | 'TRINS' | 'TRASP';
type TypeFilter = 'TODOS' | MovementKind;

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
    { value: 'PRODORD', label: 'Órdenes de Producción' },
    { value: 'ENTOP', label: 'Recepciones de Producción' },
    { value: 'SALPROD', label: 'Consumo de Insumos' },
    { value: 'TRINS', label: 'Traspasos de Insumos' },
    { value: 'TRASP', label: 'Traspasos Generales' },
];

const KIND_BADGE: Record<MovementKind, { label: string; bg: string; color: string }> = {
    VENTA: { label: '💰 Venta', bg: '#cce5ff', color: '#004085' },
    ENTAJ: { label: '▲ Entrada', bg: '#d4edda', color: '#155724' },
    SALAJ: { label: '▼ Salida', bg: '#f8d7da', color: '#721c24' },
    PRODORD: { label: '🧑‍🍳 Orden de Producción', bg: '#d4edda', color: '#155724' },
    ENTOP: { label: '📦 Recepción de Producción', bg: '#e2d4f8', color: '#4b1f8e' },
    SALPROD: { label: '🌾 Consumo de Insumos', bg: '#fbe8cc', color: '#8a5a00' },
    TRINS: { label: '🔄 Traspaso de Insumos', bg: '#e0d4f7', color: '#5b21b6' },
    TRASP: { label: '🔀 Traspaso General', bg: '#d4e7f7', color: '#1e40af' },
};

export default function Kardex({ currentUser, isPrinterConfigured, printerPort, onPreviewTicket }: KardexProps) {
    const [rows, setRows] = useState<MovementRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('TODOS');
    const [appSettings, setAppSettings] = useState<Record<string, string>>({});
    const [warehouses, setWarehouses] = useState<any[]>([]);
    const [warehouseFilter, setWarehouseFilter] = useState<number[]>([]);

    // Modal Detalle
    const [selectedRow, setSelectedRow] = useState<MovementRow | null>(null);
    const [saleItems, setSaleItems] = useState<any[]>([]);
    const [salePayments, setSalePayments] = useState<any[]>([]);
    const [receiptAllocations, setReceiptAllocations] = useState<any[]>([]);
    const [salprodItems, setSalprodItems] = useState<any[]>([]);
    const [transferItems, setTransferItems] = useState<any[]>([]);
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

    const loadData = async (search: string, warehouseIds: number[]) => {
        setLoading(true);
        try {
            const [sales, adjDocs, prodDocs, legacyAdj, receipts, transfers] = await Promise.all([
                getKardexSales(search, warehouseIds),
                getAdjustmentDocuments(warehouseIds),
                getProductionDocuments(warehouseIds),
                // Los ajustes legacy son anteriores a multi-almacén (sin warehouse_id): solo se
                // muestran cuando no hay un almacén específico seleccionado.
                warehouseIds.length > 0 ? Promise.resolve([]) : getAdjustments(),
                getProductionReceipts(undefined, warehouseIds),
                getWarehouseTransfers({ warehouseIds: warehouseIds.length > 0 ? warehouseIds : undefined }),
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
                key: `PRODORD-${d.id}`, kind: 'PRODORD', refId: d.id,
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

            // Cada recepción de producción genera 2 identidades sobre la misma fila: ENTOP
            // (entrada de producto terminado) y SALPROD (consumo de insumos) — comparten refId,
            // así que cancelar cualquiera de las dos cancela la misma recepción subyacente.
            const entopRows: MovementRow[] = receipts.map((r: any) => ({
                key: `ENTOP-${r.id}`, kind: 'ENTOP', refId: r.id,
                folio: r.folio, created_at: r.created_at, user_name: r.user_name,
                status: r.status, summary: `${r.items.length} producto(s) recibido(s)`, raw: r,
            }));
            const salprodRows: MovementRow[] = receipts.map((r: any) => ({
                key: `SALPROD-${r.id}`, kind: 'SALPROD', refId: r.id,
                folio: r.salprod_folio || '—', created_at: r.created_at, user_name: r.user_name,
                status: r.status, summary: `Insumos de ${r.folio}`, raw: r,
            }));

            const transferRows: MovementRow[] = transfers.map((t: any) => ({
                key: `${t.type}-${t.id}`, kind: t.type, refId: t.id,
                folio: t.folio, created_at: t.created_at, user_name: t.user_name,
                status: t.status,
                summary: t.type === 'TRINS' ? `Insumos de la orden ${t.order_folio || '—'}` : 'Traspaso general',
                raw: t,
            }));

            let combined = [...saleRows, ...adjRows, ...prodRows, ...legacyRows, ...entopRows, ...salprodRows, ...transferRows];

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
            loadData(searchTerm, warehouseFilter);
        }, 300);
        return () => clearTimeout(delayDebounce);
    }, [searchTerm, warehouseFilter]);

    const filteredRows = typeFilter === 'TODOS' ? rows : rows.filter(r => r.kind === typeFilter);

    const warehouseLabel = (row: MovementRow): string => {
        if (row.legacy) return '—';
        if (row.kind === 'ENTOP' || row.kind === 'SALPROD') return row.raw.branch_name ? `Sucursal: ${row.raw.branch_name}` : '—';
        if (row.kind === 'PRODORD') {
            const src = row.raw.source_warehouse_name, wip = row.raw.wip_warehouse_name;
            if (!src && !wip) return '—';
            return `${src || '?'} → ${wip || '?'}`;
        }
        if (row.kind === 'TRINS' || row.kind === 'TRASP') {
            return `${row.raw.source_warehouse_name || '?'} → ${row.raw.dest_warehouse_name || '?'}`;
        }
        return row.raw.warehouse_name || '—';
    };

    const handleViewDetails = async (row: MovementRow) => {
        setSelectedRow(row);
        setSaleItems([]);
        setSalePayments([]);
        setReceiptAllocations([]);
        setSalprodItems([]);
        setTransferItems([]);
        if (row.kind === 'VENTA') {
            setLoadingDetails(true);
            try {
                setSaleItems(await getSaleDetails(row.refId));
                if (row.raw.payment_method === 'mixed') {
                    setSalePayments(await getSalePayments(row.refId));
                }
            } catch (err) {
                console.error("Error al cargar detalles de la venta:", err);
            } finally {
                setLoadingDetails(false);
            }
        } else if (row.kind === 'ENTOP') {
            setLoadingDetails(true);
            try {
                setReceiptAllocations(await getProductionReceiptDetail(row.refId));
            } catch (err) {
                console.error("Error al cargar trazabilidad de la recepción:", err);
            } finally {
                setLoadingDetails(false);
            }
        } else if (row.kind === 'SALPROD') {
            setLoadingDetails(true);
            try {
                setSalprodItems(await getSalprodDetail(row.refId));
            } catch (err) {
                console.error("Error al cargar consumo de insumos:", err);
            } finally {
                setLoadingDetails(false);
            }
        } else if (row.kind === 'TRINS' || row.kind === 'TRASP') {
            setLoadingDetails(true);
            try {
                setTransferItems(await getWarehouseTransferItems(row.refId));
            } catch (err) {
                console.error("Error al cargar el detalle del traspaso:", err);
            } finally {
                setLoadingDetails(false);
            }
        }
    };

    const handleReprint = async () => {
        if (!selectedRow || selectedRow.kind !== 'VENTA' || saleItems.length === 0) return;
        const sale = selectedRow.raw;
        const totalVal = Number(sale.total) || 0;

        // sale.subtotal/sale.tax se guardan desde esta migración en adelante — para ventas
        // anteriores (columna en 0 por el ALTER TABLE) se recalculan con la tasa actual, igual
        // que antes, porque no hay forma de saber cuál era la tasa vigente al momento de venderlas.
        let subtotal: number, tax: number;
        if (sale.subtotal || sale.tax) {
            subtotal = Number(sale.subtotal) || 0;
            tax = Number(sale.tax) || 0;
        } else {
            const taxRate = parseFloat(appSettings.tax_rate || "16") / 100;
            subtotal = Math.round((totalVal / (1 + taxRate)) * 100) / 100;
            tax = Math.round((totalVal - subtotal) * 100) / 100;
        }

        const cardTypeLabel = (ct: string) => ct === 'credito' ? 'CRÉDITO' : 'DÉBITO';
        const paymentLines = sale.payment_method === 'mixed'
            ? salePayments.map(sp => sp.method === 'cash'
                ? { label: 'EFECTIVO', amount: Number(sp.amount) }
                : { label: `TARJETA ${cardTypeLabel(sp.card_type)} (${(sp.bank_name || '').toUpperCase()})`, amount: Number(sp.amount) })
            : undefined;
        const courtesy = sale.payment_method === 'cortesia'
            ? { reason: sale.courtesy_reason || '', authorizedBy: sale.courtesy_authorized_by_name || '' }
            : undefined;

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
            paymentLines,
            courtesy,
        });

        setSelectedRow(null);
        if (isPrinterConfigured) {
            const { invoke } = await import("@tauri-apps/api/core");
            const logoOpts = getLogoPrintOptions(appSettings);
            await invoke("print_receipt", { portName: printerPort, receiptData: withPrinterStyle(ticketText, appSettings), printLogo: logoOpts.printLogo, logoKc1: logoOpts.logoKc1, logoKc2: logoOpts.logoKc2, logoScale: logoOpts.logoScale });
        } else {
            onPreviewTicket(ticketText);
        }
    };

    const canCancelDocuments = hasPermission(currentUser, 'inventory');

    const canCancelRow = (row: MovementRow): boolean => {
        if (row.kind === 'TRINS' || row.kind === 'TRASP') return row.status === 'Pendiente';
        return ['Realizada', 'Abierta', 'En Proceso'].includes(row.status);
    };

    const cancelButtonLabel = (row: MovementRow): string => {
        if (row.kind === 'ENTOP' || row.kind === 'SALPROD') return 'Cancelar Recepción';
        if (row.kind === 'PRODORD') return 'Cancelar Pendiente';
        if (row.kind === 'TRINS' || row.kind === 'TRASP') return 'Cancelar Traspaso';
        return 'Cancelar Documento';
    };

    const handleCancelDocument = async () => {
        if (!selectedRow || selectedRow.kind === 'VENTA') return;
        const extraWarning = (selectedRow.kind === 'ENTOP' || selectedRow.kind === 'SALPROD')
            ? ' Esto también revertirá el documento pareja (ENTOP/SALPROD) vinculado a esta misma recepción.'
            : '';
        const proceed = await confirmAction(`¿Cancelar el documento ${selectedRow.folio}? Esto revertirá las existencias de los productos incluidos.${extraWarning}`);
        if (!proceed) return;
        try {
            if (selectedRow.legacy) await cancelAdjustment(selectedRow.refId, currentUser?.id);
            else if (selectedRow.kind === 'PRODORD') await cancelProductionOrder(selectedRow.refId, currentUser?.id);
            else if (selectedRow.kind === 'ENTOP' || selectedRow.kind === 'SALPROD') await cancelProductionReceipt(selectedRow.refId, currentUser?.id);
            else if (selectedRow.kind === 'TRINS' || selectedRow.kind === 'TRASP') await cancelWarehouseTransfer(selectedRow.refId, currentUser?.id);
            else await cancelAdjustmentDocument(selectedRow.refId, currentUser?.id);
            setSelectedRow(null);
            loadData(searchTerm, warehouseFilter);
        } catch (err: any) {
            await notify("No se pudo cancelar: " + (err.message || err), 'error');
        }
    };

    if (loading) return <div style={{ padding: '2rem' }}>Cargando historial...</div>;

    const isTransferKind = selectedRow?.kind === 'TRINS' || selectedRow?.kind === 'TRASP';
    const isSalprod = selectedRow?.kind === 'SALPROD';
    const isGenericDocument = selectedRow && selectedRow.kind !== 'VENTA' && !isTransferKind && !isSalprod;

    return (
        <div style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <h2 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                    <Receipt size={28} /> Kardex de Movimientos
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {warehouses.length > 0 && (
                        <MultiSelectDropdown
                            options={warehouses}
                            selectedIds={warehouseFilter}
                            onChange={setWarehouseFilter}
                            allLabel="Todos los almacenes"
                            icon={<Warehouse size={16} color="var(--text-muted)" />}
                        />
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
                                <tr key={row.key} style={{ borderBottom: '1px solid var(--border-light)', opacity: (row.status === 'Cancelada' || row.status === 'Cancelado') ? 0.5 : 1 }}>
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
                                            backgroundColor: (row.status === 'Cancelada' || row.status === 'Cancelado') ? 'var(--bg-tertiary)' : (row.status === 'pending_sync' ? 'var(--bg-tertiary)' : 'var(--success, var(--accent-primary))'),
                                            color: (row.status === 'Cancelada' || row.status === 'Cancelado' || row.status === 'pending_sync') ? 'var(--text-main)' : 'white',
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h3 style={{ fontSize: '1.5rem', margin: 0 }}>Ticket #{selectedRow.raw.id}</h3>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{new Date(selectedRow.created_at).toLocaleString()}</span>
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                            Cajero: {selectedRow.raw.cashier_name || 'Desconocido'}
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
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                            <span>Método: {
                                { cash: 'EFECTIVO', card: 'TARJETA', mixed: 'MIXTO', cortesia: 'CORTESÍA' }[selectedRow.raw.payment_method as string]
                                || (selectedRow.raw.payment_method as string || '').toUpperCase()
                            }</span>
                            {selectedRow.raw.payment_method === 'cash' && (
                                <span>Cambio: ${Number(selectedRow.raw.cash_change).toFixed(2)}</span>
                            )}
                        </div>
                        <div style={{ marginBottom: '1.5rem' }}>
                            {selectedRow.raw.payment_method === 'mixed' && (
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                                    {salePayments.map((sp, idx) => (
                                        <div key={idx} style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span>{sp.method === 'cash' ? '💵 Efectivo' : `💳 Tarjeta ${sp.card_type === 'credito' ? 'crédito' : 'débito'} (${sp.bank_name || '—'})`}</span>
                                            <span>${Number(sp.amount).toFixed(2)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {selectedRow.raw.payment_method === 'cortesia' && (
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', background: 'var(--bg-primary)', borderRadius: '8px', padding: '0.75rem' }}>
                                    <div><strong>Motivo:</strong> {selectedRow.raw.courtesy_reason || '—'}</div>
                                    <div><strong>Autorizó:</strong> {selectedRow.raw.courtesy_authorized_by_name || '—'}</div>
                                </div>
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

            {/* Modal Detalle Documento (ENTAJ / SALAJ / PRODORD / ENTOP) */}
            {isGenericDocument && selectedRow && (
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
                                        <th style={{ textAlign: 'center', paddingBottom: '0.5rem' }}>{selectedRow.kind === 'PRODORD' ? 'Lotes / Piezas' : 'Cant.'}</th>
                                        <th style={{ textAlign: 'center', paddingBottom: '0.5rem' }}>Stock (prev → nuevo)</th>
                                        <th style={{ textAlign: 'right', paddingBottom: '0.5rem' }}>{selectedRow.kind === 'PRODORD' ? 'Costo Prod.' : 'Costo Unit.'}</th>
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
                                                {selectedRow.kind === 'PRODORD'
                                                    ? `${it.batches} lote(s) → ${it.yield_qty} pz (recibido: ${it.received_qty ?? 0}, pendiente: ${Number(it.yield_qty) - Number(it.received_qty ?? 0)})`
                                                    : it.quantity}
                                            </td>
                                            <td style={{ padding: '0.5rem 0', textAlign: 'center' }}>{it.previous_stock} → <strong>{it.new_stock}</strong></td>
                                            <td style={{ padding: '0.5rem 0', textAlign: 'right' }}>${Number(it.unit_cost ?? it.new_avg_cost).toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {selectedRow.kind === 'ENTOP' && (
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
                            {canCancelRow(selectedRow) && canCancelDocuments && (
                                <button
                                    onClick={handleCancelDocument}
                                    style={{ flex: 1, padding: '0.8rem 1.5rem', backgroundColor: 'var(--danger)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <XCircle size={18} /> {cancelButtonLabel(selectedRow)}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Detalle SALPROD (consumo de insumos de una recepción) */}
            {isSalprod && selectedRow && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: 'var(--bg-secondary)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '500px',
                        boxShadow: 'var(--shadow-md)', maxHeight: '80vh', display: 'flex', flexDirection: 'column'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h3 style={{ fontSize: '1.5rem', margin: 0, fontFamily: 'monospace' }}>{selectedRow.folio}</h3>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{new Date(selectedRow.created_at).toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                            <span>Cajero: {selectedRow.user_name || 'N/A'}</span>
                            <span>Estado: {selectedRow.status}</span>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            Insumos consumidos para la recepción <strong style={{ fontFamily: 'monospace' }}>{selectedRow.raw.folio}</strong> (ENTOP).
                        </p>
                        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1.5rem' }}>
                            {loadingDetails ? (
                                <p style={{ textAlign: 'center' }}>Cargando...</p>
                            ) : salprodItems.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin detalle disponible.</p>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--bg-tertiary)' }}>
                                            <th style={{ textAlign: 'left', paddingBottom: '0.5rem' }}>Insumo</th>
                                            <th style={{ textAlign: 'center', paddingBottom: '0.5rem' }}>Cantidad</th>
                                            <th style={{ textAlign: 'right', paddingBottom: '0.5rem' }}>Costo Unit.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {salprodItems.map((it: any) => (
                                            <tr key={it.ingredient_id} style={{ borderBottom: '1px dashed var(--bg-tertiary)' }}>
                                                <td style={{ padding: '0.5rem 0' }}>{it.ingredient_name}</td>
                                                <td style={{ padding: '0.5rem 0', textAlign: 'center' }}>{Number(it.quantity).toFixed(2)} {it.ingredient_unit}</td>
                                                <td style={{ padding: '0.5rem 0', textAlign: 'right' }}>${Number(it.unit_cost).toFixed(2)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                            <button
                                onClick={() => setSelectedRow(null)}
                                style={{ flex: 1, padding: '0.8rem 1.5rem', backgroundColor: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Cerrar
                            </button>
                            {canCancelRow(selectedRow) && canCancelDocuments && (
                                <button
                                    onClick={handleCancelDocument}
                                    style={{ flex: 1, padding: '0.8rem 1.5rem', backgroundColor: 'var(--danger)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <XCircle size={18} /> {cancelButtonLabel(selectedRow)}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Detalle Traspaso (TRINS / TRASP) */}
            {isTransferKind && selectedRow && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: 'var(--bg-secondary)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '500px',
                        boxShadow: 'var(--shadow-md)', maxHeight: '80vh', display: 'flex', flexDirection: 'column'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                            <h3 style={{ fontSize: '1.5rem', margin: 0, fontFamily: 'monospace' }}>{selectedRow.folio}</h3>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{new Date(selectedRow.created_at).toLocaleString()}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                            <span>Usuario: {selectedRow.user_name || 'N/A'}</span>
                            <span>Estado: {selectedRow.status}</span>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            {warehouseLabel(selectedRow)}
                            {selectedRow.kind === 'TRINS' && selectedRow.raw.order_folio && ` · Orden: ${selectedRow.raw.order_folio}`}
                        </p>
                        <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1.5rem' }}>
                            {loadingDetails ? (
                                <p style={{ textAlign: 'center' }}>Cargando...</p>
                            ) : transferItems.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Sin ítems.</p>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--bg-tertiary)' }}>
                                            <th style={{ textAlign: 'left', paddingBottom: '0.5rem' }}>Producto / Insumo</th>
                                            <th style={{ textAlign: 'center', paddingBottom: '0.5rem' }}>Cantidad</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {transferItems.map((it: any) => (
                                            <tr key={it.id} style={{ borderBottom: '1px dashed var(--bg-tertiary)' }}>
                                                <td style={{ padding: '0.5rem 0' }}>{it.item_type === 'product' ? it.product_name : it.ingredient_name}</td>
                                                <td style={{ padding: '0.5rem 0', textAlign: 'center' }}>{it.quantity} {it.ingredient_unit || ''}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                            <button
                                onClick={() => setSelectedRow(null)}
                                style={{ flex: 1, padding: '0.8rem 1.5rem', backgroundColor: 'transparent', border: '1px solid var(--border-light)', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Cerrar
                            </button>
                            {canCancelRow(selectedRow) && canCancelDocuments && (
                                <button
                                    onClick={handleCancelDocument}
                                    style={{ flex: 1, padding: '0.8rem 1.5rem', backgroundColor: 'var(--danger)', color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
                                >
                                    <XCircle size={18} /> {cancelButtonLabel(selectedRow)}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
