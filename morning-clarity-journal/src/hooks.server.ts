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
		const excludedRoutes = ['/api/auth', '/api/session'];
		
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
	if (event.url.pathname.startsWith('/_app/')) {
		response.headers.set('cache-control', 'public, max-age=31536000, immutable');
	}
	return response;
};
