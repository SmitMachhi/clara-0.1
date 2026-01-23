import { PUBLIC_API_TOKEN } from '$env/static/public';

/**
 * Authenticated fetch wrapper - adds Bearer token to all API requests
 */
export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
	const headers = new Headers(options.headers);
	headers.set('Authorization', `Bearer ${PUBLIC_API_TOKEN}`);

	return fetch(url, { ...options, headers });
}
