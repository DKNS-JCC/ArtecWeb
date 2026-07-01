/**
 * @file Helpers de base de datos basados en promesas.
 *
 * Envuelven la API por callbacks de sqlite3 con una **única política de error**:
 * si la consulta falla, la promesa se rechaza (para que quien la llama lo gestione
 * con try/catch), en lugar de tragarse el error. Antes cada archivo redefinía sus
 * propios `dbGet/dbAll/dbRun` con criterios ligeramente distintos.
 * @module utils/db
 */
const db = require('../database');

/**
 * Ejecuta un SELECT que devuelve como mucho una fila.
 * @param {string} sql
 * @param {Array} [params]
 * @returns {Promise<Object|undefined>} La fila, o `undefined` si no hay coincidencias.
 */
function dbGet(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
}

/**
 * Ejecuta un SELECT que devuelve varias filas.
 * @param {string} sql
 * @param {Array} [params]
 * @returns {Promise<Object[]>} Las filas (array vacío si no hay ninguna).
 */
function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
    });
}

/**
 * Ejecuta un INSERT/UPDATE/DELETE.
 * @param {string} sql
 * @param {Array} [params]
 * @returns {Promise<import('sqlite3').RunResult>} El statement (`this.changes`, `this.lastID`).
 */
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

module.exports = { dbGet, dbAll, dbRun };
