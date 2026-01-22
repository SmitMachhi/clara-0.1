import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveEntry, getAllEntries, getEntryDates, type JournalData } from '$lib/db.js';
import { formatDateISO, formatDateTime } from '$lib/utils.js';

export const GET: RequestHandler = async () => {
	const entries = getAllEntries();
	const entryDates = getEntryDates();
	
	return json({ entries, entryDates });
};

interface EntryPayload {
	locationId: number | null;
	data: JournalData;
	capturedLat?: number | null;
	capturedLng?: number | null;
}

export const POST: RequestHandler = async ({ request }) => {
	let payload: EntryPayload;
	try {
		payload = await request.json() as EntryPayload;
	} catch (error) {
		return json({ success: false, error: 'Invalid JSON payload' }, { status: 400 });
	}
	
	const { locationId, data, capturedLat, capturedLng } = payload;
	
	// Validate data structure
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return json({ success: false, error: 'Invalid entry data format' }, { status: 400 });
	}
	
	// Validate locationId if provided
	if (locationId !== null && (typeof locationId !== 'number' || locationId <= 0)) {
		return json({ success: false, error: 'Invalid location ID' }, { status: 400 });
	}
	
	// Validate coordinates if provided
	if (capturedLat !== null && capturedLat !== undefined) {
		if (typeof capturedLat !== 'number' || capturedLat < -90 || capturedLat > 90) {
			return json({ success: false, error: 'Invalid latitude' }, { status: 400 });
		}
	}
	if (capturedLng !== null && capturedLng !== undefined) {
		if (typeof capturedLng !== 'number' || capturedLng < -180 || capturedLng > 180) {
			return json({ success: false, error: 'Invalid longitude' }, { status: 400 });
		}
	}
	
	const now = new Date();
	const date = formatDateISO(now);
	const timestamp = formatDateTime(now);
	
	try {
		const id = saveEntry(date, timestamp, locationId, data, capturedLat, capturedLng);
		return json({ success: true, id, date });
	} catch (error) {
		// Entry for this date might already exist
		return json({ success: false, error: 'Entry for today already exists' }, { status: 400 });
	}
};
