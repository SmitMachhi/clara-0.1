import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { verifyPassword, createSession } from '$lib/auth.js';

export const POST: RequestHandler = async ({ request, cookies }) => {
	const { password } = await request.json();
	
	if (!verifyPassword(password)) {
		return json({ success: false, error: 'Invalid password' }, { status: 401 });
	}
	
	const token = createSession();
	
	cookies.set('session', token, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: process.env.NODE_ENV === 'production',
		maxAge: 60 * 60 * 24 // 24 hours
	});
	
	return json({ success: true });
};
