import { useState } from "react";
import { BookOpen, ChefHat } from "lucide-react";
import Recetas from "./Recetas";
import ProduccionOrders from "./components/ProduccionOrders";
import { hasPermission } from "./App";

type ProduccionTab = 'recetas' | 'produccion';

export default function Produccion({ currentUser }: { currentUser: any }) {
    const canRecipes = hasPermission(currentUser, 'recipes');
    const canProduccion = hasPermission(currentUser, 'inventory');
    const [tab, setTab] = useState<ProduccionTab>(canRecipes ? 'recetas' : 'produccion');

    return (
        <div>
            {/* Solo la barra de pestañas vive aquí — cada pestaña trae su propio padding/ancho
                (Recetas ya lo tenía; ProduccionOrders lo replica) para no duplicar el espaciado. */}
            <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-light)', padding: '1.5rem 2rem 0', maxWidth: '1000px', margin: '0 auto' }}>
                {canRecipes && (
                    <button
                        onClick={() => setTab('recetas')}
                        style={{
                            padding: '0.7rem 1.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem',
                            borderBottom: tab === 'recetas' ? '3px solid var(--accent-primary)' : '3px solid transparent',
                            color: tab === 'recetas' ? 'var(--accent-primary)' : 'var(--text-muted)',
                            background: 'transparent', border: 'none', borderBottomStyle: 'solid',
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                        }}
                    >
                        <BookOpen size={16} /> Recetas
                    </button>
                )}
                {canProduccion && (
                    <button
                        onClick={() => setTab('produccion')}
                        style={{
                            padding: '0.7rem 1.5rem', cursor: 'pointer', fontWeight: 600, fontSize: '0.95rem',
                            borderBottom: tab === 'produccion' ? '3px solid var(--accent-primary)' : '3px solid transparent',
                            color: tab === 'produccion' ? 'var(--accent-primary)' : 'var(--text-muted)',
                            background: 'transparent', border: 'none', borderBottomStyle: 'solid',
                            display: 'flex', alignItems: 'center', gap: '0.4rem',
                        }}
                    >
                        <ChefHat size={16} /> Producción
                    </button>
                )}
            </div>

            {tab === 'recetas' && canRecipes && <Recetas currentUser={currentUser} />}
            {tab === 'produccion' && canProduccion && <ProduccionOrders currentUser={currentUser} />}
        </div>
    );
}
