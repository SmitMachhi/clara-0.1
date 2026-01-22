import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLocations, addLocation } from '$lib/db.js';

export const GET: RequestHandler = async () => {
	const locations = getLocations();
	return json(locations);
};

export const POST: RequestHandler = async ({ request }) => {
	const { name, lat, lng, address } = await request.json();
	
	if (!name || typeof name !== 'string' || name.trim().length === 0) {
		return json({ success: false, error: 'Invalid location name' }, { status: 400 });
	}
	
	if (typeof lat !== 'number' || typeof lng !== 'number') {
		return json({ success: false, error: 'Latitude and longitude are required' }, { status: 400 });
	}
	
	if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
		return json({ success: false, error: 'Invalid coordinates' }, { status: 400 });
	}
	
	try {
		const id = addLocation(name.trim(), lat, lng, address);
		return json({ success: true, id, name: name.trim(), lat, lng, address });
	} catch (error) {
		return json({ success: false, error: 'Failed to add location' }, { status: 400 });
	}
};
