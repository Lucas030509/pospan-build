import type { PointerEvent as ReactPointerEvent, DragEvent as ReactDragEvent, MutableRefObject } from "react";

// Umbral de movimiento (px) para distinguir un tap de un arrastre de scroll.
// 7px absorbe los microtemblores de un dedo al posarse sin confundir el desplazamiento.
const DRAG_THRESHOLD_PX = 7;

// Las grillas de producto son tarjetas clickeables dentro de un contenedor con scroll
// táctil. Esta función controla el ciclo completo del puntero: previene drag nativo de HTML5,
// monitorea movimiento continuo (pointermove) para marcar desplazamiento, y cancela ante
// eventos de scroll del navegador (pointercancel), garantizando que deslizar no agregue productos.
export function makeTapHandlers(
    dragStartRef: MutableRefObject<{ x: number; y: number } | null>,
    onTap: () => void
) {
    return {
        onDragStart: (e: ReactDragEvent) => {
            e.preventDefault();
        },
        onPointerDown: (e: ReactPointerEvent) => {
            if (e.button !== 0) return;
            dragStartRef.current = { x: e.clientX, y: e.clientY };
            (dragStartRef.current as any).moved = false;
        },
        onPointerMove: (e: ReactPointerEvent) => {
            const start = dragStartRef.current as ({ x: number; y: number; moved?: boolean } | null);
            if (!start || start.moved) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
                start.moved = true;
            }
        },
        onPointerUp: (e: ReactPointerEvent) => {
            const start = dragStartRef.current as ({ x: number; y: number; moved?: boolean } | null);
            dragStartRef.current = null;
            if (!start || start.moved) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            if (Math.hypot(dx, dy) <= DRAG_THRESHOLD_PX) {
                onTap();
            }
        },
        onPointerCancel: () => {
            dragStartRef.current = null;
        },
    };
}
