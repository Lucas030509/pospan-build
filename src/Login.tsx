import { useState, useEffect } from "react";
import { Lock, Delete } from "lucide-react";
import { getUserByPin, logAction } from "./db";

interface LoginProps {
    onLogin: (user: any) => void;
    inactivityLocked?: boolean;
    onClearInactivity?: () => void;
}

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15000;

// Persistidos en localStorage (no solo en estado de React) para que el bloqueo por intentos
// fallidos sobreviva a un recargo de la ventana en vez de resetearse con solo esperar/recargar.
const LOCK_STORAGE_KEY = "pospan_login_locked_until";
const ATTEMPTS_STORAGE_KEY = "pospan_login_failed_attempts";

function readStoredLockUntil(): number | null {
    const raw = localStorage.getItem(LOCK_STORAGE_KEY);
    const ts = raw ? Number(raw) : NaN;
    if (!ts || ts <= Date.now()) {
        localStorage.removeItem(LOCK_STORAGE_KEY);
        return null;
    }
    return ts;
}

export default function Login({ onLogin, inactivityLocked = false, onClearInactivity }: LoginProps) {
    const [pin, setPin] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);
    const [failedAttempts, setFailedAttemptsState] = useState(() => Number(localStorage.getItem(ATTEMPTS_STORAGE_KEY) || 0));
    const [lockedUntil, setLockedUntilState] = useState<number | null>(readStoredLockUntil);
    const [secondsLeft, setSecondsLeft] = useState(0);

    const setFailedAttempts = (value: number) => {
        setFailedAttemptsState(value);
        if (value > 0) localStorage.setItem(ATTEMPTS_STORAGE_KEY, String(value));
        else localStorage.removeItem(ATTEMPTS_STORAGE_KEY);
    };

    const setLockedUntil = (value: number | null) => {
        setLockedUntilState(value);
        if (value) localStorage.setItem(LOCK_STORAGE_KEY, String(value));
        else localStorage.removeItem(LOCK_STORAGE_KEY);
    };

    const isLocked = lockedUntil !== null;

    // Cuenta regresiva del bloqueo temporal tras varios PIN incorrectos seguidos
    useEffect(() => {
        if (!lockedUntil) return;
        const tick = () => {
            const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
            setSecondsLeft(remaining);
            if (remaining <= 0) setLockedUntil(null);
        };
        tick();
        const interval = setInterval(tick, 500);
        return () => clearInterval(interval);
    }, [lockedUntil]);

    const handleNumberClick = (num: string) => {
        if (isLocked) return;
        setError("");
        if (pin.length < 8) {
            setPin(prev => prev + num);
        }
    };

    const handleDelete = () => {
        if (isLocked) return;
        setPin(prev => prev.slice(0, -1));
        setError("");
    };

    const handleSubmit = async () => {
        if (isLocked || !pin) return;
        setLoading(true);
        try {
            const user = await getUserByPin(pin);
            if (user) {
                setFailedAttempts(0);
                await logAction(user.id, "LOGIN", `Empleado '${user.name}' (${user.role}) inició sesión.`);
                onLogin(user);
            } else {
                const attempts = failedAttempts + 1;
                if (attempts >= MAX_ATTEMPTS) {
                    setFailedAttempts(0);
                    setLockedUntil(Date.now() + LOCKOUT_MS);
                    setError("Demasiados intentos incorrectos. Espera unos segundos.");
                } else {
                    setFailedAttempts(attempts);
                    setError("PIN Incorrecto");
                }
                setPin("");
            }
        } catch (err: any) {
            console.error(err);
            setError("Error verificando usuario");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (loading || isLocked) return;
            if (/^[0-9]$/.test(e.key)) {
                handleNumberClick(e.key);
            } else if (e.key === "Backspace") {
                handleDelete();
            } else if (e.key === "Enter") {
                handleSubmit();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [pin, loading, isLocked]);

    return (
        <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            height: '100vh', width: '100vw', backgroundColor: 'var(--bg-primary)'
        }}>
            <div style={{
                backgroundColor: 'var(--bg-secondary)', padding: '3rem', borderRadius: 'var(--radius-lg)',
                boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-light)', width: '400px',
                display: 'flex', flexDirection: 'column', alignItems: 'center'
            }}>
                <div style={{
                    width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--bg-tertiary)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '1.5rem',
                    color: 'var(--accent-primary)'
                }}>
                    <Lock size={40} />
                </div>

                <h2 style={{ fontSize: '1.8rem', marginBottom: '0.5rem' }}>POS PRO</h2>
                <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>Ingrese su PIN de Cajero</p>

                <div style={{
                    display: 'flex', gap: '1rem', marginBottom: '2rem', height: '24px', justifyContent: 'center'
                }}>
                    {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                        <div key={i} style={{
                            width: '20px', height: '20px', borderRadius: '50%',
                            backgroundColor: i < pin.length ? 'var(--text-main)' : 'var(--border-light)',
                            transition: 'all 0.2s'
                        }} />
                    ))}
                </div>

                {error && (
                    <p style={{ color: 'var(--danger)', marginBottom: '1rem', fontWeight: 600 }}>
                        {error}{isLocked ? ` (${secondsLeft}s)` : ''}
                    </p>
                )}

                {/* Number Pad */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', width: '100%', marginBottom: '1.5rem', opacity: isLocked ? 0.5 : 1 }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                        <button
                            key={num}
                            onClick={() => handleNumberClick(num.toString())}
                            disabled={isLocked}
                            style={{
                                padding: '1rem', fontSize: '1.5rem', fontWeight: 600, border: '1px solid var(--border-light)',
                                borderRadius: '12px', backgroundColor: 'white', cursor: isLocked ? 'not-allowed' : 'pointer', transition: 'all 0.1s'
                            }}
                            onMouseDown={e => e.currentTarget.style.backgroundColor = 'var(--bg-tertiary)'}
                            onMouseUp={e => e.currentTarget.style.backgroundColor = 'white'}
                        >
                            {num}
                        </button>
                    ))}
                    <button
                        onClick={handleDelete}
                        disabled={isLocked}
                        style={{
                            padding: '1rem', fontSize: '1.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center',
                            border: '1px solid var(--border-light)', borderRadius: '12px', backgroundColor: 'var(--bg-tertiary)', cursor: isLocked ? 'not-allowed' : 'pointer'
                        }}
                    >
                        <Delete size={28} />
                    </button>
                    <button
                        onClick={() => handleNumberClick("0")}
                        disabled={isLocked}
                        style={{
                            padding: '1rem', fontSize: '1.5rem', fontWeight: 600, border: '1px solid var(--border-light)',
                            borderRadius: '12px', backgroundColor: 'white', cursor: isLocked ? 'not-allowed' : 'pointer'
                        }}
                    >
                        0
                    </button>
                    <button
                        onClick={handleSubmit}
                        disabled={loading || isLocked || pin.length === 0}
                        style={{
                            padding: '1rem', fontSize: '1.2rem', fontWeight: 600, border: 'none',
                            borderRadius: '12px', backgroundColor: 'var(--accent-primary)', color: 'white',
                            cursor: (loading || isLocked || pin.length === 0) ? 'not-allowed' : 'pointer', opacity: (loading || isLocked || pin.length === 0) ? 0.6 : 1
                        }}
                    >
                        OK
                    </button>
                </div>

            </div>

            {inactivityLocked && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    zIndex: 5000
                }}>
                    <div style={{
                        backgroundColor: 'var(--bg-secondary)',
                        padding: '2.5rem',
                        borderRadius: '20px',
                        maxWidth: '450px',
                        width: '90%',
                        textAlign: 'center',
                        boxShadow: 'var(--shadow-lg)',
                        border: '1px solid var(--border-light)',
                    }}>
                        <div style={{
                            fontSize: '4.5rem',
                            marginBottom: '1rem',
                        }}>
                            🔒
                        </div>
                        <h3 style={{
                            fontSize: '1.6rem',
                            fontWeight: 700,
                            color: 'var(--text-main)',
                            marginBottom: '0.75rem',
                            marginTop: 0
                        }}>
                            Sesión Cerrada
                        </h3>
                        <p style={{
                            color: 'var(--text-muted)',
                            fontSize: '1.05rem',
                            lineHeight: '1.5',
                            marginBottom: '1.75rem',
                            marginTop: 0
                        }}>
                            Por motivos de seguridad, la sesión de la caja registradora se cerró automáticamente tras detectar un periodo de inactividad.
                        </p>
                        <button
                            onClick={onClearInactivity}
                            style={{
                                width: '100%',
                                padding: '1rem',
                                backgroundColor: 'var(--accent-primary)',
                                color: 'white',
                                border: 'none',
                                borderRadius: '12px',
                                fontSize: '1.1rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                boxShadow: '0 8px 16px rgba(109, 83, 58, 0.2)'
                            }}
                        >
                            Entendido
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
