import type { Handle } from '@sveltejs/kit';
import { validateSession } from '$lib/auth.js';

export const handle: Handle = async ({ event, resolve }) => {
	const sessionToken = event.cookies.get('session');
	const isAuthenticated = validateSession(sessionToken);
	
	// Store auth state in locals
	event.locals.isAuthenticated = isAuthenticated;
	
	// Protected routes - redirect to login if not authenticated
	const protectedRoutes = ['/journal', '/entry'];
	const isProtectedRoute = protectedRoutes.some(route => event.url.pathname.startsWith(route));
	const isApiRoute = event.url.pathname.startsWith('/api/');
	
	// Allow certain API routes without authentication
	if (event.url.pathname === '/api/auth' || event.url.pathname === '/api/seed-test') {
		return resolve(event);
	}
	
	// Protect API routes (except auth)
	if (isApiRoute && !isAuthenticated) {
		return new Response(JSON.stringify({ error: 'Unauthorized' }), {
			status: 401,
			headers: { 'Content-Type': 'application/json' }
		});
	}
	
	// Redirect to login for protected pages
	if (isProtectedRoute && !isAuthenticated) {
		return new Response(null, {
			status: 302,
			headers: { Location: '/' }
		});
	}
	
	// Redirect to journal if already authenticated and on login page
	if (event.url.pathname === '/' && isAuthenticated) {
		return new Response(null, {
			status: 302,
			headers: { Location: '/journal' }
		});
	}
	
	return resolve(event);
};
