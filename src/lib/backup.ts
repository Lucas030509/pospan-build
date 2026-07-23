import { appConfigDir, join } from "@tauri-apps/api/path";
import { copyFile, mkdir, readDir, remove, exists } from "@tauri-apps/plugin-fs";
import { getDb } from "../db";

const DB_FILENAME = "pospan.db";
const BACKUPS_DIRNAME = "backups";
const MAX_BACKUPS = 30;
const AUTO_BACKUP_MIN_INTERVAL_MS = 20 * 60 * 60 * 1000; // ~20h entre respaldos automáticos

function timestampForFilename(d = new Date()): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function listBackupFiles(backupsDir: string): Promise<string[]> {
    if (!(await exists(backupsDir))) return [];
    const entries = await readDir(backupsDir);
    return entries
        .filter(e => e.isFile && e.name.startsWith("pospan_") && e.name.endsWith(".db"))
        .map(e => e.name)
        .sort(); // el timestamp está en el nombre: orden alfabético = orden cronológico
}

async function pruneOldBackups(backupsDir: string): Promise<void> {
    try {
        const files = await listBackupFiles(backupsDir);
        const excess = files.length - MAX_BACKUPS;
        if (excess > 0) {
            for (const name of files.slice(0, excess)) {
                await remove(await join(backupsDir, name));
            }
        }
    } catch (err) {
        console.error("Error podando respaldos antiguos:", err);
    }
}

/**
 * La base corre en journal_mode=WAL: los cambios recientes pueden vivir en pospan.db-wal
 * y no en pospan.db hasta que SQLite hace checkpoint. Copiar solo pospan.db sin forzar esto
 * primero puede dejar un respaldo "válido" pero desactualizado, sin ningún error visible.
 */
async function checkpointWal(): Promise<void> {
    try {
        const db = await getDb();
        await db.execute("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch (err) {
        console.warn("No se pudo hacer checkpoint del WAL antes del respaldo:", err);
    }
}

/**
 * Copia el archivo real de la base de datos. Sin `destPath`, respalda a la carpeta
 * interna `backups/` (y poda los más viejos); con `destPath` (elegido por el usuario
 * vía diálogo, ej. un USB), respalda ahí y no toca la rotación interna.
 */
export async function backupNow(destPath?: string): Promise<string> {
    await checkpointWal();

    const configDir = await appConfigDir();
    const dbPath = await join(configDir, DB_FILENAME);

    if (destPath) {
        await copyFile(dbPath, destPath);
        return destPath;
    }

    const backupsDir = await join(configDir, BACKUPS_DIRNAME);
    if (!(await exists(backupsDir))) {
        await mkdir(backupsDir, { recursive: true });
    }
    const target = await join(backupsDir, `pospan_${timestampForFilename()}.db`);
    await copyFile(dbPath, target);
    await pruneOldBackups(backupsDir);
    return target;
}

/** Respalda solo si no hay un respaldo automático reciente (~20h). Pensado para llamarse al iniciar la app. */
export async function maybeAutoBackup(): Promise<void> {
    try {
        const configDir = await appConfigDir();
        const backupsDir = await join(configDir, BACKUPS_DIRNAME);
        const files = await listBackupFiles(backupsDir);

        if (files.length > 0) {
            const lastName = files[files.length - 1];
            const match = lastName.match(/^pospan_(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})\.db$/);
            if (match) {
                const [, y, mo, d, h, mi, s] = match;
                const lastTime = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)).getTime();
                if (!isNaN(lastTime) && (Date.now() - lastTime) < AUTO_BACKUP_MIN_INTERVAL_MS) {
                    return;
                }
            }
        }

        await backupNow();
    } catch (err) {
        console.error("Error en respaldo automático:", err);
    }
}
