import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEntryByDate, getTemplateById } from '$lib/db.js';
import { decrypt } from '$lib/server/crypto.js';
import { noStoreHeaders } from '$lib/api-helpers.js';

function isValidDateFormat(dateStr: string): boolean {
	// Must match YYYY-MM-DD format
	if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
		return false;
	}

	// Must be a valid date
	const [year, month, day] = dateStr.split('-').map(Number);
	const date = new Date(year, month - 1, day);
	return date.getFullYear() === year &&
		date.getMonth() === month - 1 &&
		date.getDate() === day;
}

export const GET: RequestHandler = async ({ params }) => {
	if (!isValidDateFormat(params.date)) {
		return new Response('Invalid date format', { status: 400, headers: noStoreHeaders() });
	}

	const entry = getEntryByDate(params.date);

	if (!entry) {
		return new Response('Entry not found', { status: 404, headers: noStoreHeaders() });
	}

	const encryptedStr = entry.rawData.toString('utf8');
	const data = JSON.parse(decrypt(encryptedStr));
	const templateId = entry.template_id;
	const template = templateId ? getTemplateById(templateId) : null;

	if (!template) {
		return new Response('Failed to load template', { status: 500, headers: noStoreHeaders() });
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
	}, { headers: noStoreHeaders() });
};
