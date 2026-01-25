import { decrypt, encrypt } from '$lib/server/crypto.js';
import { parseTemplateSource, serializeDefaultTemplate } from '../template.js';
import type { TemplateModel } from '../template.js';
import { EMPTY_TEXT_PLACEHOLDER, getDb } from './connection.js';
import type { TemplatePresetSummary } from './types.js';

export function createTemplateVersion(sourceText: string, parsed: TemplateModel): number {
	const database = getDb();
	const encrypted = encrypt(sourceText);
	const encryptedBuffer = Buffer.from(encrypted, 'utf8');
	const parsedJson = JSON.stringify(parsed);
	const parsedJsonEncrypted = encrypt(parsedJson);
	const parsedJsonEncryptedBuffer = Buffer.from(parsedJsonEncrypted, 'utf8');
	const result = database.prepare(`
		INSERT INTO templates (source_text_encrypted, parsed_json,
			parsed_json_encrypted)
		VALUES (?, ?, ?)
	`).run(encryptedBuffer, EMPTY_TEXT_PLACEHOLDER, parsedJsonEncryptedBuffer);
	return result.lastInsertRowid as number;
}

export function createTemplatePreset(
	name: string,
	sourceText: string,
	parsed: TemplateModel
): number {
	const database = getDb();
	const encrypted = encrypt(sourceText);
	const encryptedBuffer = Buffer.from(encrypted, 'utf8');
	const parsedJson = JSON.stringify(parsed);
	const parsedJsonEncrypted = encrypt(parsedJson);
	const parsedJsonEncryptedBuffer = Buffer.from(parsedJsonEncrypted, 'utf8');
	const result = database.prepare(`
		INSERT INTO template_presets (name, source_text_encrypted,
			parsed_json, parsed_json_encrypted)
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

export function getTemplatePresetById(
	id: number
): { id: number; name: string; sourceText: string; parsed: TemplateModel } | null {
	const database = getDb();
	const row = database.prepare(`
		SELECT id, name, source_text_encrypted, parsed_json_encrypted
		FROM template_presets
		WHERE id = ?
	`).get(id) as {
		id: number;
		name: string;
		source_text_encrypted: Buffer;
		parsed_json_encrypted: Buffer;
	} | undefined;

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

export function getTemplateById(
	id: number
): { id: number; sourceText: string; parsed: TemplateModel } | null {
	const database = getDb();
	const row = database.prepare(`
		SELECT id, source_text_encrypted, parsed_json_encrypted
		FROM templates
		WHERE id = ?
	`).get(id) as {
		id: number;
		source_text_encrypted: Buffer;
		parsed_json_encrypted: Buffer;
	} | undefined;

	if (!row) return null;

	const decrypted = decrypt(row.source_text_encrypted.toString('utf8'));
	const parsedJson = decrypt(row.parsed_json_encrypted.toString('utf8'));
	return {
		id: row.id,
		sourceText: decrypted,
		parsed: JSON.parse(parsedJson) as TemplateModel
	};
}

export function getActiveTemplate():
	{ id: number; sourceText: string; parsed: TemplateModel } | null {
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

	const templateCount = database.prepare(
		'SELECT COUNT(1) as count FROM templates'
	).get() as { count: number };
	if (templateCount.count > 0) {
		const row = database.prepare(
			'SELECT id FROM templates ORDER BY id ASC LIMIT 1'
		).get() as { id: number };
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
	const count = database.prepare(
		'SELECT COUNT(1) as count FROM template_presets'
	).get() as { count: number };
	if (count.count > 0) return;

	const active = getActiveTemplate();
	if (!active) return;
	createTemplatePreset('Default Template', active.sourceText, active.parsed);
}
