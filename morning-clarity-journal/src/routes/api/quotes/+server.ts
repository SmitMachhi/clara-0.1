import type { RequestHandler } from './$types';
import { createQuote, getQuotes } from '$lib/db.js';
import { parseJsonBody, successResponse, errorResponse } from '$lib/api-helpers.js';
import { validateQuoteText } from '$lib/validation.js';

interface QuotePayload {
	text: string;
}

export const GET: RequestHandler = async () => {
	try {
		const quotes = getQuotes();
		return successResponse({ quotes });
	} catch (error) {
		console.error('Failed to load quotes', error);
		return errorResponse('Failed to load quotes', 500);
	}
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await parseJsonBody<QuotePayload>(request, 8192);
	if (body.error) {
		return errorResponse(body.error);
	}

	const { text } = body.data ?? {};
	const validation = validateQuoteText(text);
	if (!validation.valid) {
		return errorResponse(validation.error!);
	}

	const trimmed = text.trim();
	try {
		const id = createQuote(trimmed);
		return successResponse({ id });
	} catch (error) {
		console.error('Failed to create quote', error);
		return errorResponse('Failed to create quote', 500);
	}
};
