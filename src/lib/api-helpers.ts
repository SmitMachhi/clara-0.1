import { json } from '@sveltejs/kit';

export async function parseJsonBody<T>(request: Request, maxBytes?: number): Promise<{ data?: T; error?: string }> {
	try {
		const text = await request.text();
		if (maxBytes && text.length > maxBytes) {
			return { error: 'Payload too large' };
		}
		const data = JSON.parse(text) as T;
		return { data };
	} catch {
		return { error: 'Invalid JSON payload' };
	}
}

export function noStoreHeaders(): HeadersInit {
	return {
		'Cache-Control': 'no-store, private',
		'Pragma': 'no-cache'
	};
}

export function successResponse(data: Record<string, unknown> = {}, headers?: HeadersInit) {
	return json({ success: true, ...data }, { headers });
}

export function errorResponse(message: string, status: number = 400, headers?: HeadersInit) {
	return json({ success: false, error: message }, { status, headers });
}

export function notFoundResponse(message: string = 'Not found') {
	return json({ success: false, error: message }, { status: 404 });
}

export function validationErrorResponse(message: string, details: string[]) {
	return json({ success: false, error: message, details }, { status: 400 });
}
