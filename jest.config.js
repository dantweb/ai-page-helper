// jest.config.js
module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/test/**/*.test.js'],
    collectCoverageFrom: ['src/**/*.js'],
    coveragePathIgnorePatterns: ['/node_modules/'],
    // Set environment variables for tests
    testEnvironment: 'node',
    testEnvironmentOptions: {
        env: {
            NODE_ENV: 'test'
        }
    },
};