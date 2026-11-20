import { defineConfig, devices } from '@playwright/test';
import { randomUUID } from 'node:crypto';

process.env['E2E_AUTH_EMAIL'] ??= 'e2e-partner-1@example.test';
process.env['E2E_AUTH_PASSWORD'] ??= randomUUID();

// Puertos de las pruebas: configurables para correr varios worktrees a la vez (3100 y 4300 por defecto).
const apiPort = process.env['E2E_API_PORT'] ?? '3100';
const webPort = process.env['E2E_WEB_PORT'] ?? '4300';
process.env['E2E_API_PORT'] = apiPort;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/setup.ts',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop',
      testIgnore: '**/partners.spec.ts',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    // Pixel 7 (táctil, móvil) con el ancho de referencia de 390 px de CLAUDE.md.
    {
      name: 'mobile',
      testIgnore: '**/partners.spec.ts',
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'partners-desktop',
      testMatch: '**/partners.spec.ts',
      dependencies: ['desktop', 'mobile'],
      fullyParallel: false,
      workers: 1,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'partners-mobile',
      testMatch: '**/partners.spec.ts',
      dependencies: ['partners-desktop'],
      fullyParallel: false,
      workers: 1,
      use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } },
    },
  ],
  webServer: [
    {
      command: 'node ../api/dist/main.js',
      url: `http://localhost:${apiPort}/api/health`,
      env: {
        API_PORT: apiPort,
        NODE_ENV: 'test',
        SESSION_SECRET: 'playwright-only-secret-not-for-production',
        ...(process.env['DATABASE_URL_TEST']
          ? { DATABASE_URL: process.env['DATABASE_URL_TEST'] }
          : {}),
      },
    },
    {
      command: `pnpm ng serve --port ${webPort} --proxy-config proxy.e2e.conf.mjs`,
      url: `http://localhost:${webPort}`,
      timeout: 120_000,
    },
  ],
});
