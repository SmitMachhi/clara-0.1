import type { RequestHandler } from './$types';
import {
	getActiveTemplate,
	getEntryDatesForYear,
	getEntryYearSummaries,
	getRecentEntrySummaries,
	getDb
} from '$lib/db.js';
import { DISPLAY } from '$lib/constants.js';
import { formatDateISO, formatDateTime, isPastCutoff } from '$lib/utils.js';
import { validateCoordinates } from '$lib/validation.js';
import { parseJsonBody, successResponse, errorResponse, noStoreHeaders } from '$lib/api-helpers.js';
import { encrypt } from '$lib/server/crypto.js';
import {
	encryptOptionalNumber,
	encryptOptionalString
} from '$lib/db/crypto-helpers.js';
import { getOrCreateDailyQuoteAtomic } from '$lib/db/quotes.js';

export const GET: RequestHandler = async ({ url }) => {
	const yearParam = url.searchParams.get('year');
	const currentYear = new Date().getFullYear();
	const year = yearParam ? parseInt(yearParam, 10) : currentYear;
	const validYear = !isNaN(year) && year > 1900 && year < 2100 ? year : currentYear;
	const entryDates = getEntryDatesForYear(validYear);
	const recentEntries = getRecentEntrySummaries(DISPLAY.RECENT_ENTRIES_LIMIT, validYear);
	const yearSummaries = getEntryYearSummaries();

	return successResponse({ recentEntries, entryDates, yearSummaries }, noStoreHeaders());
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

	// Begin transaction to ensure atomicity
	const database = getDb();

	try {
		// Use immediate mode to get exclusive lock right away
		database.prepare('BEGIN IMMEDIATE').run();

		try {
			// Recheck cutoff time INSIDE transaction (race condition fix)
			if (isPastCutoff()) {
				database.prepare('ROLLBACK').run();
				return errorResponse('Past cutoff', 403, noStoreHeaders());
			}

			// Check if entry already exists for today (atomic check)
			const now = new Date();
			const date = formatDateISO(now);
			const existingEntry = database.prepare(
				'SELECT 1 FROM entries WHERE date = ?'
			).get(date);

			if (existingEntry) {
				database.prepare('ROLLBACK').run();
				return errorResponse('Entry for today already exists', 409, noStoreHeaders());
			}

			const timestamp = formatDateTime(now);
			const template = getActiveTemplate();

			if (!template) {
				database.prepare('ROLLBACK').run();
				return errorResponse('Failed to load template', 500, noStoreHeaders());
			}

			// Get or create daily quote atomically
			const dailyQuote = getOrCreateDailyQuoteAtomic(database, date);

			const encryptedData = encrypt(JSON.stringify(data));

			// Insert entry within transaction
			const dataBuffer = Buffer.from(encryptedData, 'utf8');
			const capturedLatEncrypted = encryptOptionalNumber(capturedLat ?? null);
			const capturedLngEncrypted = encryptOptionalNumber(capturedLng ?? null);
			const locationIdEncrypted = encryptOptionalNumber(locationId);
			const quoteIdEncrypted = encryptOptionalNumber(dailyQuote?.quote_id ?? null);
			const quoteTextEncrypted = encryptOptionalString(dailyQuote?.text ?? null);

			const result = database.prepare(`
				INSERT INTO entries (
					date, timestamp, location_id, location_id_encrypted,
					captured_lat, captured_lng, captured_lat_encrypted, captured_lng_encrypted,
					quote_id_encrypted, quote_text_encrypted, template_id, encrypted_data
				)
				VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`).run(
				date,
				timestamp,
				locationIdEncrypted,
				null,
				null,
				capturedLatEncrypted,
				capturedLngEncrypted,
				quoteIdEncrypted,
				quoteTextEncrypted,
				template.id,
				dataBuffer
			);

			// Commit transaction
			database.prepare('COMMIT').run();

			return successResponse({ id: result.lastInsertRowid, date }, noStoreHeaders());

		} catch (error) {
			// Rollback on any error
			database.prepare('ROLLBACK').run();
			throw error;
		}
	} catch (error) {
		console.error('Entry creation error:', error);
		return errorResponse('Failed to save entry', 500, noStoreHeaders());
	}
};
