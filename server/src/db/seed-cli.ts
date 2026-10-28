import { createEnv } from '../config/env.js';
import { createDatabase } from './client.js';
import { insertCampaign } from './campaigns.repository.js';
import { insertScene } from './scenes.repository.js';
import { insertActor } from './actors.repository.js';
import { runMigrations } from './migrations.js';
import { campaigns } from './schema.js';

const env = createEnv();
const handle = createDatabase(env.databasePath);
try {
  runMigrations(handle, env.migrationsDir);
  const existing = handle.db.select().from(campaigns).limit(1).get();
  if (existing === undefined) {
    const campaign = insertCampaign(handle.db, {
      name: 'Campagna di prova',
      description: 'Seed locale per lo sviluppo della console.',
      fogDefault: 'hidden',
      advancementMode: 'milestone',
    });
    insertScene(handle.db, campaign.id, { name: 'Ingresso', widthPx: 1920, heightPx: 1080 });
    insertActor(handle.db, {
      campaignId: campaign.id,
      kind: 'monster',
      name: 'Goblin',
      xp: 0,
      statblock: {
        kind: 'monster',
        size: 'medium',
        abilities: { str: 10, dex: 14, con: 12, int: 8, wis: 10, cha: 8 },
        hp: { current: 7, max: 7, temp: 0 },
        speed: { walk: 30 },
        senses: { darkvision: 60 },
        languages: ['common', 'goblin'],
        conditions: [],
        creatureType: 'goblinoid',
        cr: '1/4',
        tags: [],
        ac: 13,
        damageResistances: [],
        damageImmunities: [],
        damageVulnerabilities: [],
        conditionImmunities: [],
        traits: [],
        actions: [],
        reactions: [],
      },
    });
  }
} finally {
  handle.close();
}
