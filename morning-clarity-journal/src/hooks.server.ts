import type { Handle } from '@sveltejs/kit';
import { verifySessionToken } from '$lib/auth.js';

export const handle: Handle = async ({ event, resolve }) => {
	const forwardedProto = event.request.headers.get('x-forwarded-proto');
	if (process.env.NODE_ENV === 'production' && forwardedProto && forwardedProto !== 'https') {
		const httpsUrl = new URL(event.url);
		httpsUrl.protocol = 'https:';
		return Response.redirect(httpsUrl.toString(), 308);
	}

	if (event.url.pathname.startsWith('/api/')) {
		const excludedRoutes = ['/api/auth', '/api/session', '/api/auth/logout'];
		
		if (!excludedRoutes.includes(event.url.pathname)) {
			const sessionCookie = event.cookies.get('session');
			
			if (!verifySessionToken(sessionCookie)) {
				return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
					status: 403,
					headers: { 'content-type': 'application/json' }
				});
			}
		}
	}

	const response = await resolve(event);
	response.headers.set('X-Content-Type-Options', 'nosniff');
	response.headers.set('X-Frame-Options', 'DENY');
	response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
	response.headers.set('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
	if (process.env.NODE_ENV === 'production') {
		response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
		response.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'");
	}
	if (event.url.pathname.startsWith('/_app/')) {
		response.headers.set('cache-control', 'public, max-age=31536000, immutable');
	}
	return response;
};
