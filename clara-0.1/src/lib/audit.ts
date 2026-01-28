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
const CLEANUP_FREQUENCY = 50;
const CLEANUP_BATCH_SIZE = 500;
let auditWriteCounter = 0;

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

	auditWriteCounter += 1;
	if (auditWriteCounter >= CLEANUP_FREQUENCY) {
		auditWriteCounter = 0;
		const count = database.prepare('SELECT COUNT(*) as count FROM audit_log').get() as {
			count: number
		};
		if (count.count > CLEANUP_THRESHOLD) {
			const excess = Math.max(0, count.count - MAX_AUDIT_LOG_ENTRIES);
			const deleteCount = Math.max(excess, CLEANUP_BATCH_SIZE);
			database.prepare(`
				DELETE FROM audit_log WHERE id IN (
					SELECT id FROM audit_log ORDER BY timestamp ASC LIMIT ?
				)
			`).run(deleteCount);
		}
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
