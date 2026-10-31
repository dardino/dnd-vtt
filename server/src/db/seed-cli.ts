import { createEnv } from '../config/env.js';
import { createDatabase } from './client.js';
import { runMigrations } from './migrations.js';
import { seedDemo } from './seed.js';

const env = createEnv();
const handle = createDatabase(env.databasePath);
try {
  runMigrations(handle, env.migrationsDir);
  const result = await seedDemo(env, handle);
  if (result === null) {
    process.stdout.write('Seed saltato: esiste già una campagna.\n');
  } else {
    process.stdout.write(
      `Seed creato: campagna ${result.campaignId}, mappa ${result.mapId}, scena ${result.sceneId}.\n`,
    );
  }
} finally {
  handle.close();
}
