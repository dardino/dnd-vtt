import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { schema } from './schema.js';

export type AppDatabase = BetterSQLite3Database<typeof schema>;
export type Transaction = Parameters<Parameters<AppDatabase['transaction']>[0]>[0];
export type DbExecutor = AppDatabase | Transaction;
export type SqliteClient = Database.Database;

export interface DatabaseHandle {
  db: AppDatabase;
  sqlite: SqliteClient;
  close: () => void;
}

export const createDatabase = (path: string): DatabaseHandle => {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  return {
    db: drizzle(sqlite, { schema }),
    sqlite,
    close: () => {
      sqlite.close();
    },
  };
};
