import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { decrypt, encrypt } from '$lib/server/crypto.js';
import { parseTemplateSource, serializeDefaultTemplate } from './template';
import type { TemplateModel } from './template';

// Database path - use /data for production (Fly.io volume), local for dev
const DATA_DIR = process.env.NODE_ENV === 'production' ? '/data' : './data';
const DB_PATH = path.join(DATA_DIR, 'journal.db');

// Lazy-initialized database connection
let db: Database.Database | null = null;

function getDbInternal(): Database.Database {
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
			template_id INTEGER,
			encrypted_data BLOB NOT NULL,
			created_at TEXT DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS templates (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			created_at TEXT DEFAULT (datetime('now')),
			source_text_encrypted BLOB NOT NULL,
			parsed_json TEXT NOT NULL
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
	const tableInfo = db.prepare('PRAGMA table_info(locations)').all() as { name: string }[];
	const locationColumns = tableInfo.map(col => col.name);
	
	if (!locationColumns.includes('lat')) {
		db.exec(`
			ALTER TABLE locations ADD COLUMN lat REAL;
			ALTER TABLE locations ADD COLUMN lng REAL;
			ALTER TABLE locations ADD COLUMN address TEXT;
		`);
	}
	
	const entriesInfo = db.prepare('PRAGMA table_info(entries)').all() as { name: string }[];
	const entriesColumns = entriesInfo.map(col => col.name);
	
	if (!entriesColumns.includes('captured_lat')) {
		db.exec(`
			ALTER TABLE entries ADD COLUMN captured_lat REAL;
			ALTER TABLE entries ADD COLUMN captured_lng REAL;
		`);
	}

	if (!entriesColumns.includes('template_id')) {
		db.exec(`
			ALTER TABLE entries ADD COLUMN template_id INTEGER;
		`);
	}

	const activeTemplateId = ensureActiveTemplate();
	backfillEntryTemplateIds(activeTemplateId);
	
	return db;
}

// Journal entry types
export interface JournalData {
	whoAmIDoingThisFor: string;
	whatMakingAnxious: string;
	whatAvoiding: string;
	whyAvoiding: string;
	fearUnderneath: string;
	evidenceFearNotTrue: string;
	upsideIfAct: string;
	consumeInsteadProduce: string;
	exactDistraction: string;
	wasteToday: string;
	commitment1: string;
	commitment2: string;
	commitment3: string;
	// Legacy fields (for backward compatibility with old entries)
	howLikely: string;
	howBad10Days: string;
	howBad10Months: string;
	howBad10Years: string;
	realFear: string;
	kimTest: string;
	whatDoILose: string;
	whatConsumeInsteadProduce: string;
	egoWillTell: string;
	triggerTimeSituation: string;
	temptedWhenWillBecause: string;
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
	template_id: number | null;
	created_at: string;
}

export interface EntryWithData extends Entry {
	data: JournalData;
}

/**
 * Save a new journal entry with client-encrypted data
 */
export function saveEntry(
	date: string, 
	timestamp: string, 
	locationId: number | null, 
	encryptedData: string,
	templateId: number | null,
	capturedLat?: number | null,
	capturedLng?: number | null
): number {
	const database = getDb();
	const dataBuffer = Buffer.from(encryptedData, 'utf8');
	
	const result = database.prepare(`
		INSERT INTO entries (date, timestamp, location_id, captured_lat, captured_lng, template_id, encrypted_data)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`).run(date, timestamp, locationId, capturedLat ?? null, capturedLng ?? null, templateId, dataBuffer);
	
	return result.lastInsertRowid as number;
}

/**
 * Update an existing journal entry with client-encrypted data
 */
export function updateEntry(
	date: string, 
	timestamp: string, 
	locationId: number | null, 
	encryptedData: string,
	templateId: number | null,
	capturedLat?: number | null,
	capturedLng?: number | null
): boolean {
	const database = getDb();
	const dataBuffer = Buffer.from(encryptedData, 'utf8');
	
	const result = database.prepare(`
		UPDATE entries 
		SET timestamp = ?, location_id = ?, captured_lat = ?, captured_lng = ?, template_id = ?, encrypted_data = ?
		WHERE date = ?
	`).run(timestamp, locationId, capturedLat ?? null, capturedLng ?? null, templateId, dataBuffer, date);
	
	return result.changes > 0;
}

/**
 * Get all entries (without decrypted data)
 */
export function getAllEntries(): Entry[] {
	const database = getDb();
	return database.prepare(`
		SELECT e.id, e.date, e.timestamp, e.location_id, e.captured_lat, e.captured_lng, e.template_id, e.created_at, l.name as location_name
		FROM entries e
		LEFT JOIN locations l ON e.location_id = l.id
		ORDER BY e.date DESC
	`).all() as Entry[];
}

/**
 * Get an entry by date with encrypted data (client will decrypt)
 */
export function getEntryByDate(date: string): (EntryWithData & { rawData: Buffer }) | null {
	const database = getDb();
	const row = database.prepare(`
		SELECT e.id, e.date, e.timestamp, e.location_id, e.captured_lat, e.captured_lng, e.template_id, e.encrypted_data, e.created_at, l.name as location_name
		FROM entries e
		LEFT JOIN locations l ON e.location_id = l.id
		WHERE e.date = ?
	`).get(date) as (Entry & { encrypted_data: Buffer }) | undefined;

	if (!row) return null;

	return {
		id: row.id,
		date: row.date,
		timestamp: row.timestamp,
		location_id: row.location_id,
		location_name: row.location_name,
		captured_lat: row.captured_lat,
		rawData: row.encrypted_data,
		captured_lng: row.captured_lng,
		template_id: row.template_id,
		created_at: row.created_at,
		data: {} as any
	};
}

/**
 * Get database instance
 */
export function getDb(): Database.Database {
	return getDbInternal();
}

export function createTemplateVersion(sourceText: string, parsed: TemplateModel): number {
	const database = getDb();
	const encrypted = encrypt(sourceText);
	const encryptedBuffer = Buffer.from(encrypted, 'utf8');
	const parsedJson = JSON.stringify(parsed);
	const result = database.prepare(`
		INSERT INTO templates (source_text_encrypted, parsed_json)
		VALUES (?, ?)
	`).run(encryptedBuffer, parsedJson);
	return result.lastInsertRowid as number;
}

export function setActiveTemplate(id: number): void {
	const database = getDb();
	database.prepare(`
		INSERT INTO config (key, value)
		VALUES ('active_template_id', ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value
	`).run(id.toString());
}

export function getTemplateById(id: number): { id: number; sourceText: string; parsed: TemplateModel } | null {
	const database = getDb();
	const row = database.prepare(`
		SELECT id, source_text_encrypted, parsed_json
		FROM templates
		WHERE id = ?
	`).get(id) as { id: number; source_text_encrypted: Buffer; parsed_json: string } | undefined;

	if (!row) return null;

	const decrypted = decrypt(row.source_text_encrypted.toString('utf8'));
	return {
		id: row.id,
		sourceText: decrypted,
		parsed: JSON.parse(row.parsed_json) as TemplateModel
	};
}

export function getActiveTemplate(): { id: number; sourceText: string; parsed: TemplateModel } | null {
	const database = getDb();
	const row = database.prepare(`
		SELECT value
		FROM config
		WHERE key = 'active_template_id'
	`).get() as { value: string } | undefined;

	if (!row?.value) return null;
	const templateId = Number(row.value);
	if (!Number.isFinite(templateId)) return null;
	return getTemplateById(templateId);
}

export function ensureActiveTemplate(): number {
	const database = getDb();
	const existing = getActiveTemplate();
	if (existing) return existing.id;

	const templateCount = database.prepare('SELECT COUNT(1) as count FROM templates').get() as { count: number };
	if (templateCount.count > 0) {
		const row = database.prepare('SELECT id FROM templates ORDER BY id ASC LIMIT 1').get() as { id: number };
		setActiveTemplate(row.id);
		return row.id;
	}

	const sourceText = serializeDefaultTemplate();
	const parseResult = parseTemplateSource(sourceText);
	if (parseResult.errors.length > 0) {
		throw new Error('Default template failed validation');
	}
	const parsed = parseResult.parsed;
	const id = createTemplateVersion(sourceText, parsed);
	setActiveTemplate(id);
	return id;
}

export function backfillEntryTemplateIds(activeTemplateId: number): void {
	const database = getDb();
	database.prepare(`
		UPDATE entries
		SET template_id = ?
		WHERE template_id IS NULL
	`).run(activeTemplateId);
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

/**
 * Create a backup of the database
 * Returns the path to the backup file
 */
export function createBackup(): string {
	const database = getDb();
	
	// Checkpoint WAL to ensure all data is in the main database file
	database.pragma('wal_checkpoint(TRUNCATE)');
	
	// Ensure backup directory exists
	const backupDir = path.join(DATA_DIR, 'backups');
	if (!fs.existsSync(backupDir)) {
		fs.mkdirSync(backupDir, { recursive: true });
	}
	
	// Create backup filename with timestamp
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5); // Format: 2024-01-15T10-30-45
	const backupPath = path.join(backupDir, `journal-backup-${timestamp}.db`);
	
	// Copy the database file
	fs.copyFileSync(DB_PATH, backupPath);
	
	// Prune old backups - keep only the last 5
	const backups = getBackups();
	const RETENTION_COUNT = 5;
	if (backups.length > RETENTION_COUNT) {
		const backupsToDelete = backups.slice(RETENTION_COUNT);
		for (const backup of backupsToDelete) {
			fs.unlinkSync(backup.path);
		}
	}
	
	return backupPath;
}

/**
 * Get list of all backup files
 */
export function getBackups(): Array<{ filename: string; path: string; size: number; created: Date }> {
	const backupDir = path.join(DATA_DIR, 'backups');
	if (!fs.existsSync(backupDir)) {
		return [];
	}
	
	const files = fs.readdirSync(backupDir)
		.filter(file => file.startsWith('journal-backup-') && file.endsWith('.db'))
		.map(file => {
			const filePath = path.join(backupDir, file);
			const stats = fs.statSync(filePath);
			return {
				filename: file,
				path: filePath,
				size: stats.size,
				created: stats.birthtime
			};
		})
		.sort((a, b) => b.created.getTime() - a.created.getTime()); // Most recent first
	
	return files;
}
