import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyPassphrase, createSessionToken, checkAuthRateLimit, recordAuthFailure, clearAuthFailures } from '$lib/auth.js';

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const { passphrase } = await request.json();
	const ip = getClientAddress();

	const rateLimitCheck = checkAuthRateLimit(ip);
	if (!rateLimitCheck.ok) {
		return json({ success: false, error: 'Too many attempts' }, {
			status: 429,
			headers: {
				'Retry-After': String(rateLimitCheck.retryAfter)
			}
		});
	}

	if (!passphrase || !verifyPassphrase(passphrase)) {
		recordAuthFailure(ip);
		return json({ success: false, error: 'Invalid passphrase' }, { status: 401 });
	}

	clearAuthFailures(ip);

	const { token, expiresAt } = createSessionToken();
	const maxAgeSeconds = Math.floor((expiresAt - Date.now()) / 1000);

	cookies.set('session', token, {
		httpOnly: true,
		sameSite: 'strict',
		secure: process.env.NODE_ENV === 'production',
		path: '/',
		maxAge: maxAgeSeconds
	});

	return json({ success: true });
};
