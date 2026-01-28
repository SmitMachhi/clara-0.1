import { decrypt, encrypt } from '$lib/server/crypto.js';
import { parseTemplateSource } from '../template.js';
import type { TemplateModel } from '../template.js';
import { EMPTY_TEXT_PLACEHOLDER, getDb } from './connection.js';
import {
	backfillEntryTemplateIds as backfillEntryTemplateIdsWithDb,
	ensureActiveTemplate as ensureActiveTemplateWithDb,
	ensureTemplatePresetSeed as ensureTemplatePresetSeedWithDb,
	getActiveTemplate as getActiveTemplateWithDb,
	getTemplateById as getTemplateByIdWithDb,
	setActiveTemplate as setActiveTemplateWithDb
} from './template-utils.js';
import type { TemplatePresetSummary } from './types.js';

export function createTemplateVersion(sourceText: string): number {
	const database = getDb();
	const encrypted = encrypt(sourceText);
	const encryptedBuffer = Buffer.from(encrypted, 'utf8');
	const result = database.prepare(`
		INSERT INTO templates (source_text_encrypted, parsed_json,
			parsed_json_encrypted)
		VALUES (?, ?, ?)
	`).run(encryptedBuffer, EMPTY_TEXT_PLACEHOLDER, EMPTY_TEXT_PLACEHOLDER);
	return result.lastInsertRowid as number;
}

export function createTemplatePreset(name: string, sourceText: string): number {
	const database = getDb();
	const { errors } = parseTemplateSource(sourceText);
	if (errors.length > 0) {
		throw new Error(`Invalid template: ${errors.join(', ')}`);
	}
	const encrypted = encrypt(sourceText);
	const encryptedBuffer = Buffer.from(encrypted, 'utf8');
	const result = database.prepare(`
		INSERT INTO template_presets (name, source_text_encrypted,
			parsed_json, parsed_json_encrypted)
		VALUES (?, ?, ?, ?)
	`).run(name, encryptedBuffer, EMPTY_TEXT_PLACEHOLDER, EMPTY_TEXT_PLACEHOLDER);
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
		SELECT id, name, source_text_encrypted
		FROM template_presets
		WHERE id = ?
	`).get(id) as {
		id: number;
		name: string;
		source_text_encrypted: Buffer;
	} | undefined;

	if (!row) return null;

	const sourceText = decrypt(row.source_text_encrypted.toString('utf8'));
	const { parsed, errors } = parseTemplateSource(sourceText);

	if (errors.length > 0) {
		console.error(`Preset ${id} has invalid template:`, errors);
		return null;
	}

	return { id: row.id, name: row.name, sourceText, parsed };
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
	setActiveTemplateWithDb(getDb(), id);
}

export function getTemplateById(
	id: number
): { id: number; sourceText: string; parsed: TemplateModel } | null {
	return getTemplateByIdWithDb(getDb(), id);
}

export function getActiveTemplate():
	{ id: number; sourceText: string; parsed: TemplateModel } | null {
	return getActiveTemplateWithDb(getDb());
}

export function ensureActiveTemplate(): number {
	return ensureActiveTemplateWithDb(getDb());
}

export function backfillEntryTemplateIds(activeTemplateId: number): void {
	backfillEntryTemplateIdsWithDb(getDb(), activeTemplateId);
}

export function ensureTemplatePresetSeed(): void {
	ensureTemplatePresetSeedWithDb(getDb());
}
