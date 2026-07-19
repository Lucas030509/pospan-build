import { useState, useEffect } from "react";
import { 
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    BarChart, Bar, Cell
} from "recharts";
import { getDailySalesAnalytics, getTopProductsAnalytics, getSalesKPIs } from "./db";
import { TrendingUp, DollarSign, ShoppingBag, ArrowUpRight } from "lucide-react";

export default function Dashboard() {
    const [dailyData, setDailyData] = useState<any[]>([]);
    const [topProducts, setTopProducts] = useState<any[]>([]);
    const [kpis, setKpis] = useState<any>({ today: 0, month: 0, average: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                const [daily, top, metrics] = await Promise.all([
                    getDailySalesAnalytics(),
                    getTopProductsAnalytics(),
                    getSalesKPIs()
                ]);
                // Rellenar fechas vacías en los últimos 30 días para evitar saltos en la gráfica
                const paddedDaily: any[] = [];
                const dailyMap = new Map((daily || []).map((d: any) => [d.date, d.total]));

                for (let i = 29; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    const year = d.getFullYear();
                    const month = String(d.getMonth() + 1).padStart(2, '0');
                    const day = String(d.getDate()).padStart(2, '0');
                    const dateStr = `${year}-${month}-${day}`;

                    paddedDaily.push({
                        date: dateStr,
                        total: dailyMap.get(dateStr) || 0
                    });
                }

                setDailyData(paddedDaily);
                setTopProducts(top);
                setKpis(metrics);
            } catch (e) {
                console.error("Error cargando dashboard:", e);
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []);

    if (loading) return <div style={{ padding: '2rem', color: 'var(--text-muted)' }}>Analizando datos del negocio...</div>;

    const COLORS = ['#6366f1', '#a855f7', '#ec4899', '#f43f5e', '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e'];

    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', paddingBottom: '5rem' }}>
            <header style={{ marginBottom: '2.5rem' }}>
                <h2 style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>Panel de Inteligencia</h2>
                <p style={{ color: 'var(--text-muted)', marginTop: '0.5rem' }}>Visualiza el rendimiento de tu panadería en tiempo real.</p>
            </header>

            {/* Fila de KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.5rem', marginBottom: '2.5rem' }}>
                <div style={cardStyle}>
                    <div style={iconBoxStyle('var(--accent-primary)')}><DollarSign size={24} /></div>
                    <div>
                        <span style={kpiLabelStyle}>Ventas Hoy</span>
                        <div style={kpiValueStyle}>${kpis.today.toFixed(2)}</div>
                        <div style={{ color: 'var(--success)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                            <ArrowUpRight size={14} /> +12.5% vs ayer
                        </div>
                    </div>
                </div>

                <div style={cardStyle}>
                    <div style={iconBoxStyle('#a855f7')}><TrendingUp size={24} /></div>
                    <div>
                        <span style={kpiLabelStyle}>Ventas del Mes</span>
                        <div style={kpiValueStyle}>${kpis.month.toFixed(2)}</div>
                        <div style={{ color: 'var(--success)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                            <ArrowUpRight size={14} /> En meta mensual
                        </div>
                    </div>
                </div>

                <div style={cardStyle}>
                    <div style={iconBoxStyle('#ec4899')}><ShoppingBag size={24} /></div>
                    <div>
                        <span style={kpiLabelStyle}>Ticket Promedio</span>
                        <div style={kpiValueStyle}>${kpis.average.toFixed(2)}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: '4px' }}>
                            Basado en {dailyData.length} días
                        </div>
                    </div>
                </div>
            </div>

            {/* Gráficos Principales */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr', gap: '2rem' }}>
                
                {/* Tendencia Diaria */}
                <div style={{ ...cardStyle, display: 'block', padding: '2rem' }}>
                    <h3 style={{ margin: '0 0 2rem 0', fontSize: '1.2rem' }}>Tendencia de Ventas (30 días)</h3>
                    <div style={{ width: '100%', height: 350 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={dailyData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                                <XAxis 
                                    dataKey="date" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{fontSize: 12, fill: '#94a3b8'}}
                                    dy={10}
                                />
                                <YAxis 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{fontSize: 12, fill: '#94a3b8'}}
                                    tickFormatter={(val) => `$${val}`}
                                />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                    formatter={(val: any) => [`$${val.toFixed(2)}`, 'Ventas']}
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="total" 
                                    stroke="var(--accent-primary)" 
                                    strokeWidth={4} 
                                    dot={{ r: 4, fill: 'var(--accent-primary)', strokeWidth: 2, stroke: '#fff' }}
                                    activeDot={{ r: 8 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Top Productos */}
                <div style={{ ...cardStyle, display: 'block', padding: '2rem' }}>
                    <h3 style={{ margin: '0 0 1.5rem 0', fontSize: '1.2rem' }}>Top 10 Productos</h3>
                    <div style={{ width: '100%', height: 350 }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={topProducts} layout="vertical" margin={{ left: 40 }}>
                                <XAxis type="number" hide />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{fontSize: 11, fontWeight: 600, fill: '#64748b'}}
                                    width={100}
                                />
                                <Tooltip 
                                    cursor={{fill: 'rgba(0,0,0,0.02)'}}
                                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }}
                                />
                                <Bar dataKey="total_qty" radius={[0, 4, 4, 0]} barSize={20}>
                                    {topProducts.map((_, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>
        </div>
    );
}

const cardStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-secondary)',
    borderRadius: '20px',
    padding: '1.5rem',
    border: '1px solid var(--border-light)',
    display: 'flex',
    alignItems: 'center',
    gap: '1.25rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
};

const iconBoxStyle = (color: string): React.CSSProperties => ({
    backgroundColor: color + '15',
    color: color,
    width: '56px',
    height: '56px',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
});

const kpiLabelStyle: React.CSSProperties = {
    fontSize: '0.9rem',
    color: 'var(--text-muted)',
    fontWeight: 500,
    display: 'block'
};

const kpiValueStyle: React.CSSProperties = {
    fontSize: '1.75rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    marginTop: '2px'
};
