import type { RequestHandler } from './$types';
import { getActiveTemplate, saveEntry, getAllEntries, getEntryDates } from '$lib/db.js';
import { formatDateISO, formatDateTime, isPastCutoff } from '$lib/utils.js';
import { validateCoordinates } from '$lib/validation.js';
import { parseJsonBody, successResponse, errorResponse } from '$lib/api-helpers.js';
import { encrypt } from '$lib/server/crypto.js';

export const GET: RequestHandler = async () => {
	const entries = getAllEntries();
	const entryDates = getEntryDates();

	return successResponse({ entries, entryDates });
};

interface EntryPayload {
	locationId: number | null;
	data: Record<string, string>;
	capturedLat?: number | null;
	capturedLng?: number | null;
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await parseJsonBody<EntryPayload>(request);
	if (body.error) {
		return errorResponse(body.error);
	}

	const { locationId, data, capturedLat, capturedLng } = body.data!;

	if (!data || typeof data !== 'object') {
		return errorResponse('Invalid data');
	}

	if (locationId !== null && (typeof locationId !== 'number' || locationId <= 0)) {
		return errorResponse('Invalid location ID');
	}

	if (capturedLat !== null && capturedLat !== undefined) {
		const validation = validateCoordinates(capturedLat, capturedLng || 0);
		if (!validation.valid) {
			return errorResponse(validation.error!);
		}
	}

	if (isPastCutoff()) {
		return errorResponse('Past cutoff', 403);
	}

	const now = new Date();
	const date = formatDateISO(now);
	const timestamp = formatDateTime(now);

	try {
		const template = getActiveTemplate();
		if (!template) {
			return errorResponse('Failed to load template', 500);
		}
		const encryptedData = encrypt(JSON.stringify(data));
		const id = saveEntry(date, timestamp, locationId, encryptedData, template.id, capturedLat, capturedLng);
		return successResponse({ id, date });
	} catch (error) {
		return errorResponse('Entry for today already exists');
	}
};
