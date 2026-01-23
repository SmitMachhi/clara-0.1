import type { RequestHandler } from './$types';
import { getLocations, addLocation, locationNameExists } from '$lib/db.js';
import { validateCoordinates, validateLocationName } from '$lib/validation.js';
import { parseJsonBody, successResponse, errorResponse } from '$lib/api-helpers.js';

export const GET: RequestHandler = async () => {
	const locations = getLocations();
	return successResponse({ locations });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await parseJsonBody<{ name: string; lat: number; lng: number; address?: string | null }>(request);
	if (body.error) {
		return errorResponse(body.error);
	}

	const { name, lat, lng, address } = body.data!;

	const nameValidation = validateLocationName(name);
	if (!nameValidation.valid) {
		return errorResponse(nameValidation.error!);
	}

	if (typeof lat !== 'number' || typeof lng !== 'number') {
		return errorResponse('Latitude and longitude are required');
	}

	const coordValidation = validateCoordinates(lat, lng);
	if (!coordValidation.valid) {
		return errorResponse(coordValidation.error!);
	}

	// Check for duplicate location names (case-insensitive)
	if (locationNameExists(name)) {
		return errorResponse('A location with this name already exists');
	}

	try {
		const id = addLocation(name.trim(), lat, lng, address || undefined);
		return successResponse({ id, name: name.trim(), lat, lng, address });
	} catch (error) {
		return errorResponse('Failed to add location');
	}
};
