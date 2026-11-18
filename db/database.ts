import * as SQLite from 'expo-sqlite';
import { runMigrations } from './migrations';

let db: SQLite.SQLiteDatabase | null = null;

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    db = SQLite.openDatabaseSync('hvac_maintenance.db');
  }
  return db;
}

// Not async: every step here is synchronous, and an async wrapper hid a failure from the caller's try/catch.
export function initDatabase(): void {
  const database = getDatabase();
  database.execSync('PRAGMA journal_mode = WAL;');
  database.execSync('PRAGMA foreign_keys = ON;');
  runMigrations(database);
}
