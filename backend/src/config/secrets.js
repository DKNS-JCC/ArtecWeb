/**
 * Secretos de la aplicación centralizados.
 *
 * Lee el secreto de firma de los JWT desde la variable de entorno `JWT_SECRET`
 * y falla al arrancar si no está definida. Así evitamos usar un valor por
 * defecto inseguro (antes había un literal hardcodeado repetido por el código).
 */
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error('Falta JWT_SECRET: define la variable de entorno JWT_SECRET (ver .env.example).');
}

module.exports = { JWT_SECRET };
