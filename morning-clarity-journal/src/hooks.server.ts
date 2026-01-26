import { json } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit';
import { verifySessionToken, SESSION_REFRESH_THRESHOLD_MS, refreshSessionToken, validateConfiguredPassphrase } from '$lib/auth.js';
import { getActiveSession, isSessionNonceBlacklisted, updateSessionExpiration } from '$lib/db.js';
import { checkRateLimit, getRateLimitKey } from '$lib/rate-limit.js';

// Validate passphrase on server startup
try {
	validateConfiguredPassphrase();
} catch {
	// Validation function handles its own warnings
}

export const handle: Handle = async ({ event, resolve }) => {
	const isProd = process.env.NODE_ENV === 'production';
	const forwardedProto = event.request.headers.get('x-forwarded-proto');
	if (isProd && forwardedProto && forwardedProto !== 'https') {
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

			// Check if session has been explicitly revoked
			if (isSessionNonceBlacklisted(payload.nonce)) {
				return json({ success: false, error: 'Session revoked' }, { status: 403 });
			}

			// Refresh session if approaching expiration (sliding window)
			const timeRemaining = payload.exp - Date.now();
			if (timeRemaining < SESSION_REFRESH_THRESHOLD_MS && timeRemaining > 0) {
				const { token: newToken, expiresAt: newExpiresAt } = refreshSessionToken(payload.nonce);

				if (updateSessionExpiration(payload.nonce, newExpiresAt)) {
					const maxAgeSeconds = Math.floor((newExpiresAt - Date.now()) / 1000);
					event.cookies.set('session', newToken, {
						path: '/',
						httpOnly: true,
						sameSite: 'strict',
						secure: process.env.NODE_ENV === 'production',
						maxAge: maxAgeSeconds
					});
				}
			}
		}
	}

	// Rate limiting for authenticated API requests
	if (event.url.pathname.startsWith('/api/')) {
		const excludedFromRateLimit = ['/api/auth', '/api/session'];

		if (!excludedFromRateLimit.includes(event.url.pathname)) {
			const sessionCookie = event.cookies.get('session');
			const rateLimitIdentifier = sessionCookie ? sessionCookie.slice(0, 32) : event.getClientAddress();
			const rateLimitKey = getRateLimitKey(event.url.pathname, event.request.method);

			const rateCheck = checkRateLimit(rateLimitKey, rateLimitIdentifier);
			if (!rateCheck.allowed) {
				return json(
					{ success: false, error: `Rate limit exceeded. Try again in ${rateCheck.retryAfter} seconds.` },
					{
						status: 429,
						headers: {
							'Retry-After': String(rateCheck.retryAfter),
							'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000) + (rateCheck.retryAfter || 0))
						}
					}
				);
			}
		}
	}

	const cspDirectives = {
		'default-src': ['self'],
		'script-src': ['self'],
		'style-src': ['self', 'unsafe-inline', 'https://fonts.googleapis.com'],
		'img-src': ['self', 'data:'],
		'font-src': ['self', 'https://fonts.gstatic.com'],
		'connect-src': isProd ? ['self'] : ['self', 'ws:', 'wss:'],
		'frame-ancestors': ['none']
	} as const;

	const response = await resolve(event, {
		csp: {
			mode: 'nonce',
			directives: cspDirectives
		}
	} as Parameters<typeof resolve>[1]);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');

	// HSTS only in production (requires HTTPS)
	if (isProd) {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
	}
	if (event.url.pathname.startsWith('/_app/')) {
		response.headers.set('cache-control', 'public, max-age=31536000, immutable');
	}
	return response;
};
