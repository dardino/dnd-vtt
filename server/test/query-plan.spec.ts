import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { createDatabase, type DatabaseHandle } from '../src/db/client.js';
import { runMigrations } from '../src/db/migrations.js';
import { actors, campaigns, scenes } from '../src/db/schema.js';
import { createTestEnv } from './helpers.js';

const PAGE_LIMIT = 50;
const CURSOR = { createdAt: '2026-01-01T00:00:00.000Z', id: '00000000-0000-7000-8000-000000000000' };
const CAMPAIGN_ID = '01900000-0000-7000-8000-000000000001';

interface QueryStatement {
  sql: string;
  params: unknown[];
}

interface QueryPlanRow {
  detail: string;
}

const queryPlan = (handle: DatabaseHandle, statement: QueryStatement): string =>
  (handle.sqlite
    .prepare(`EXPLAIN QUERY PLAN ${statement.sql}`)
    .all(...statement.params) as QueryPlanRow[])
    .map((row) => row.detail)
    .join('\n');

/**
 * Il cursore di paginazione è `(createdAt, id)`: l'indice deve coprire entrambe
 * le colonne nell'ordine dell'ORDER BY, così da evitare il sort (`TEMP B-TREE`).
 */
const expectIndexedPlan = (
  handle: DatabaseHandle,
  statement: QueryStatement,
  indexName: string,
): void => {
  const plan = queryPlan(handle, statement);
  expect(plan).toContain(`USING INDEX ${indexName}`);
  expect(plan).not.toContain('TEMP B-TREE');
};

describe('query plan: paginazione a cursore', () => {
  let handle: DatabaseHandle;

  beforeAll(() => {
    const env = createTestEnv();
    handle = createDatabase(':memory:');
    runMigrations(handle, env.migrationsDir);
  });

  afterAll(() => {
    handle.close();
  });

  it('campagne: il cursore (createdAt, id) usa campaigns_created_at_idx', () => {
    const statement = handle.db
      .select()
      .from(campaigns)
      .where(or(
        lt(campaigns.createdAt, CURSOR.createdAt),
        and(eq(campaigns.createdAt, CURSOR.createdAt), lt(campaigns.id, CURSOR.id)),
      ))
      .orderBy(desc(campaigns.createdAt), desc(campaigns.id))
      .limit(PAGE_LIMIT + 1)
      .toSQL();
    expectIndexedPlan(handle, statement, 'campaigns_created_at_idx');
  });

  it('scene: campaignId + cursore (createdAt, id) usa scenes_campaign_idx', () => {
    const statement = handle.db
      .select()
      .from(scenes)
      .where(and(
        eq(scenes.campaignId, CAMPAIGN_ID),
        or(
          lt(scenes.createdAt, CURSOR.createdAt),
          and(eq(scenes.createdAt, CURSOR.createdAt), lt(scenes.id, CURSOR.id)),
        ),
      ))
      .orderBy(desc(scenes.createdAt), desc(scenes.id))
      .limit(PAGE_LIMIT + 1)
      .toSQL();
    expectIndexedPlan(handle, statement, 'scenes_campaign_idx');
  });

  it('attori: campaignId + cursore (createdAt, id) usa actors_campaign_idx', () => {
    const statement = handle.db
      .select()
      .from(actors)
      .where(and(
        eq(actors.campaignId, CAMPAIGN_ID),
        or(
          lt(actors.createdAt, CURSOR.createdAt),
          and(eq(actors.createdAt, CURSOR.createdAt), lt(actors.id, CURSOR.id)),
        ),
      ))
      .orderBy(desc(actors.createdAt), desc(actors.id))
      .limit(PAGE_LIMIT + 1)
      .toSQL();
    expectIndexedPlan(handle, statement, 'actors_campaign_idx');
  });

  it('attori per kind: kind + cursore (createdAt, id) usa actors_kind_idx', () => {
    const statement = handle.db
      .select()
      .from(actors)
      .where(and(
        eq(actors.kind, 'pc'),
        or(
          lt(actors.createdAt, CURSOR.createdAt),
          and(eq(actors.createdAt, CURSOR.createdAt), lt(actors.id, CURSOR.id)),
        ),
      ))
      .orderBy(desc(actors.createdAt), desc(actors.id))
      .limit(PAGE_LIMIT + 1)
      .toSQL();
    expectIndexedPlan(handle, statement, 'actors_kind_idx');
  });
});
