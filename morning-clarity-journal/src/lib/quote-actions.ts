import { apiFetch } from '$lib/api-client.js';
import type { Quote } from '$lib/db.js';

export async function fetchQuotes(): Promise<Quote[]> {
	const res = await apiFetch('/api/quotes');
	if (!res.ok) {
		throw new Error(`Failed to fetch quotes: ${res.status}`);
	}
	const data = await res.json();
	return Array.isArray(data.quotes) ? data.quotes : [];
}

export async function createQuote(text: string): Promise<{ ok: boolean; id?: number; error?: string }> {
	const res = await apiFetch('/api/quotes', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ text })
	});

	const data = await res.json();
	if (res.ok && data.success) {
		return { ok: true, id: data.id as number };
	}
	return { ok: false, error: data.error || 'Failed to create quote' };
}

export async function updateQuote(id: number, text: string): Promise<{ ok: boolean; error?: string }> {
	const res = await apiFetch(`/api/quotes/${id}`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ text })
	});
	const data = await res.json();
	if (res.ok && data.success) {
		return { ok: true };
	}
	return { ok: false, error: data.error || 'Failed to update quote' };
}

export async function deleteQuote(id: number): Promise<{ ok: boolean; error?: string }> {
	const res = await apiFetch(`/api/quotes/${id}`, { method: 'DELETE' });
	const data = await res.json();
	if (res.ok && data.success) {
		return { ok: true };
	}
	return { ok: false, error: data.error || 'Failed to delete quote' };
}

export async function fetchDailyQuote(): Promise<string | null> {
	const res = await apiFetch('/api/quotes/daily');
	if (!res.ok) {
		return null;
	}
	const data = await res.json();
	return data?.quote?.text ?? null;
}
