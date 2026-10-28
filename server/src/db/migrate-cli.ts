import { createEnv } from '../config/env.js';
import { createDatabase } from './client.js';
import { runMigrations } from './migrations.js';

const env = createEnv();
const handle = createDatabase(env.databasePath);
try {
  runMigrations(handle, env.migrationsDir);
} finally {
  handle.close();
}
