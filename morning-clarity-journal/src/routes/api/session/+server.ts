import type { RequestHandler } from './$types';
import { verifySessionToken } from '$lib/auth.js';

export const GET: RequestHandler = ({ cookies }) => {
	const sessionCookie = cookies.get('session');

	if (verifySessionToken(sessionCookie)) {
		return new Response(null, { status: 204 });
	}

	return new Response(null, { status: 401 });
};
