import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { initializeDatabase } from './schema';

const dbPath = path.join(process.cwd(), 'data', 'sqlite.db');

const globalForDb = globalThis as unknown as { db: Database.Database };

function createDb(): Database.Database {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath, { verbose: undefined });
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 10000');
  db.pragma('foreign_keys = ON');

  initializeDatabase(db);
  return db;
}

export function getDb(): Database.Database {
  if (globalForDb.db) return globalForDb.db;
  const db = createDb();
  globalForDb.db = db;
  return db;
}

export const db = getDb();
