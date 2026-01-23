import type { RequestHandler } from './$types';
import { saveEntry, getAllEntries, getEntryDates } from '$lib/db.js';
import { formatDateISO, formatDateTime } from '$lib/utils.js';
import { validateCoordinates } from '$lib/validation.js';
import { parseJsonBody, successResponse, errorResponse } from '$lib/api-helpers.js';
import type { ClientEncryptedData } from '$lib/crypto.js';

export const GET: RequestHandler = async () => {
	const entries = getAllEntries();
	const entryDates = getEntryDates();

	return successResponse({ entries, entryDates });
};

interface EntryPayload {
	locationId: number | null;
	encryption: ClientEncryptedData;
	capturedLat?: number | null;
	capturedLng?: number | null;
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await parseJsonBody<EntryPayload>(request);
	if (body.error) {
		return errorResponse(body.error);
	}

	const { locationId, encryption, capturedLat, capturedLng } = body.data!;

	if (!encryption || typeof encryption !== 'object' || !encryption.version) {
		return errorResponse('Invalid encryption data');
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
		const encryptedDataJson = JSON.stringify(encryption);
		const id = saveEntry(date, timestamp, locationId, encryptedDataJson, capturedLat, capturedLng);
		return successResponse({ id, date });
	} catch (error) {
		return errorResponse('Entry for today already exists');
	}
};
