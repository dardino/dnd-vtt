import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { DatabaseHandle } from './client.js';

interface Journal {
  entries: { tag: string }[];
}

export const readJournal = (migrationsFolder: string): Journal => {
  const raw = readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8');
  return JSON.parse(raw) as Journal;
};

export const runMigrations = (handle: DatabaseHandle, migrationsFolder: string): void => {
  migrate(handle.db, { migrationsFolder });
};

/**
 * Lo stato è "pending" se il database non esiste ancora, se manca la tabella
 * delle migrazioni o se il numero di migrazioni applicate è diverso da quelle
 * committate. Il server non esegue mai DDL all'avvio.
 */
export const migrationStatus = (
  handle: DatabaseHandle,
  migrationsFolder: string,
): 'ok' | 'migration_pending' => {
  const journal = readJournal(migrationsFolder);
  const table = handle.sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = '__drizzle_migrations'")
    .get() as { name: string } | undefined;
  if (table === undefined) {
    return 'migration_pending';
  }
  const row = handle.sqlite
    .prepare('SELECT count(*) AS count FROM __drizzle_migrations')
    .get() as { count: number };
  return row.count === journal.entries.length ? 'ok' : 'migration_pending';
};
