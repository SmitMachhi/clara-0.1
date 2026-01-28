import { apiFetch } from '$lib/api-client.js';

export async function fetchQuoteSource(): Promise<string> {
	const res = await apiFetch('/api/quotes/source');
	if (!res.ok) {
		throw new Error(`Failed to fetch quote source: ${res.status}`);
	}
	const data = await res.json();
	return typeof data.sourceText === 'string' ? data.sourceText : '';
}

export async function saveQuoteSource(sourceText: string): Promise<{ ok: boolean; error?: string; details?: string[] }> {
	const res = await apiFetch('/api/quotes/source', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ sourceText })
	});
	const data = await res.json();
	if (res.ok && data.success) {
		return { ok: true };
	}
	return {
		ok: false,
		error: data.error || 'Failed to save quotes',
		details: Array.isArray(data.details) ? data.details : []
	};
}

export async function fetchDailyQuote(): Promise<string | null> {
	const res = await apiFetch('/api/quotes/daily');
	if (!res.ok) {
		return null;
	}
	const data = await res.json();
	return data?.quote?.text ?? null;
}
