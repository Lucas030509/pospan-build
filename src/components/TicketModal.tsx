import { X, Printer } from "lucide-react";
import Barcode from "react-barcode";

interface TicketModalProps {
    show: boolean;
    ticketData: string;
    logo?: string;
    onClose: () => void;
    isPrinterConfigured?: boolean;
    onPrint?: () => void;
}

export default function TicketModal({ show, ticketData, logo, onClose, isPrinterConfigured, onPrint }: TicketModalProps) {
    if (!show) return null;

    // Intentamos extraer el Ticket ID mediante regex para generar el código de barras
    // Buscar un patrón como: "Ticket: #34" o similar si se inyectó. Si no, usamos Date().getTime() 
    let ticketId = "1000"; // Fallback por defecto
    const match = ticketData.match(/(?:Ticket:|FOLIO VENTA:)\s*#?([0-9]+)/i);
    if (match && match[1]) {
        ticketId = match[1];
    } else {
        // En ventas normales (sin la palabra "Ticket: #" pero sabiendo que es cobro), generamos un código pseudo-unico
        // basado en la hora para que la pistola registre algo escaneable temporalmente en el simulador
        const unix = new Date().getTime().toString();
        ticketId = unix.substring(unix.length - 8);
    }

    return (
        <div style={{
            position: 'fixed',
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '2rem'
        }}>
            <div style={{
                backgroundColor: '#fff',
                borderRadius: '12px',
                maxWidth: '400px',
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
                overflow: 'hidden'
            }}>

                {/* Cabecera del Modal */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1rem',
                    backgroundColor: 'var(--bg-secondary)',
                    borderBottom: '1px solid var(--border-light)'
                }}>
                    <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <Printer size={20} /> Previsualización de Ticket
                    </h3>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: 'var(--text-muted)' }}
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Contenido (El papel térmico simulado) */}
                <div style={{
                    padding: '2rem',
                    backgroundColor: '#f8f9fa',
                    maxHeight: '60vh',
                    overflowY: 'auto',
                    display: 'flex',
                    justifyContent: 'center'
                }}>
                    <div style={{
                        backgroundColor: 'white',
                        padding: '2rem 1.5rem',
                        width: '300px', // Ancho típico de 80mm
                        flexShrink: 0, // Evitar colapso de tamaño en flexbox
                        fontFamily: '"Courier New", Courier, monospace',
                        fontSize: '0.85rem',
                        color: '#000',
                        lineHeight: '1.2',
                        whiteSpace: 'pre-wrap',
                        boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                        border: '1px solid #eee',
                        textAlign: 'left'
                    }}>
                        {logo && (
                            <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
                                <img src={logo} alt="Logo" style={{ maxWidth: '180px', maxHeight: '100px', objectFit: 'contain' }} />
                            </div>
                        )}
                        {ticketData}

                        <div style={{ 
                            marginTop: '2rem', 
                            display: 'flex', 
                            flexDirection: 'column',
                            alignItems: 'center',
                            opacity: 0.8
                        }}>
                            <Barcode
                                value={ticketId}
                                width={1.2}
                                height={40}
                                displayValue={true}
                                fontSize={10}
                                margin={0}
                            />
                        </div>
                    </div>
                </div>

                {/* Pie del Modal (Acciones) */}
                <div style={{
                    padding: '1rem',
                    backgroundColor: 'var(--bg-secondary)',
                    borderTop: '1px solid var(--border-light)',
                    display: 'flex',
                    justifyContent: 'flex-end',
                    gap: '1rem'
                }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--warning)', alignSelf: 'center', flex: 1 }}>
                        {isPrinterConfigured
                            ? "Impresora configurada: puedes imprimir manualmente desde aquí."
                            : "*Modo simulador activo (Sin hardware detectado)"}
                    </span>
                    {isPrinterConfigured && onPrint && (
                        <button
                            onClick={onPrint}
                            style={{
                                padding: '0.8rem 1.5rem',
                                backgroundColor: 'var(--accent-primary)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                            }}
                        >
                            <Printer size={18} /> Imprimir
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        style={{
                            padding: '0.8rem 1.5rem',
                            backgroundColor: 'var(--text-main)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontWeight: 600
                        }}
                    >
                        Continuar Operando
                    </button>
                </div>
            </div>
        </div>
    );
}
