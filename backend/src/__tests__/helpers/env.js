/**
 * Runs before each test file, before any modules are loaded.
 * Sets environment variables so database.js and authMiddleware use test values.
 */
const path = require('path');

process.env.NODE_ENV    = 'test';
process.env.JWT_SECRET  = 'test-jwt-secret-do-not-use-in-prod';
process.env.DB_PATH     = path.join(__dirname, '../../../../database/test.sqlite');
process.env.PORT        = '3099';
// Disable actual email sending in tests
process.env.GMAIL_USER          = 'test@example.com';
process.env.GMAIL_APP_PASSWORD  = 'fake-app-password';
