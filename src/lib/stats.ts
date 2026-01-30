import { DISPLAY } from './constants.js';
import { formatDateISO } from './utils.js';

export interface Stats {
	completedCount: number;
	total: number;
}

export interface Streaks {
	current: number;
	best: number;
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

export function calculateStreaks(entryDates: string[], yearDates: string[]): Streaks {
	const entrySet = new Set(entryDates);
	const today = formatDateISO(new Date());
	const dates = yearDates.filter(d => d <= today);

	let best = 0;
	let running = 0;
	for (const date of dates) {
		if (entrySet.has(date)) {
			running += 1;
			if (running > best) best = running;
		} else {
			running = 0;
		}
	}

	const yesterdayDate = new Date();
	yesterdayDate.setDate(yesterdayDate.getDate() - 1);
	const yesterday = formatDateISO(yesterdayDate);
	const endDate = entrySet.has(today) ? today : entrySet.has(yesterday) ? yesterday : '';
	if (!endDate) return { current: 0, best };

	const endIndex = dates.lastIndexOf(endDate);
	if (endIndex === -1) return { current: 0, best };

	let current = 0;
	for (let i = endIndex; i >= 0; i -= 1) {
		if (entrySet.has(dates[i])) {
			current += 1;
			continue;
		}
		break;
	}

	return { current, best };
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
