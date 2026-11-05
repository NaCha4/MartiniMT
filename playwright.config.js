import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5174', viewport: { width: 1440, height: 960 }, screenshot: 'only-on-failure', trace: 'retain-on-failure', launchOptions: { channel: 'chrome' } },
  webServer: { command: 'npm run dev:emulators -- --host 127.0.0.1 --port 5174', url: 'http://127.0.0.1:5174', reuseExistingServer: !process.env.CI, timeout: 30000 },
});
