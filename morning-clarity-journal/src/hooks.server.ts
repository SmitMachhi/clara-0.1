import { json } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { verifySessionToken } from '$lib/auth.js';
import { getActiveSession } from '$lib/db.js';

export const handle: Handle = async ({ event, resolve }) => {
	const forwardedProto = event.request.headers.get('x-forwarded-proto');
	if (process.env.NODE_ENV === 'production' && forwardedProto && forwardedProto !== 'https') {
		const httpsUrl = new URL(event.url);
		httpsUrl.protocol = 'https:';
		return Response.redirect(httpsUrl.toString(), 308);
	}

	// Origin validation for state-changing requests (CSRF protection)
	if (event.url.pathname.startsWith('/api/') && event.request.method !== 'GET') {
		const origin = event.request.headers.get('origin');
		const host = event.request.headers.get('host');

		// In production, require origin header and validate it matches host
		if (process.env.NODE_ENV === 'production') {
			if (!origin) {
				return json({ success: false, error: 'Missing origin header' }, { status: 403 });
			}

			try {
				const originUrl = new URL(origin);
				const expectedHost = host?.split(':')[0];
				if (originUrl.host.split(':')[0] !== expectedHost) {
					return json({ success: false, error: 'Invalid origin' }, { status: 403 });
				}
			} catch {
				return json({ success: false, error: 'Invalid origin header' }, { status: 403 });
			}
		}
	}

	if (event.url.pathname.startsWith('/api/')) {
		const excludedRoutes = ['/api/auth', '/api/session', '/api/auth/logout'];
		
		if (!excludedRoutes.includes(event.url.pathname)) {
			const sessionCookie = event.cookies.get('session');
			
			const payload = verifySessionToken(sessionCookie);
			if (!payload) {
				return json({ success: false, error: 'Unauthorized' }, { status: 403 });
			}

			const activeSession = getActiveSession();
			if (!activeSession || activeSession.nonce !== payload.nonce || Date.now() > activeSession.expiresAt) {
				return json({ success: false, error: 'Unauthorized' }, { status: 403 });
			}
		}
	}

	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
	// CSP in all environments
	response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'");

	// HSTS only in production (requires HTTPS)
	if (process.env.NODE_ENV === 'production') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
	if (event.url.pathname.startsWith('/_app/')) {
		response.headers.set('cache-control', 'public, max-age=31536000, immutable');
	}
	return response;
};
