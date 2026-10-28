import { createEnv } from './config/env.js';
import { buildApp } from './app.js';
import { createDatabase } from './db/client.js';
import { migrationStatus } from './db/migrations.js';

const env = createEnv();
const database = createDatabase(env.databasePath);
const app = buildApp({ env, database, logger: true });

try {
  const status = migrationStatus(database, env.migrationsDir);
  if (status === 'migration_pending') {
    app.log.warn('Migrazioni non applicate: eseguire npm run db:migrate');
  }
} catch (error) {
  app.log.warn({ err: error }, 'Impossibile verificare le migrazioni');
}

const shutdown = async (): Promise<void> => {
  await app.close();
  database.close();
};

process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});

try {
  await app.listen({ port: env.port, host: env.host });
} catch (error) {
  app.log.error(error);
  database.close();
  process.exitCode = 1;
}
