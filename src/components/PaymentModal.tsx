import { useState, useEffect } from "react";
import { X, Banknote, CreditCard, Delete, CheckCircle2, ChevronRight } from "lucide-react";
import { emit } from "@tauri-apps/api/event";

interface PaymentModalProps {
    show: boolean;
    total: number;
    onClose: () => void;
    onConfirm: (paymentData: { 
        method: 'cash' | 'card', 
        received: number, 
        change: number 
    }) => void;
}

export default function PaymentModal({ show, total, onClose, onConfirm }: PaymentModalProps) {
    const [method, setMethod] = useState<'cash' | 'card'>('cash');
    const [receivedStr, setReceivedStr] = useState("");
    // Evita disparar onConfirm dos veces (doble Enter por auto-repeat del teclado,
    // doble tap en pantalla táctil) antes de que el modal se cierre y desmonte.
    const [submitting, setSubmitting] = useState(false);
    const received = parseFloat(receivedStr) || 0;
    const change = Math.max(0, received - total);
    const isEnough = method === 'card' || received >= total;

    // Resetear al abrir
    useEffect(() => {
        if (show) {
            setMethod('cash');
            setReceivedStr("");
            setSubmitting(false);
            emit("payment-sync", { isOpen: true, total, method: 'cash', received: 0, change: 0 });
        } else {
            emit("payment-sync", { isOpen: false });
        }
    }, [show, total]);

    // Sincronizar en tiempo real
    useEffect(() => {
        if (show) {
            emit("payment-sync", { 
                isOpen: true, 
                total, 
                method, 
                received, 
                change 
            });
        }
    }, [received, change, method, show, total]);

    const confirmPayment = () => {
        if (submitting || !isEnough) return;
        setSubmitting(true);
        onConfirm({
            method,
            received: method === 'card' ? total : received,
            change: method === 'card' ? 0 : change
        });
    };

    useEffect(() => {
        if (!show) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Enter") {
                confirmPayment();
            } else if (e.key === "Escape") {
                onClose();
            } else if (method === 'cash') {
                if (/^[0-9]$/.test(e.key)) {
                    handleNumberClick(e.key);
                } else if (e.key === ".") {
                    handleNumberClick(".");
                } else if (e.key === "Backspace") {
                    handleDelete();
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [show, method, receivedStr, isEnough, total, received, change, submitting]);

    if (!show) return null;

    const handleNumberClick = (val: string) => {
        if (receivedStr.includes('.') && val === '.') return;
        setReceivedStr(prev => prev + val);
    };

    const handleDelete = () => {
        setReceivedStr(prev => prev.slice(0, -1));
    };

    const quickAmounts = [20, 50, 100, 200, 500];

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 2000,
            backdropFilter: 'blur(4px)'
        }}>
            <div style={{
                backgroundColor: 'var(--bg-secondary)', borderRadius: '20px',
                width: '90%', maxWidth: '900px', maxHeight: '94vh', display: 'flex', flexDirection: 'column',
                overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
                border: '1px solid var(--border-light)'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1.5rem 2rem', borderBottom: '1px solid var(--border-light)',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0
                }}>
                    <h2 style={{ fontSize: '1.8rem', margin: 0, display: 'flex', alignItems: 'center', gap: '1rem' }}>
                        Finalizar Cobro <span style={{ color: 'var(--accent-primary)' }}>${total.toFixed(2)}</span>
                    </h2>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
                        <X size={32} />
                    </button>
                </div>

                <div style={{ display: 'flex', flex: 1, overflowY: 'auto' }}>
                    {/* Left Side: Methods & Summary */}
                    <div style={{ flex: 1, padding: '2rem', borderRight: '1px solid var(--border-light)', backgroundColor: 'var(--bg-primary)' }}>
                        <h3 style={{ marginBottom: '1.5rem', opacity: 0.7 }}>Método de Pago</h3>
                        
                        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2.5rem' }}>
                            <button 
                                onClick={() => setMethod('cash')}
                                style={{
                                    flex: 1, padding: '2rem 1rem', borderRadius: '16px', border: method === 'cash' ? '2px solid var(--accent-primary)' : '1px solid var(--border-light)',
                                    backgroundColor: method === 'cash' ? 'rgba(109, 83, 58, 0.05)' : 'white', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                                }}
                            >
                                <Banknote size={40} color={method === 'cash' ? 'var(--accent-primary)' : '#999'} />
                                <span style={{ fontWeight: 600, color: method === 'cash' ? 'var(--text-main)' : '#999' }}>Efectivo</span>
                            </button>
                            <button 
                                onClick={() => setMethod('card')}
                                style={{
                                    flex: 1, padding: '2rem 1rem', borderRadius: '16px', border: method === 'card' ? '2px solid var(--accent-primary)' : '1px solid var(--border-light)',
                                    backgroundColor: method === 'card' ? 'rgba(109, 83, 58, 0.05)' : 'white', cursor: 'pointer',
                                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', transition: 'all 0.2s'
                                }}
                            >
                                <CreditCard size={40} color={method === 'card' ? 'var(--accent-primary)' : '#999'} />
                                <span style={{ fontWeight: 600, color: method === 'card' ? 'var(--text-main)' : '#999' }}>Tarjeta</span>
                            </button>
                        </div>

                        {method === 'cash' && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
                                    <div style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Recibido</div>
                                    <div style={{ fontSize: '2.5rem', fontWeight: 800, color: 'var(--text-main)' }}>
                                        ${received.toFixed(2)}
                                    </div>
                                </div>

                                <div style={{ 
                                    background: change > 0 ? 'rgba(76, 175, 80, 0.1)' : 'var(--bg-secondary)', 
                                    padding: '1.5rem', borderRadius: '16px', border: change > 0 ? '1px solid #4CAF50' : '1px solid var(--border-light)' 
                                }}>
                                    <div style={{ fontSize: '0.9rem', color: change > 0 ? '#2E7D32' : 'var(--text-muted)', marginBottom: '0.5rem' }}>Cambio</div>
                                    <div style={{ fontSize: '2.5rem', fontWeight: 800, color: change > 0 ? '#2E7D32' : 'var(--text-main)' }}>
                                        ${change.toFixed(2)}
                                    </div>
                                </div>
                            </div>
                        )}

                        {method === 'card' && (
                            <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--text-muted)' }}>
                                <CreditCard size={80} style={{ opacity: 0.1, marginBottom: '1rem' }} />
                                <p style={{ fontSize: '1.1rem' }}>Deslice o inserte la tarjeta en la terminal bancaria externa.</p>
                            </div>
                        )}
                    </div>

                    {/* Right Side: Numpad */}
                    <div style={{ width: '400px', padding: '2rem', backgroundColor: 'var(--bg-secondary)' }}>
                        {method === 'cash' ? (
                            <>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
                                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, '.', 0].map(n => (
                                        <button 
                                            key={n} 
                                            onClick={() => handleNumberClick(n.toString())}
                                            style={{
                                                padding: '1.2rem', fontSize: '1.8rem', fontWeight: 700, borderRadius: '12px',
                                                border: '1px solid var(--border-light)', backgroundColor: 'white', cursor: 'pointer',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                            }}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                    <button 
                                        onClick={handleDelete}
                                        style={{
                                            padding: '1.2rem', borderRadius: '12px', border: '1px solid var(--border-light)',
                                            backgroundColor: 'var(--bg-tertiary)', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center'
                                        }}
                                    >
                                        <Delete size={32} />
                                    </button>
                                </div>

                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '2rem' }}>
                                    {quickAmounts.map(amt => (
                                        <button 
                                            key={amt}
                                            onClick={() => setReceivedStr(prev => (((parseFloat(prev) || 0) + amt)).toString())}
                                            style={{
                                                flex: 1, padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--accent-primary)',
                                                color: 'var(--accent-primary)', fontWeight: 700, backgroundColor: 'transparent', cursor: 'pointer'
                                            }}
                                        >
                                            +${amt}
                                        </button>
                                    ))}
                                    <button 
                                        onClick={() => setReceivedStr(total.toString())}
                                        style={{
                                            width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--success)',
                                            color: 'var(--success)', fontWeight: 700, backgroundColor: 'transparent', cursor: 'pointer'
                                        }}
                                    >
                                        Pago Exacto
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div style={{ height: '70%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CheckCircle2 size={120} color="var(--success)" style={{ opacity: 0.2 }} />
                            </div>
                        )}

                        <button
                            disabled={!isEnough || submitting}
                            onClick={confirmPayment}
                            style={{
                                width: '100%', padding: '1.5rem', borderRadius: '16px', fontSize: '1.5rem', fontWeight: 800,
                                border: 'none', backgroundColor: (isEnough && !submitting) ? 'var(--accent-primary)' : '#ccc',
                                color: 'white', cursor: (isEnough && !submitting) ? 'pointer' : 'not-allowed',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '1rem',
                                boxShadow: (isEnough && !submitting) ? '0 10px 20px rgba(109, 83, 58, 0.3)' : 'none',
                                transition: 'all 0.2s'
                            }}
                        >
                            {submitting ? "PROCESANDO..." : "CONFIRMAR COBRO"}
                            <ChevronRight size={28} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
