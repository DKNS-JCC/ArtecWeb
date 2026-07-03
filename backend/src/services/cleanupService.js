const { dbRun } = require('../utils/db');

const RETENTION_DAYS = Math.max(1, parseInt(process.env.CHAT_RETENTION_DAYS || '90'));
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function runCleanup() {
    // El intervalo se pasa como parámetro (en vez de interpolarlo) para no construir SQL con texto.
    const cutoff = `-${RETENTION_DAYS} days`;
    try {
        const msgs = (await dbRun(`DELETE FROM chat_messages WHERE created_at < datetime('now', ?)`, [cutoff])).changes;
        const sessions = (await dbRun(
            `DELETE FROM visitors WHERE ended_at IS NOT NULL AND ended_at < datetime('now', ?)`, [cutoff]
        )).changes;
        if (msgs > 0 || sessions > 0) {
            console.log(`[Cleanup] Eliminados ${msgs} mensajes, ${sessions} sesiones (retención: ${RETENTION_DAYS}d)`);
        }
    } catch (err) {
        console.error('[Cleanup] Error durante la limpieza:', err.message);
    }
}

function start() {
    // Retrasa la primera ejecución para que la BD esté totalmente inicializada antes de tocarla
    setTimeout(runCleanup, 10_000);
    setInterval(runCleanup, CLEANUP_INTERVAL_MS);
}

module.exports = { start, runCleanup };
