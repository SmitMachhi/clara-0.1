import Database from 'better-sqlite3';
import { generateSalt, deriveKey, encryptJSON, decryptJSON } from './crypto.js';
import path from 'path';
import fs from 'fs';

// Database path - use /data for production (Fly.io volume), local for dev
const DATA_DIR = process.env.NODE_ENV === 'production' ? '/data' : './data';
const DB_PATH = path.join(DATA_DIR, 'journal.db');

// Lazy-initialized database connection
let db: Database.Database | null = null;

function getDb(): Database.Database {
	if (db) return db;
	
	// Ensure data directory exists
	if (!fs.existsSync(DATA_DIR)) {
		fs.mkdirSync(DATA_DIR, { recursive: true });
	}
	
	// Initialize database connection
	db = new Database(DB_PATH);
	db.pragma('journal_mode = WAL');
	
	// Initialize schema
	db.exec(`
		CREATE TABLE IF NOT EXISTS config (
			key TEXT PRIMARY KEY,
			value TEXT
		);

		CREATE TABLE IF NOT EXISTS entries (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			date TEXT UNIQUE NOT NULL,
			timestamp TEXT NOT NULL,
			location_id INTEGER,
			captured_lat REAL,
			captured_lng REAL,
			encrypted_data BLOB NOT NULL,
			created_at TEXT DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS locations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			lat REAL NOT NULL,
			lng REAL NOT NULL,
			address TEXT
		);

		CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);
	`);
	
	// Migration: Add new columns to existing tables if they don't exist
	const tableInfo = db.prepare("PRAGMA table_info(locations)").all() as { name: string }[];
	const locationColumns = tableInfo.map(col => col.name);
	
	if (!locationColumns.includes('lat')) {
		db.exec(`
			ALTER TABLE locations ADD COLUMN lat REAL;
			ALTER TABLE locations ADD COLUMN lng REAL;
			ALTER TABLE locations ADD COLUMN address TEXT;
		`);
	}
	
	const entriesInfo = db.prepare("PRAGMA table_info(entries)").all() as { name: string }[];
	const entriesColumns = entriesInfo.map(col => col.name);
	
	if (!entriesColumns.includes('captured_lat')) {
		db.exec(`
			ALTER TABLE entries ADD COLUMN captured_lat REAL;
			ALTER TABLE entries ADD COLUMN captured_lng REAL;
		`);
	}
	
	return db;
}

// The hardcoded password
const PASSWORD = 'ismathrelatedtoscience';

/**
 * Get or create the salt for key derivation
 */
export function getSalt(): Buffer {
	const database = getDb();
	const row = database.prepare('SELECT value FROM config WHERE key = ?').get('salt') as { value: string } | undefined;
	
	if (row) {
		return Buffer.from(row.value, 'hex');
	}
	
	// Generate and store new salt
	const salt = generateSalt();
	database.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('salt', salt.toString('hex'));
	return salt;
}

/**
 * Get the encryption key derived from password
 */
export function getEncryptionKey(): Buffer {
	const salt = getSalt();
	return deriveKey(PASSWORD, salt);
}

/**
 * Verify password
 */
export function verifyPassword(input: string): boolean {
	return input === PASSWORD;
}

// Journal entry types
export interface JournalData {
	whoAmIDoingThisFor: string;
	whatMakingAnxious: string;
	whatAvoiding: string;
	whyAvoiding: string;
	fearUnderneath: string;
	howLikely: string;
	howBad10Days: string;
	howBad10Months: string;
	howBad10Years: string;
	realFear: string;
	evidenceFearNotTrue: string;
	kimTest: string;
	whatDoILose: string;
	upsideIfAct: string;
	whatConsumeInsteadProduce: string;
	egoWillTell: string;
	exactDistraction: string;
	triggerTimeSituation: string;
	temptedWhenWillBecause: string;
	wasteToday: string;
	track: string;
	nonNeg1What: string;
	nonNeg1When: string;
	nonNeg2What: string;
	nonNeg2When: string;
	nonNeg3What: string;
	nonNeg3When: string;
	trapRule: string;
}

export interface Entry {
	id: number;
	date: string;
	timestamp: string;
	location_id: number | null;
	location_name?: string;
	captured_lat: number | null;
	captured_lng: number | null;
	created_at: string;
}

export interface EntryWithData extends Entry {
	data: JournalData;
}

/**
 * Save a new journal entry
 */
export function saveEntry(
	date: string, 
	timestamp: string, 
	locationId: number | null, 
	data: JournalData,
	capturedLat?: number | null,
	capturedLng?: number | null
): number {
	const database = getDb();
	const key = getEncryptionKey();
	const encryptedData = encryptJSON(data, key);
	
	const result = database.prepare(`
		INSERT INTO entries (date, timestamp, location_id, captured_lat, captured_lng, encrypted_data)
		VALUES (?, ?, ?, ?, ?, ?)
	`).run(date, timestamp, locationId, capturedLat ?? null, capturedLng ?? null, encryptedData);
	
	return result.lastInsertRowid as number;
}

/**
 * Get all entries (without decrypted data)
 */
export function getAllEntries(): Entry[] {
	const database = getDb();
	return database.prepare(`
		SELECT e.id, e.date, e.timestamp, e.location_id, e.captured_lat, e.captured_lng, e.created_at, l.name as location_name
		FROM entries e
		LEFT JOIN locations l ON e.location_id = l.id
		ORDER BY e.date DESC
	`).all() as Entry[];
}

/**
 * Get an entry by date with decrypted data
 */
export function getEntryByDate(date: string): EntryWithData | null {
	const database = getDb();
	const row = database.prepare(`
		SELECT e.id, e.date, e.timestamp, e.location_id, e.captured_lat, e.captured_lng, e.encrypted_data, e.created_at, l.name as location_name
		FROM entries e
		LEFT JOIN locations l ON e.location_id = l.id
		WHERE e.date = ?
	`).get(date) as (Entry & { encrypted_data: Buffer }) | undefined;
	
	if (!row) return null;
	
	const key = getEncryptionKey();
	const data = decryptJSON<JournalData>(row.encrypted_data, key);
	
	return {
		id: row.id,
		date: row.date,
		timestamp: row.timestamp,
		location_id: row.location_id,
		location_name: row.location_name,
		captured_lat: row.captured_lat,
		captured_lng: row.captured_lng,
		created_at: row.created_at,
		data
	};
}

/**
 * Check if entry exists for date
 */
export function hasEntryForDate(date: string): boolean {
	const database = getDb();
	const row = database.prepare('SELECT 1 FROM entries WHERE date = ?').get(date);
	return !!row;
}

/**
 * Get all dates that have entries (for the tracker)
 */
export function getEntryDates(): string[] {
	const database = getDb();
	const rows = database.prepare('SELECT date FROM entries ORDER BY date').all() as { date: string }[];
	return rows.map(r => r.date);
}

// Location functions
export interface Location {
	id: number;
	name: string;
	lat: number;
	lng: number;
	address: string | null;
}

/**
 * Get all locations
 */
export function getLocations(): Location[] {
	const database = getDb();
	return database.prepare('SELECT id, name, lat, lng, address FROM locations ORDER BY name').all() as Location[];
}

/**
 * Add a new location
 */
export function addLocation(name: string, lat: number, lng: number, address?: string): number {
	const database = getDb();
	const result = database.prepare('INSERT INTO locations (name, lat, lng, address) VALUES (?, ?, ?, ?)').run(name, lat, lng, address || null);
	return result.lastInsertRowid as number;
}

/**
 * Delete a location by ID
 */
export function deleteLocation(id: number): boolean {
	const database = getDb();
	const result = database.prepare('DELETE FROM locations WHERE id = ?').run(id);
	return result.changes > 0;
}

/**
 * Get location by ID
 */
export function getLocationById(id: number): Location | null {
	const database = getDb();
	return database.prepare('SELECT id, name, lat, lng, address FROM locations WHERE id = ?').get(id) as Location | null;
}

/**
 * Check if a location with the given name already exists
 */
export function locationNameExists(name: string): boolean {
	const database = getDb();
	const row = database.prepare('SELECT 1 FROM locations WHERE LOWER(TRIM(name)) = LOWER(TRIM(?))').get(name);
	return !!row;
}
