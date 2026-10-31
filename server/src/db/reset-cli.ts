import { existsSync, rmSync } from 'node:fs';
import { createEnv } from '../config/env.js';
import { createDatabase } from './client.js';
import { runMigrations } from './migrations.js';
import { seedDemo } from './seed.js';

const env = createEnv();
if (env.nodeEnv === 'production' && !process.argv.includes('--force')) {
  throw new Error('db:reset rifiutato in produzione. Usa --force solo se sai cosa stai facendo.');
}

for (const suffix of ['', '-wal', '-shm']) {
  const path = `${env.databasePath}${suffix}`;
  if (existsSync(path)) {
    rmSync(path, { force: true });
  }
}
if (existsSync(env.uploadDir)) {
  rmSync(env.uploadDir, { recursive: true, force: true });
}

const handle = createDatabase(env.databasePath);
try {
  runMigrations(handle, env.migrationsDir);
  const result = await seedDemo(env, handle);
  process.stdout.write(result === null
    ? 'Database resettato, nessun seed creato.\n'
    : `Database resettato. Campagna ${result.campaignId}, mappa ${result.mapId}, scena ${result.sceneId}.\n`);
} finally {
  handle.close();
}
