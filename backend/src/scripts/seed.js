/**
 * Script de seed - vacía la base de datos y la repuebla con datos de demo realistas:
 * varios museos, cuentas de personal (nombres de usuario sin espacios), robots y un
 * histórico de sesiones de visitante + chat para que el panel de analíticas no esté vacío.
 *
 * El esquema NO se redefine aquí: hacemos require de ../database, que crea cada tabla
 * (con cascade de FK e índices) exactamente una vez. Así el seed nunca puede volver a
 * desincronizarse del esquema real.
 *
 * Ejecútalo con el servidor backend parado:   npm run seed
 * Respeta DB_PATH, así que puede apuntar a una BD desechable para verificación.
 */
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const dbFile = process.env.DB_PATH || path.resolve(__dirname, '../../../database/database.sqlite');
for (const f of [dbFile, `${dbFile}-wal`, `${dbFile}-shm`]) {
    if (fs.existsSync(f)) fs.unlinkSync(f);
}
// Solo borra las subidas de avatares compartidas al sembrar la BD real, nunca con un DB_PATH alternativo.
if (!process.env.DB_PATH) {
    const avatarsDir = path.resolve(__dirname, '../../uploads/avatars');
    if (fs.existsSync(avatarsDir)) {
        for (const f of fs.readdirSync(avatarsDir)) fs.unlinkSync(path.join(avatarsDir, f));
    }
}

// Hacer require de database.js (re)crea el esquema sobre el archivo nuevo, con
// foreign_keys = ON y las reglas ON DELETE CASCADE ya definidas.
const db = require('../database');

const run = (sql, p = []) => new Promise((resolve, reject) => {
    db.run(sql, p, function (err) {
        if (err) reject(err);
        else resolve(this);
    });
});
const get = (sql, p = []) => new Promise((resolve, reject) => {
    db.get(sql, p, (err, row) => {
        if (err) reject(err);
        else resolve(row);
    });
});

async function waitForSchema() {
    for (let i = 0; i < 30; i++) {
        try { await get('SELECT 1 FROM museums LIMIT 1'); return; }
        catch { await new Promise(r => setTimeout(r, 100)); }
    }
    throw new Error('Schema not ready after timeout');
}

// UTC 'YYYY-MM-DD HH:MM:SS', hace N días - encaja con los buckets date('now') de SQLite.
function ts(daysAgo, hour = 10, min = 0) {
    const d = new Date(Date.now() - daysAgo * 86_400_000);
    d.setUTCHours(hour, min, 0, 0);
    return d.toISOString().slice(0, 19).replace('T', ' ');
}

const PASSWORD = process.env.DEMO_SEED_PASSWORD || 'artec1234';   // compartida por todas las cuentas de demo

// El robot que ya existe en el sistema - su id NO debe cambiar.
const EXISTING_ROBOT_ID = 'b0a2b9f6-a4bc-47f6-82fc-99a5672c926a';

const MUSEUMS = [
    {
        key: 'prado', name: 'Museo del Prado', company: 'Museo Nacional del Prado',
        domain: 'prado.es', techs: 2,
        robots: [
            { id: EXISTING_ROBOT_ID, name: 'Goya', status: 'idle', battery: 92 }, // kept pristine for live testing
            { name: 'Velázquez', status: 'navigating', battery: 67, sessions: 6 },
        ],
    },
    {
        key: 'reina', name: 'Museo Reina Sofía', company: 'MNCARS',
        domain: 'reinasofia.es', techs: 1,
        robots: [
            { name: 'Dalí', status: 'idle', battery: 80, sessions: 5 },
            { name: 'Miró', status: 'navigating', battery: 45, sessions: 4, navError: 'Sala 206' },
        ],
    },
    {
        key: 'gugg', name: 'Museo Guggenheim Bilbao', company: 'Fundación Guggenheim',
        domain: 'guggenheim.es', techs: 1,
        robots: [
            { name: 'Chillida', status: 'idle', battery: 100, sessions: 3 },
        ],
    },
    {
        key: 'thyssen', name: 'Museo Thyssen-Bornemisza', company: 'Fundación Thyssen',
        domain: 'thyssen.es', techs: 1,
        robots: [
            { name: 'Carmen', status: 'idle', battery: 55, sessions: 0 }, // brand-new robot, no history yet
        ],
    },
];

const EXPERTISE = ['general', 'general', 'general', 'experto', 'nino'];
const LANGS     = ['es', 'es', 'es', 'en', 'en', 'fr', 'it'];

const DIALOGS = [
    { intent: 'greet',       user: 'Hola',                          bot: 'Hola, soy tu guía del museo. ¿Qué te gustaría ver?' },
    { intent: 'navigate_to', user: 'Llévame a Las Meninas',         bot: 'Perfecto, te llevo a Las Meninas.' },
    { intent: 'explain',     user: '¿Quién pintó Las Meninas?',     bot: 'Las Meninas las pintó Diego Velázquez en 1656.' },
    { intent: 'explain',     user: 'Cuéntame sobre el Guernica',    bot: 'El Guernica es una obra de Picasso de 1937 sobre la guerra.' },
    { intent: 'navigate_to', user: 'Quiero ir a la salida',         bot: 'Claro, te acompaño a la salida.' },
    { intent: 'none',        user: 'Muchas gracias',                bot: '¡Un placer! Disfruta de la visita.' },
    { intent: 'farewell',    user: 'Adiós',                         bot: '¡Hasta pronto, que disfrutes!' },
];

async function seed() {
    await waitForSchema();
    const hash = await bcrypt.hash(PASSWORD, 10);

    // Administrador de plataforma (no pertenece a ningún museo)
    const superAdminId = crypto.randomUUID();
    await run(
        `INSERT INTO users (id, name, email, password_hash, role, active, must_change_password)
         VALUES (?, ?, ?, ?, 'platform_admin', 1, 0)`,
        [superAdminId, 'superadmin', 'admin@artec.io', hash]
    );

    const credentials = [{ role: 'Platform admin', user: 'superadmin', email: 'admin@artec.io' }];
    let users = 1, robots = 0, visitors = 0, messages = 0, incidents = 0;

    for (const m of MUSEUMS) {
        const museumId = crypto.randomUUID();
        await run(`INSERT INTO museums (id, name, company) VALUES (?, ?, ?)`, [museumId, m.name, m.company]);

        // Administrador del museo
        const adminId = crypto.randomUUID();
        const adminUser = `${m.key}_admin`;
        await run(
            `INSERT INTO users (id, name, email, password_hash, role, active, museum_id, created_by, must_change_password)
             VALUES (?, ?, ?, ?, 'museum_admin', 1, ?, ?, 0)`,
            [adminId, adminUser, `admin@${m.domain}`, hash, museumId, superAdminId]
        );
        users++;
        credentials.push({ role: `Admin · ${m.name}`, user: adminUser, email: `admin@${m.domain}` });

        // Técnicos (creados por el administrador del museo)
        for (let t = 1; t <= m.techs; t++) {
            const techUser = `${m.key}_tec${t}`;
            await run(
                `INSERT INTO users (id, name, email, password_hash, role, active, museum_id, created_by, must_change_password)
                 VALUES (?, ?, ?, ?, 'technician', 1, ?, ?, 0)`,
                [crypto.randomUUID(), techUser, `${techUser}@${m.domain}`, hash, museumId, adminId]
            );
            users++;
        }

        // Robots
        for (const r of m.robots) {
            const robotId = r.id || crypto.randomUUID();
            await run(
                `INSERT INTO robots (id, museum_id, name, status, battery) VALUES (?, ?, ?, ?, ?)`,
                [robotId, museumId, r.name, r.status, r.battery]
            );
            robots++;

            // Opcional: marca un fallo de navegación reciente + registra la incidencia
            if (r.navError) {
                await run(`UPDATE robots SET last_nav_error_at = ?, last_nav_error_place = ? WHERE id = ?`,
                    [ts(0, 9, 30), r.navError, robotId]);
                await run(
                    `INSERT INTO incidents (id, museum_id, robot_id, type, place_name, detail, resolved, created_at)
                     VALUES (?, ?, ?, 'nav_failed', ?, ?, 0, ?)`,
                    [crypto.randomUUID(), museumId, robotId, r.navError,
                     `El robot no pudo llegar a "${r.navError}". Posible obstáculo o ruta bloqueada.`, ts(0, 9, 30)]
                );
                incidents++;
            }

            // Sesiones de visitante + historial de chat repartidos en los últimos ~10 días
            for (let i = 0; i < (r.sessions || 0); i++) {
                visitors++;
                const daysAgo   = i % 10;
                const startHour = 9 + (i % 8);
                const expertise = EXPERTISE[visitors % EXPERTISE.length];
                const language  = LANGS[visitors % LANGS.length];
                const active    = daysAgo === 0 && i % 4 === 0;            // un par siguen abiertas hoy
                const startTs   = ts(daysAgo, startHour, 0);
                const endTs     = active ? null : ts(daysAgo, startHour, 8 + (visitors % 15));

                const visitorId = crypto.randomUUID();
                const sessionId = crypto.randomUUID();
                await run(
                    `INSERT INTO visitors (id, session_id, robot_id, name, expertise_level, language, created_at, ended_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [visitorId, sessionId, robotId, `Visitante ${visitors}`, expertise, language, startTs, endTs]
                );

                const pairs = 2 + (visitors % 2); // 2-3 pares de mensajes por sesión
                for (let d = 0; d < pairs; d++) {
                    const turn = DIALOGS[(i + d) % DIALOGS.length];
                    await run(
                        `INSERT INTO chat_messages (id, visitor_id, session_id, robot_id, role, content, intent, created_at)
                         VALUES (?, ?, ?, ?, 'user', ?, NULL, ?)`,
                        [crypto.randomUUID(), visitorId, sessionId, robotId, turn.user, ts(daysAgo, startHour, d * 2)]
                    );
                    await run(
                        `INSERT INTO chat_messages (id, visitor_id, session_id, robot_id, role, content, intent, created_at)
                         VALUES (?, ?, ?, ?, 'assistant', ?, ?, ?)`,
                        [crypto.randomUUID(), visitorId, sessionId, robotId, turn.bot, turn.intent, ts(daysAgo, startHour, d * 2 + 1)]
                    );
                    messages += 2;
                }
            }
        }
    }

    console.log('\n=================== SEED COMPLETO ===================');
    console.log(`Museos: ${MUSEUMS.length}  |  Usuarios: ${users}  |  Robots: ${robots}`);
    console.log(`Visitantes: ${visitors}  |  Mensajes: ${messages}  |  Incidencias: ${incidents}`);
    console.log(`\nContraseña para TODAS las cuentas: ${PASSWORD}`);
    console.log('\nCuentas (login por usuario o email):');
    for (const c of credentials) {
        console.log(`  · ${c.role.padEnd(26)} ${c.user.padEnd(16)} ${c.email}`);
    }
    console.log('  · (técnicos)                 <museo>_tec1 / _tec2   misma contraseña');
    console.log(`\nRobot existente conservado: ${EXISTING_ROBOT_ID}  (Goya · Museo del Prado)`);
    console.log('=====================================================\n');
}

seed()
    .catch(err => { console.error('Error during seeding:', err); process.exitCode = 1; })
    .finally(() => db.close());
