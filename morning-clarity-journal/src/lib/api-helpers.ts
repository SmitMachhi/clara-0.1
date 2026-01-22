import { json } from '@sveltejs/kit';

export async function parseJsonBody<T>(request: Request): Promise<{ data?: T; error?: string }> {
	try {
		const data = await request.json() as T;
		return { data };
	} catch {
		return { error: 'Invalid JSON payload' };
	}
}

export function successResponse(data: Record<string, unknown> = {}) {
	return json({ success: true, ...data });
}

export function errorResponse(message: string, status: number = 400) {
	return json({ success: false, error: message }, { status });
}

export function notFoundResponse(message: string = 'Not found') {
	return json({ success: false, error: message }, { status: 404 });
}
