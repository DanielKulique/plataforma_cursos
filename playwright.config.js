'use strict';

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/e2e',
    fullyParallel: false,
    workers: 1,
    forbidOnly: Boolean(process.env.CI),
    retries: process.env.CI ? 1 : 0,
    timeout: 30_000,
    expect: { timeout: 7000 },
    outputDir: 'test-results',
    reporter: [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }]
    ],
    use: {
        baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3400',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        video: 'off',
        actionTimeout: 7000,
        navigationTimeout: 12_000
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        { name: 'firefox-critical', grep: /@smoke/, use: { ...devices['Desktop Firefox'] } },
        { name: 'webkit-critical', grep: /@smoke/, use: { ...devices['Desktop Safari'] } }
    ]
});
