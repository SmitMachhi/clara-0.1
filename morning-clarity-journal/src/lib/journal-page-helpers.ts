import { apiFetch } from '$lib/api-client.js';
import { fetchEntries, fetchLocations } from '$lib/journal-actions.js';
import { fetchDailyQuote } from '$lib/quote-actions.js';
import { createEmptyFormData } from '$lib/template.js';
import type { TemplateModel } from '$lib/template.js';
import type { Entry, Location } from '$lib/db.js';

export const DRAFT_STORAGE_KEY = 'mcj-draft';
export const DRAFT_DEBOUNCE_MS = 300;

export interface JournalPageData {
	locations: Location[];
	entries: Entry[];
	entryDates: string[];
	template: TemplateModel | null;
	formData: Record<string, string>;
	dailyQuote: string | null;
}

export async function loadJournalPageData(): Promise<{ data: JournalPageData | null; error: string }> {
	try {
		const [locationsResult, entriesResult, templateResult, dailyQuoteResult] = await Promise.all([
			fetchLocations().catch(() => null),
			fetchEntries().catch(() => null),
			loadTemplate(),
			fetchDailyQuote().catch(() => null)
		]);

		if (!locationsResult || !entriesResult || !templateResult.template) {
			return { data: null, error: 'Failed to load journal data.' };
		}

		return {
			data: {
				locations: locationsResult,
				entries: entriesResult.entries,
				entryDates: entriesResult.entryDates,
				template: templateResult.template,
				formData: templateResult.formData,
				dailyQuote: dailyQuoteResult
			},
			error: ''
		};
	} catch {
		return { data: null, error: 'Failed to load journal data.' };
	}
}

async function loadTemplate(): Promise<{ template: TemplateModel | null; formData: Record<string, string> }> {
	try {
		const response = await apiFetch('/api/template');
		if (!response.ok) {
			return { template: null, formData: {} };
		}
		const data = await response.json();
		if (!data?.parsed?.fieldIds) {
			return { template: null, formData: {} };
		}
		const template = data.parsed as TemplateModel;
		return {
			template,
			formData: createEmptyFormData(template)
		};
	} catch {
		return { template: null, formData: {} };
	}
}

export function saveDraft(formData: Record<string, string>): void {
	try {
		sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(formData));
	} catch (err) {
		console.error('Failed to save draft', err);
	}
}

export function restoreDraft(currentFormData: Record<string, string>): Record<string, string> {
	try {
		const rawDraft = sessionStorage.getItem(DRAFT_STORAGE_KEY);
		if (!rawDraft) return currentFormData;
		const parsedDraft = JSON.parse(rawDraft);
		if (parsedDraft && typeof parsedDraft === 'object') {
			return { ...currentFormData, ...parsedDraft };
		}
	} catch (err) {
		console.error('Failed to restore draft', err);
	}
	return currentFormData;
}

export function clearDraft(): void {
	try {
		sessionStorage.removeItem(DRAFT_STORAGE_KEY);
	} catch (err) {
		console.error('Failed to clear draft', err);
	}
}
