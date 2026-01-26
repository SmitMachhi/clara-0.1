// GPS Configuration
export const GPS = {
	EARTH_RADIUS_METERS: 6371000,
	DEFAULT_TOLERANCE_METERS: 15,
	DEFAULT_TIMEOUT_MS: 10000,
	DEFAULT_OPTIONS: {
		enableHighAccuracy: true,
		timeout: 10000
	}
} as const;

// Time & Date
export const TIME = {
	CUTOFF_HOUR: 14, // 2:00 PM - from src/lib/utils.ts:43
	CLOCK_UPDATE_INTERVAL_MS: 30000,
	SHAKE_DURATION_MS: 400, // from src/routes/+page.svelte:28
	SUCCESS_MESSAGE_DURATION_MS: 3000, // from src/routes/journal/+page.svelte:483
	ANIMATION_DURATION_MS: 150 // from src/routes/journal/+page.svelte:648
} as const;

// Display
export const DISPLAY = {
	RECENT_ENTRIES_LIMIT: 30, // from src/routes/journal/+page.svelte:316
	COORDINATE_DECIMAL_PLACES: 4 // from multiple .toFixed(4) calls
} as const;

// Validation
export const VALIDATION = {
	LATITUDE_MIN: -90,
	LATITUDE_MAX: 90,
	LONGITUDE_MIN: -180,
	LONGITUDE_MAX: 180,
	QUOTE_TEXT_MIN: 1,
	QUOTE_TEXT_MAX: 500,
	QUOTE_SOURCE_MAX: 50000
} as const;
