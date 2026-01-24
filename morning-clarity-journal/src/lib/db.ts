import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { decrypt, encrypt, decryptWithLegacyKey } from '$lib/server/crypto.js';
import { parseTemplateSource, serializeDefaultTemplate } from './template';
import type { TemplateModel } from './template';

// Database path - use /data for production (Fly.io volume), local for dev
const DATA_DIR = process.env.NODE_ENV === 'production' ? '/data' : './data';
const DB_PATH = path.join(DATA_DIR, 'journal.db');
const EMPTY_TEXT_PLACEHOLDER = '';
const EMPTY_COORDINATE_PLACEHOLDER = 0;

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
			captured_lat_encrypted BLOB,
			captured_lng_encrypted BLOB,
			template_id INTEGER,
			encrypted_data BLOB NOT NULL,
			created_at TEXT DEFAULT (datetime('now'))
		);

		CREATE TABLE IF NOT EXISTS templates (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			created_at TEXT DEFAULT (datetime('now')),
			source_text_encrypted BLOB NOT NULL,
			parsed_json TEXT NOT NULL,
			parsed_json_encrypted BLOB NOT NULL
		);

		CREATE TABLE IF NOT EXISTS template_presets (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			created_at TEXT DEFAULT (datetime('now')),
			source_text_encrypted BLOB NOT NULL,
			parsed_json TEXT NOT NULL,
			parsed_json_encrypted BLOB NOT NULL
		);

		CREATE TABLE IF NOT EXISTS locations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			lat REAL NOT NULL,
			lng REAL NOT NULL,
			address TEXT,
			name_encrypted BLOB NOT NULL,
			lat_encrypted BLOB NOT NULL,
			lng_encrypted BLOB NOT NULL,
			address_encrypted BLOB
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

	if (!locationColumns.includes('name_encrypted')) {
		db.exec('ALTER TABLE locations ADD COLUMN name_encrypted BLOB;');
	}

	if (!locationColumns.includes('lat_encrypted')) {
		db.exec('ALTER TABLE locations ADD COLUMN lat_encrypted BLOB;');
	}

	if (!locationColumns.includes('lng_encrypted')) {
		db.exec('ALTER TABLE locations ADD COLUMN lng_encrypted BLOB;');
	}

	if (!locationColumns.includes('address_encrypted')) {
		db.exec('ALTER TABLE locations ADD COLUMN address_encrypted BLOB;');
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

	if (!entriesColumns.includes('captured_lat_encrypted')) {
		db.exec('ALTER TABLE entries ADD COLUMN captured_lat_encrypted BLOB;');
	}

	if (!entriesColumns.includes('captured_lng_encrypted')) {
		db.exec('ALTER TABLE entries ADD COLUMN captured_lng_encrypted BLOB;');
	}

	const templatesInfo = db.prepare('PRAGMA table_info(templates)').all() as { name: string }[];
	const templatesColumns = templatesInfo.map(col => col.name);

	if (!templatesColumns.includes('parsed_json_encrypted')) {
		db.exec('ALTER TABLE templates ADD COLUMN parsed_json_encrypted BLOB;');
	}

	const presetsInfo = db.prepare('PRAGMA table_info(template_presets)').all() as { name: string }[];
	const presetsColumns = presetsInfo.map(col => col.name);

	if (!presetsColumns.includes('parsed_json_encrypted')) {
		db.exec('ALTER TABLE template_presets ADD COLUMN parsed_json_encrypted BLOB;');
	}

	// User-provided fields are stored only in *_encrypted columns at rest.
	backfillTemplateParsedJson(db);
	backfillTemplatePresetParsedJson(db);
	backfillLocationsEncryptedData(db);
	backfillEntryCapturedCoordinates(db);

	const activeTemplateId = ensureActiveTemplate();
	backfillEntryTemplateIds(activeTemplateId);
	ensureTemplatePresetSeed();
	migrateEncryptedDataToNewKey(db);
	
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

export interface TemplatePresetSummary {
	id: number;
	name: string;
	created_at: string;
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
	const capturedLatEncrypted = encryptOptionalNumber(capturedLat ?? null);
	const capturedLngEncrypted = encryptOptionalNumber(capturedLng ?? null);
	
	const result = database.prepare(`
		INSERT INTO entries (date, timestamp, location_id, captured_lat, captured_lng, captured_lat_encrypted, captured_lng_encrypted, template_id, encrypted_data)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(
		date,
		timestamp,
		locationId,
		null,
		null,
		capturedLatEncrypted,
		capturedLngEncrypted,
		templateId,
		dataBuffer
	);
	
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
	const capturedLatEncrypted = encryptOptionalNumber(capturedLat ?? null);
	const capturedLngEncrypted = encryptOptionalNumber(capturedLng ?? null);
	
	const result = database.prepare(`
		UPDATE entries 
		SET timestamp = ?, location_id = ?, captured_lat = ?, captured_lng = ?, captured_lat_encrypted = ?, captured_lng_encrypted = ?, template_id = ?, encrypted_data = ?
		WHERE date = ?
	`).run(
		timestamp,
		locationId,
		null,
		null,
		capturedLatEncrypted,
		capturedLngEncrypted,
		templateId,
		dataBuffer,
		date
	);
	
	return result.changes > 0;
}

/**
 * Get all entries (without decrypted data)
 */
export function getAllEntries(): Entry[] {
	const database = getDb();
	const rows = database.prepare(`
		SELECT e.id, e.date, e.timestamp, e.location_id, e.captured_lat_encrypted, e.captured_lng_encrypted, e.template_id, e.created_at, l.name_encrypted as location_name_encrypted
		FROM entries e
		LEFT JOIN locations l ON e.location_id = l.id
		ORDER BY e.date DESC
	`).all() as Array<Entry & { location_name_encrypted: Buffer | null; captured_lat_encrypted: Buffer | null; captured_lng_encrypted: Buffer | null }>;

	return rows.map(row => {
		const locationName = decryptOptionalString(row.location_name_encrypted);
		return {
			id: row.id,
			date: row.date,
			timestamp: row.timestamp,
			location_id: row.location_id,
			location_name: locationName ?? undefined,
			captured_lat: decryptOptionalNumber(row.captured_lat_encrypted),
			captured_lng: decryptOptionalNumber(row.captured_lng_encrypted),
			template_id: row.template_id,
			created_at: row.created_at
		};
	});
}

/**
 * Get an entry by date with encrypted data (client will decrypt)
 */
export function getEntryByDate(date: string): (EntryWithData & { rawData: Buffer }) | null {
	const database = getDb();
	const row = database.prepare(`
		SELECT e.id, e.date, e.timestamp, e.location_id, e.captured_lat_encrypted, e.captured_lng_encrypted, e.template_id, e.encrypted_data, e.created_at, l.name_encrypted as location_name_encrypted
		FROM entries e
		LEFT JOIN locations l ON e.location_id = l.id
		WHERE e.date = ?
	`).get(date) as (Entry & { encrypted_data: Buffer; location_name_encrypted: Buffer | null; captured_lat_encrypted: Buffer | null; captured_lng_encrypted: Buffer | null }) | undefined;

	if (!row) return null;

	return {
		id: row.id,
		date: row.date,
		timestamp: row.timestamp,
		location_id: row.location_id,
		location_name: decryptOptionalString(row.location_name_encrypted) ?? undefined,
		captured_lat: decryptOptionalNumber(row.captured_lat_encrypted),
		rawData: row.encrypted_data,
		captured_lng: decryptOptionalNumber(row.captured_lng_encrypted),
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
	const parsedJsonEncrypted = encrypt(parsedJson);
	const parsedJsonEncryptedBuffer = Buffer.from(parsedJsonEncrypted, 'utf8');
	const result = database.prepare(`
		INSERT INTO templates (source_text_encrypted, parsed_json, parsed_json_encrypted)
		VALUES (?, ?, ?)
	`).run(encryptedBuffer, EMPTY_TEXT_PLACEHOLDER, parsedJsonEncryptedBuffer);
	return result.lastInsertRowid as number;
}

export function createTemplatePreset(name: string, sourceText: string, parsed: TemplateModel): number {
	const database = getDb();
	const encrypted = encrypt(sourceText);
	const encryptedBuffer = Buffer.from(encrypted, 'utf8');
	const parsedJson = JSON.stringify(parsed);
	const parsedJsonEncrypted = encrypt(parsedJson);
	const parsedJsonEncryptedBuffer = Buffer.from(parsedJsonEncrypted, 'utf8');
	const result = database.prepare(`
		INSERT INTO template_presets (name, source_text_encrypted, parsed_json, parsed_json_encrypted)
		VALUES (?, ?, ?, ?)
	`).run(name, encryptedBuffer, EMPTY_TEXT_PLACEHOLDER, parsedJsonEncryptedBuffer);
	return result.lastInsertRowid as number;
}

export function getTemplatePresets(): TemplatePresetSummary[] {
	const database = getDb();
	return database.prepare(`
		SELECT id, name, created_at
		FROM template_presets
		ORDER BY created_at DESC
	`).all() as TemplatePresetSummary[];
}

export function getTemplatePresetById(id: number): { id: number; name: string; sourceText: string; parsed: TemplateModel } | null {
	const database = getDb();
	const row = database.prepare(`
		SELECT id, name, source_text_encrypted, parsed_json_encrypted
		FROM template_presets
		WHERE id = ?
	`).get(id) as { id: number; name: string; source_text_encrypted: Buffer; parsed_json_encrypted: Buffer } | undefined;

	if (!row) return null;

	const decrypted = decrypt(row.source_text_encrypted.toString('utf8'));
	const parsedJson = decrypt(row.parsed_json_encrypted.toString('utf8'));
	return {
		id: row.id,
		name: row.name,
		sourceText: decrypted,
		parsed: JSON.parse(parsedJson) as TemplateModel
	};
}

export function renameTemplatePreset(id: number, name: string): boolean {
	const database = getDb();
	const result = database.prepare(`
		UPDATE template_presets
		SET name = ?
		WHERE id = ?
	`).run(name, id);
	return result.changes > 0;
}

export function deleteTemplatePreset(id: number): boolean {
	const database = getDb();
	const result = database.prepare(`
		DELETE FROM template_presets
		WHERE id = ?
	`).run(id);
	return result.changes > 0;
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
		SELECT id, source_text_encrypted, parsed_json_encrypted
		FROM templates
		WHERE id = ?
	`).get(id) as { id: number; source_text_encrypted: Buffer; parsed_json_encrypted: Buffer } | undefined;

	if (!row) return null;

	const decrypted = decrypt(row.source_text_encrypted.toString('utf8'));
	const parsedJson = decrypt(row.parsed_json_encrypted.toString('utf8'));
	return {
		id: row.id,
		sourceText: decrypted,
		parsed: JSON.parse(parsedJson) as TemplateModel
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

export function ensureTemplatePresetSeed(): void {
	const database = getDb();
	const count = database.prepare('SELECT COUNT(1) as count FROM template_presets').get() as { count: number };
	if (count.count > 0) return;

	const active = getActiveTemplate();
	if (!active) return;
	createTemplatePreset('Default Template', active.sourceText, active.parsed);
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
	const rows = database.prepare('SELECT id, name_encrypted, lat_encrypted, lng_encrypted, address_encrypted FROM locations').all() as Array<{
		id: number;
		name_encrypted: Buffer | null;
		lat_encrypted: Buffer | null;
		lng_encrypted: Buffer | null;
		address_encrypted: Buffer | null;
	}>;

	return rows
		.map(row => ({
			id: row.id,
			name: decryptOptionalString(row.name_encrypted) ?? EMPTY_TEXT_PLACEHOLDER,
			lat: decryptOptionalNumber(row.lat_encrypted) ?? EMPTY_COORDINATE_PLACEHOLDER,
			lng: decryptOptionalNumber(row.lng_encrypted) ?? EMPTY_COORDINATE_PLACEHOLDER,
			address: decryptOptionalString(row.address_encrypted)
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Add a new location
 */
export function addLocation(name: string, lat: number, lng: number, address?: string): number {
	const database = getDb();
	const nameEncrypted = encryptOptionalString(name);
	const latEncrypted = encryptOptionalNumber(lat);
	const lngEncrypted = encryptOptionalNumber(lng);
	const addressEncrypted = encryptOptionalString(address ?? null);
	const result = database.prepare(`
		INSERT INTO locations (name, lat, lng, address, name_encrypted, lat_encrypted, lng_encrypted, address_encrypted)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`).run(
		EMPTY_TEXT_PLACEHOLDER,
		EMPTY_COORDINATE_PLACEHOLDER,
		EMPTY_COORDINATE_PLACEHOLDER,
		null,
		nameEncrypted,
		latEncrypted,
		lngEncrypted,
		addressEncrypted
	);
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
	const row = database.prepare('SELECT id, name_encrypted, lat_encrypted, lng_encrypted, address_encrypted FROM locations WHERE id = ?').get(id) as {
		id: number;
		name_encrypted: Buffer | null;
		lat_encrypted: Buffer | null;
		lng_encrypted: Buffer | null;
		address_encrypted: Buffer | null;
	} | undefined;

	if (!row) return null;

	return {
		id: row.id,
		name: decryptOptionalString(row.name_encrypted) ?? EMPTY_TEXT_PLACEHOLDER,
		lat: decryptOptionalNumber(row.lat_encrypted) ?? EMPTY_COORDINATE_PLACEHOLDER,
		lng: decryptOptionalNumber(row.lng_encrypted) ?? EMPTY_COORDINATE_PLACEHOLDER,
		address: decryptOptionalString(row.address_encrypted)
	};
}

/**
 * Check if a location with the given name already exists
 */
export function locationNameExists(name: string): boolean {
	const database = getDb();
	const rows = database.prepare('SELECT name_encrypted FROM locations').all() as Array<{ name_encrypted: Buffer | null }>;
	const normalized = normalizeLocationName(name);
	return rows.some(row => {
		const decrypted = decryptOptionalString(row.name_encrypted);
		if (!decrypted) return false;
		return normalizeLocationName(decrypted) === normalized;
	});
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

function encryptOptionalString(value: string | null | undefined): Buffer | null {
	if (value === null || value === undefined) return null;
	const encrypted = encrypt(value);
	return Buffer.from(encrypted, 'utf8');
}

function encryptOptionalNumber(value: number | null | undefined): Buffer | null {
	if (value === null || value === undefined) return null;
	const encrypted = encrypt(value.toString());
	return Buffer.from(encrypted, 'utf8');
}

function decryptOptionalString(value: Buffer | null | undefined): string | null {
	if (!value) return null;
	return decrypt(value.toString('utf8'));
}

function decryptOptionalNumber(value: Buffer | null | undefined): number | null {
	const decrypted = decryptOptionalString(value);
	if (decrypted === null) return null;
	const parsed = Number(decrypted);
	return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLocationName(value: string): string {
	return value.trim().toLowerCase();
}

function migrateEncryptedDataToNewKey(database: Database.Database): void {
	const migrationDone = database.prepare(
		"SELECT value FROM config WHERE key = 'encryption_key_migrated_v2'"
	).get() as { value: string } | undefined;
	if (migrationDone?.value === 'true') return;

	const migrate = database.transaction(() => {
		const entries = database.prepare(
			'SELECT id, encrypted_data, captured_lat_encrypted, captured_lng_encrypted FROM entries'
		).all() as Array<{
			id: number;
			encrypted_data: Buffer;
			captured_lat_encrypted: Buffer | null;
			captured_lng_encrypted: Buffer | null;
		}>;
		const updateEntry = database.prepare(
			'UPDATE entries SET encrypted_data = ?, captured_lat_encrypted = ?, captured_lng_encrypted = ? WHERE id = ?'
		);
		for (const row of entries) {
			const newData = Buffer.from(
				encrypt(decryptWithLegacyKey(row.encrypted_data.toString('utf8'))),
				'utf8'
			);
			const newLat = row.captured_lat_encrypted
				? Buffer.from(
					encrypt(decryptWithLegacyKey(row.captured_lat_encrypted.toString('utf8'))),
					'utf8'
				)
				: null;
			const newLng = row.captured_lng_encrypted
				? Buffer.from(
					encrypt(decryptWithLegacyKey(row.captured_lng_encrypted.toString('utf8'))),
					'utf8'
				)
				: null;
			updateEntry.run(newData, newLat, newLng, row.id);
		}

		const locations = database.prepare(
			'SELECT id, name_encrypted, lat_encrypted, lng_encrypted, address_encrypted FROM locations'
		).all() as Array<{
			id: number;
			name_encrypted: Buffer | null;
			lat_encrypted: Buffer | null;
			lng_encrypted: Buffer | null;
			address_encrypted: Buffer | null;
		}>;
		const updateLocation = database.prepare(
			'UPDATE locations SET name_encrypted = ?, lat_encrypted = ?, lng_encrypted = ?, address_encrypted = ? WHERE id = ?'
		);
		for (const row of locations) {
			const newName = row.name_encrypted
				? Buffer.from(
					encrypt(decryptWithLegacyKey(row.name_encrypted.toString('utf8'))),
					'utf8'
				)
				: null;
			const newLat = row.lat_encrypted
				? Buffer.from(
					encrypt(decryptWithLegacyKey(row.lat_encrypted.toString('utf8'))),
					'utf8'
				)
				: null;
			const newLng = row.lng_encrypted
				? Buffer.from(
					encrypt(decryptWithLegacyKey(row.lng_encrypted.toString('utf8'))),
					'utf8'
				)
				: null;
			const newAddr = row.address_encrypted
				? Buffer.from(
					encrypt(decryptWithLegacyKey(row.address_encrypted.toString('utf8'))),
					'utf8'
				)
				: null;
			updateLocation.run(newName, newLat, newLng, newAddr, row.id);
		}

		const templates = database.prepare(
			'SELECT id, source_text_encrypted, parsed_json_encrypted FROM templates'
		).all() as Array<{
			id: number;
			source_text_encrypted: Buffer;
			parsed_json_encrypted: Buffer;
		}>;
		const updateTemplate = database.prepare(
			'UPDATE templates SET source_text_encrypted = ?, parsed_json_encrypted = ? WHERE id = ?'
		);
		for (const row of templates) {
			const newSource = Buffer.from(
				encrypt(decryptWithLegacyKey(row.source_text_encrypted.toString('utf8'))),
				'utf8'
			);
			const newParsed = Buffer.from(
				encrypt(decryptWithLegacyKey(row.parsed_json_encrypted.toString('utf8'))),
				'utf8'
			);
			updateTemplate.run(newSource, newParsed, row.id);
		}

		const presets = database.prepare(
			'SELECT id, source_text_encrypted, parsed_json_encrypted FROM template_presets'
		).all() as Array<{
			id: number;
			source_text_encrypted: Buffer;
			parsed_json_encrypted: Buffer;
		}>;
		const updatePreset = database.prepare(
			'UPDATE template_presets SET source_text_encrypted = ?, parsed_json_encrypted = ? WHERE id = ?'
		);
		for (const row of presets) {
			const newSource = Buffer.from(
				encrypt(decryptWithLegacyKey(row.source_text_encrypted.toString('utf8'))),
				'utf8'
			);
			const newParsed = Buffer.from(
				encrypt(decryptWithLegacyKey(row.parsed_json_encrypted.toString('utf8'))),
				'utf8'
			);
			updatePreset.run(newSource, newParsed, row.id);
		}

		database.prepare(
			"INSERT INTO config (key, value) VALUES ('encryption_key_migrated_v2', 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'"
		).run();
	});

	migrate();
}

function backfillTemplateParsedJson(database: Database.Database): void {
	const rows = database.prepare('SELECT id, parsed_json FROM templates WHERE parsed_json_encrypted IS NULL').all() as Array<{ id: number; parsed_json: string }>;
	if (rows.length === 0) return;

	const update = database.prepare(`
		UPDATE templates
		SET parsed_json_encrypted = ?, parsed_json = ?
		WHERE id = ?
	`);

	for (const row of rows) {
		const encrypted = encrypt(row.parsed_json);
		update.run(Buffer.from(encrypted, 'utf8'), EMPTY_TEXT_PLACEHOLDER, row.id);
	}
}

function backfillTemplatePresetParsedJson(database: Database.Database): void {
	const rows = database.prepare('SELECT id, parsed_json FROM template_presets WHERE parsed_json_encrypted IS NULL').all() as Array<{ id: number; parsed_json: string }>;
	if (rows.length === 0) return;

	const update = database.prepare(`
		UPDATE template_presets
		SET parsed_json_encrypted = ?, parsed_json = ?
		WHERE id = ?
	`);

	for (const row of rows) {
		const encrypted = encrypt(row.parsed_json);
		update.run(Buffer.from(encrypted, 'utf8'), EMPTY_TEXT_PLACEHOLDER, row.id);
	}
}

function backfillLocationsEncryptedData(database: Database.Database): void {
	const rows = database.prepare(`
		SELECT id, name, lat, lng, address, name_encrypted, lat_encrypted, lng_encrypted, address_encrypted
		FROM locations
		WHERE name_encrypted IS NULL OR lat_encrypted IS NULL OR lng_encrypted IS NULL OR (address IS NOT NULL AND address_encrypted IS NULL)
	`).all() as Array<{
		id: number;
		name: string;
		lat: number;
		lng: number;
		address: string | null;
		name_encrypted: Buffer | null;
		lat_encrypted: Buffer | null;
		lng_encrypted: Buffer | null;
		address_encrypted: Buffer | null;
	}>;
	if (rows.length === 0) return;

	const update = database.prepare(`
		UPDATE locations
		SET name = ?, lat = ?, lng = ?, address = ?, name_encrypted = ?, lat_encrypted = ?, lng_encrypted = ?, address_encrypted = ?
		WHERE id = ?
	`);

	for (const row of rows) {
		const nameEncrypted = row.name_encrypted ?? encryptOptionalString(row.name);
		const latEncrypted = row.lat_encrypted ?? encryptOptionalNumber(row.lat);
		const lngEncrypted = row.lng_encrypted ?? encryptOptionalNumber(row.lng);
		const addressEncrypted = row.address_encrypted ?? encryptOptionalString(row.address);
		update.run(
			EMPTY_TEXT_PLACEHOLDER,
			EMPTY_COORDINATE_PLACEHOLDER,
			EMPTY_COORDINATE_PLACEHOLDER,
			null,
			nameEncrypted,
			latEncrypted,
			lngEncrypted,
			addressEncrypted,
			row.id
		);
	}
}

function backfillEntryCapturedCoordinates(database: Database.Database): void {
	const rows = database.prepare(`
		SELECT id, captured_lat, captured_lng, captured_lat_encrypted, captured_lng_encrypted
		FROM entries
		WHERE captured_lat_encrypted IS NULL OR captured_lng_encrypted IS NULL
	`).all() as Array<{
		id: number;
		captured_lat: number | null;
		captured_lng: number | null;
		captured_lat_encrypted: Buffer | null;
		captured_lng_encrypted: Buffer | null;
	}>;
	if (rows.length === 0) return;

	const update = database.prepare(`
		UPDATE entries
		SET captured_lat = ?, captured_lng = ?, captured_lat_encrypted = ?, captured_lng_encrypted = ?
		WHERE id = ?
	`);

	for (const row of rows) {
		const latEncrypted = row.captured_lat_encrypted ?? encryptOptionalNumber(row.captured_lat);
		const lngEncrypted = row.captured_lng_encrypted ?? encryptOptionalNumber(row.captured_lng);
		update.run(null, null, latEncrypted, lngEncrypted, row.id);
	}
}
