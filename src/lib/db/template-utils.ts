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

export function ensureTemplatePresetSeed(database: Database.Database): void {
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
