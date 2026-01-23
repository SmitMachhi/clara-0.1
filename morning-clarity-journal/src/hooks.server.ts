import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const handle: Handle = async ({ event, resolve }) => {
	// Protect all /api/* routes with bearer token
	if (event.url.pathname.startsWith('/api/')) {
		const expectedToken = env.PUBLIC_API_TOKEN || 'dev-mcj-token-2026';
		const authHeader = event.request.headers.get('authorization');
		const queryToken = event.url.searchParams.get('token');

		const isAuthorized =
			(authHeader && authHeader === `Bearer ${expectedToken}`) ||
			(queryToken && queryToken === expectedToken);

		if (!isAuthorized) {
			return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
	}

	const response = await resolve(event);

	// Add cache headers for static build assets
	if (event.url.pathname.startsWith('/_app/')) {
		response.headers.set('cache-control', 'public, max-age=31536000, immutable');
	}

	return response;
};
