import type Database from 'better-sqlite3';
import { decrypt, encrypt } from '$lib/server/crypto.js';
import { parseTemplateSource, DEFAULT_TEMPLATE_TEXT } from '../template.js';
import type { TemplateModel } from '../template.js';
import { EMPTY_TEXT_PLACEHOLDER } from './connection.js';

export function setActiveTemplate(database: Database.Database, id: number): void {
	const statement = "INSERT INTO config (key, value) VALUES ('active_template_id', ?)" +
		' ON CONFLICT(key) DO UPDATE SET value = excluded.value';
	database.prepare(statement).run(id.toString());
}

function findFirstValidTemplateId(database: Database.Database): number | null {
	const rows = database.prepare(
		'SELECT id, source_text_encrypted FROM templates ORDER BY id ASC'
	).all() as Array<{
		id: number;
		source_text_encrypted: Buffer;
	}>;

	for (const row of rows) {
		const sourceText = decrypt(row.source_text_encrypted.toString('utf8'));
		const { errors } = parseTemplateSource(sourceText);
		if (errors.length === 0) {
			return row.id;
		}
	}

	return null;
}

export function getTemplateById(
	database: Database.Database,
	id: number
): { id: number; sourceText: string; parsed: TemplateModel } | null {
	const row = database.prepare(
		'SELECT id, source_text_encrypted FROM templates WHERE id = ?'
	).get(id) as {
		id: number;
		source_text_encrypted: Buffer;
	} | undefined;

	if (!row) return null;

	const sourceText = decrypt(row.source_text_encrypted.toString('utf8'));
	const { parsed, errors } = parseTemplateSource(sourceText);

	if (errors.length > 0) {
		console.error(`Template ${id} has invalid source:`, errors);
		return null;
	}

	return { id: row.id, sourceText, parsed };
}

export function getActiveTemplate(
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

export function ensureActiveTemplate(database: Database.Database): number {
	const existing = getActiveTemplate(database);
	if (existing) {
		return existing.id;
	}

	const firstValidId = findFirstValidTemplateId(database);
	if (firstValidId !== null) {
		setActiveTemplate(database, firstValidId);
		return firstValidId;
	}

	const sourceText = DEFAULT_TEMPLATE_TEXT;
	const parseResult = parseTemplateSource(sourceText);
	if (parseResult.errors.length > 0) {
		throw new Error(`Default template failed validation: ${parseResult.errors.join(', ')}`);
	}
	const encrypted = encrypt(sourceText);
	const result = database.prepare(
		'INSERT INTO templates (source_text_encrypted, parsed_json, parsed_json_encrypted)' +
		' VALUES (?, ?, ?)'
	).run(
		Buffer.from(encrypted, 'utf8'),
		EMPTY_TEXT_PLACEHOLDER,
		EMPTY_TEXT_PLACEHOLDER
	);
	const id = result.lastInsertRowid as number;
	setActiveTemplate(database, id);
	return id;
}

export function backfillEntryTemplateIds(
	database: Database.Database,
	activeTemplateId: number
): void {
	database.prepare(
		'UPDATE entries SET template_id = ? WHERE template_id IS NULL'
	).run(activeTemplateId);
}

export function getDefaultPresetId(database: Database.Database): number | null {
	const row = database.prepare(
		"SELECT value FROM config WHERE key = 'default_template_preset_id'"
	).get() as { value: string } | undefined;
	if (!row?.value) return null;
	const presetId = Number(row.value);
	if (!Number.isFinite(presetId)) return null;
	return presetId;
}

export function ensureTemplatePresetSeed(database: Database.Database): void {
	const count = database.prepare(
		'SELECT COUNT(1) as count FROM template_presets'
	).get() as { count: number };
	if (count.count > 0) return;
	const active = getActiveTemplate(database);
	if (!active) return;
	const encrypted = encrypt(active.sourceText);
	const parsedJsonEncrypted = encrypt(JSON.stringify(active.parsed));
	const result = database.prepare(
		'INSERT INTO template_presets (name, source_text_encrypted, parsed_json, parsed_json_encrypted)' +
		' VALUES (?, ?, ?, ?)'
	).run(
		'Default Template',
		Buffer.from(encrypted, 'utf8'),
		EMPTY_TEXT_PLACEHOLDER,
		Buffer.from(parsedJsonEncrypted, 'utf8')
	);
	const presetId = result.lastInsertRowid as number;
	const statement = "INSERT INTO config (key, value) VALUES ('default_template_preset_id', ?)" +
		' ON CONFLICT(key) DO UPDATE SET value = excluded.value';
	database.prepare(statement).run(presetId.toString());
}

export function ensureDefaultPresetId(database: Database.Database): number | null {
	const existing = getDefaultPresetId(database);
	if (existing !== null) {
		const presetExists = database.prepare(
			'SELECT 1 FROM template_presets WHERE id = ?'
		).get(existing);
		if (presetExists) {
			return existing;
		}
	}

	const defaultNameRow = database.prepare(
		"SELECT id FROM template_presets WHERE name = 'Default Template' LIMIT 1"
	).get() as { id: number } | undefined;

	let presetId: number | null;
	if (defaultNameRow) {
		presetId = defaultNameRow.id;
	} else {
		const oldestRow = database.prepare(
			'SELECT id FROM template_presets ORDER BY created_at ASC, id ASC LIMIT 1'
		).get() as { id: number } | undefined;
		presetId = oldestRow?.id ?? null;
	}

	if (presetId !== null) {
		const statement = "INSERT INTO config (key, value) VALUES ('default_template_preset_id', ?)" +
			' ON CONFLICT(key) DO UPDATE SET value = excluded.value';
		database.prepare(statement).run(presetId.toString());
	}

	return presetId;
}
