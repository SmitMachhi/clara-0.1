import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteLocation, getLocationById } from '$lib/db.js';

export const DELETE: RequestHandler = async ({ params }) => {
	const id = parseInt(params.id, 10);
	
	if (isNaN(id)) {
		return json({ success: false, error: 'Invalid location ID' }, { status: 400 });
	}
	
	const location = getLocationById(id);
	if (!location) {
		return json({ success: false, error: 'Location not found' }, { status: 404 });
	}
	
	const deleted = deleteLocation(id);
	
	if (deleted) {
		return json({ success: true });
	} else {
		return json({ success: false, error: 'Failed to delete location' }, { status: 500 });
	}
};
