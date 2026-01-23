import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/db.js';

interface MigratePayload {
	date: string;
	timestamp: string;
	encryptedData: string;
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json() as { entries: MigratePayload[] };
	
	if (!Array.isArray(body.entries)) {
		return json({ error: 'Invalid request' }, { status: 400 });
	}
	
	const database = getDb();
	
	try {
		for (const entry of body.entries) {
			const result = database.prepare(`
				UPDATE entries 
				SET encrypted_data = ?
				WHERE date = ?
			`).run(entry.encryptedData, entry.date);
			
			if (result.changes === 0) {
				return json({ error: `Entry not found for date: ${entry.date}` }, { status: 404 });
			}
		}
		
		return json({ success: true, migrated: body.entries.length });
	} catch (err) {
		console.error('Migration error:', err);
		return json({ error: 'Migration failed' }, { status: 500 });
	}
};
