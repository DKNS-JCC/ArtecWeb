const { dbRun } = require('../utils/db');

const RETENTION_DAYS = Math.max(1, parseInt(process.env.CHAT_RETENTION_DAYS || '90'));
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function runCleanup() {
    const cutoff = `datetime('now', '-${RETENTION_DAYS} days')`;
    try {
        const msgs = (await dbRun(`DELETE FROM chat_messages WHERE created_at < ${cutoff}`)).changes;
        const sessions = (await dbRun(
            `DELETE FROM visitors WHERE ended_at IS NOT NULL AND ended_at < ${cutoff}`
        )).changes;
        if (msgs > 0 || sessions > 0) {
            console.log(`[Cleanup] Removed ${msgs} messages, ${sessions} sessions (retention: ${RETENTION_DAYS}d)`);
        }
    } catch (err) {
        console.error('[Cleanup] Error during cleanup:', err.message);
    }
}

function start() {
    // Retrasa la primera ejecución para que la BD esté totalmente inicializada antes de tocarla
    setTimeout(runCleanup, 10_000);
    setInterval(runCleanup, CLEANUP_INTERVAL_MS);
}

module.exports = { start, runCleanup };
