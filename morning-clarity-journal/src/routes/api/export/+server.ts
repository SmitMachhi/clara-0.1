import type { RequestHandler } from './$types';
import {
	getAllEntries,
	getEntryByDate,
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

export const GET: RequestHandler = async () => {
	logAuditEvent({
		eventType: 'data_export',
		details: { format: 'json' }
	});

	const entries = getAllEntries();
	const entriesWithData = entries.map(entry => {
		const full = getEntryByDate(entry.date);
		let data = null;
		if (full?.rawData) {
			try {
				const decrypted = decrypt(full.rawData.toString('utf8'));
				data = JSON.parse(decrypted);
			} catch {
				data = null;
			}
		}
		return {
			date: entry.date,
			timestamp: entry.timestamp,
			location_name: entry.location_name ?? null,
			captured_lat: entry.captured_lat,
			captured_lng: entry.captured_lng,
			quote_text: full?.quote_text ?? null,
			data
		};
	});

	const locations = getLocations();
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

	const exportData = {
		exportedAt: new Date().toISOString(),
		entries: entriesWithData,
		locations: locations.map(location => ({
			name: location.name,
			lat: location.lat,
			lng: location.lng,
			address: location.address
		})),
		quoteSource: quoteSource?.sourceText ?? null,
		quotes: parsedQuotes,
		dailyQuotes: getDailyQuotes().map(quote => ({
			date: quote.date,
			text: quote.text,
			created_at: quote.created_at
		})),
		activeTemplate: activeTemplate ? {
			sourceText: activeTemplate.sourceText
		} : null,
		presets
	};

	const json = JSON.stringify(exportData, null, 2);
	const filename = `journal-export-${new Date().toISOString().slice(0, 10)}.json`;

	return new Response(json, {
		headers: {
			...noStoreHeaders(),
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
