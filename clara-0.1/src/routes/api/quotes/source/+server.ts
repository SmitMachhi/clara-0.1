import type { RequestHandler } from './$types';
import { getQuoteSource, setQuoteSource } from '$lib/db.js';
import { json } from '@sveltejs/kit';
import { parseJsonBody, successResponse, errorResponse } from '$lib/api-helpers.js';
import { parseQuoteSource } from '$lib/quote-parser.js';
import { VALIDATION } from '$lib/constants.js';

interface QuoteSourcePayload {
	sourceText: string;
}

export const GET: RequestHandler = async () => {
	const source = getQuoteSource();
	return successResponse({ sourceText: source?.sourceText ?? '' });
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await parseJsonBody<QuoteSourcePayload>(request, VALIDATION.QUOTE_SOURCE_MAX + 1024);
	if (body.error) {
		return errorResponse(body.error);
	}

	const { sourceText } = body.data ?? {};
	if (typeof sourceText !== 'string') {
		return errorResponse('Invalid quote source');
	}
	if (sourceText.length > VALIDATION.QUOTE_SOURCE_MAX) {
		return errorResponse(`Quote source too long (max ${VALIDATION.QUOTE_SOURCE_MAX} characters)`);
	}

	const { errors } = parseQuoteSource(sourceText);
	if (errors.length > 0) {
		return json({ success: false, error: 'Invalid quotes', details: errors }, { status: 400 });
	}

	setQuoteSource(sourceText);
	return successResponse();
};
