import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { registerDialogHandler, type DialogRequest } from "../lib/dialogs";

const KIND_STYLES: Record<string, { color: string; Icon: typeof AlertTriangle }> = {
    info: { color: "var(--accent-primary)", Icon: CheckCircle2 },
    warning: { color: "#d97706", Icon: AlertTriangle },
    error: { color: "var(--danger)", Icon: XCircle },
};

export default function DialogHost() {
    const [queue, setQueue] = useState<DialogRequest[]>([]);

    useEffect(() => {
        registerDialogHandler(req => setQueue(q => [...q, req]));
        return () => registerDialogHandler(null);
    }, []);

    const current = queue[0];
    if (!current) return null;

    const { color, Icon } = KIND_STYLES[current.kind] || KIND_STYLES.info;

    const close = (result: boolean) => {
        current.resolve(result);
        setQueue(q => q.slice(1));
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', zIndex: 3000
        }}>
            <div style={{
                backgroundColor: 'var(--bg-primary)', borderRadius: '16px', width: '90%', maxWidth: '420px',
                padding: '2rem', boxShadow: '0 20px 40px rgba(0,0,0,0.25)', textAlign: 'center'
            }}>
                <Icon size={48} color={color} style={{ marginBottom: '1rem' }} />
                <p style={{ fontSize: '1.05rem', color: 'var(--text-main)', margin: '0 0 1.75rem', whiteSpace: 'pre-line', lineHeight: 1.5 }}>
                    {current.message}
                </p>
                {current.mode === 'confirm' ? (
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                            onClick={() => close(false)}
                            style={{
                                flex: 1, padding: '0.9rem', borderRadius: '12px', border: '1px solid var(--border-light)',
                                backgroundColor: 'transparent', color: 'var(--text-main)', fontWeight: 700, fontSize: '1rem', cursor: 'pointer'
                            }}
                        >
                            Cancelar
                        </button>
                        <button
                            onClick={() => close(true)}
                            style={{
                                flex: 1, padding: '0.9rem', borderRadius: '12px', border: 'none',
                                backgroundColor: color, color: 'white', fontWeight: 700, fontSize: '1rem', cursor: 'pointer'
                            }}
                        >
                            Aceptar
                        </button>
                    </div>
                ) : (
                    <button
                        onClick={() => close(true)}
                        style={{
                            width: '100%', padding: '0.9rem', borderRadius: '12px', border: 'none',
                            backgroundColor: color, color: 'white', fontWeight: 700, fontSize: '1rem', cursor: 'pointer'
                        }}
                    >
                        Entendido
                    </button>
                )}
            </div>
        </div>
    );
}
