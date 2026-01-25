import { json } from '@sveltejs/kit';
import { verifySessionToken } from '$lib/auth.js';
import { clearActiveSession, getActiveSession } from '$lib/db.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ cookies }) => {
	const sessionCookie = cookies.get('session');
	const payload = verifySessionToken(sessionCookie);

	if (!payload) {
		return json({ success: false, error: 'Not authenticated' }, { status: 401 });
	}

	const activeSession = getActiveSession();
	if (!activeSession || activeSession.nonce !== payload.nonce) {
		return json({ success: false, error: 'Invalid session' }, { status: 401 });
	}

	clearActiveSession();
	cookies.delete('session', { path: '/' });
	return json({ success: true });
};
