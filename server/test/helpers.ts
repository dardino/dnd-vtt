import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { createEnv, type AppEnv } from '../src/config/env.js';
import { createDatabase, type DatabaseHandle } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrations.js';

export interface TestApp {
  app: FastifyInstance;
  database: DatabaseHandle;
  env: AppEnv;
}

export const createTestEnv = (raw: NodeJS.ProcessEnv = {}): AppEnv => createEnv({
  NODE_ENV: 'test',
  HOST: '127.0.0.1',
  PUBLIC_URL: 'http://localhost:3000',
  ALLOWED_ORIGINS: 'http://localhost:4200,http://localhost:3000',
  DM_PASSWORD: 'correct-horse-battery',
  DATABASE_PATH: ':memory:',
  UPLOAD_DIR: mkdtempSync(join(tmpdir(), 'dnd-vtt-uploads-')),
  CLIENT_DIST: join(process.cwd(), 'test', 'missing-client-dist'),
  LOG_LEVEL: 'silent',
  ...raw,
});

export const createTestApp = async (raw: NodeJS.ProcessEnv = {}): Promise<TestApp> => {
  const env = createTestEnv(raw);
  const database = createDatabase(':memory:');
  runMigrations(database, env.migrationsDir);
  const app = buildApp({ env, database });
  await app.ready();
  return { app, database, env };
};

export const closeTestApp = async (testApp: TestApp): Promise<void> => {
  await testApp.app.close();
  testApp.database.close();
};
