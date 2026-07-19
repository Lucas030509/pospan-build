export interface IconOption {
    emoji: string;
    label: string;
}

// Catálogo de íconos disponibles para productos. Cada entrada tiene una
// etiqueta en español para poder buscarlas por nombre en el selector.
// Para agregar más íconos, solo añade nuevas entradas { emoji, label } aquí.
export const ICON_LIBRARY: IconOption[] = [
    { emoji: '🥐', label: 'Croissant / Cuerno' },
    { emoji: '🍩', label: 'Dona / Rosca' },
    { emoji: '🥖', label: 'Baguette / Bolillo / Telera' },
    { emoji: '🍞', label: 'Pan de caja / Hogaza' },
    { emoji: '🥯', label: 'Bagel / Cemita' },
    { emoji: '🥨', label: 'Pretzel' },
    { emoji: '🫓', label: 'Pan árabe / Pita / Focaccia' },
    { emoji: '🐚', label: 'Concha / Concha marina' },
    { emoji: '🍰', label: 'Pastel / Rebanada de pastel' },
    { emoji: '🎂', label: 'Pastel de cumpleaños' },
    { emoji: '🧁', label: 'Mantecada / Cupcake' },
    { emoji: '🥧', label: 'Pay / Empanada dulce' },
    { emoji: '🥟', label: 'Empanada' },
    { emoji: '🍪', label: 'Galleta / Polvorón' },
    { emoji: '🍫', label: 'Chocolate' },
    { emoji: '🍮', label: 'Flan / Postre' },
    { emoji: '🍯', label: 'Miel / Panal' },
    { emoji: '🥛', label: 'Leche / Nata' },
    { emoji: '☕', label: 'Café' },
    { emoji: '🧃', label: 'Jugo' },
    { emoji: '🥤', label: 'Bebida / Refresco' },
    { emoji: '🥞', label: 'Hot cakes / Panqué' },
    { emoji: '🧇', label: 'Waffle' },
    { emoji: '🥪', label: 'Sándwich / Torta' },
    { emoji: '🥥', label: 'Coco' },
    { emoji: '🍓', label: 'Fresa' },
    { emoji: '🍊', label: 'Naranja' },
    { emoji: '🌾', label: 'Trigo / Grano / Regional' },
    { emoji: '🌽', label: 'Elote' },
    { emoji: '🥚', label: 'Huevo / Yema' },
    { emoji: '🧄', label: 'Ajo' },
    { emoji: '🌵', label: 'Maguey / Pulque' },
    { emoji: '🍥', label: 'Rol / Espiral / Canela' },
    { emoji: '🌀', label: 'Espiral / Remolino / Chino' },
    { emoji: '🍡', label: 'Banderilla / Brocheta dulce' },
    { emoji: '🎀', label: 'Moño / Corbata' },
    { emoji: '🪮', label: 'Peine / Peineta' },
    { emoji: '👛', label: 'Cartera' },
    { emoji: '🍦', label: 'Barquillo / Helado' },
    { emoji: '💋', label: 'Beso' },
    { emoji: '🐷', label: 'Puerquito' },
    { emoji: '💍', label: 'Novia / Anillo' },
    { emoji: '☁️', label: 'Nube' },
    { emoji: '🛏️', label: 'Colchón' },
    { emoji: '🌋', label: 'Volcán' },
    { emoji: '🐢', label: 'Tortuga' },
    { emoji: '🎯', label: 'Ojo de buey' },
    { emoji: '🪨', label: 'Piedra' },
    { emoji: '🪺', label: 'Nido' },
    { emoji: '🧺', label: 'Canasta / Huacal' },
    { emoji: '🥃', label: 'Borrachito / Licor' },
    { emoji: '🥮', label: 'Pastel de luna / Redondo' },
    { emoji: '🌭', label: 'Pan para hot dog' },
    { emoji: '🧀', label: 'Queso' },
    { emoji: '👂', label: 'Oreja' },
    { emoji: '💀', label: 'Pan de muerto' },
    { emoji: '👑', label: 'Rosca de reyes / Corona' },
    { emoji: '🎉', label: 'Fiesta / Temporada' },
    { emoji: '⛄', label: 'Nieve / Invierno' },
    { emoji: '🔥', label: 'Recién horneado / Popular' },
    { emoji: '💖', label: 'Favorito' },
    { emoji: '😋', label: 'Delicioso' },
];

export function searchIcons(query: string): IconOption[] {
    const q = query.trim().toLowerCase();
    if (!q) return ICON_LIBRARY;
    return ICON_LIBRARY.filter(i => i.label.toLowerCase().includes(q) || i.emoji === query.trim());
}

// Un ícono "imagen" es una foto subida por el usuario (guardada como data URL),
// a diferencia de los emoji de ICON_LIBRARY que son simples caracteres de texto.
export function isImageIcon(icon?: string | null): boolean {
    if (!icon) return false;
    return icon.startsWith('data:image') || icon.startsWith('http://') || icon.startsWith('https://');
}

// Para contextos de solo texto (como <option> de un <select> nativo) donde no
// se puede renderizar una imagen: usa un ícono genérico en vez del data URL crudo.
export function iconGlyph(icon?: string | null): string {
    if (!icon || isImageIcon(icon)) return '🍞';
    return icon;
}
