import type { RequestHandler } from './$types';
import { getOrCreateDailyQuote } from '$lib/db.js';
import { formatDateISO } from '$lib/utils.js';
import { successResponse, noStoreHeaders } from '$lib/api-helpers.js';

export const GET: RequestHandler = async () => {
	try {
		const date = formatDateISO(new Date());
		const quote = getOrCreateDailyQuote(date);
		return successResponse(
			{ quote: quote ? { text: quote.text, date: quote.date } : null },
			noStoreHeaders()
		);
	} catch (error) {
		console.error('Failed to load daily quote', error);
		return successResponse({ quote: null }, noStoreHeaders());
	}
};
