import type { RequestHandler } from './$types';
import { errorResponse } from '$lib/api-helpers.js';

export const PUT: RequestHandler = async ({ params, request }) => {
	void params;
	void request;
	return errorResponse('Use /api/quotes/source', 405);
};

export const DELETE: RequestHandler = async ({ params }) => {
	void params;
	return errorResponse('Use /api/quotes/source', 405);
};
