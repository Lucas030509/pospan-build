import { confirm as tauriConfirm, message as tauriMessage } from "@tauri-apps/plugin-dialog";

export async function notify(msg: string, kind: 'info' | 'warning' | 'error' = 'info'): Promise<void> {
    await tauriMessage(msg, { title: "POSPAN", kind });
}

export async function confirmAction(msg: string): Promise<boolean> {
    return await tauriConfirm(msg, { title: "POSPAN", kind: 'warning' });
}
