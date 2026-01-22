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
	const { locationId, data, capturedLat, capturedLng } = await request.json() as EntryPayload;
	
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
