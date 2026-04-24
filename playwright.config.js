const { defineConfig, devices } = require('@playwright/test');

const TEST_PORT = 5002;
const BASE_URL = `http://127.0.0.1:${TEST_PORT}`;
const TEST_DB = '/tmp/meal_e2e.db';

module.exports = defineConfig({
    testDir: './tests/e2e',
    timeout: 15_000,
    expect: { timeout: 5_000 },
    fullyParallel: false,
    workers: 1,
    reporter: [['list']],
    use: {
        baseURL: BASE_URL,
        trace: 'retain-on-failure',
    },
    projects: [
        {
            name: 'desktop',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'mobile',
            use: { ...devices['iPhone 12'] },
        },
    ],
    webServer: {
        command: `rm -f ${TEST_DB} && FLASK_TEST_MODE=1 PORT=${TEST_PORT} DATABASE_PATH=${TEST_DB} SECRET_KEY=test-secret GOOGLE_CLIENT_ID=test GOOGLE_CLIENT_SECRET=test FACEBOOK_CLIENT_ID=test FACEBOOK_CLIENT_SECRET=test FLASK_ENV=production python app.py`,
        url: BASE_URL,
        reuseExistingServer: !process.env.CI,
        timeout: 20_000,
        stdout: 'pipe',
        stderr: 'pipe',
    },
});
