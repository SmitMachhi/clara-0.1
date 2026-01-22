import { TIME } from './constants.js';

/**
 * Format date to display format: "06:30:45 12th October, 2026"
 */
export function formatDateTime(date: Date): string {
	const hours = date.getHours().toString().padStart(2, '0');
	const minutes = date.getMinutes().toString().padStart(2, '0');
	const seconds = date.getSeconds().toString().padStart(2, '0');
	const time = `${hours}:${minutes}:${seconds}`;

	const day = date.getDate();
	const suffix = getOrdinalSuffix(day);

	const month = date.toLocaleDateString('en-US', { month: 'long' });
	const year = date.getFullYear();

	return `${time} ${day}${suffix} ${month}, ${year}`;
}

/**
 * Get ordinal suffix for day (1st, 2nd, 3rd, etc.)
 */
function getOrdinalSuffix(day: number): string {
	if (day >= 11 && day <= 13) return 'th';
	switch (day % 10) {
		case 1: return 'st';
		case 2: return 'nd';
		case 3: return 'rd';
		default: return 'th';
	}
}

/**
 * Format date to ISO date string (YYYY-MM-DD)
 */
export function formatDateISO(date: Date): string {
	return date.toISOString().split('T')[0];
}

/**
 * Check if current time is past 2pm (14:00)
 * Can be disabled for development by setting PRIVATE_DISABLE_TIME_CUTOFF=true
 */
export function isPastCutoff(date: Date = new Date()): boolean {
	if (import.meta.env.PRIVATE_DISABLE_TIME_CUTOFF === 'true') {
		return false;
	}
	return date.getHours() >= TIME.CUTOFF_HOUR;
}

/**
 * Get all dates in a year
 */
export function getYearDates(year: number): string[] {
	const dates: string[] = [];
	const start = new Date(year, 0, 1);
	const end = new Date(year, 11, 31);
	
	const current = new Date(start);
	while (current <= end) {
		dates.push(formatDateISO(current));
		current.setDate(current.getDate() + 1);
	}
	
	return dates;
}

/**
 * Get the week day (0 = Sunday, 6 = Saturday) for the first day of the year
 */
export function getFirstDayOfYear(year: number): number {
	return new Date(year, 0, 1).getDay();
}

/**
 * Parse date string to display format for sidebar (includes year)
 */
export function formatDateForSidebar(dateStr: string): string {
	const date = new Date(dateStr + 'T12:00:00');
	const day = date.getDate();
	const suffix = getOrdinalSuffix(day);
	const month = date.toLocaleDateString('en-US', { month: 'short' });
	const year = date.getFullYear();
	return `${day}${suffix} ${month} ${year}`;
}

/**
 * Extract time (HH:MM) from a full timestamp string like "06:30:45 12th October, 2026"
 */
export function extractTimeFromTimestamp(timestamp: string): string {
	// Timestamp format: "HH:MM:SS day month, year"
	const timePart = timestamp.split(' ')[0];
	// Return HH:MM (without seconds)
	const [hours, minutes] = timePart.split(':');
	return `${hours}:${minutes}`;
}

/**
 * Check if a date is in the past (before today)
 */
export function isDateInPast(dateStr: string): boolean {
	const today = formatDateISO(new Date());
	return dateStr < today;
}

/**
 * Check if a date is today
 */
export function isToday(dateStr: string): boolean {
	const today = formatDateISO(new Date());
	return dateStr === today;
}

/**
 * Get date/time parts for creative display
 */
export function getDateTimeParts(date: Date): {
	time: string;
	seconds: string;
	dayOfWeek: string;
	dayOfWeekShort: string;
	day: string;
	month: string;
	monthShort: string;
	year: string;
} {
	const hours = date.getHours().toString().padStart(2, '0');
	const minutes = date.getMinutes().toString().padStart(2, '0');
	const seconds = date.getSeconds().toString().padStart(2, '0');
	
	const dayNum = date.getDate();
	
	return {
		time: `${hours}:${minutes}`,
		seconds,
		dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'long' }),
		dayOfWeekShort: date.toLocaleDateString('en-US', { weekday: 'short' }),
		day: dayNum.toString(),
		month: date.toLocaleDateString('en-US', { month: 'long' }),
		monthShort: date.toLocaleDateString('en-US', { month: 'short' }),
		year: date.getFullYear().toString()
	};
}
