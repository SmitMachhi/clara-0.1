import type { RequestHandler } from './$types';
import { verifySessionToken, checkAuthRateLimit, recordAuthFailure, clearAuthFailures } from '$lib/auth.js';

export const GET: RequestHandler = ({ cookies, getClientAddress }) => {
	const ip = getClientAddress();
	const rateLimitCheck = checkAuthRateLimit(ip);
	if (!rateLimitCheck.ok) {
		return new Response(null, {
			status: 429,
			headers: { 'Retry-After': String(rateLimitCheck.retryAfter) }
		});
	}

	const sessionCookie = cookies.get('session');

	if (verifySessionToken(sessionCookie)) {
		clearAuthFailures(ip);
		return new Response(null, { status: 204 });
	}

	recordAuthFailure(ip);
	return new Response(null, { status: 401 });
};
