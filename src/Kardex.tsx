import { useState, useEffect } from "react";
import { getKardexSales, getSaleDetails } from "./db";
import { Receipt, Search, Eye, Printer } from "lucide-react";

interface KardexProps {
    isPrinterConfigured: boolean;
    printerPort?: string;
    onPreviewTicket: (ticket: string) => void;
}

export default function Kardex({ isPrinterConfigured, printerPort, onPreviewTicket }: KardexProps) {
    const [filteredSales, setFilteredSales] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [appSettings, setAppSettings] = useState<Record<string, string>>({});

    // Modal Details
    const [selectedSale, setSelectedSale] = useState<any>(null);
    const [saleItems, setSaleItems] = useState<any[]>([]);
    const [loadingDetails, setLoadingDetails] = useState(false);

    // Cargar configuraciones al montar para reimprimir el ticket con el mismo diseño
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
    }, []);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            try {
                const data = await getKardexSales(searchTerm);
                setFilteredSales(data);
            } catch (err) {
                console.error("Error al cargar historial:", err);
            } finally {
                setLoading(false);
            }
        };

        const delayDebounce = setTimeout(() => {
            loadData();
        }, 300);

        return () => clearTimeout(delayDebounce);
    }, [searchTerm]);

    const handleViewDetails = async (sale: any) => {
        setSelectedSale(sale);
        setLoadingDetails(true);
        try {
            const items = await getSaleDetails(sale.id);
            setSaleItems(items);
        } catch (err) {
            console.error("Error al cargar detalles de la venta:", err);
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleReprint = async () => {
        if (!selectedSale || saleItems.length === 0) return;

        const taxRate = parseFloat(appSettings.tax_rate || "16") / 100;
        const totalVal = Number(selectedSale.total) || 0;
        const subtotal = Math.round((totalVal / (1 + taxRate)) * 100) / 100;
        const tax = Math.round((totalVal - subtotal) * 100) / 100;

        const ticketText = `
${(appSettings.biz_logo || '🍦').padStart(16 + Math.floor((appSettings.biz_logo?.length || 1)/2))}
${appSettings.biz_name?.toUpperCase().padStart(16 + Math.floor(appSettings.biz_name?.length/2))}
${appSettings.biz_subtitle?.toUpperCase().padStart(16 + Math.floor(appSettings.biz_subtitle?.length/2))}
${appSettings.biz_address_1?.padStart(16 + Math.floor(appSettings.biz_address_1?.length/2))}
${appSettings.biz_address_2?.padStart(16 + Math.floor(appSettings.biz_address_2?.length/2))}
${appSettings.biz_rfc?.padStart(16 + Math.floor(appSettings.biz_rfc?.length/2))}
TEL: ${appSettings.biz_phone}

FOLIO VENTA: ${String(selectedSale.id).padStart(6, '0')} (COPIA)
CAJERO: ${selectedSale.cashier_name?.toUpperCase()}
FECHA: ${new Date(selectedSale.created_at).toLocaleString()}
--------------------------------
#  DESCRIPCION         TOTAL
--------------------------------
${saleItems.map(t => `${t.quantity} ${t.product_name.padEnd(18).substring(0, 18)} $${(t.price * t.quantity).toFixed(2).padStart(8)}`).join('\n')}

DESCUENTO:             $${(0).toFixed(2).padStart(8)}
SUBTOTAL:              $${subtotal.toFixed(2).padStart(8)}
IMPUESTOS:             $${tax.toFixed(2).padStart(8)}
TOTAL:                 $${totalVal.toFixed(2).padStart(8)}
PAGADO:                $${Number(selectedSale.cash_received || totalVal).toFixed(2).padStart(8)}
CAMBIO:                $${Number(selectedSale.cash_change || 0).toFixed(2).padStart(8)}

${appSettings.ticket_legal}

  ${appSettings.ticket_footer_msg}
SISTEMA: ${appSettings.ticket_website}
********************************
        `.trim();

        setSelectedSale(null);
        if (isPrinterConfigured) {
            const { invoke } = await import("@tauri-apps/api/core");
            await invoke("print_receipt", { portName: printerPort, receiptData: ticketText });
        } else {
            onPreviewTicket(ticketText);
        }
    };

    if (loading) return <div style={{ padding: '2rem' }}>Cargando historial de ventas...</div>;

    return (
        <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <Receipt size={28} /> Historial de Ventas (Kardex)
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-full)', padding: '0.5rem 1rem', border: '1px solid var(--border-light)', width: '300px' }}>
                    <Search size={18} color="var(--text-muted)" />
                    <input
                        type="text"
                        placeholder="Buscar ID, total o cajero..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{ border: 'none', background: 'transparent', outline: 'none', marginLeft: '0.5rem', width: '100%' }}
                    />
                </div>
            </div>

            <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ background: 'var(--bg-tertiary)', borderBottom: '1px solid var(--border-light)' }}>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>Ticket #</th>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>Fecha / Hora</th>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>Cajero</th>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>Método</th>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>Total</th>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)' }}>Estado</th>
                            <th style={{ padding: '1rem 1.5rem', color: 'var(--text-muted)', textAlign: 'right' }}>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredSales.map((sale) => (
                            <tr key={sale.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                <td style={{ padding: '1rem 1.5rem', fontWeight: 600 }}>#{sale.id}</td>
                                <td style={{ padding: '1rem 1.5rem' }}>{new Date(sale.created_at).toLocaleString()}</td>
                                <td style={{ padding: '1rem 1.5rem' }}>{sale.cashier_name || 'N/A'}</td>
                                <td style={{ padding: '1rem 1.5rem' }}>
                                    <span style={{ textTransform: 'uppercase', fontSize: '0.8rem', fontWeight: 700 }}>
                                        {sale.payment_method === 'card' ? '💳 Tarjeta' : '💵 Efectivo'}
                                    </span>
                                </td>
                                <td style={{ padding: '1rem 1.5rem', color: 'var(--accent-primary)', fontWeight: 600 }}>${Number(sale.total).toFixed(2)}</td>
                                <td style={{ padding: '1rem 1.5rem' }}>
                                    <span style={{
                                        backgroundColor: sale.status === 'pending_sync' ? 'var(--bg-tertiary)' : 'var(--success)',
                                        color: sale.status === 'pending_sync' ? 'var(--text-main)' : 'white',
                                        padding: '0.25rem 0.5rem', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600
                                    }}>
                                        {sale.status === 'pending_sync' ? 'Local' : 'Sincronizado'}
                                    </span>
                                </td>
                                <td style={{ padding: '1rem 1.5rem', textAlign: 'right' }}>
                                    <button
                                        onClick={() => handleViewDetails(sale)}
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                                        title="Ver Detalles"
                                    >
                                        <Eye size={20} />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {filteredSales.length === 0 && (
                            <tr>
                                <td colSpan={7} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    No se encontraron ventas para esta búsqueda.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal Detalle Venta */}
            {selectedSale && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div style={{
                        backgroundColor: 'var(--bg-secondary)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '450px',
                        boxShadow: 'var(--shadow-md)', maxHeight: '80vh', display: 'flex', flexDirection: 'column'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                            <h3 style={{ fontSize: '1.5rem', margin: 0 }}>Ticket #{selectedSale.id}</h3>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{new Date(selectedSale.created_at).toLocaleString()}</span>
                        </div>

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
                            <span style={{ color: 'var(--accent-primary)' }}>${Number(selectedSale.total).toFixed(2)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>
                            <span>Método: {selectedSale.payment_method === 'card' ? 'TARJETA' : 'EFECTIVO'}</span>
                            {selectedSale.payment_method === 'cash' && (
                                <span>Cambio: ${Number(selectedSale.cash_change).toFixed(2)}</span>
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                            <button
                                onClick={() => setSelectedSale(null)}
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
        </div>
    );
}
