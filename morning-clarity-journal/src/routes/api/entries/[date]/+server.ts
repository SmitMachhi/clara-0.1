import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getEntryByDate } from '$lib/db.js';

export const GET: RequestHandler = async ({ params }) => {
	const entry = getEntryByDate(params.date);
	
	if (!entry) {
		throw error(404, 'Entry not found');
	}
	
	return json(entry);
};
