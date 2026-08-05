// Los modales nativos del plugin de Tauri (@tauri-apps/plugin-dialog) dibujan un cuadro de
// diálogo del sistema operativo (en Windows, el msgbox genérico), fuera de todo control de
// estilo/touch de la app. notify()/confirmAction() ahora delegan en <DialogHost/> (montado una
// sola vez en App.tsx), que muestra un modal propio con la misma apariencia del resto de POSPAN.

export type DialogKind = 'info' | 'warning' | 'error';

export interface DialogRequest {
    mode: 'alert' | 'confirm';
    message: string;
    kind: DialogKind;
    resolve: (value: boolean) => void;
}

type DialogHandler = (req: DialogRequest) => void;

let handler: DialogHandler | null = null;

export function registerDialogHandler(fn: DialogHandler | null): void {
    handler = fn;
}

export async function notify(msg: string, kind: DialogKind = 'info'): Promise<void> {
    return new Promise(resolve => {
        if (!handler) { resolve(); return; }
        handler({ mode: 'alert', message: msg, kind, resolve: () => resolve() });
    });
}

export async function confirmAction(msg: string): Promise<boolean> {
    return new Promise(resolve => {
        if (!handler) { resolve(false); return; }
        handler({ mode: 'confirm', message: msg, kind: 'warning', resolve });
    });
}
