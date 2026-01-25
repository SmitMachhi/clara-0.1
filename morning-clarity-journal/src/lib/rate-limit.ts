import { getDb } from '$lib/db.js';

interface RateLimitConfig {
	maxRequests: number;
	windowMs: number;
}

const RATE_LIMIT_CONFIGS: Record<string, RateLimitConfig> = {
	'api_default': { maxRequests: 60, windowMs: 60 * 1000 },
	'api_backup': { maxRequests: 5, windowMs: 60 * 60 * 1000 },
	'api_export': { maxRequests: 10, windowMs: 60 * 60 * 1000 },
	'api_wipe': { maxRequests: 1, windowMs: 24 * 60 * 60 * 1000 },
	'api_entries_write': { maxRequests: 30, windowMs: 60 * 1000 },
	'api_locations_write': { maxRequests: 20, windowMs: 60 * 1000 }
};

export function checkRateLimit(key: string, identifier: string): { allowed: boolean; retryAfter?: number } {
	const config = RATE_LIMIT_CONFIGS[key] || RATE_LIMIT_CONFIGS['api_default'];
	const now = Date.now();
	const windowStart = now - config.windowMs;
	const fullKey = `${key}:${identifier}`;

	const database = getDb();

	// Clean up old entries
	database.prepare('DELETE FROM api_rate_limits WHERE timestamp < ?').run(windowStart);

	// Count requests in current window
	const countResult = database.prepare(
		'SELECT COUNT(*) as count FROM api_rate_limits WHERE key = ? AND timestamp >= ?'
	).get(fullKey, windowStart) as { count: number };

	if (countResult.count >= config.maxRequests) {
		// Find oldest entry to calculate retry time
		const oldest = database.prepare(
			'SELECT MIN(timestamp) as ts FROM api_rate_limits WHERE key = ? AND timestamp >= ?'
		).get(fullKey, windowStart) as { ts: number };

		const retryAfter = Math.ceil((oldest.ts + config.windowMs - now) / 1000);
		return { allowed: false, retryAfter: Math.max(1, retryAfter) };
	}

	// Record this request
	database.prepare('INSERT INTO api_rate_limits (key, timestamp) VALUES (?, ?)').run(fullKey, now);

	return { allowed: true };
}

export function getRateLimitKey(pathname: string, method: string): string {
	if (pathname === '/api/backup' && method === 'POST') return 'api_backup';
	if (pathname === '/api/backup' && method === 'GET') return 'api_backup';
	if (pathname === '/api/export') return 'api_export';
	if (pathname === '/api/wipe') return 'api_wipe';
	if (pathname === '/api/entries' && method === 'POST') return 'api_entries_write';
	if (pathname.startsWith('/api/entries/') && method !== 'GET') return 'api_entries_write';
	if (pathname === '/api/locations' && method === 'POST') return 'api_locations_write';
	if (pathname.startsWith('/api/locations/') && method === 'DELETE') return 'api_locations_write';
	return 'api_default';
}
