import type { PointerEvent, MutableRefObject } from "react";

// Umbral de movimiento (px) para distinguir un tap de un arrastre de scroll.
const DRAG_THRESHOLD_PX = 10;

// Las grillas de producto son tarjetas clicleables dentro de un contenedor con scroll
// táctil. Un simple onClick dispara igual al soltar el dedo tras arrastrar para hacer
// scroll, porque el WebView embebido no siempre distingue ese gesto de un tap. Esta
// función mide el desplazamiento real entre pointerdown y pointerup y solo dispara la
// acción si fue mínimo — así el scroll deja de seleccionar productos por accidente.
//
// Es una función PLANA (no un hook): se usa dentro de un .map() al renderizar la grilla,
// y los hooks no pueden llamarse dentro de un loop. El componente dueño de la grilla debe
// declarar una sola vez `const dragStart = useRef<{x:number;y:number}|null>(null)` y
// pasarlo aquí en cada tarjeta.
export function makeTapHandlers(
    dragStartRef: MutableRefObject<{ x: number; y: number } | null>,
    onTap: () => void
) {
    return {
        onPointerDown: (e: PointerEvent) => {
            dragStartRef.current = { x: e.clientX, y: e.clientY };
        },
        onPointerUp: (e: PointerEvent) => {
            const start = dragStartRef.current;
            dragStartRef.current = null;
            if (!start) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) {
                onTap();
            }
        },
    };
}
