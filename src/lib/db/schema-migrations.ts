import type Database from 'better-sqlite3';
import {
	backfillEntryTemplateIds,
	ensureActiveTemplate,
	ensureTemplatePresetSeed
} from './template-utils.js';
import {
	backfillEntryCapturedCoordinates,
	backfillEntryLocationIdEncryption,
	backfillLocationsEncryptedData,
	backfillTemplateParsedJson,
	backfillTemplatePresetParsedJson,
	migrateEncryptedDataToNewKey
} from './schema-backfills.js';
function addColumnIfMissing(
	db: Database.Database,
	columns: string[],
	name: string,
	statement: string
): void {
	if (!columns.includes(name)) db.exec(statement);
}
export function runMigrations(db: Database.Database): void {
	const tableInfo = db.prepare('PRAGMA table_info(locations)').all() as { name: string }[];
	const locationColumns = tableInfo.map(col => col.name);
	if (!locationColumns.includes('lat')) {
		db.exec('ALTER TABLE locations ADD COLUMN lat REAL;');
		db.exec('ALTER TABLE locations ADD COLUMN lng REAL;');
		db.exec('ALTER TABLE locations ADD COLUMN address TEXT;');
	}
	addColumnIfMissing(
		db,
		locationColumns,
		'name_encrypted',
		'ALTER TABLE locations ADD COLUMN name_encrypted BLOB;'
	);
	addColumnIfMissing(
		db,
		locationColumns,
		'lat_encrypted',
		'ALTER TABLE locations ADD COLUMN lat_encrypted BLOB;'
	);
	addColumnIfMissing(
		db,
		locationColumns,
		'lng_encrypted',
		'ALTER TABLE locations ADD COLUMN lng_encrypted BLOB;'
	);
	addColumnIfMissing(
		db,
		locationColumns,
		'address_encrypted',
		'ALTER TABLE locations ADD COLUMN address_encrypted BLOB;'
	);
	const entriesInfo = db.prepare('PRAGMA table_info(entries)').all() as { name: string }[];
	const entriesColumns = entriesInfo.map(col => col.name);
	if (!entriesColumns.includes('captured_lat')) {
		db.exec('ALTER TABLE entries ADD COLUMN captured_lat REAL;');
		db.exec('ALTER TABLE entries ADD COLUMN captured_lng REAL;');
	}
	addColumnIfMissing(
		db,
		entriesColumns,
		'template_id',
		'ALTER TABLE entries ADD COLUMN template_id INTEGER;'
	);
	addColumnIfMissing(
		db,
		entriesColumns,
		'captured_lat_encrypted',
		'ALTER TABLE entries ADD COLUMN captured_lat_encrypted BLOB;'
	);
	addColumnIfMissing(
		db,
		entriesColumns,
		'captured_lng_encrypted',
		'ALTER TABLE entries ADD COLUMN captured_lng_encrypted BLOB;'
	);
	addColumnIfMissing(
		db,
		entriesColumns,
		'location_id_encrypted',
		'ALTER TABLE entries ADD COLUMN location_id_encrypted BLOB;'
	);
	addColumnIfMissing(
		db,
		entriesColumns,
		'quote_id_encrypted',
		'ALTER TABLE entries ADD COLUMN quote_id_encrypted BLOB;'
	);
	addColumnIfMissing(
		db,
		entriesColumns,
		'quote_text_encrypted',
		'ALTER TABLE entries ADD COLUMN quote_text_encrypted BLOB;'
	);
	db.exec(`
		CREATE TABLE IF NOT EXISTS quotes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			text_encrypted BLOB NOT NULL,
			created_at TEXT DEFAULT (datetime('now'))
		);
		CREATE TABLE IF NOT EXISTS quote_sources (
			id INTEGER PRIMARY KEY,
			source_text_encrypted BLOB NOT NULL,
			created_at TEXT DEFAULT (datetime('now')),
			updated_at TEXT DEFAULT (datetime('now'))
		);
		CREATE TABLE IF NOT EXISTS daily_quotes (
			date TEXT PRIMARY KEY,
			quote_id_encrypted BLOB,
			quote_text_encrypted BLOB NOT NULL,
			created_at TEXT DEFAULT (datetime('now'))
		);
	`);
	const templatesInfo = db.prepare('PRAGMA table_info(templates)').all() as { name: string }[];
	const templatesColumns = templatesInfo.map(col => col.name);
	addColumnIfMissing(
		db,
		templatesColumns,
		'parsed_json_encrypted',
		'ALTER TABLE templates ADD COLUMN parsed_json_encrypted BLOB;'
	);
	const presetsInfo = db.prepare('PRAGMA table_info(template_presets)').all() as { name: string }[];
	const presetsColumns = presetsInfo.map(col => col.name);
	addColumnIfMissing(
		db,
		presetsColumns,
		'parsed_json_encrypted',
		'ALTER TABLE template_presets ADD COLUMN parsed_json_encrypted BLOB;'
	);
	backfillTemplateParsedJson(db);
	backfillTemplatePresetParsedJson(db);
	backfillLocationsEncryptedData(db);
	backfillEntryCapturedCoordinates(db);
	backfillEntryLocationIdEncryption(db);
	const activeTemplateId = ensureActiveTemplate(db);
	backfillEntryTemplateIds(db, activeTemplateId);
	ensureTemplatePresetSeed(db);
	migrateEncryptedDataToNewKey(db);
}

/**
 * FUTURE MIGRATION: Remove parsed_json columns
 * This should be run after all code stops referencing these columns
 *
 * Steps:
 * 1. Create new tables without parsed_json columns
 * 2. Copy data from old tables
 * 3. Drop old tables
 * 4. Rename new tables
 *
 * This requires table recreation in SQLite
 */
export function migrateRemoveParsedJsonColumns(db: Database.Database): void {
}
