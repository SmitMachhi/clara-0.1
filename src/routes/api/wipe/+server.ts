import type { RequestHandler } from './$types';
import { getDb } from '$lib/db.js';
import { verifyPassphrase } from '$lib/auth.js';
import { parseJsonBody, successResponse, errorResponse } from '$lib/api-helpers.js';
import { logAuditEvent } from '$lib/audit.js';

interface WipePayload {
	confirm: string;
	passphrase: string;
}

export const POST: RequestHandler = async ({ request }) => {
	const body = await parseJsonBody<WipePayload>(request, 2048);
	if (body.error) {
		return errorResponse(body.error);
	}

	const { confirm, passphrase } = body.data ?? {};

	// Require confirmation string
	if (confirm !== 'DELETE_ALL_MY_DATA') {
		return errorResponse('Must send confirm: \"DELETE_ALL_MY_DATA\" to proceed', 400);
	}

	// Require re-authentication with passphrase
	if (!passphrase || typeof passphrase !== 'string') {
		return errorResponse('Passphrase required for destructive operations', 400);
	}

	const isValid = await verifyPassphrase(passphrase);
	if (!isValid) {
		return errorResponse('Invalid passphrase', 401);
	}

	const database = getDb();
	database.exec('DELETE FROM entries');
	database.exec('DELETE FROM locations');
	database.exec('DELETE FROM templates');
	database.exec('DELETE FROM template_presets');
	database.exec('DELETE FROM quotes');
	database.exec('DELETE FROM quote_sources');
	database.exec('DELETE FROM daily_quotes');
	database.exec("DELETE FROM config WHERE key != 'encryption_key_migrated_v2' AND key != 'passphrase_salt'");

	logAuditEvent({
		eventType: 'data_wipe'
	});

	return successResponse({ message: 'All data deleted' });
};
