import type { RequestHandler } from './$types';
import { deleteLocation, getLocationById } from '$lib/db.js';
import { validateId } from '$lib/validation.js';
import { successResponse, errorResponse, notFoundResponse } from '$lib/api-helpers.js';

export const DELETE: RequestHandler = async ({ params }) => {
	const validation = validateId(params.id);
	if (!validation.valid) {
		return errorResponse(validation.error!);
	}
	const id = typeof params.id === 'number' ? params.id : parseInt(params.id, 10);

	const location = getLocationById(id);
	if (!location) {
		return notFoundResponse('Location not found');
	}

	const deleted = deleteLocation(id);

	if (deleted) {
		return successResponse();
	} else {
		return errorResponse('Failed to delete location', 500);
	}
};
