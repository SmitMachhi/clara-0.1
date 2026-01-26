import { decrypt, encrypt } from '$lib/server/crypto.js';
import { getDb } from './connection.js';
import { decryptOptionalNumber, encryptOptionalNumber } from './crypto-helpers.js';
import { parseQuoteSource, serializeQuoteSource } from '$lib/quote-parser.js';
import type { DailyQuote, QuoteSource } from './types.js';

interface DailyQuoteRow {
	date: string;
	quote_id_encrypted: Buffer | null;
	quote_text_encrypted: Buffer;
	created_at: string;
}

interface QuoteSourceRow {
	id: number;
	source_text_encrypted: Buffer;
	created_at: string;
	updated_at: string;
}

interface LegacyQuoteRow {
	id: number;
	text_encrypted: Buffer;
	created_at: string;
}

const SOURCE_ID = 1;

function mapDailyQuoteRow(row: DailyQuoteRow): DailyQuote {
	return {
		date: row.date,
		quote_id: decryptOptionalNumber(row.quote_id_encrypted),
		text: decrypt(row.quote_text_encrypted.toString('utf8')),
		created_at: row.created_at
	};
}

function mapQuoteSourceRow(row: QuoteSourceRow): QuoteSource {
	return {
		id: row.id,
		sourceText: decrypt(row.source_text_encrypted.toString('utf8')),
		created_at: row.created_at,
		updated_at: row.updated_at
	};
}

function getQuoteSourceRow(): QuoteSourceRow | null {
	const database = getDb();
	const row = database.prepare(`
		SELECT id, source_text_encrypted, created_at, updated_at
		FROM quote_sources
		WHERE id = ?
	`).get(SOURCE_ID) as QuoteSourceRow | undefined;
	return row ?? null;
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

function getLegacyQuotes(): LegacyQuoteRow[] {
	const database = getDb();
	return database.prepare(`
		SELECT id, text_encrypted, created_at
		FROM quotes
		ORDER BY created_at DESC
	`).all() as LegacyQuoteRow[];
}

function seedQuoteSourceFromLegacy(): string | null {
	const legacyRows = getLegacyQuotes();
	if (legacyRows.length === 0) return null;
	const quotes = legacyRows.map(row => decrypt(row.text_encrypted.toString('utf8')));
	const sourceText = serializeQuoteSource(quotes);
	setQuoteSource(sourceText);
	return sourceText;
}

export function getQuoteSource(): QuoteSource | null {
	const existing = getQuoteSourceRow();
	if (existing) return mapQuoteSourceRow(existing);
	const seeded = seedQuoteSourceFromLegacy();
	if (!seeded) return null;
	const created = getQuoteSourceRow();
	return created ? mapQuoteSourceRow(created) : null;
}

export function setQuoteSource(sourceText: string): void {
	const database = getDb();
	const encrypted = Buffer.from(encrypt(sourceText), 'utf8');
	database.prepare(`
		INSERT INTO quote_sources (id, source_text_encrypted)
		VALUES (?, ?)
		ON CONFLICT(id) DO UPDATE SET
			source_text_encrypted = excluded.source_text_encrypted,
			updated_at = datetime('now')
	`).run(SOURCE_ID, encrypted);
}

export function getParsedQuotes(): { quotes: string[]; errors: string[] } {
	const source = getQuoteSource();
	if (!source) {
		return { quotes: [], errors: [] };
	}
	return parseQuoteSource(source.sourceText);
}

export function getOrCreateDailyQuote(date: string): DailyQuote | null {
	const existing = getDailyQuoteRow(date);
	if (existing) return mapDailyQuoteRow(existing);

	const parsed = getParsedQuotes();
	if (parsed.quotes.length === 0) return null;

	const quoteText = parsed.quotes[Math.floor(Math.random() * parsed.quotes.length)];
	const quoteTextEncrypted = Buffer.from(encrypt(quoteText), 'utf8');

	const database = getDb();
	database.prepare(`
		INSERT OR IGNORE INTO daily_quotes (date, quote_id_encrypted, quote_text_encrypted)
		VALUES (?, ?, ?)
	`).run(date, null, quoteTextEncrypted);

	const stored = getDailyQuoteRow(date);
	return stored ? mapDailyQuoteRow(stored) : {
		date,
		quote_id: null,
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
