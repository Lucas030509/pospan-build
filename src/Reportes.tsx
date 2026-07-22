import { useState } from "react";
import * as XLSX from "xlsx";
import { 
    getSalesReportByPaymentMethod, 
    getSalesReportByCashier, 
    getSalesReportByProduct, 
    getInventoryValuation, 
    getShiftsReport 
} from "./db";
import {
    FileText, ArrowDownToLine, RefreshCw, BarChart2
} from "lucide-react";
import { notify } from "./lib/dialogs";

type ReportType = 'payment' | 'cashier' | 'product' | 'inventory' | 'shifts';

export default function Reportes() {
    const [reportType, setReportType] = useState<ReportType>('payment');
    const [datePreset, setDatePreset] = useState<string>('today');
    const [startDate, setStartDate] = useState<string>(getTodayDateString());
    const [endDate, setEndDate] = useState<string>(getTodayDateString());
    const [reportData, setReportData] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    function getTodayDateString() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    const handlePresetChange = (preset: string) => {
        setDatePreset(preset);
        const today = new Date();
        if (preset === 'today') {
            setStartDate(getTodayDateString());
            setEndDate(getTodayDateString());
        } else if (preset === 'yesterday') {
            const yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);
            const yStr = formatDate(yesterday);
            setStartDate(yStr);
            setEndDate(yStr);
        } else if (preset === 'week') {
            const lastWeek = new Date();
            lastWeek.setDate(today.getDate() - 7);
            setStartDate(formatDate(lastWeek));
            setEndDate(getTodayDateString());
        } else if (preset === 'month') {
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            setStartDate(formatDate(firstDay));
            setEndDate(getTodayDateString());
        }
    };

    const formatDate = (d: Date) => {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const generateReport = async () => {
        setLoading(true);
        setSearched(true);
        try {
            let data: any[] = [];
            if (reportType === 'payment') {
                data = await getSalesReportByPaymentMethod(startDate, endDate);
            } else if (reportType === 'cashier') {
                data = await getSalesReportByCashier(startDate, endDate);
            } else if (reportType === 'product') {
                data = await getSalesReportByProduct(startDate, endDate);
            } else if (reportType === 'inventory') {
                data = await getInventoryValuation();
            } else if (reportType === 'shifts') {
                data = await getShiftsReport(startDate, endDate);
            }
            setReportData(data);
        } catch (e) {
            console.error(e);
            await notify("Error al generar reporte", 'error');
        } finally {
            setLoading(false);
        }
    };

    const handleExport = () => {
        if (reportData.length === 0) return;
        const worksheet = XLSX.utils.json_to_sheet(reportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Reporte");
        XLSX.writeFile(workbook, `reporte_${reportType}_${startDate}_a_${endDate}.xlsx`);
    };

    const reportOptions = [
        { id: 'payment', label: '💳 Métodos de Pago', desc: 'Ventas en tarjeta vs efectivo' },
        { id: 'cashier', label: '🧑‍💼 Ventas por Cajero', desc: 'Monto y tickets vendidos por empleado' },
        { id: 'product', label: '🍞 Productos y Utilidad', desc: 'Productos vendidos, costo, venta y utilidad' },
        { id: 'inventory', label: '📦 Valuación de Inventario', desc: 'Existencias físicas y valor comercial (suma de todos los almacenes)' },
        { id: 'shifts', label: '🔑 Historial de Cortes', desc: 'Arqueos, fondos iniciales y diferencias de caja' }
    ];

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box' }}>
            <header style={{ marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '2rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <BarChart2 size={32} color="var(--accent-primary)" /> Centro de Reportes
                </h2>
                <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Genera y descarga hojas de cálculo analíticas sobre las finanzas de tu negocio.</p>
            </header>

            <div style={{ display: 'flex', gap: '2rem', flex: 1, minHeight: 0 }}>
                {/* Panel de Configuración (Izquierda) */}
                <div style={{
                    width: '320px',
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: '20px',
                    padding: '1.5rem',
                    border: '1px solid var(--border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '1.5rem',
                    flexShrink: 0
                }}>
                    <div>
                        <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>1. Selecciona Reporte</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {reportOptions.map(opt => (
                                <button
                                    key={opt.id}
                                    onClick={() => { setReportType(opt.id as ReportType); setReportData([]); setSearched(false); }}
                                    style={{
                                        textAlign: 'left',
                                        padding: '1rem',
                                        border: reportType === opt.id ? '2px solid var(--accent-primary)' : '1px solid var(--border-light)',
                                        borderRadius: '12px',
                                        backgroundColor: reportType === opt.id ? 'rgba(109, 83, 58, 0.05)' : 'white',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <div style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>{opt.label}</div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{opt.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {reportType !== 'inventory' && (
                        <div>
                            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>2. Rango de Fechas</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem', marginBottom: '1rem' }}>
                                {[
                                    { id: 'today', label: 'Hoy' },
                                    { id: 'yesterday', label: 'Ayer' },
                                    { id: 'week', label: '7 días' },
                                    { id: 'month', label: 'Mes' }
                                ].map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => handlePresetChange(p.id)}
                                        style={{
                                            padding: '0.5rem',
                                            borderRadius: '8px',
                                            border: datePreset === p.id ? '1px solid var(--accent-primary)' : '1px solid var(--border-light)',
                                            backgroundColor: datePreset === p.id ? 'rgba(109, 83, 58, 0.05)' : 'white',
                                            fontWeight: 600,
                                            fontSize: '0.85rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Desde</label>
                                    <input
                                        type="date"
                                        value={startDate}
                                        onChange={(e) => { setStartDate(e.target.value); setDatePreset('custom'); }}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-light)', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Hasta</label>
                                    <input
                                        type="date"
                                        value={endDate}
                                        onChange={(e) => { setEndDate(e.target.value); setDatePreset('custom'); }}
                                        style={{ width: '100%', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border-light)', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    <button
                        onClick={generateReport}
                        disabled={loading}
                        style={{
                            width: '100%',
                            padding: '1rem',
                            backgroundColor: 'var(--accent-primary)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            fontWeight: 700,
                            fontSize: '1rem',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '0.5rem',
                            marginTop: 'auto',
                            boxShadow: '0 8px 16px rgba(109, 83, 58, 0.15)'
                        }}
                    >
                        <RefreshCw size={18} className={loading ? "spin" : ""} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        {loading ? "Generando..." : "Generar Reporte"}
                    </button>
                </div>

                {/* Vista Previa del Reporte (Derecha) */}
                <div style={{
                    flex: 1,
                    backgroundColor: 'var(--bg-secondary)',
                    borderRadius: '20px',
                    border: '1px solid var(--border-light)',
                    display: 'flex',
                    flexDirection: 'column',
                    minWidth: 0,
                    overflow: 'hidden'
                }}>
                    <header style={{
                        padding: '1.25rem 1.5rem',
                        borderBottom: '1px solid var(--border-light)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        backgroundColor: 'var(--bg-primary)'
                    }}>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Vista Previa de Datos</h3>
                            <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                {reportData.length} registros encontrados {reportType !== 'inventory' && `del ${startDate} al ${endDate}`}
                            </p>
                        </div>
                        {reportData.length > 0 && (
                            <button
                                onClick={handleExport}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.6rem 1.2rem',
                                    backgroundColor: 'var(--success)',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    fontWeight: 700,
                                    fontSize: '0.9rem'
                                }}
                            >
                                <ArrowDownToLine size={16} /> Exportar Excel (.xlsx)
                            </button>
                        )}
                    </header>

                    <div style={{ flex: 1, overflow: 'auto', padding: '1.5rem' }}>
                        {reportData.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center' }}>
                                <FileText size={64} style={{ opacity: 0.15, marginBottom: '1rem' }} />
                                <h3>{!searched ? "Configura los filtros y genera el reporte" : "No se encontraron resultados"}</h3>
                                <p style={{ fontSize: '0.9rem', maxWidth: '300px', margin: '0.25rem 0 0 0' }}>
                                    {!searched ? "Selecciona el reporte y rango de fechas a auditar." : "Prueba con un rango de fechas diferente."}
                                </p>
                            </div>
                                        ) : (
                            <>
                                {/* Dynamic Totals Bar */}
                                <div style={{
                                    display: 'flex',
                                    flexWrap: 'wrap',
                                    gap: '1.5rem',
                                    marginBottom: '1.5rem',
                                    backgroundColor: 'var(--bg-primary)',
                                    padding: '1.25rem',
                                    borderRadius: '12px',
                                    border: '1px solid var(--border-light)',
                                    boxShadow: 'var(--shadow-sm)'
                                }}>
                                    {reportType === 'inventory' && (
                                        <>
                                            <div style={{ flex: '1 1 180px' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Existencias Totales</div>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-main)' }}>
                                                    {reportData.reduce((acc, r) => acc + (r.stock || 0), 0).toLocaleString()} pzas
                                                </div>
                                            </div>
                                            <div style={{ width: '1px', backgroundColor: 'var(--border-light)', alignSelf: 'stretch' }}></div>
                                            <div style={{ flex: '1 1 180px' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Importe Valuación (Costo)</div>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--accent-primary)' }}>
                                                    ${reportData.reduce((acc, r) => acc + (r.valuation || 0), 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                            <div style={{ width: '1px', backgroundColor: 'var(--border-light)', alignSelf: 'stretch' }}></div>
                                            <div style={{ flex: '1 1 180px' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Valor Comercial (Venta)</div>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--success)' }}>
                                                    ${reportData.reduce((acc, r) => acc + ((r.stock || 0) * (r.price || 0)), 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {reportType === 'payment' && (
                                        <>
                                            <div style={{ flex: '1 1 180px' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Ventas Totales</div>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--success)' }}>
                                                    ${reportData.reduce((acc, r) => acc + (r.total || 0), 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                            <div style={{ width: '1px', backgroundColor: 'var(--border-light)', alignSelf: 'stretch' }}></div>
                                            <div style={{ flex: '1 1 180px' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Cantidad de Ventas</div>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-main)' }}>
                                                    {reportData.reduce((acc, r) => acc + (r.count || 0), 0)} transacciones
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {reportType === 'cashier' && (
                                        <>
                                            <div style={{ flex: '1 1 180px' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Ventas Totales</div>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--success)' }}>
                                                    ${reportData.reduce((acc, r) => acc + (r.total || 0), 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                            <div style={{ width: '1px', backgroundColor: 'var(--border-light)', alignSelf: 'stretch' }}></div>
                                            <div style={{ flex: '1 1 180px' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Tickets Emitidos</div>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-main)' }}>
                                                    {reportData.reduce((acc, r) => acc + (r.count || 0), 0)}
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {reportType === 'product' && (
                                        <>
                                            <div style={{ flex: '1 1 180px' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Ingresos Totales (Venta)</div>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-main)' }}>
                                                    ${reportData.reduce((acc, r) => acc + (r.revenue || 0), 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                            <div style={{ width: '1px', backgroundColor: 'var(--border-light)', alignSelf: 'stretch' }}></div>
                                            <div style={{ flex: '1 1 180px' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Utilidad Estimada</div>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--success)' }}>
                                                    ${reportData.reduce((acc, r) => acc + (r.profit || 0), 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                            <div style={{ width: '1px', backgroundColor: 'var(--border-light)', alignSelf: 'stretch' }}></div>
                                            <div style={{ flex: '1 1 180px' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Piezas Vendidas</div>
                                                <div style={{ fontSize: '1.4rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--accent-primary)' }}>
                                                    {reportData.reduce((acc, r) => acc + (r.qty || 0), 0).toLocaleString()}
                                                </div>
                                            </div>
                                        </>
                                    )}

                                    {reportType === 'shifts' && (
                                        <>
                                            <div style={{ flex: '1 1 150px' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Fondos Iniciales</div>
                                                <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-main)' }}>
                                                    ${reportData.reduce((acc, r) => acc + (r.initial_amount || 0), 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                            <div style={{ width: '1px', backgroundColor: 'var(--border-light)', alignSelf: 'stretch' }}></div>
                                            <div style={{ flex: '1 1 150px' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Cierre Esperado</div>
                                                <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--text-muted)' }}>
                                                    ${reportData.reduce((acc, r) => acc + (r.expected_amount || 0), 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                            <div style={{ width: '1px', backgroundColor: 'var(--border-light)', alignSelf: 'stretch' }}></div>
                                            <div style={{ flex: '1 1 150px' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Cierre Real</div>
                                                <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '0.25rem', color: 'var(--success)' }}>
                                                    ${reportData.reduce((acc, r) => acc + (r.actual_amount || 0), 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                            <div style={{ width: '1px', backgroundColor: 'var(--border-light)', alignSelf: 'stretch' }}></div>
                                            <div style={{ flex: '1 1 150px' }}>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Diferencia Total</div>
                                                {(() => {
                                                    const diff = reportData.reduce((acc, r) => acc + (r.difference || 0), 0);
                                                    return (
                                                        <div style={{ fontSize: '1.25rem', fontWeight: 800, marginTop: '0.25rem', color: diff < 0 ? 'var(--accent-primary)' : diff > 0 ? 'var(--success)' : 'var(--text-main)' }}>
                                                            {diff < 0 ? '-' : diff > 0 ? '+' : ''}${Math.abs(diff).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        </>
                                    )}
                                </div>

                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem', textAlign: 'left' }}>
                                <thead>
                                    <tr style={{ borderBottom: '2px solid var(--border-light)', color: 'var(--text-muted)', fontWeight: 600 }}>
                                        {Object.keys(reportData[0]).map(key => (
                                            <th key={key} style={{ padding: '0.75rem 1rem', textTransform: 'capitalize' }}>
                                                {key.replace('_', ' ')}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {reportData.map((row, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid var(--border-light)', backgroundColor: idx % 2 === 0 ? 'rgba(0,0,0,0.01)' : 'transparent' }}>
                                            {Object.entries(row).map(([key, val]: any, cellIdx) => (
                                                <td key={cellIdx} style={{ padding: '0.75rem 1rem', color: 'var(--text-main)' }}>
                                                    {formatCellValue(key, val)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function formatCellValue(key: string, val: any): string {
    if (val === null || val === undefined) return "-";
    if (typeof val === 'number') {
        if (key.includes('total') || key.includes('revenue') || key.includes('profit') || key.includes('valuation') || key.includes('cost') || key.includes('price') || key.includes('initial') || key.includes('expected') || key.includes('actual') || key.includes('difference')) {
            return `$${val.toFixed(2)}`;
        }
        return val.toString();
    }
    if (key === 'payment_method') {
        return val === 'cash' ? '💵 Efectivo' : '💳 Tarjeta';
    }
    return val.toString();
}
