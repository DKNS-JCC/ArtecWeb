/**
 * Runs after the test framework is installed (after env.js).
 * Ensures the test database directory exists so database.js can open the file.
 */
const path = require('path');
const fs   = require('fs');

const dbDir = path.join(__dirname, '../../../../database');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}
