import type { CSSProperties } from "react";

// Estilos de tarjeta/formulario reutilizados tal cual (copy-paste) en varias pantallas de
// Configuración. Centralizados aquí para que un cambio de branding no requiera tocar cada
// archivo por separado. Puramente extractivo: mismos valores que ya se usaban antes.
export const cardStyle: CSSProperties = { backgroundColor: 'var(--bg-secondary)', padding: '2rem', borderRadius: '16px', border: '1px solid var(--border-light)', marginBottom: '2rem' };
export const inputStyle: CSSProperties = { width: '100%', padding: '0.7rem', borderRadius: '6px', border: '1px solid var(--border-light)' };
export const labelStyle: CSSProperties = { display: 'block', marginBottom: '0.3rem', fontWeight: 600 };
export const modalOverlay: CSSProperties = { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 };
export const modalBox: CSSProperties = { backgroundColor: 'var(--bg-primary)', padding: '2rem', borderRadius: 'var(--radius-lg)', width: '400px' };
