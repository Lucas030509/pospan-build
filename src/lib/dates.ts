// SQLite (CURRENT_TIMESTAMP) guarda "YYYY-MM-DD HH:MM:SS" en UTC, sin sufijo de zona.
// Si esa cadena se le pasa tal cual a `new Date()`, el motor JS la interpreta como hora
// LOCAL (no UTC), así que la hora mostrada queda corrida varias horas respecto a la real.
// Estas funciones marcan explícitamente la cadena como UTC antes de convertirla, para que
// toLocaleString()/toLocaleDateString() sí devuelvan la hora local correcta del equipo.
export function parseDbDate(value: string | null | undefined): Date | null {
    if (!value) return null;
    let iso = value.includes('T') ? value : value.replace(' ', 'T');
    if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso)) iso += 'Z';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
}

export function formatDbDateTime(value: string | null | undefined): string {
    const d = parseDbDate(value);
    return d ? d.toLocaleString() : '';
}

export function formatDbDate(value: string | null | undefined): string {
    const d = parseDbDate(value);
    return d ? d.toLocaleDateString() : '';
}
