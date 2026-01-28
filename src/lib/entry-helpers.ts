import type { EntryWithData } from '$lib/db.js';
import type { TemplateModel } from '$lib/template.js';

export function hasLegacyContent(
	entry: EntryWithData | null,
	template: TemplateModel | null
): boolean {
	if (!entry || !template) return false;
	const currentFieldIds = new Set(template.fieldIds);
	return Object.entries(entry.data).some(([key, value]) =>
		value && !currentFieldIds.has(key)
	);
}

export function getTimestampParts(timestamp: string): { time: string; rest: string } {
	const parts = timestamp.split(' ');
	const time = parts[0]?.split(':').slice(0, 2).join(':') || '';
	const rest = parts.slice(1).join(' ');
	return { time, rest };
}
