import { getDb } from '$lib/db.js';

export type AuditEventType =
	| 'auth_success'
	| 'auth_failure'
	| 'auth_rate_limited'
	| 'logout'
	| 'session_refresh'
	| 'data_export'
	| 'backup_created'
	| 'backup_downloaded'
	| 'data_wipe'
	| 'session_revoked';

interface AuditLogEntry {
	eventType: AuditEventType;
	ipAddress?: string;
	sessionId?: string;
	details?: Record<string, unknown>;
}

const MAX_AUDIT_LOG_ENTRIES = 10000;
const CLEANUP_THRESHOLD = 11000;

export function logAuditEvent(entry: AuditLogEntry): void {
	const database = getDb();
	const now = Date.now();

	// Sanitize session ID (only store first 16 chars for identification)
	const sanitizedSessionId = entry.sessionId ? entry.sessionId.slice(0, 16) : null;

	// Don't log sensitive details
	const safeDetails = entry.details ? JSON.stringify(sanitizeDetails(entry.details)) : null;

	database.prepare(`
		INSERT INTO audit_log (timestamp, event_type, ip_address, session_id, details)
		VALUES (?, ?, ?, ?, ?)
	`).run(now, entry.eventType, entry.ipAddress || null, sanitizedSessionId, safeDetails);

	// Cleanup old entries periodically
	const count = database.prepare('SELECT COUNT(*) as count FROM audit_log').get() as { count: number };
	if (count.count > CLEANUP_THRESHOLD) {
		database.prepare(`
			DELETE FROM audit_log WHERE id IN (
				SELECT id FROM audit_log ORDER BY timestamp ASC LIMIT ?
			)
		`).run(count.count - MAX_AUDIT_LOG_ENTRIES);
	}
}

function sanitizeDetails(details: Record<string, unknown>): Record<string, unknown> {
	const sanitized: Record<string, unknown> = {};
	const sensitiveKeys = ['passphrase', 'password', 'secret', 'token', 'key', 'data', 'content'];

	for (const [key, value] of Object.entries(details)) {
		if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
			sanitized[key] = '[REDACTED]';
		} else if (typeof value === 'string' && value.length > 100) {
			sanitized[key] = value.slice(0, 100) + '...[truncated]';
		} else {
			sanitized[key] = value;
		}
	}

	return sanitized;
}

export function getRecentAuditLogs(limit: number = 100): Array<{
	id: number;
	timestamp: number;
	event_type: string;
	ip_address: string | null;
	session_id: string | null;
	details: string | null;
}> {
	const database = getDb();
	return database.prepare(`
		SELECT id, timestamp, event_type, ip_address, session_id, details
		FROM audit_log
		ORDER BY timestamp DESC
		LIMIT ?
	`).all(limit) as Array<{
		id: number;
		timestamp: number;
		event_type: string;
		ip_address: string | null;
		session_id: string | null;
		details: string | null;
	}>;
}
