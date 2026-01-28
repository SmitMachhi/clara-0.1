import type { RequestHandler } from './$types';
import { verifySessionToken } from '$lib/auth.js';
import { getActiveSession } from '$lib/db.js';

export const GET: RequestHandler = async ({ cookies }) => {
	const sessionCookie = cookies.get('session');
	const payload = verifySessionToken(sessionCookie);

	if (!payload) {
		return new Response(null, { status: 401 });
	}

	const activeSession = getActiveSession();
	if (!activeSession || activeSession.nonce !== payload.nonce || Date.now() > activeSession.expiresAt) {
		return new Response(null, { status: 401 });
	}

	return new Response(null, { status: 204 });
};
