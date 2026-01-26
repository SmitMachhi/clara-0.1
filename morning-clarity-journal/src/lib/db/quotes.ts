import { encrypt, decrypt } from '$lib/server/crypto.js';
import { getDb } from './connection.js';
import { decryptOptionalNumber, encryptOptionalNumber } from './crypto-helpers.js';
import type { DailyQuote, Quote } from './types.js';

interface DailyQuoteRow {
	date: string;
	quote_id_encrypted: Buffer | null;
	quote_text_encrypted: Buffer;
	created_at: string;
}

function mapDailyQuoteRow(row: DailyQuoteRow): DailyQuote {
	return {
		date: row.date,
		quote_id: decryptOptionalNumber(row.quote_id_encrypted),
		text: decrypt(row.quote_text_encrypted.toString('utf8')),
		created_at: row.created_at
	};
}

function getDailyQuoteRow(date: string): DailyQuoteRow | null {
	const database = getDb();
	const row = database.prepare(`
		SELECT date, quote_id_encrypted, quote_text_encrypted, created_at
		FROM daily_quotes
		WHERE date = ?
	`).get(date) as DailyQuoteRow | undefined;
	return row ?? null;
}

export function getQuotes(): Quote[] {
	const database = getDb();
	const rows = database.prepare(`
		SELECT id, text_encrypted, created_at
		FROM quotes
		ORDER BY created_at DESC
	`).all() as Array<{ id: number; text_encrypted: Buffer; created_at: string }>;
	return rows.map(row => ({
		id: row.id,
		text: decrypt(row.text_encrypted.toString('utf8')),
		created_at: row.created_at
	}));
}

export function getQuoteById(id: number): Quote | null {
	const database = getDb();
	const row = database.prepare(`
		SELECT id, text_encrypted, created_at
		FROM quotes
		WHERE id = ?
	`).get(id) as { id: number; text_encrypted: Buffer; created_at: string } | undefined;
	if (!row) return null;
	return {
		id: row.id,
		text: decrypt(row.text_encrypted.toString('utf8')),
		created_at: row.created_at
	};
}

export function createQuote(text: string): number {
	const database = getDb();
	const encrypted = Buffer.from(encrypt(text), 'utf8');
	const result = database.prepare(`
		INSERT INTO quotes (text_encrypted)
		VALUES (?)
	`).run(encrypted);
	return result.lastInsertRowid as number;
}

export function updateQuote(id: number, text: string): boolean {
	const database = getDb();
	const encrypted = Buffer.from(encrypt(text), 'utf8');
	const result = database.prepare(`
		UPDATE quotes
		SET text_encrypted = ?
		WHERE id = ?
	`).run(encrypted, id);
	return result.changes > 0;
}

export function deleteQuote(id: number): boolean {
	const database = getDb();
	const result = database.prepare(`
		DELETE FROM quotes
		WHERE id = ?
	`).run(id);
	return result.changes > 0;
}

export function getOrCreateDailyQuote(date: string): DailyQuote | null {
	const existing = getDailyQuoteRow(date);
	if (existing) return mapDailyQuoteRow(existing);

	const database = getDb();
	const quoteRow = database.prepare(`
		SELECT id, text_encrypted
		FROM quotes
		ORDER BY RANDOM()
		LIMIT 1
	`).get() as { id: number; text_encrypted: Buffer } | undefined;
	if (!quoteRow) return null;

	const quoteText = decrypt(quoteRow.text_encrypted.toString('utf8'));
	const quoteTextEncrypted = Buffer.from(encrypt(quoteText), 'utf8');
	const quoteIdEncrypted = encryptOptionalNumber(quoteRow.id);

	database.prepare(`
		INSERT OR IGNORE INTO daily_quotes (date, quote_id_encrypted, quote_text_encrypted)
		VALUES (?, ?, ?)
	`).run(date, quoteIdEncrypted, quoteTextEncrypted);

	const stored = getDailyQuoteRow(date);
	return stored ? mapDailyQuoteRow(stored) : {
		date,
		quote_id: quoteRow.id,
		text: quoteText,
		created_at: new Date().toISOString()
	};
}

export function getDailyQuotes(): DailyQuote[] {
	const database = getDb();
	const rows = database.prepare(`
		SELECT date, quote_id_encrypted, quote_text_encrypted, created_at
		FROM daily_quotes
		ORDER BY date DESC
	`).all() as DailyQuoteRow[];
	return rows.map(mapDailyQuoteRow);
}
