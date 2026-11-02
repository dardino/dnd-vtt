import { describe, expect, it } from 'vitest';
import {
  createCampaignSchema,
  createDefaultSceneState,
  type PcStatblock,
  type SceneState,
  type TokenState,
} from '@dnd-vtt/shared';
import { eq } from 'drizzle-orm';
import { v7 as uuidv7 } from 'uuid';
import { createPc } from '../src/actors/pc-service.js';
import { RollStats } from '../src/actors/roll-stats.js';
import { updateTokensForActor } from '../src/actors/token-sync.js';
import { insertCampaign } from '../src/db/campaigns.repository.js';
import { createDatabase, type DatabaseHandle, type Transaction } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrations.js';
import { insertScene } from '../src/db/scenes.repository.js';
import { actionLog, scenes } from '../src/db/schema.js';
import { fighterBuild } from './factories.js';
import { createTestEnv } from './helpers.js';

interface Fixture {
  database: DatabaseHandle;
  campaignId: string;
  actorId: string;
  statblock: PcStatblock;
  next: PcStatblock;
}

const createFixture = (): Fixture => {
  const database = createDatabase(':memory:');
  runMigrations(database, createTestEnv().migrationsDir);
  const campaign = insertCampaign(database.db, createCampaignSchema.parse({ name: 'Sync token' }));
  const rolls = new RollStats();
  try {
    const actor = createPc(
      database.db,
      campaign.id,
      { name: 'Tank', build: fighterBuild() },
      rolls,
    );
    if (actor.statblock.kind !== 'pc') {
      throw new Error('atteso uno statblock pc');
    }
    const statblock = actor.statblock;
    return {
      database,
      campaignId: campaign.id,
      actorId: actor.id,
      statblock,
      next: {
        ...statblock,
        hp: { current: statblock.hp.max - 5, max: statblock.hp.max, temp: 0 },
        conditions: [{ name: 'poisoned' }],
      },
    };
  } finally {
    rolls.dispose();
  }
};

const tokenFor = (actorId: string, hp: TokenState['hp']): TokenState => ({
  id: uuidv7(),
  actorId,
  label: 'Token',
  x: 1,
  y: 1,
  size: 1,
  rotation: 0,
  elevation: 0,
  hp,
  conditions: [],
  visible: true,
});

const addScene = (
  database: DatabaseHandle,
  campaignId: string,
  actorId: string,
  hp: TokenState['hp'],
  name: string,
): string => {
  const state: SceneState = { ...createDefaultSceneState(), tokens: [tokenFor(actorId, hp)] };
  return insertScene(database.db, campaignId, { name, widthPx: 100, heightPx: 100 }, state).id;
};

const readToken = (state: string): TokenState => {
  const parsed = JSON.parse(state) as SceneState;
  const [token] = parsed.tokens;
  if (token === undefined) {
    throw new Error('token mancante');
  }
  return token;
};

const disableJson1 = (tx: Transaction): Transaction => {
  let firstAll = true;
  return new Proxy(tx, {
    get(target, property, receiver) {
      if (property === 'all') {
        return (query: unknown): unknown => {
          if (firstAll) {
            firstAll = false;
            throw new Error('no such table: json_each');
          }
          return target.all(query as Parameters<Transaction['all']>[0]);
        };
      }
      const value = Reflect.get(target, property, receiver) as unknown;
      return typeof value === 'function'
        ? (value as (...args: unknown[]) => unknown).bind(target)
        : value;
    },
  });
};

describe('updateTokensForActor', () => {
  it('parsa solo le scene che contengono il token dell\'attore', () => {
    const { database, campaignId, actorId, statblock, next } = createFixture();
    try {
      const matching = new Set<string>();
      const malformed = new Set<string>();
      for (let index = 0; index < 50; index += 1) {
        if (index === 7 || index === 23 || index === 49) {
          matching.add(addScene(database, campaignId, actorId, statblock.hp, `Scena ${index}`));
          continue;
        }
        // 10 scene con JSON corrotto: se venissero parsate la sync fallirebbe.
        const otherActor = index >= 40 ? actorId : uuidv7();
        const sceneId = addScene(database, campaignId, otherActor, statblock.hp, `Scena ${index}`);
        if (index >= 40) {
          database.db.update(scenes).set({ state: '{"broken' }).where(eq(scenes.id, sceneId)).run();
          malformed.add(sceneId);
        }
      }

      database.db.transaction((tx) => {
        updateTokensForActor(tx, campaignId, actorId, next, 'dm');
      });

      const rows = database.db.select().from(scenes).where(eq(scenes.campaignId, campaignId)).all();
      expect(rows).toHaveLength(50);
      for (const row of rows) {
        if (matching.has(row.id)) {
          const token = readToken(row.state);
          expect(token.hp).toEqual(next.hp);
          expect(token.conditions).toEqual(next.conditions);
        } else if (malformed.has(row.id)) {
          expect(row.state).toBe('{"broken');
        } else {
          expect(readToken(row.state).hp).toEqual(statblock.hp);
        }
      }

      const actions = database.db
        .select()
        .from(actionLog)
        .where(eq(actionLog.campaignId, campaignId))
        .all();
      expect(actions).toHaveLength(3);
      for (const action of actions) {
        expect(action).toMatchObject({
          type: 'token.update',
          clientId: 'token-sync',
          actorId,
          origin: 'dm',
        });
      }
    } finally {
      database.close();
    }
  });

  it('usa il fallback LIKE se JSON1 non è disponibile', () => {
    const { database, campaignId, actorId, statblock, next } = createFixture();
    try {
      const matching = new Set([7, 23].map((index) => (
        addScene(database, campaignId, actorId, statblock.hp, `Scena ${index}`)
      )));
      const untouched = new Set([
        addScene(database, campaignId, uuidv7(), statblock.hp, 'Altro attore'),
        addScene(database, campaignId, actorId, statblock.hp, 'JSON rotto'),
      ]);
      const broken = [...untouched][1];
      if (broken === undefined) {
        throw new Error('scena mancante');
      }
      database.db.update(scenes).set({ state: '{"broken' }).where(eq(scenes.id, broken)).run();

      database.db.transaction((tx) => {
        updateTokensForActor(disableJson1(tx), campaignId, actorId, next, 'dm');
      });

      const rows = database.db.select().from(scenes).where(eq(scenes.campaignId, campaignId)).all();
      expect(rows).toHaveLength(4);
      for (const row of rows) {
        if (matching.has(row.id)) {
          expect(readToken(row.state).hp).toEqual(next.hp);
        } else if (row.id === broken) {
          expect(row.state).toBe('{"broken');
        } else {
          expect(readToken(row.state).hp).toEqual(statblock.hp);
        }
      }
      expect(
        database.db.select().from(actionLog).where(eq(actionLog.campaignId, campaignId)).all(),
      ).toHaveLength(2);
    } finally {
      database.close();
    }
  });
});
