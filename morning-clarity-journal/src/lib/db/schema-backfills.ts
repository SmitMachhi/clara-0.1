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
	const migrate = database.transaction(() => {
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
		const updateEntry = database.prepare(
			'UPDATE entries SET encrypted_data = ?, captured_lat_encrypted = ?,' +
			' captured_lng_encrypted = ?, location_id_encrypted = ?,' +
			' quote_id_encrypted = ?, quote_text_encrypted = ? WHERE id = ?'
		);
		const selectEntries = database.prepare(
			'SELECT id, encrypted_data, captured_lat_encrypted, captured_lng_encrypted,' +
			' location_id_encrypted, quote_id_encrypted, quote_text_encrypted FROM entries'
		);
		for (const row of selectEntries.iterate()) {
			const newData = reEncryptRow(row.encrypted_data);
			const newLat = row.captured_lat_encrypted ? reEncryptRow(row.captured_lat_encrypted) : null;
			const newLng = row.captured_lng_encrypted ? reEncryptRow(row.captured_lng_encrypted) : null;
			const newLocationId = row.location_id_encrypted ? reEncryptRow(row.location_id_encrypted) : null;
			const newQuoteId = row.quote_id_encrypted ? reEncryptRow(row.quote_id_encrypted) : null;
			const newQuoteText = row.quote_text_encrypted ? reEncryptRow(row.quote_text_encrypted) : null;
			updateEntry.run(newData, newLat, newLng, newLocationId, newQuoteId, newQuoteText, row.id);
		}
		const updateQuote = database.prepare(
			'UPDATE quotes SET text_encrypted = ? WHERE id = ?'
		);
		const selectQuotes = database.prepare(
			'SELECT id, text_encrypted FROM quotes'
		);
		for (const row of selectQuotes.iterate()) {
			const newText = reEncryptRow(row.text_encrypted);
			updateQuote.run(newText, row.id);
		}
		const updateDailyQuote = database.prepare(
			'UPDATE daily_quotes SET quote_id_encrypted = ?, quote_text_encrypted = ? WHERE date = ?'
		);
		const selectDailyQuotes = database.prepare(
			'SELECT date, quote_id_encrypted, quote_text_encrypted FROM daily_quotes'
		);
		for (const row of selectDailyQuotes.iterate()) {
			const newQuoteId = row.quote_id_encrypted ? reEncryptRow(row.quote_id_encrypted) : null;
			const newQuoteText = reEncryptRow(row.quote_text_encrypted);
			updateDailyQuote.run(newQuoteId, newQuoteText, row.date);
		}
		const updateQuoteSource = database.prepare(
			'UPDATE quote_sources SET source_text_encrypted = ? WHERE id = ?'
		);
		const selectQuoteSources = database.prepare(
			'SELECT id, source_text_encrypted FROM quote_sources'
		);
		for (const row of selectQuoteSources.iterate()) {
			const newSource = reEncryptRow(row.source_text_encrypted);
			updateQuoteSource.run(newSource, row.id);
		}
		const updateLocation = database.prepare(
			'UPDATE locations SET name_encrypted = ?, lat_encrypted = ?,' +
			' lng_encrypted = ?, address_encrypted = ? WHERE id = ?'
		);
		const selectLocations = database.prepare(
			'SELECT id, name_encrypted, lat_encrypted, lng_encrypted, address_encrypted FROM locations'
		);
		for (const row of selectLocations.iterate()) {
			const newName = row.name_encrypted ? reEncryptRow(row.name_encrypted) : null;
			const newLat = row.lat_encrypted ? reEncryptRow(row.lat_encrypted) : null;
			const newLng = row.lng_encrypted ? reEncryptRow(row.lng_encrypted) : null;
			const newAddr = row.address_encrypted ? reEncryptRow(row.address_encrypted) : null;
			updateLocation.run(newName, newLat, newLng, newAddr, row.id);
		}
		const updateTemplate = database.prepare(
			'UPDATE templates SET source_text_encrypted = ?, parsed_json_encrypted = ? WHERE id = ?'
		);
		const selectTemplates = database.prepare(
			'SELECT id, source_text_encrypted, parsed_json_encrypted FROM templates'
		);
		for (const row of selectTemplates.iterate()) {
			const newSource = reEncryptRow(row.source_text_encrypted);
			const newParsed = reEncryptRow(row.parsed_json_encrypted);
			updateTemplate.run(newSource, newParsed, row.id);
		}
		const updatePreset = database.prepare(
			'UPDATE template_presets SET source_text_encrypted = ?, parsed_json_encrypted = ? WHERE id = ?'
		);
		const selectPresets = database.prepare(
			'SELECT id, source_text_encrypted, parsed_json_encrypted FROM template_presets'
		);
		for (const row of selectPresets.iterate()) {
			const newSource = reEncryptRow(row.source_text_encrypted);
			const newParsed = reEncryptRow(row.parsed_json_encrypted);
			updatePreset.run(newSource, newParsed, row.id);
		}
		const statement = "INSERT INTO config (key, value) VALUES ('encryption_key_migrated_v2'," +
			" 'true') ON CONFLICT(key) DO UPDATE SET value = 'true'";
		database.prepare(statement).run();
	});
	migrate();
}
export function backfillTemplateParsedJson(database: Database.Database): void {
	let hasRows = false;
	const select = database.prepare(
		'SELECT id, parsed_json FROM templates WHERE parsed_json_encrypted IS NULL'
	);
	const update = database.prepare(
		'UPDATE templates SET parsed_json_encrypted = ?, parsed_json = ? WHERE id = ?'
	);
	for (const row of select.iterate()) {
		hasRows = true;
		const encrypted = encrypt(row.parsed_json);
		update.run(Buffer.from(encrypted, 'utf8'), EMPTY_TEXT_PLACEHOLDER, row.id);
	}
	if (!hasRows) return;
}
export function backfillTemplatePresetParsedJson(database: Database.Database): void {
	const rows = database.prepare(
		'SELECT id, parsed_json FROM template_presets WHERE parsed_json_encrypted IS NULL'
	).all() as Array<{ id: number; parsed_json: string }>;
	if (rows.length === 0) return;
	const update = database.prepare(
		'UPDATE template_presets SET parsed_json_encrypted = ?, parsed_json = ? WHERE id = ?'
	);
	for (const row of rows) {
		const encrypted = encrypt(row.parsed_json);
		update.run(Buffer.from(encrypted, 'utf8'), EMPTY_TEXT_PLACEHOLDER, row.id);
	}
}
export function backfillLocationsEncryptedData(database: Database.Database): void {
	const rows = database.prepare(
		'SELECT id, name, lat, lng, address, name_encrypted, lat_encrypted, lng_encrypted,' +
		' address_encrypted FROM locations WHERE name_encrypted IS NULL OR lat_encrypted IS NULL OR' +
		' lng_encrypted IS NULL OR (address IS NOT NULL AND address_encrypted IS NULL)'
	).all() as Array<{
		id: number;
		name: string;
		lat: number;
		lng: number;
		address: string | null;
		name_encrypted: Buffer | null;
		lat_encrypted: Buffer | null;
		lng_encrypted: Buffer | null;
		address_encrypted: Buffer | null;
	}>;
	if (rows.length === 0) return;
	const update = database.prepare(
		'UPDATE locations SET name = ?, lat = ?, lng = ?, address = ?, name_encrypted = ?,' +
		' lat_encrypted = ?, lng_encrypted = ?, address_encrypted = ? WHERE id = ?'
	);
	for (const row of rows) {
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
}
export function backfillEntryCapturedCoordinates(database: Database.Database): void {
	const rows = database.prepare(
		'SELECT id, captured_lat, captured_lng, captured_lat_encrypted, captured_lng_encrypted' +
		' FROM entries WHERE captured_lat_encrypted IS NULL OR captured_lng_encrypted IS NULL'
	).all() as Array<{
		id: number;
		captured_lat: number | null;
		captured_lng: number | null;
		captured_lat_encrypted: Buffer | null;
		captured_lng_encrypted: Buffer | null;
	}>;
	if (rows.length === 0) return;
	const update = database.prepare(
		'UPDATE entries SET captured_lat = ?, captured_lng = ?, captured_lat_encrypted = ?,' +
		' captured_lng_encrypted = ? WHERE id = ?'
	);
	for (const row of rows) {
		const latEncrypted = row.captured_lat_encrypted ?? encryptOptionalNumber(row.captured_lat);
		const lngEncrypted = row.captured_lng_encrypted ?? encryptOptionalNumber(row.captured_lng);
		update.run(null, null, latEncrypted, lngEncrypted, row.id);
	}
}
export function backfillEntryLocationIdEncryption(database: Database.Database): void {
	const rows = database.prepare(
		'SELECT id, location_id FROM entries WHERE location_id IS NOT NULL' +
		' AND location_id_encrypted IS NULL'
	).all() as Array<{ id: number; location_id: number }>;
	if (rows.length === 0) return;
	const migrate = database.transaction(() => {
		const update = database.prepare(
			'UPDATE entries SET location_id = NULL, location_id_encrypted = ? WHERE id = ?'
		);
		for (const row of rows) {
			const encrypted = encryptOptionalNumber(row.location_id);
			update.run(encrypted, row.id);
		}
	});
	migrate();
}
