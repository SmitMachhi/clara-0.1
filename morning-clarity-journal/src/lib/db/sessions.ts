import { randomBytes } from 'crypto';
import { getDb } from './connection.js';
import type { ActiveSession } from './types.js';

export function setActiveSession(
	nonce: string,
	expiresAt: number,
	deviceInfo: string,
	locationId: number | null,
	locationLat: number | null,
	locationLng: number | null
): void {
	const database = getDb();
	const createdAt = Date.now();
	const sessionData = JSON.stringify({
		nonce,
		expiresAt,
		deviceInfo,
		locationId,
		locationLat,
		locationLng,
		createdAt
	});
	database.prepare(`
		INSERT INTO config (key, value)
		VALUES ('active_session', ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value
	`).run(sessionData);
}

export function updateSessionExpiration(nonce: string, newExpiresAt: number): boolean {
	const database = getDb();
	const existing = getActiveSession();

	if (!existing || existing.nonce !== nonce) {
		return false;
	}

	const updatedSession = { ...existing, expiresAt: newExpiresAt };
	database.prepare(`
		UPDATE config SET value = ? WHERE key = 'active_session'
	`).run(JSON.stringify(updatedSession));

	return true;
}

export function clearActiveSession(): void {
	const database = getDb();
	database.prepare('DELETE FROM config WHERE key = \'active_session\'').run();
}

export function getActiveSession(): ActiveSession | null {
	const database = getDb();
	const row = database.prepare(
		"SELECT value FROM config WHERE key = 'active_session'"
	).get() as { value: string } | undefined;
	if (!row?.value) return null;
	try {
		const session = JSON.parse(row.value) as ActiveSession;
		if (!session.nonce || typeof session.expiresAt !== 'number') return null;
		return session;
	} catch {
		return null;
	}
}

export function getPassphraseSalt(): string {
	const database = getDb();
	const row = database.prepare(
		"SELECT value FROM config WHERE key = 'passphrase_salt'"
	).get() as { value: string } | undefined;

	if (row?.value) {
		return row.value;
	}

	const newSalt = randomBytes(32).toString('hex');
	database.prepare(`
		INSERT INTO config (key, value)
		VALUES ('passphrase_salt', ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value
	`).run(newSalt);

	return newSalt;
}

export function getAuthRateLimit(ip: string): { count: number; resetAt: number } | null {
	const database = getDb();
	const row = database.prepare(
		'SELECT count, reset_at FROM auth_rate_limits WHERE ip = ?'
	).get(ip) as {
		count: number;
		reset_at: number;
	} | undefined;
	if (!row) return null;
	return { count: row.count, resetAt: row.reset_at };
}

export function setAuthRateLimit(ip: string, count: number, resetAt: number): void {
	const database = getDb();
	database.prepare(`
		INSERT INTO auth_rate_limits (ip, count, reset_at)
		VALUES (?, ?, ?)
		ON CONFLICT(ip) DO UPDATE SET count = excluded.count, reset_at = excluded.reset_at
	`).run(ip, count, resetAt);
}

export function clearAuthRateLimit(ip: string): void {
	const database = getDb();
	database.prepare('DELETE FROM auth_rate_limits WHERE ip = ?').run(ip);
}

export function blacklistSessionNonce(nonce: string, expiresAt: number): void {
	const database = getDb();
	const now = Date.now();

	database.prepare('DELETE FROM session_blacklist WHERE expires_at < ?').run(now);

	database.prepare(`
		INSERT INTO session_blacklist (nonce, blacklisted_at, expires_at)
		VALUES (?, ?, ?)
		ON CONFLICT(nonce) DO UPDATE SET blacklisted_at = excluded.blacklisted_at
	`).run(nonce, now, expiresAt);
}

export function isSessionNonceBlacklisted(nonce: string): boolean {
	const database = getDb();
	const now = Date.now();

	const row = database.prepare(
		'SELECT 1 FROM session_blacklist WHERE nonce = ? AND expires_at > ?'
	).get(nonce, now);

	return !!row;
}
