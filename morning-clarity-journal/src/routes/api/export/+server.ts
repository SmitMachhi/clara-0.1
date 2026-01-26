import type { RequestHandler } from './$types';
import {
	iterateEntriesWithRawData,
	getLocations,
	getActiveTemplate,
	getTemplatePresets,
	getTemplatePresetById,
	getQuoteSource,
	getDailyQuotes
} from '$lib/db.js';
import { decrypt } from '$lib/server/crypto.js';
import { noStoreHeaders } from '$lib/api-helpers.js';
import { logAuditEvent } from '$lib/audit.js';
import { parseQuoteSource } from '$lib/quote-parser.js';
import {
	decryptOptionalNumber,
	decryptOptionalString
} from '$lib/db/crypto-helpers.js';

export const GET: RequestHandler = async () => {
	logAuditEvent({
		eventType: 'data_export',
		details: { format: 'json' }
	});

	const encoder = new TextEncoder();
	const locations = getLocations();
	const locationMap = new Map<number, string>();
	for (const loc of locations) {
		locationMap.set(loc.id, loc.name);
	}
	const activeTemplate = getActiveTemplate();
	const presetSummaries = getTemplatePresets();
	const presets = presetSummaries.map(preset => {
		const full = getTemplatePresetById(preset.id);
		return {
			id: preset.id,
			name: preset.name,
			sourceText: full?.sourceText ?? null
		};
	});

	const quoteSource = getQuoteSource();
	const parsedQuotes = quoteSource ? parseQuoteSource(quoteSource.sourceText).quotes : [];
	const dailyQuotes = getDailyQuotes().map(quote => ({
		date: quote.date,
		text: quote.text,
		created_at: quote.created_at
	}));

	const stream = new ReadableStream({
		start(controller) {
			const write = (text: string) => controller.enqueue(encoder.encode(text));

			write('{\n');
			write(`  "exportedAt": "${new Date().toISOString()}"`);
			write(',\n  "locations": ');

			write(JSON.stringify(locations.map(location => ({
				name: location.name,
				lat: location.lat,
				lng: location.lng,
				address: location.address
			})), null, 2));

			write(',\n  "quoteSource": ');
			write(JSON.stringify(quoteSource?.sourceText ?? null));

			write(',\n  "quotes": ');
			write(JSON.stringify(parsedQuotes));

			write(',\n  "dailyQuotes": ');
			write(JSON.stringify(dailyQuotes));

			write(',\n  "activeTemplate": ');
			write(JSON.stringify(activeTemplate ? { sourceText: activeTemplate.sourceText } : null));

			write(',\n  "presets": ');
			write(JSON.stringify(presets));

			write(',\n  "entries": [');

			let first = true;
			for (const row of iterateEntriesWithRawData()) {
				const locationId = decryptOptionalNumber(row.location_id_encrypted);
				const locationName = locationId != null ? locationMap.get(locationId) : null;
				const capturedLat = decryptOptionalNumber(row.captured_lat_encrypted);
				const capturedLng = decryptOptionalNumber(row.captured_lng_encrypted);
				const quoteText = decryptOptionalString(row.quote_text_encrypted);

				let data = null;
				try {
					const decrypted = decrypt(row.encrypted_data.toString('utf8'));
					data = JSON.parse(decrypted);
				} catch {
					data = null;
				}

				const entry = {
					date: row.date,
					timestamp: row.timestamp,
					location_name: locationName ?? null,
					captured_lat: capturedLat,
					captured_lng: capturedLng,
					quote_text: quoteText ?? null,
					data
				};

				if (!first) {
					write(',');
				}
				first = false;

				write('\n    ');
				write(JSON.stringify(entry));
			}

			write('\n  ]\n}');
			controller.close();
		}
	});

	const filename = `journal-export-${new Date().toISOString().slice(0, 10)}.json`;

	return new Response(stream, {
		headers: {
			...noStoreHeaders(),
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
