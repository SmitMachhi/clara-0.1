import { json } from '@sveltejs/kit';
import { verifySessionToken } from '$lib/auth.js';
import { clearActiveSession, getActiveSession, blacklistSessionNonce } from '$lib/db.js';
import { logAuditEvent } from '$lib/audit.js';
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

	// Blacklist the session nonce so the token can't be reused
	blacklistSessionNonce(payload.nonce, payload.exp);

	clearActiveSession();
	cookies.delete('session', { path: '/' });
	logAuditEvent({
		eventType: 'logout',
		sessionId: sessionCookie
	});
	return json({ success: true });
};
