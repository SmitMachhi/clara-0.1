import { VALIDATION } from './constants.js';

export interface QuoteParseResult {
	quotes: string[];
	errors: string[];
}

export function parseQuoteSource(sourceText: string): QuoteParseResult {
	const quotes: string[] = [];
	const errors: string[] = [];
	if (!sourceText.trim()) {
		return { quotes, errors };
	}
	const pattern = /<q>([\s\S]*?)<\/q>/gi;
	let match: RegExpExecArray | null = null;
	let index = 0;

	while ((match = pattern.exec(sourceText)) !== null) {
		index += 1;
		const trimmed = match[1].trim();
		if (!trimmed) {
			errors.push(`Quote ${index} is empty`);
			continue;
		}
		if (trimmed.length > VALIDATION.QUOTE_TEXT_MAX) {
			errors.push(`Quote ${index} exceeds ${VALIDATION.QUOTE_TEXT_MAX} characters`);
			continue;
		}
		quotes.push(trimmed);
	}

	if (quotes.length === 0) {
		errors.push('No <q>...</q> quotes found');
	}

	return { quotes, errors };
}

export function serializeQuoteSource(quotes: string[]): string {
	if (quotes.length === 0) return '';
	return quotes.map(quote => `<q>${quote}</q>`).join('\n\n');
}
