import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { initializeSchema } from './schema.js';

// Database path - use /data for production (Fly.io volume), local for dev
export const DATA_DIR = process.env.NODE_ENV === 'production' ? '/data' : './data';
export const DB_PATH = path.join(DATA_DIR, 'journal.db');
export const EMPTY_TEXT_PLACEHOLDER = '';
export const EMPTY_COORDINATE_PLACEHOLDER = 0;

// Lazy-initialized database connection
let db: Database.Database | null = null;

export function getDbInternal(): Database.Database {
	if (db) return db;

	// Ensure data directory exists
	if (!fs.existsSync(DATA_DIR)) {
		fs.mkdirSync(DATA_DIR, { recursive: true });
	}

	// Initialize database connection
	db = new Database(DB_PATH);
	db.pragma('journal_mode = WAL');

	// Initialize schema and run migrations
	initializeSchema(db);

	return db;
}

export function getDb(): Database.Database {
	return getDbInternal();
}
