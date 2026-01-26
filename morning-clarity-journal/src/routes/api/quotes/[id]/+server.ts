import type { RequestHandler } from './$types';
import { deleteQuote, updateQuote, getQuoteById } from '$lib/db.js';
import { parseJsonBody, successResponse, errorResponse, notFoundResponse } from '$lib/api-helpers.js';
import { validateId, validateQuoteText } from '$lib/validation.js';

interface QuotePayload {
	text: string;
}

export const PUT: RequestHandler = async ({ params, request }) => {
	const validation = validateId(params.id);
	if (!validation.valid) {
		return errorResponse(validation.error!);
	}
	const id = typeof params.id === 'number' ? params.id : parseInt(params.id, 10);

	const body = await parseJsonBody<QuotePayload>(request, 8192);
	if (body.error) {
		return errorResponse(body.error);
	}

	const { text } = body.data ?? {};
	const textValidation = validateQuoteText(text);
	if (!textValidation.valid) {
		return errorResponse(textValidation.error!);
	}

	const trimmed = text.trim();
	try {
		if (!getQuoteById(id)) {
			return notFoundResponse('Quote not found');
		}
		const updated = updateQuote(id, trimmed);
		if (!updated) {
			return errorResponse('Failed to update quote', 500);
		}
		return successResponse();
	} catch (error) {
		console.error('Failed to update quote', error);
		return errorResponse('Failed to update quote', 500);
	}
};

export const DELETE: RequestHandler = async ({ params }) => {
	const validation = validateId(params.id);
	if (!validation.valid) {
		return errorResponse(validation.error!);
	}
	const id = typeof params.id === 'number' ? params.id : parseInt(params.id, 10);
	try {
		if (!getQuoteById(id)) {
			return notFoundResponse('Quote not found');
		}
		const deleted = deleteQuote(id);
		if (!deleted) {
			return errorResponse('Failed to delete quote', 500);
		}
		return successResponse();
	} catch (error) {
		console.error('Failed to delete quote', error);
		return errorResponse('Failed to delete quote', 500);
	}
};
