import { Component, ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
    children: ReactNode;
}

interface State {
    error: Error | null;
}

// Sin esto, un error de render en cualquier pantalla (Kardex, Producción, POS, etc.)
// tumba toda la ventana a blanco en medio de un turno de caja, sin forma de recuperarse
// salvo reiniciar la app a mano.
export default class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: { componentStack: string }) {
        console.error("Error no capturado en la interfaz:", error, info.componentStack);
    }

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (!this.state.error) return this.props.children;

        return (
            <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                height: '100vh', width: '100vw', backgroundColor: 'var(--bg-primary)', textAlign: 'center', padding: '2rem'
            }}>
                <div style={{
                    backgroundColor: 'var(--bg-secondary)', padding: '3rem', borderRadius: 'var(--radius-lg)',
                    boxShadow: 'var(--shadow-md)', border: '1px solid var(--border-light)', maxWidth: '480px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center'
                }}>
                    <div style={{
                        width: '80px', height: '80px', borderRadius: '50%', backgroundColor: 'var(--bg-tertiary)',
                        display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '1.5rem',
                        color: 'var(--danger)'
                    }}>
                        <AlertTriangle size={40} />
                    </div>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Ocurrió un error inesperado</h2>
                    <p style={{ color: 'var(--text-muted)', marginBottom: '2rem' }}>
                        La aplicación encontró un problema y no puede continuar en esta pantalla. Ningún dato guardado se pierde por esto; reinicia para seguir trabajando.
                    </p>
                    <button
                        onClick={this.handleReload}
                        style={{
                            padding: '1rem 2rem', fontSize: '1.05rem', fontWeight: 700, border: 'none',
                            borderRadius: '12px', backgroundColor: 'var(--accent-primary)', color: 'white', cursor: 'pointer'
                        }}
                    >
                        Reiniciar
                    </button>
                </div>
            </div>
        );
    }
}
