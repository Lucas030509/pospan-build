import { useState, useEffect } from "react";
import { openShift, getShiftSales, getSettings, getUserCashboxes } from "./db";
import { invoke } from "@tauri-apps/api/core";
import { notify } from "./lib/dialogs";
import { PlayCircle, CheckSquare, Printer, Clock, Search, Eye, AlertTriangle } from "lucide-react";
import { buildCorteTicketText, getTicketWidth, withPrinterStyle } from "./lib/ticketFormat";

interface CortesProps {
    shift: any;
    onShiftChange: () => void;
    isPrinterConfigured: boolean;
    printerPort?: string;
    onPreviewTicket: (ticket: string) => void;
    currentUser: any;
}

const DENOMINATIONS = [
    { label: 'Billetes', items: [1000, 500, 200, 100, 50, 20] },
    { label: 'Monedas', items: [20, 10, 5, 2, 1, 0.5] }
];

export default function Cortes({ shift, onShiftChange, isPrinterConfigured, printerPort, onPreviewTicket, currentUser }: CortesProps) {
    const [subTab, setSubTab] = useState<'current' | 'history'>('current');
    const [sales, setSales] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [counts, setCounts] = useState<Record<number, number>>({});
    const [appSettings, setAppSettings] = useState<Record<string, string>>({});
    const [myCashboxes, setMyCashboxes] = useState<any[]>([]);
    const [cashboxesLoaded, setCashboxesLoaded] = useState(false);
    const [selectedCashboxId, setSelectedCashboxId] = useState<number | null>(null);

    useEffect(() => {
        getSettings().then(setAppSettings).catch(err => console.error("Error al cargar configuraciones:", err));
    }, []);

    useEffect(() => {
        if (!currentUser?.id) return;
        getUserCashboxes(currentUser.id)
            .then(cbs => {
                setMyCashboxes(cbs);
                setSelectedCashboxId(cbs.length > 0 ? cbs[0].id : null);
            })
            .catch(err => console.error("Error al cargar cajas asignadas:", err))
            .finally(() => setCashboxesLoaded(true));
    }, [currentUser?.id]);

    // Historial
    const [historyStart, setHistoryStart] = useState<string>(getTodayDateString());
    const [historyEnd, setHistoryEnd] = useState<string>(getTodayDateString());
    const [historyShifts, setHistoryShifts] = useState<any[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);

    function getTodayDateString() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    const totalFromDenominationsRaw = Object.entries(counts).reduce((acc, [val, qty]) => {
        return acc + (parseFloat(val) * qty);
    }, 0);
    const totalFromDenominations = Math.round(totalFromDenominationsRaw * 100) / 100;

    const handleCountChange = (val: number, qty: string) => {
        const nQty = parseInt(qty) || 0;
        setCounts(prev => ({ ...prev, [val]: nQty }));
    };

    useEffect(() => {
        async function fetchSales() {
            if (shift) {
                const s = await getShiftSales(shift.id);
                setSales(s);
            }
            setLoading(false);
        }
        fetchSales();
    }, [shift]);

    // Limpiar el conteo físico declarado cada vez que cambia el turno activo
    // (evita arrastrar el desglose de billetes/monedas del corte anterior)
    useEffect(() => {
        setCounts({});
    }, [shift?.id]);

    // Cálculos del corte
    const totalSalesValRaw = sales.reduce((acc, sale) => acc + sale.total, 0);
    const totalSalesVal = Math.round(totalSalesValRaw * 100) / 100;
    const totalSalesStr = totalSalesVal.toFixed(2);
    
    const expectedTotalValRaw = shift ? (shift.initial_amount + totalSalesVal) : 0;
    const expectedTotalVal = Math.round(expectedTotalValRaw * 100) / 100;
    const expectedTotalStr = expectedTotalVal.toFixed(2);

    const handleCloseShift = async () => {
        if (!shift) return;

        // 1. Parte crítica: cerrar el turno en la base de datos. Si esto falla, el corte
        // de verdad no se hizo y hay que avisarlo como tal.
        try {
            const { closeShift } = await import("./db");
            await closeShift(shift.id, expectedTotalVal, totalFromDenominations, currentUser?.id);
        } catch (e) {
            await notify("Error cerrando el turno.", 'error');
            console.error(e);
            return;
        }

        setCounts({});
        onShiftChange();

        try {
            const { backupNow } = await import("./lib/backup");
            await backupNow();
        } catch (e) {
            console.error("Error en respaldo automático post-corte:", e);
        }

        // 2. Parte no crítica: imprimir y abrir cajón. El turno ya quedó cerrado arriba;
        // un fallo aquí no debe leerse como que el corte no se realizó.
        try {
            const width = getTicketWidth(appSettings);
            const breakdownText = Object.entries(counts)
                .filter(([_, qty]) => qty > 0)
                .sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]))
                .map(([val, qty]) => `${qty.toString().padStart(3)} x $${parseFloat(val).toFixed(2).padEnd(7)} = $${(parseFloat(val) * qty).toFixed(2).padStart(8)}`)
                .join('\n');

            const ticketFormat = buildCorteTicketText({
                width,
                shiftId: shift.id,
                cashierName: currentUser?.name || "Desconocido",
                dateStr: new Date().toLocaleString(),
                breakdownText,
                initialAmount: shift.initial_amount,
                totalSales: totalSalesVal,
                expectedAmount: expectedTotalVal,
                actualAmount: totalFromDenominations,
                difference: Math.round((totalFromDenominations - expectedTotalVal) * 100) / 100,
            });

            if (isPrinterConfigured) {
                // El cajón se abre como parte de la misma impresión (ver print_receipt en Rust).
                await invoke("print_receipt", { portName: printerPort, receiptData: withPrinterStyle(ticketFormat, appSettings), openDrawer: true });
            } else {
                await invoke("open_cash_drawer", { portName: printerPort });
                onPreviewTicket(ticketFormat);
            }
        } catch (e) {
            await notify("El corte de caja ya quedó registrado, pero no se pudo imprimir/abrir el cajón: " + e, 'warning');
            console.error(e);
        }
    };

    const loadHistory = async () => {
        setHistoryLoading(true);
        try {
            const { getShiftsReport } = await import("./db");
            const res = await getShiftsReport(historyStart, historyEnd);
            setHistoryShifts(res);
        } catch (e) {
            console.error(e);
            await notify("Error al cargar historial de cortes", 'error');
        } finally {
            setHistoryLoading(false);
        }
    };

    const buildPastCorteTicket = (sh: any) => buildCorteTicketText({
        width: getTicketWidth(appSettings),
        shiftId: sh.id,
        cashierName: sh.cashier_name,
        openedAtStr: sh.start_time ? new Date(sh.start_time).toLocaleString() : 'N/A',
        closedAtStr: sh.end_time ? new Date(sh.end_time).toLocaleString() : 'En curso',
        initialAmount: sh.initial_amount,
        expectedAmount: sh.expected_amount || 0,
        actualAmount: sh.actual_amount || 0,
        difference: sh.difference || 0,
    });

    const handleViewPastCorte = (sh: any) => {
        onPreviewTicket(buildPastCorteTicket(sh));
    };

    const handlePrintPastCorte = async (sh: any) => {
        if (!isPrinterConfigured) {
            await notify("No hay una impresora configurada. Ve a Configuración > Impresora para asignar un puerto.", 'warning');
            return;
        }
        try {
            await invoke("print_receipt", { portName: printerPort, receiptData: withPrinterStyle(buildPastCorteTicket(sh), appSettings) });
        } catch (e) {
            await notify("Error al imprimir el ticket.", 'error');
            console.error(e);
        }
    };

    if (loading) {
        return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Cargando datos financieros del turno...</div>;
    }

    return (
        <div style={{ padding: '1.5rem', maxWidth: '1000px', margin: '0 auto', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            
            {/* Sub-Tab Navigation Bar */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-light)', paddingBottom: '1rem', marginBottom: '2rem' }}>
                <button
                    onClick={() => setSubTab('current')}
                    style={{
                        padding: '0.6rem 1.5rem', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer',
                        backgroundColor: subTab === 'current' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                        color: subTab === 'current' ? 'white' : 'var(--text-main)',
                        transition: 'all 0.2s', boxShadow: 'var(--shadow-sm)'
                    }}
                >
                    💵 Turno Activo
                </button>
                <button
                    onClick={() => { setSubTab('history'); loadHistory(); }}
                    style={{
                        padding: '0.6rem 1.5rem', borderRadius: '8px', border: 'none', fontWeight: 700, cursor: 'pointer',
                        backgroundColor: subTab === 'history' ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                        color: subTab === 'history' ? 'white' : 'var(--text-main)',
                        transition: 'all 0.2s', boxShadow: 'var(--shadow-sm)'
                    }}
                >
                    📅 Consultar Historial de Cortes
                </button>
            </div>

            {subTab === 'current' ? (
                <>
                    {!shift ? (
                        !cashboxesLoaded ? (
                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando cajas asignadas...</div>
                        ) : myCashboxes.length === 0 ? (
                            <div style={{ padding: '3rem', maxWidth: '500px', margin: '0 auto', textAlign: 'center' }}>
                                <AlertTriangle size={48} color="var(--danger)" style={{ marginBottom: '1rem' }} />
                                <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>No tienes cajas asignadas</h2>
                                <p style={{ color: 'var(--text-muted)', fontSize: '1.05rem' }}>
                                    Pide a un administrador que te asigne al menos una caja en Configuración &gt; Ventas antes de poder abrir turno y vender.
                                </p>
                            </div>
                        ) : (
                        <div style={{ padding: '3rem', maxWidth: '600px', margin: '0 auto', textAlign: 'center' }}>
                            <h2 style={{ fontSize: '2rem', marginBottom: '1rem' }}>Turno Cerrado</h2>
                            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '1.2rem' }}>
                                Actualmente no hay una caja/turno abierto. Ingresa el fondo con el que inicia el cajón.
                            </p>

                            {myCashboxes.length > 1 && (
                                <div style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 600 }}>Caja a abrir</label>
                                    <select
                                        value={selectedCashboxId ?? ''}
                                        onChange={e => setSelectedCashboxId(Number(e.target.value))}
                                        style={{ padding: '0.7rem', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '1rem' }}
                                    >
                                        {myCashboxes.map(cb => <option key={cb.id} value={cb.id}>{cb.name}</option>)}
                                    </select>
                                </div>
                            )}

                            <div className="search-bar" style={{ width: '100%', maxWidth: '300px', margin: '0 auto 2rem auto', border: '2px solid var(--border-light)' }}>
                                <span style={{ fontSize: '1.5rem', color: 'var(--text-muted)', fontWeight: 'bold' }}>$</span>
                                <input
                                    type="number"
                                    placeholder="0.00"
                                    id="initial-amount-input"
                                    style={{ fontSize: '1.5rem', fontWeight: 'bold', height: '40px' }}
                                />
                            </div>

                            <button
                                onClick={async () => {
                                    if (!selectedCashboxId) return;
                                    const input = document.getElementById('initial-amount-input') as HTMLInputElement;
                                    const inicial = parseFloat(input?.value) || 0;
                                    try {
                                        await openShift(inicial, currentUser?.id, selectedCashboxId);
                                        onShiftChange();
                                    } catch (e: any) {
                                        await notify("No se pudo abrir la caja: " + (e.message || e), 'error');
                                        console.error(e);
                                    }
                                }}
                                className="pay-btn" style={{ justifyContent: 'center', gap: '1rem' }}
                            >
                                <PlayCircle size={24} />
                                Abrir Caja y Comenzar Venta
                            </button>
                        </div>
                        )
                    ) : (
                        <div>
                            <h2 style={{ fontSize: '1.8rem', borderBottom: '2px solid var(--border-light)', paddingBottom: '1rem', marginBottom: '2rem' }}>
                                Arqueo de Caja (Turno #{shift.id})
                            </h2>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '2rem' }}>
                                {/* Panel Resumen (Izquierdo) */}
                                <div style={{ background: 'var(--bg-secondary)', padding: '2rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-light)' }}>
                                    <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
                                        <Clock size={20} /> Resumen de Operación
                                    </h3>

                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', fontSize: '1.1rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Fondo Inicial:</span>
                                            <b>${shift.initial_amount.toFixed(2)}</b>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Total Tickets (Ventas):</span>
                                            <b>{sales.length}</b>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: 'var(--text-muted)' }}>Total Ingresos (Suma):</span>
                                            <b style={{ color: 'var(--success)' }}>${totalSalesStr}</b>
                                        </div>
                                    </div>

                                    <hr style={{ margin: '1.5rem 0', borderColor: 'var(--border-light)', borderStyle: 'dashed' }} />

                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.3rem', fontWeight: 700 }}>
                                        <span>Monto Esperado en Cajón:</span>
                                        <span>${expectedTotalStr}</span>
                                    </div>
                                </div>

                                {/* Panel Cierre Dinero (Derecho) */}
                                <div style={{ background: 'var(--bg-secondary)', padding: '2rem', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column' }}>
                                    <h3 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-main)' }}>
                                        <CheckSquare size={20} /> Declaración Física (Corte Z)
                                    </h3>

                                    <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                                        Cuenta billetes/monedas físicos en la gaveta:
                                    </p>

                                    <div style={{ flex: 1, overflowY: 'auto', marginBottom: '1.5rem', maxHeight: '350px' }}>
                                        {DENOMINATIONS.map(group => (
                                            <div key={group.label} style={{ marginBottom: '1.5rem' }}>
                                                <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--accent-primary)', marginBottom: '0.75rem', borderBottom: '1px solid var(--border-light)' }}>
                                                    {group.label}
                                                </h4>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                                    {group.items.map(val => (
                                                        <div key={val} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--bg-primary)', padding: '0.5rem', borderRadius: '8px' }}>
                                                            <span style={{ width: '40px', fontWeight: 700, fontSize: '0.9rem' }}>${val}</span>
                                                            <input 
                                                                type="number" 
                                                                min="0"
                                                                placeholder="0"
                                                                value={counts[val] || ""}
                                                                onChange={(e) => handleCountChange(val, e.target.value)}
                                                                style={{ width: '100%', border: '1px solid var(--border-light)', borderRadius: '4px', padding: '0.25rem', textAlign: 'right', fontWeight: 600 }}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ backgroundColor: 'var(--bg-primary)', padding: '1rem', borderRadius: '12px', border: '2px solid var(--border-light)', marginBottom: '1.5rem' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 600 }}>Total Físico Calculado:</span>
                                            <span style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--accent-primary)' }}>
                                                ${totalFromDenominations.toFixed(2)}
                                            </span>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleCloseShift}
                                        className="pay-btn"
                                        style={{ width: '100%', display: 'flex', justifyContent: 'center', gap: '1rem', backgroundColor: totalFromDenominations <= 0 ? 'var(--text-muted)' : 'var(--danger)' }}
                                        disabled={totalFromDenominations <= 0}
                                    >
                                        <Printer size={24} />
                                        Realizar Corte e Imprimir
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            ) : (
                // Historial de Cortes View
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div style={{
                        display: 'flex',
                        gap: '1.5rem',
                        alignItems: 'flex-end',
                        backgroundColor: 'var(--bg-secondary)',
                        padding: '1.5rem',
                        borderRadius: '16px',
                        border: '1px solid var(--border-light)'
                    }}>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>Desde</label>
                            <input
                                type="date"
                                value={historyStart}
                                onChange={(e) => setHistoryStart(e.target.value)}
                                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-light)', boxSizing: 'border-box' }}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '0.5rem', fontWeight: 600 }}>Hasta</label>
                            <input
                                type="date"
                                value={historyEnd}
                                onChange={(e) => setHistoryEnd(e.target.value)}
                                style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-light)', boxSizing: 'border-box' }}
                            />
                        </div>
                        <button
                            onClick={loadHistory}
                            disabled={historyLoading}
                            style={{
                                padding: '0.75rem 1.5rem',
                                backgroundColor: 'var(--accent-primary)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '8px',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                boxShadow: 'var(--shadow-sm)'
                            }}
                        >
                            <Search size={18} /> {historyLoading ? "Cargando..." : "Buscar Cortes"}
                        </button>
                    </div>

                    <div style={{
                        backgroundColor: 'var(--bg-secondary)',
                        borderRadius: '16px',
                        border: '1px solid var(--border-light)',
                        overflow: 'hidden'
                    }}>
                        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-light)' }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Cortes Realizados</h3>
                            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {historyShifts.length} turnos encontrados en el rango seleccionado
                            </p>
                        </div>

                        <div style={{ overflowX: 'auto', padding: '1.5rem' }}>
                            {historyShifts.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
                                    <Clock size={48} style={{ opacity: 0.2, marginBottom: '1rem' }} />
                                    <h3>No se encontraron cortes de caja</h3>
                                    <p style={{ fontSize: '0.85rem' }}>Ajusta el rango de fechas e intenta de nuevo.</p>
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid var(--border-light)', color: 'var(--text-muted)', fontWeight: 600 }}>
                                            <th style={{ padding: '0.75rem 1rem' }}>ID Turno</th>
                                            <th style={{ padding: '0.75rem 1rem' }}>Cajero</th>
                                            <th style={{ padding: '0.75rem 1rem' }}>Fondo Inicial</th>
                                            <th style={{ padding: '0.75rem 1rem' }}>Monto Esperado</th>
                                            <th style={{ padding: '0.75rem 1rem' }}>Monto Contado</th>
                                            <th style={{ padding: '0.75rem 1rem' }}>Diferencia</th>
                                            <th style={{ padding: '0.75rem 1rem' }}>Cierre</th>
                                            <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {historyShifts.map((sh, idx) => {
                                            const diff = sh.difference || 0;
                                            return (
                                                <tr key={sh.id} style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: idx % 2 === 0 ? 'rgba(0,0,0,0.01)' : 'transparent' }}>
                                                    <td style={{ padding: '0.75rem 1rem', fontWeight: 'bold' }}>#{sh.id}</td>
                                                    <td style={{ padding: '0.75rem 1rem' }}>{sh.cashier_name}</td>
                                                    <td style={{ padding: '0.75rem 1rem' }}>${sh.initial_amount.toFixed(2)}</td>
                                                    <td style={{ padding: '0.75rem 1rem' }}>${sh.expected_amount ? sh.expected_amount.toFixed(2) : '0.00'}</td>
                                                    <td style={{ padding: '0.75rem 1rem', color: 'var(--success)', fontWeight: 600 }}>${sh.actual_amount ? sh.actual_amount.toFixed(2) : '0.00'}</td>
                                                    <td style={{ padding: '0.75rem 1rem', color: diff < 0 ? 'var(--accent-primary)' : diff > 0 ? 'var(--success)' : 'var(--text-main)', fontWeight: 600 }}>
                                                        {diff < 0 ? '-' : diff > 0 ? '+' : ''}${Math.abs(diff).toFixed(2)}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                        {sh.end_time ? new Date(sh.end_time).toLocaleString() : 'Abierto (Activo)'}
                                                    </td>
                                                    <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                                                        <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                                                            <button
                                                                onClick={() => handleViewPastCorte(sh)}
                                                                title="Ver Ticket de Arqueo"
                                                                style={{
                                                                    padding: '0.4rem 0.8rem',
                                                                    borderRadius: '6px',
                                                                    border: '1px solid var(--border-light)',
                                                                    backgroundColor: 'white',
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    fontSize: '0.8rem',
                                                                    fontWeight: 600,
                                                                    color: 'var(--text-main)'
                                                                }}
                                                            >
                                                                <Eye size={12} /> Ver
                                                            </button>
                                                            <button
                                                                onClick={() => handlePrintPastCorte(sh)}
                                                                title="Imprimir Ticket de Arqueo"
                                                                style={{
                                                                    padding: '0.4rem 0.8rem',
                                                                    borderRadius: '6px',
                                                                    border: '1px solid var(--border-light)',
                                                                    backgroundColor: 'var(--accent-primary)',
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px',
                                                                    fontSize: '0.8rem',
                                                                    fontWeight: 600,
                                                                    color: 'white'
                                                                }}
                                                            >
                                                                <Printer size={12} /> Imprimir
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
