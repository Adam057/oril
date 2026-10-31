import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests', use: { baseURL: 'http://127.0.0.1:3100', channel: 'chrome' }, webServer: { command: 'npm.cmd run dev -- -p 3100', url: 'http://127.0.0.1:3100', reuseExistingServer: false, timeout: 120000 } });
