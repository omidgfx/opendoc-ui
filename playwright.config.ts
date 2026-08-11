import {defineConfig, devices} from '@playwright/test';

export default defineConfig({
    testDir: './tests/browser',
    timeout: 30_000,
    expect: {timeout: 8_000},
    fullyParallel: false,
    retries: 0,
    reporter: [['list']],
    use: {
        baseURL: 'http://127.0.0.1:3000',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    webServer: {
        command: 'npm run dev',
        url: 'http://127.0.0.1:3000',
        reuseExistingServer: true,
        timeout: 120_000,
        env: {...process.env, VITE_LOAD_FROM_URL: 'true', VITE_SPEC_DOWNLOADER: ''},
    },
    projects: [{name: 'chromium', use: {...devices['Desktop Chrome']}}],
});
