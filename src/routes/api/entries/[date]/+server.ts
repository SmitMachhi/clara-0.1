import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEntryWithTemplate } from '$lib/db.js';
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

	const result = getEntryWithTemplate(params.date);

	if (!result) {
		return new Response('Entry not found', { status: 404, headers: noStoreHeaders() });
	}

	const { entry, template, warning } = result;

	return json({
		id: entry.id,
		date: entry.date,
		timestamp: entry.timestamp,
		location_id: entry.location_id,
		captured_lat: entry.captured_lat,
		captured_lng: entry.captured_lng,
		quote_text: entry.quote_text ?? null,
		template_id: entry.template_id,
		created_at: entry.created_at,
		data: entry.data,
		template,
		warning
	}, { headers: noStoreHeaders() });
};
