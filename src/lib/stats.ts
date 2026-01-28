import { DISPLAY } from './constants.js';
import { formatDateISO } from './utils.js';

export interface Stats {
	completedCount: number;
	total: number;
}

export interface RecentEntry {
	date: string;
	completed: boolean;
	entry?: any;
}

export function calculateStats(entryDates: string[], yearDates: string[]): Stats {
	const entrySet = new Set(entryDates);
	const today = formatDateISO(new Date());
	const pastDates = yearDates.filter(d => d < today);
	let completedCount = 0;
	for (const d of pastDates) {
		if (entrySet.has(d)) completedCount += 1;
	}
	return { completedCount, total: pastDates.length };
}

export function getRecentEntries(
	yearDates: string[],
	entryDates: string[],
	entries: any[],
	limit: number = DISPLAY.RECENT_ENTRIES_LIMIT
): RecentEntry[] {
	const entriesByDate = new Map(entries.map(entry => [entry.date, entry]));
	const entrySet = new Set(entryDates);
	const today = formatDateISO(new Date());

	return yearDates
		.filter(d => d <= today)
		.map(d => ({
			date: d,
			completed: entrySet.has(d),
			entry: entriesByDate.get(d)
		}))
		.reverse()
		.slice(0, limit);
}
