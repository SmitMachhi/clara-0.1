import type { RequestHandler } from './$types';
import { getDb } from '$lib/db.js';
import { parseJsonBody, successResponse, errorResponse } from '$lib/api-helpers.js';

interface WipePayload {
	confirm: string;
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await parseJsonBody<WipePayload>(request, 2048);
	if (body.error) {
		return errorResponse(body.error);
	}

	if (body.data?.confirm !== 'DELETE_ALL_MY_DATA') {
		return errorResponse('Must send { \"confirm\": \"DELETE_ALL_MY_DATA\" } to proceed');
	}

	const database = getDb();
	database.exec('DELETE FROM entries');
	database.exec('DELETE FROM locations');
	database.exec('DELETE FROM templates');
	database.exec('DELETE FROM template_presets');
	database.exec("DELETE FROM config WHERE key != 'encryption_key_migrated_v2'");

	return successResponse({ message: 'All data deleted' });
};
