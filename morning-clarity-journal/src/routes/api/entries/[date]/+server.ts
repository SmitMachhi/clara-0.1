import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEntryByDate, getTemplateById } from '$lib/db.js';
import { decrypt } from '$lib/server/crypto.js';

export const GET: RequestHandler = async ({ params }) => {
	const entry = getEntryByDate(params.date);

	if (!entry) {
		throw error(404, 'Entry not found');
	}

	const encryptedStr = entry.rawData.toString('utf8');
	const data = JSON.parse(decrypt(encryptedStr));
	const templateId = entry.template_id;
	const template = templateId ? getTemplateById(templateId) : null;

	if (!template) {
		throw error(500, 'Failed to load template');
	}

	return json({
		id: entry.id,
		date: entry.date,
		timestamp: entry.timestamp,
		location_id: entry.location_id,
		captured_lat: entry.captured_lat,
		captured_lng: entry.captured_lng,
		template_id: templateId,
		created_at: entry.created_at,
		data,
		template: template.parsed
	});
};
