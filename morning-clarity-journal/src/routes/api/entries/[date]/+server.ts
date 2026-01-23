import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEntryByDate } from '$lib/db.js';

export const GET: RequestHandler = async ({ params }) => {
	const entry = getEntryByDate(params.date);
	
	if (!entry) {
		throw error(404, 'Entry not found');
	}
	
	return json({
		id: entry.id,
		date: entry.date,
		timestamp: entry.timestamp,
		location_id: entry.location_id,
		captured_lat: entry.captured_lat,
		captured_lng: entry.captured_lng,
		created_at: entry.created_at,
		encryption: JSON.parse(entry.data as unknown as string)
	});
};
