import { useState, useEffect } from "react";
import { getAuditLogs } from "./db";
import { ClipboardList, RefreshCw, Calendar, User } from "lucide-react";
import { formatDbDateTime } from "./lib/dates";

export default function Bitacora() {
    const [logs, setLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const loadLogs = async () => {
        setLoading(true);
        try {
            const data = await getAuditLogs();
            setLogs(data);
        } catch (err) {
            console.error("Error al cargar la bitácora:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLogs();
    }, []);

    const formatAction = (action: string) => {
        const colors: Record<string, string> = {
            "VENTA REGISTRADA": "#4CAF50",
            "APERTURA CAJA": "#2196F3",
            "CIERRE CAJA": "#9C27B0",
            "PRODUCTO CREADO": "#00BCD4",
            "PRODUCTO ACTUALIZADO": "#FF9800",
            "PRODUCTO ELIMINADO": "#F44336",
            "EMPLEADO CREADO": "#009688",
            "EMPLEADO ACTUALIZADO": "#607D8B",
            "EMPLEADO ELIMINADO": "#E91E63",
        };
        const color = colors[action] || "#333";
        return (
            <span style={{
                backgroundColor: `${color}15`,
                color: color,
                padding: '0.3rem 0.6rem',
                borderRadius: '4px',
                fontSize: '0.8rem',
                fontWeight: 600
            }}>
                {action}
            </span>
        );
    };

    return (
        <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
                <h2 style={{ fontSize: '1.8rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <ClipboardList size={28} /> Control de Cambios (Bitácora)
                </h2>
                <button
                    onClick={loadLogs}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.5rem 1rem', border: '1px solid var(--border-light)',
                        borderRadius: '8px', cursor: 'pointer', backgroundColor: 'white',
                        fontWeight: 600
                    }}
                >
                    <RefreshCw size={16} /> Actualizar
                </button>
            </div>

            {loading ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando bitácora...</div>
            ) : (
                <div style={{ 
                    backgroundColor: 'white', 
                    borderRadius: '12px', 
                    boxShadow: 'var(--shadow-sm)', 
                    border: '1px solid var(--border-light)',
                    overflow: 'hidden'
                }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ backgroundColor: 'var(--bg-secondary)', borderBottom: '1px solid var(--border-light)' }}>
                                <th style={{ padding: '1rem' }}>Fecha (Local)</th>
                                <th style={{ padding: '1rem' }}>Usuario</th>
                                <th style={{ padding: '1rem' }}>Acción</th>
                                <th style={{ padding: '1rem' }}>Detalles</th>
                            </tr>
                        </thead>
                        <tbody>
                            {logs.map((log) => (
                                <tr key={log.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                    <td style={{ padding: '1rem', whiteSpace: 'nowrap', fontSize: '0.85rem' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)' }}>
                                            <Calendar size={14} />
                                            {formatDbDateTime(log.created_at)}
                                        </div>
                                    </td>
                                    <td style={{ padding: '1rem', fontWeight: 600 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                            <User size={14} style={{ opacity: 0.5 }} />
                                            {log.user_name || 'Sistema'}
                                        </div>
                                    </td>
                                    <td style={{ padding: '1rem' }}>
                                        {formatAction(log.action)}
                                    </td>
                                    <td style={{ padding: '1rem', fontSize: '0.9rem', color: 'var(--text-main)' }}>
                                        {log.details}
                                    </td>
                                </tr>
                            ))}
                            {logs.length === 0 && (
                                <tr>
                                    <td colSpan={4} style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                        No hay registros en la bitácora aún.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
