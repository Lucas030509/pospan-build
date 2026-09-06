import { useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, DragEvent as ReactDragEvent, MutableRefObject } from "react";

// Umbral de movimiento (px) para distinguir un tap de un arrastre de scroll.
// 7px absorbe los microtemblores de un dedo al posarse sin confundir el desplazamiento.
const DRAG_THRESHOLD_PX = 7;

// Con `touch-action: pan-y` en la tarjeta, el WebView puede scrollear el contenedor
// por su cuenta (compositor) sin despachar pointermove a React a tiempo -o del todo-,
// así que el cálculo de distancia por pointermove/pointerup no siempre detecta el
// arrastre. Este cooldown (ms) marca "hubo scroll" apenas se dispara un evento scroll
// real en el contenedor, y bloquea el tap aunque el pointer no haya reportado movimiento.
const SCROLL_COOLDOWN_MS = 200;

// Los eventos "scroll" no burbujean, pero sí pasan por la fase de captura de sus
// ancestros. Escuchando en document con capture:true detectamos scroll en CUALQUIER
// contenedor de la pantalla (.main-area, un modal con overflow, etc.) sin tener que
// engancharlo a mano en cada pantalla que usa makeTapHandlers.
export function useScrollGuard() {
    const justScrolledRef = useRef(false);

    useEffect(() => {
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        const onScroll = () => {
            justScrolledRef.current = true;
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                justScrolledRef.current = false;
            }, SCROLL_COOLDOWN_MS);
        };
        document.addEventListener("scroll", onScroll, true);
        return () => {
            document.removeEventListener("scroll", onScroll, true);
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, []);

    return { justScrolledRef };
}

// Las grillas de producto son tarjetas clickeables dentro de un contenedor con scroll
// táctil. Esta función controla el ciclo completo del puntero: previene drag nativo de HTML5,
// monitorea movimiento continuo (pointermove) para marcar desplazamiento, y cancela ante
// eventos de scroll del navegador (pointercancel), garantizando que deslizar no agregue productos.
export function makeTapHandlers(
    dragStartRef: MutableRefObject<{ x: number; y: number } | null>,
    onTap: () => void,
    justScrolledRef?: MutableRefObject<boolean>
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
            if (justScrolledRef?.current) return;
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
