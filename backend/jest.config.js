module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/src/__tests__/**/*.test.js'],
    setupFiles: ['./src/__tests__/helpers/env.js'],
    testTimeout: 30000,
    maxWorkers: 1,
    verbose: true,
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/scripts/**',
        '!src/__tests__/**',
        '!src/services/rosService.js'
    ]
};
