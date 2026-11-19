import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';

process.env['E2E_AUTH_EMAIL'] ??= `e2e-${randomUUID()}@example.test`;
process.env['E2E_AUTH_PASSWORD'] ??= randomUUID();

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4300',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      url: 'http://localhost:3100/api/health',
      env: {
        API_PORT: '3100',
        NODE_ENV: 'test',
        SESSION_SECRET: 'playwright-only-secret-not-for-production',
        ...(process.env['DATABASE_URL_TEST']
          ? { DATABASE_URL: process.env['DATABASE_URL_TEST'] }
          : {}),
      },
    },
    {
      command: 'pnpm ng serve --port 4300 --proxy-config proxy.e2e.conf.json',
      url: 'http://localhost:4300',
      timeout: 120_000,
    },
  ],
});
