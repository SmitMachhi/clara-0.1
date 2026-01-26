import { getDb } from './connection.js';
import { getLocationById, getLocations } from './locations.js';
import {
	decryptOptionalNumber,
	decryptOptionalString,
	encryptOptionalNumber,
	encryptOptionalString
} from './crypto-helpers.js';
import type { Entry, EntryWithData } from './types.js';

/**
 * Build a map of location IDs to location names for efficient lookup.
 * Used when hydrating entries with location names.
 */
function buildLocationNameMap(): Map<number, string> {
	const locations = getLocations();
	const map = new Map<number, string>();
	for (const loc of locations) {
		map.set(loc.id, loc.name);
	}
	return map;
}
export function saveEntry(
	date: string,
	timestamp: string,
	locationId: number | null,
	encryptedData: string,
	templateId: number | null,
	quoteId: number | null,
	quoteText: string | null,
	capturedLat?: number | null,
	capturedLng?: number | null
): number {
	const database = getDb();
	const dataBuffer = Buffer.from(encryptedData, 'utf8');
	const capturedLatEncrypted = encryptOptionalNumber(capturedLat ?? null);
	const capturedLngEncrypted = encryptOptionalNumber(capturedLng ?? null);
	const locationIdEncrypted = encryptOptionalNumber(locationId);
	const quoteIdEncrypted = encryptOptionalNumber(quoteId);
	const quoteTextEncrypted = encryptOptionalString(quoteText);
	const result = database.prepare(`
		INSERT INTO entries (
			date, timestamp, location_id, location_id_encrypted,
			captured_lat, captured_lng, captured_lat_encrypted, captured_lng_encrypted,
			quote_id_encrypted, quote_text_encrypted, template_id, encrypted_data
		)
		VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`).run(
		date,
		timestamp,
		locationIdEncrypted,
		null,
		null,
		capturedLatEncrypted,
		capturedLngEncrypted,
		quoteIdEncrypted,
		quoteTextEncrypted,
		templateId,
		dataBuffer
	);
	return result.lastInsertRowid as number;
}
export function getAllEntries(): Entry[] {
	const database = getDb();
	const rows = database.prepare(`
		SELECT id, date, timestamp, location_id_encrypted,
			captured_lat_encrypted, captured_lng_encrypted, template_id, created_at
		FROM entries
		ORDER BY date DESC
	`).all() as Array<{
		id: number;
		date: string;
		timestamp: string;
		location_id_encrypted: Buffer | null;
		captured_lat_encrypted: Buffer | null;
		captured_lng_encrypted: Buffer | null;
		template_id: number | null;
		created_at: string;
	}>;
	const locationMap = buildLocationNameMap();
	return rows.map(row => {
		const locationId = decryptOptionalNumber(row.location_id_encrypted);
		const locationName = locationId != null ? locationMap.get(locationId) : undefined;
		return {
			id: row.id,
			date: row.date,
			timestamp: row.timestamp,
			location_id: locationId,
			location_name: locationName ?? undefined,
			captured_lat: decryptOptionalNumber(row.captured_lat_encrypted),
			captured_lng: decryptOptionalNumber(row.captured_lng_encrypted),
			template_id: row.template_id,
			created_at: row.created_at
		};
	});
}
export function getRecentEntrySummaries(limit: number): Entry[] {
	const database = getDb();
	const rows = database.prepare(`
		SELECT id, date, timestamp, location_id_encrypted, template_id, created_at
		FROM entries
		ORDER BY date DESC
		LIMIT ?
	`).all(limit) as Array<{
		id: number;
		date: string;
		timestamp: string;
		location_id_encrypted: Buffer | null;
		template_id: number | null;
		created_at: string;
	}>;
	const locationMap = buildLocationNameMap();
	return rows.map(row => {
		const locationId = decryptOptionalNumber(row.location_id_encrypted);
		const locationName = locationId != null ? locationMap.get(locationId) : undefined;
		return {
			id: row.id,
			date: row.date,
			timestamp: row.timestamp,
			location_id: locationId,
			location_name: locationName ?? undefined,
			captured_lat: null,
			captured_lng: null,
			template_id: row.template_id,
			created_at: row.created_at
		};
	});
}
export function getEntryByDate(date: string): (EntryWithData & { rawData: Buffer }) | null {
	const database = getDb();
	const row = database.prepare(`
		SELECT id, date, timestamp, location_id_encrypted, captured_lat_encrypted,
			captured_lng_encrypted, quote_id_encrypted, quote_text_encrypted,
			template_id, encrypted_data, created_at
		FROM entries
		WHERE date = ?
	`).get(date) as {
		id: number;
		date: string;
		timestamp: string;
		location_id_encrypted: Buffer | null;
		captured_lat_encrypted: Buffer | null;
		captured_lng_encrypted: Buffer | null;
		quote_id_encrypted: Buffer | null;
		quote_text_encrypted: Buffer | null;
		template_id: number | null;
		encrypted_data: Buffer;
		created_at: string;
	} | undefined;
	if (!row) return null;
	const locationId = decryptOptionalNumber(row.location_id_encrypted);
	const location = locationId != null ? getLocationById(locationId) : null;
	const quoteId = decryptOptionalNumber(row.quote_id_encrypted);
	const quoteText = decryptOptionalString(row.quote_text_encrypted);
	return {
		id: row.id,
		date: row.date,
		timestamp: row.timestamp,
		location_id: locationId,
		location_name: location?.name,
		captured_lat: decryptOptionalNumber(row.captured_lat_encrypted),
		rawData: row.encrypted_data,
		captured_lng: decryptOptionalNumber(row.captured_lng_encrypted),
		quote_id: quoteId,
		quote_text: quoteText ?? undefined,
		template_id: row.template_id,
		created_at: row.created_at,
		data: {} as any
	};
}
export function getEntryDates(): string[] {
	const database = getDb();
	const rows = database.prepare(
		'SELECT date FROM entries ORDER BY date'
	).all() as { date: string }[];
	return rows.map(r => r.date);
}
