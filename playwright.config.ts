import { defineConfig } from '@playwright/test';
const productionUrl = process.env.ORIL_BASE_URL;
export default defineConfig({ testDir: './tests', use: { baseURL: productionUrl || 'http://127.0.0.1:3100', channel: 'chrome' }, webServer: productionUrl ? undefined : { command: 'npm.cmd run dev -- -p 3100', url: 'http://127.0.0.1:3100', reuseExistingServer: false, timeout: 120000 } });
