import type { RequestHandler } from './$types';
import { getParsedQuotes } from '$lib/db.js';
import { successResponse, errorResponse } from '$lib/api-helpers.js';

export const GET: RequestHandler = async () => {
	try {
		const quotes = getParsedQuotes().quotes;
		return successResponse({ quotes });
	} catch (error) {
		console.error('Failed to load quotes', error);
		return errorResponse('Failed to load quotes', 500);
	}
};

export const POST: RequestHandler = async ({ request }) => {
	void request;
	return errorResponse('Use /api/quotes/source', 405);
};
