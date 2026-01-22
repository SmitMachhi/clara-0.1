import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveEntry, getAllEntries, getEntryDates, type JournalData } from '$lib/db.js';
import { formatDateISO, formatDateTime } from '$lib/utils.js';
import { validateCoordinates, validateJournalData } from '$lib/validation.js';
import { parseJsonBody, successResponse, errorResponse } from '$lib/api-helpers.js';

export const GET: RequestHandler = async () => {
	const entries = getAllEntries();
	const entryDates = getEntryDates();

	return successResponse({ entries, entryDates });
};

interface EntryPayload {
	locationId: number | null;
	data: JournalData;
	capturedLat?: number | null;
	capturedLng?: number | null;
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await parseJsonBody<EntryPayload>(request);
	if (body.error) {
		return errorResponse(body.error);
	}

	const { locationId, data, capturedLat, capturedLng } = body.data!;

	const dataValidation = validateJournalData(data);
	if (!dataValidation.valid) {
		return errorResponse(dataValidation.error!);
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

	const now = new Date();
	const date = formatDateISO(now);
	const timestamp = formatDateTime(now);

	try {
		const id = saveEntry(date, timestamp, locationId, data, capturedLat, capturedLng);
		return successResponse({ id, date });
	} catch (error) {
		return errorResponse('Entry for today already exists');
	}
};
