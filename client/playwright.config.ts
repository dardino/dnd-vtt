import { defineConfig } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const dataDir = join(root, '.e2e', new Date().toISOString().replaceAll(/[:.]/g, '-'));
process.env['E2E_DATA_DIR'] = dataDir;

const serverEnv = {
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PORT: '3100',
  PUBLIC_URL: 'http://127.0.0.1:3100',
  ALLOWED_ORIGINS: 'http://127.0.0.1:3100',
  DM_PASSWORD: '',
  SESSION_SECRET: '',
  LOG_LEVEL: 'error',
  DATABASE_PATH: join(dataDir, 'dnd.db'),
  UPLOAD_DIR: join(dataDir, 'uploads'),
  CLIENT_DIST: join(root, 'client', 'dist', 'browser'),
};

export default defineConfig({
  testDir: './e2e',
  globalSetup: join(here, 'e2e', 'global-setup.ts'),
  fullyParallel: false,
  // 4 worker saturano i canvas Konva e rendono instabile la regia (phase-7);
  // 3 restano ~2,3x più veloci della suite seriale.
  workers: 3,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // Il primo avvio verifica il DB vuoto: deve restare isolato e seriale.
      name: 'setup',
      testMatch: /phase-2\.spec\.ts/,
    },
    {
      name: 'chromium',
      testIgnore: /phase-2\.spec\.ts/,
      dependencies: ['setup'],
    },
  ],
  webServer: {
    command: `"${process.execPath}" ../server/dist/index.js`,
    url: 'http://127.0.0.1:3100/api/v1/health',
    reuseExistingServer: false,
    timeout: 120_000,
    env: serverEnv,
  },
});
