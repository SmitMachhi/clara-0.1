import type { RequestHandler } from './$types';
import {
	getActiveTemplate,
	saveEntry,
	getEntryDates,
	getEntryDatesForYear,
	getRecentEntrySummaries,
	getOrCreateDailyQuote
} from '$lib/db.js';
import { DISPLAY } from '$lib/constants.js';
import { formatDateISO, formatDateTime, isPastCutoff } from '$lib/utils.js';
import { validateCoordinates } from '$lib/validation.js';
import { parseJsonBody, successResponse, errorResponse, noStoreHeaders } from '$lib/api-helpers.js';
import { encrypt } from '$lib/server/crypto.js';

export const GET: RequestHandler = async ({ url }) => {
	const yearParam = url.searchParams.get('year');
	const currentYear = new Date().getFullYear();
	const year = yearParam ? parseInt(yearParam, 10) : currentYear;
	const validYear = !isNaN(year) && year > 1900 && year < 2100 ? year : currentYear;
	const entryDates = getEntryDatesForYear(validYear);
	const recentEntries = getRecentEntrySummaries(DISPLAY.RECENT_ENTRIES_LIMIT);

	return successResponse({ recentEntries, entryDates }, noStoreHeaders());
};

interface EntryPayload {
	locationId: number | null;
	data: Record<string, string>;
	capturedLat?: number | null;
	capturedLng?: number | null;
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await parseJsonBody<EntryPayload>(request, 102400);
	if (body.error) {
		return errorResponse(body.error, 400, noStoreHeaders());
	}

	const { locationId, data, capturedLat, capturedLng } = body.data!;

	if (!data || typeof data !== 'object') {
		return errorResponse('Invalid data', 400, noStoreHeaders());
	}

	if (locationId !== null && (typeof locationId !== 'number' || locationId <= 0)) {
		return errorResponse('Invalid location ID', 400, noStoreHeaders());
	}

	if (capturedLat !== null && capturedLat !== undefined) {
		const validation = validateCoordinates(capturedLat, capturedLng || 0);
		if (!validation.valid) {
			return errorResponse(validation.error!, 400, noStoreHeaders());
		}
	}

	if (isPastCutoff()) {
		return errorResponse('Past cutoff', 403, noStoreHeaders());
	}

	const now = new Date();
	const date = formatDateISO(now);
	const timestamp = formatDateTime(now);

	try {
		const template = getActiveTemplate();
		if (!template) {
			return errorResponse('Failed to load template', 500, noStoreHeaders());
		}
		const dailyQuote = getOrCreateDailyQuote(date);
		const encryptedData = encrypt(JSON.stringify(data));
		const id = saveEntry(
			date,
			timestamp,
			locationId,
			encryptedData,
			template.id,
			dailyQuote?.quote_id ?? null,
			dailyQuote?.text ?? null,
			capturedLat,
			capturedLng
		);
		return successResponse({ id, date }, noStoreHeaders());
	} catch (error) {
		return errorResponse('Entry for today already exists', 400, noStoreHeaders());
	}
};
