import type Database from 'better-sqlite3';
import { decrypt, encrypt } from '$lib/server/crypto.js';
import { parseTemplateSource, serializeDefaultTemplate } from '../template.js';
import type { TemplateModel } from '../template.js';
import { EMPTY_TEXT_PLACEHOLDER } from './connection.js';
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
function setActiveTemplate(database: Database.Database, id: number): void {
	const statement = "INSERT INTO config (key, value) VALUES ('active_template_id', ?)" +
		' ON CONFLICT(key) DO UPDATE SET value = excluded.value';
	database.prepare(statement).run(id.toString());
}
function getTemplateById(
	database: Database.Database,
	id: number
): { id: number; sourceText: string; parsed: TemplateModel } | null {
	const row = database.prepare(
		'SELECT id, source_text_encrypted, parsed_json_encrypted FROM templates WHERE id = ?'
	).get(id) as { id: number; source_text_encrypted: Buffer;
		parsed_json_encrypted: Buffer } | undefined;
	if (!row) return null;
	const decrypted = decrypt(row.source_text_encrypted.toString('utf8'));
	const parsedJson = decrypt(row.parsed_json_encrypted.toString('utf8'));
	return { id: row.id, sourceText: decrypted, parsed: JSON.parse(parsedJson) as TemplateModel };
}
function getActiveTemplate(
	database: Database.Database
): { id: number; sourceText: string; parsed: TemplateModel } | null {
	const row = database.prepare(
		"SELECT value FROM config WHERE key = 'active_template_id'"
	).get() as { value: string } | undefined;
	if (!row?.value) return null;
	const templateId = Number(row.value);
	if (!Number.isFinite(templateId)) return null;
	return getTemplateById(database, templateId);
}
function ensureActiveTemplate(database: Database.Database): number {
	const existing = getActiveTemplate(database);
	if (existing) return existing.id;
	const templateCount = database.prepare(
		'SELECT COUNT(1) as count FROM templates'
	).get() as { count: number };
	if (templateCount.count > 0) {
		const row = database.prepare(
			'SELECT id FROM templates ORDER BY id ASC LIMIT 1'
		).get() as { id: number };
		setActiveTemplate(database, row.id);
		return row.id;
	}
	const sourceText = serializeDefaultTemplate();
	const parseResult = parseTemplateSource(sourceText);
	if (parseResult.errors.length > 0) {
		throw new Error('Default template failed validation');
	}
	const encrypted = encrypt(sourceText);
	const parsedJsonEncrypted = encrypt(JSON.stringify(parseResult.parsed));
	const result = database.prepare(
		'INSERT INTO templates (source_text_encrypted, parsed_json, parsed_json_encrypted)' +
		' VALUES (?, ?, ?)'
	).run(
		Buffer.from(encrypted, 'utf8'),
		EMPTY_TEXT_PLACEHOLDER,
		Buffer.from(parsedJsonEncrypted, 'utf8')
	);
	const id = result.lastInsertRowid as number;
	setActiveTemplate(database, id);
	return id;
}
function backfillEntryTemplateIds(database: Database.Database, activeTemplateId: number): void {
	database.prepare(
		'UPDATE entries SET template_id = ? WHERE template_id IS NULL'
	).run(activeTemplateId);
}
function ensureTemplatePresetSeed(database: Database.Database): void {
	const count = database.prepare(
		'SELECT COUNT(1) as count FROM template_presets'
	).get() as { count: number };
	if (count.count > 0) return;
	const active = getActiveTemplate(database);
	if (!active) return;
	const encrypted = encrypt(active.sourceText);
	const parsedJsonEncrypted = encrypt(JSON.stringify(active.parsed));
	database.prepare(
		'INSERT INTO template_presets (name, source_text_encrypted, parsed_json, parsed_json_encrypted)' +
		' VALUES (?, ?, ?, ?)'
	).run(
		'Default Template',
		Buffer.from(encrypted, 'utf8'),
		EMPTY_TEXT_PLACEHOLDER,
		Buffer.from(parsedJsonEncrypted, 'utf8')
	);
}
