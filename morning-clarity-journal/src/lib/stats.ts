import { DISPLAY } from './constants.js';
import { formatDateISO, isToday } from './utils.js';

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
	const pastDates = yearDates.filter(d => isDateInPast(d));
	const completedCount = pastDates.filter(d => entryDates.includes(d)).length;
	return { completedCount, total: pastDates.length };
}

export function getRecentEntries(
	yearDates: string[], 
	entryDates: string[], 
	entries: any[], 
	limit: number = DISPLAY.RECENT_ENTRIES_LIMIT
): RecentEntry[] {
	const entriesByDate = new Map(entries.map(entry => [entry.date, entry]));

	return yearDates
		.filter(d => isDateInPast(d) || isToday(d))
		.map(d => ({
			date: d,
			completed: entryDates.includes(d),
			entry: entriesByDate.get(d)
		}))
		.reverse()
		.slice(0, limit);
}

function isDateInPast(dateStr: string): boolean {
	const today = formatDateISO(new Date());
	return dateStr < today;
}
