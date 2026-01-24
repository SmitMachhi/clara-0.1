import type { RequestHandler } from './$types';
import {
	getAllEntries,
	getEntryByDate,
	getLocations,
	getActiveTemplate,
	getTemplatePresets,
	getTemplatePresetById
} from '$lib/db.js';
import { decrypt } from '$lib/server/crypto.js';

export const GET: RequestHandler = async () => {
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

	const exportData = {
		exportedAt: new Date().toISOString(),
		entries: entriesWithData,
		locations: locations.map(location => ({
			name: location.name,
			lat: location.lat,
			lng: location.lng,
			address: location.address
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
			'Content-Type': 'application/json',
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};
