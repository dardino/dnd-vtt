import type { ProgramState } from '@dnd-vtt/shared';
import { and, eq } from 'drizzle-orm';
import type { DbExecutor } from './client.js';
import { programs } from './schema.js';

export interface ProgramRow {
  state: ProgramState;
  version: number;
}

export const getProgramRow = (db: DbExecutor, campaignId: string): ProgramRow | null => {
  const row = db.select().from(programs).where(eq(programs.campaignId, campaignId)).get();
  return row === undefined
    ? null
    : { state: JSON.parse(row.state) as ProgramState, version: row.programVersion };
};

export const insertProgram = (db: DbExecutor, campaignId: string, state: ProgramState): ProgramRow => {
  const now = new Date().toISOString();
  const row = {
    campaignId,
    state: JSON.stringify(state),
    programVersion: 1,
    updatedAt: now,
  };
  db.insert(programs).values(row).run();
  return { state, version: 1 };
};

export const updateProgram = (
  db: DbExecutor,
  campaignId: string,
  state: ProgramState,
  expectedVersion: number,
): ProgramRow | null => {
  const result = db.update(programs)
    .set({
      state: JSON.stringify(state),
      programVersion: expectedVersion + 1,
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(programs.campaignId, campaignId), eq(programs.programVersion, expectedVersion)))
    .run();
  if (result.changes === 0) {
    return null;
  }
  return { state, version: expectedVersion + 1 };
};
