import type { EntryYearSummary } from '$lib/db.js';

export function getYearOptions(
	summaries: EntryYearSummary[],
	currentYear: number
): EntryYearSummary[] {
	const yearMap = new Map<number, EntryYearSummary>();
	for (const summary of summaries) {
		if (!Number.isFinite(summary.year)) {
			continue;
		}
		const entryCount = Number.isFinite(summary.entryCount) ? summary.entryCount : 0;
		yearMap.set(summary.year, { year: summary.year, entryCount });
	}

	if (!yearMap.has(currentYear)) {
		yearMap.set(currentYear, { year: currentYear, entryCount: 0 });
	}

	return [...yearMap.values()].sort((a, b) => b.year - a.year);
}

export function getPastYearSummaries(
	yearOptions: EntryYearSummary[],
	selectedYear: number,
	currentYear: number
): EntryYearSummary[] {
	return yearOptions.filter(summary => summary.year !== selectedYear && summary.year < currentYear);
}
