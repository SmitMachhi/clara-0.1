import type Database from 'better-sqlite3';
import { decrypt, decryptWithLegacyKey, encrypt } from '$lib/server/crypto.js';
import { EMPTY_COORDINATE_PLACEHOLDER, EMPTY_TEXT_PLACEHOLDER } from './connection.js';
import {
	encryptOptionalString,
	encryptOptionalNumber
} from './crypto-helpers.js';
export function migrateEncryptedDataToNewKey(database: Database.Database): void {
	const migrationDone = database.prepare(
		"SELECT value FROM config WHERE key = 'encryption_key_migrated_v2'"
	).get() as { value: string } | undefined;
	if (migrationDone?.value === 'true') return;
	const reEncryptRow = (blob: Buffer): Buffer => {
		const stored = blob.toString('utf8');
		try {
			const plaintext = decryptWithLegacyKey(stored);
			return Buffer.from(encrypt(plaintext), 'utf8');
		} catch {
			try {
				decrypt(stored);
				return blob;
			} catch {
				throw new Error('Encrypted data unreadable with both legacy and current keys');
			}
		}
	};

	// Process entries: collect IDs first to avoid cursor conflicts, then batch update
	const entryIds = database.prepare('SELECT id FROM entries').pluck().all() as number[];
	const updateEntry = database.prepare(
		'UPDATE entries SET encrypted_data = ?, captured_lat_encrypted = ?,' +
		' captured_lng_encrypted = ?, location_id_encrypted = ?,' +
		' quote_id_encrypted = ?, quote_text_encrypted = ? WHERE id = ?'
	);
	const selectEntry = database.prepare(
		'SELECT id, encrypted_data, captured_lat_encrypted, captured_lng_encrypted,' +
		' location_id_encrypted, quote_id_encrypted, quote_text_encrypted FROM entries WHERE id = ?'
	);
	for (const id of entryIds) {
		const row = selectEntry.get(id) as {
			id: number; encrypted_data: Buffer;
			captured_lat_encrypted: Buffer | null; captured_lng_encrypted: Buffer | null;
			location_id_encrypted: Buffer | null;
			quote_id_encrypted: Buffer | null;
			quote_text_encrypted: Buffer | null;
		};
		const newData = reEncryptRow(row.encrypted_data);
		const newLat = row.captured_lat_encrypted ? reEncryptRow(row.captured_lat_encrypted) : null;
		const newLng = row.captured_lng_encrypted ? reEncryptRow(row.captured_lng_encrypted) : null;
		const newLocationId = row.location_id_encrypted ? reEncryptRow(row.location_id_encrypted) : null;
		const newQuoteId = row.quote_id_encrypted ? reEncryptRow(row.quote_id_encrypted) : null;
		const newQuoteText = row.quote_text_encrypted ? reEncryptRow(row.quote_text_encrypted) : null;
		updateEntry.run(newData, newLat, newLng, newLocationId, newQuoteId, newQuoteText, row.id);
	}

	// Process quotes
	const quoteIds = database.prepare('SELECT id FROM quotes').pluck().all() as number[];
	const updateQuote = database.prepare('UPDATE quotes SET text_encrypted = ? WHERE id = ?');
	const selectQuote = database.prepare('SELECT id, text_encrypted FROM quotes WHERE id = ?');
	for (const id of quoteIds) {
		const row = selectQuote.get(id) as { id: number; text_encrypted: Buffer };
		const newText = reEncryptRow(row.text_encrypted);
		updateQuote.run(newText, row.id);
	}

	// Process daily_quotes
	const dailyQuoteDates = database.prepare('SELECT date FROM daily_quotes').pluck().all() as string[];
	const updateDailyQuote = database.prepare(
		'UPDATE daily_quotes SET quote_id_encrypted = ?, quote_text_encrypted = ? WHERE date = ?'
	);
	const selectDailyQuote = database.prepare(
		'SELECT date, quote_id_encrypted, quote_text_encrypted FROM daily_quotes WHERE date = ?'
	);
	for (const date of dailyQuoteDates) {
		const row = selectDailyQuote.get(date) as {
			date: string;
			quote_id_encrypted: Buffer | null;
			quote_text_encrypted: Buffer;
		};
		const newQuoteId = row.quote_id_encrypted ? reEncryptRow(row.quote_id_encrypted) : null;
		const newQuoteText = reEncryptRow(row.quote_text_encrypted);
		updateDailyQuote.run(newQuoteId, newQuoteText, row.date);
	}

	// Process quote_sources
	const quoteSourceIds = database.prepare('SELECT id FROM quote_sources').pluck().all() as number[];
	const updateQuoteSource = database.prepare(
		'UPDATE quote_sources SET source_text_encrypted = ? WHERE id = ?'
	);
	const selectQuoteSource = database.prepare(
		'SELECT id, source_text_encrypted FROM quote_sources WHERE id = ?'
	);
	for (const id of quoteSourceIds) {
		const row = selectQuoteSource.get(id) as { id: number; source_text_encrypted: Buffer };
		const newSource = reEncryptRow(row.source_text_encrypted);
		updateQuoteSource.run(newSource, row.id);
	}

	// Process locations
	const locationIds = database.prepare('SELECT id FROM locations').pluck().all() as number[];
	const updateLocation = database.prepare(
		'UPDATE locations SET name_encrypted = ?, lat_encrypted = ?,' +
		' lng_encrypted = ?, address_encrypted = ? WHERE id = ?'
	);
	const selectLocation = database.prepare(
		'SELECT id, name_encrypted, lat_encrypted, lng_encrypted, address_encrypted FROM locations WHERE id = ?'
	);
	for (const id of locationIds) {
		const row = selectLocation.get(id) as {
			id: number; name_encrypted: Buffer | null;
			lat_encrypted: Buffer | null; lng_encrypted: Buffer | null;
			address_encrypted: Buffer | null;
		};
		const newName = row.name_encrypted ? reEncryptRow(row.name_encrypted) : null;
		const newLat = row.lat_encrypted ? reEncryptRow(row.lat_encrypted) : null;
		const newLng = row.lng_encrypted ? reEncryptRow(row.lng_encrypted) : null;
		const newAddr = row.address_encrypted ? reEncryptRow(row.address_encrypted) : null;
		updateLocation.run(newName, newLat, newLng, newAddr, row.id);
	}

	// Process templates
	const templateIds = database.prepare('SELECT id FROM templates').pluck().all() as number[];
	const updateTemplate = database.prepare(
		'UPDATE templates SET source_text_encrypted = ?, parsed_json_encrypted = ? WHERE id = ?'
	);
	const selectTemplate = database.prepare(
		'SELECT id, source_text_encrypted, parsed_json_encrypted FROM templates WHERE id = ?'
	);
	for (const id of templateIds) {
		const row = selectTemplate.get(id) as { id: number; source_text_encrypted: Buffer; parsed_json_encrypted: Buffer };
		const newSource = reEncryptRow(row.source_text_encrypted);
		const newParsed = reEncryptRow(row.parsed_json_encrypted);
		updateTemplate.run(newSource, newParsed, row.id);
	}

	// Process template_presets
	const presetIds = database.prepare('SELECT id FROM template_presets').pluck().all() as number[];
	const updatePreset = database.prepare(
		'UPDATE template_presets SET source_text_encrypted = ?, parsed_json_encrypted = ? WHERE id = ?'
	);
	const selectPreset = database.prepare(
		'SELECT id, source_text_encrypted, parsed_json_encrypted FROM template_presets WHERE id = ?'
	);
	for (const id of presetIds) {
		const row = selectPreset.get(id) as { id: number; source_text_encrypted: Buffer; parsed_json_encrypted: Buffer };
		const newSource = reEncryptRow(row.source_text_encrypted);
		const newParsed = reEncryptRow(row.parsed_json_encrypted);
		updatePreset.run(newSource, newParsed, row.id);
	}

	// Mark migration as complete
	const statement = "INSERT INTO config (key, value) VALUES ('encryption_key_migrated_v2'," +
		" 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'";
	database.prepare(statement).run();
}

export function backfillTemplateParsedJson(database: Database.Database): void {
	// Use iterate() instead of all() to avoid loading full tables into memory
	let hasRows = false;
	const select = database.prepare(
		'SELECT id, parsed_json FROM templates WHERE parsed_json_encrypted IS NULL'
	);
	const update = database.prepare(
		'UPDATE templates SET parsed_json_encrypted = ?, parsed_json = ? WHERE id = ?'
	);
	for (const row of select.iterate() as Iterable<{ id: number; parsed_json: string }>) {
		hasRows = true;
		const encrypted = encrypt(row.parsed_json);
		update.run(Buffer.from(encrypted, 'utf8'), EMPTY_TEXT_PLACEHOLDER, row.id);
	}
	if (!hasRows) return;
}
export function backfillTemplatePresetParsedJson(database: Database.Database): void {
	// Use iterate() instead of all() to avoid loading full tables into memory
	let hasRows = false;
	const select = database.prepare(
		'SELECT id, parsed_json FROM template_presets WHERE parsed_json_encrypted IS NULL'
	);
	const update = database.prepare(
		'UPDATE template_presets SET parsed_json_encrypted = ?, parsed_json = ? WHERE id = ?'
	);
	for (const row of select.iterate() as Iterable<{ id: number; parsed_json: string }>) {
		hasRows = true;
		const encrypted = encrypt(row.parsed_json);
		update.run(Buffer.from(encrypted, 'utf8'), EMPTY_TEXT_PLACEHOLDER, row.id);
	}
	if (!hasRows) return;
}
export function backfillLocationsEncryptedData(database: Database.Database): void {
	// Use iterate() instead of all() to avoid loading full tables into memory
	let hasRows = false;
	const select = database.prepare(
		'SELECT id, name, lat, lng, address, name_encrypted, lat_encrypted, lng_encrypted,' +
		' address_encrypted FROM locations WHERE name_encrypted IS NULL OR lat_encrypted IS NULL OR' +
		' lng_encrypted IS NULL OR (address IS NOT NULL AND address_encrypted IS NULL)'
	);
	const update = database.prepare(
		'UPDATE locations SET name = ?, lat = ?, lng = ?, address = ?, name_encrypted = ?,' +
		' lat_encrypted = ?, lng_encrypted = ?, address_encrypted = ? WHERE id = ?'
	);
	for (const row of select.iterate() as Iterable<{
		id: number;
		name: string;
		lat: number;
		lng: number;
		address: string | null;
		name_encrypted: Buffer | null;
		lat_encrypted: Buffer | null;
		lng_encrypted: Buffer | null;
		address_encrypted: Buffer | null;
	}>) {
		hasRows = true;
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
	if (!hasRows) return;
}
export function backfillEntryCapturedCoordinates(database: Database.Database): void {
	// Use iterate() instead of all() to avoid loading full tables into memory
	let hasRows = false;
	const select = database.prepare(
		'SELECT id, captured_lat, captured_lng, captured_lat_encrypted, captured_lng_encrypted' +
		' FROM entries WHERE captured_lat_encrypted IS NULL OR captured_lng_encrypted IS NULL'
	);
	const update = database.prepare(
		'UPDATE entries SET captured_lat = ?, captured_lng = ?, captured_lat_encrypted = ?,' +
		' captured_lng_encrypted = ? WHERE id = ?'
	);
	for (const row of select.iterate() as Iterable<{
		id: number;
		captured_lat: number | null;
		captured_lng: number | null;
		captured_lat_encrypted: Buffer | null;
		captured_lng_encrypted: Buffer | null;
	}>) {
		hasRows = true;
		const latEncrypted = row.captured_lat_encrypted ?? encryptOptionalNumber(row.captured_lat);
		const lngEncrypted = row.captured_lng_encrypted ?? encryptOptionalNumber(row.captured_lng);
		update.run(null, null, latEncrypted, lngEncrypted, row.id);
	}
	if (!hasRows) return;
}
export function backfillEntryLocationIdEncryption(database: Database.Database): void {
	// Use iterate() instead of all() to avoid loading full tables into memory
	let hasRows = false;
	const select = database.prepare(
		'SELECT id, location_id FROM entries WHERE location_id IS NOT NULL' +
		' AND location_id_encrypted IS NULL'
	);
	const migrate = database.transaction(() => {
		const update = database.prepare(
			'UPDATE entries SET location_id = NULL, location_id_encrypted = ? WHERE id = ?'
		);
		for (const row of select.iterate() as Iterable<{ id: number; location_id: number }>) {
			hasRows = true;
			const encrypted = encryptOptionalNumber(row.location_id);
			update.run(encrypted, row.id);
		}
	});
	migrate();
	if (!hasRows) return;
}
