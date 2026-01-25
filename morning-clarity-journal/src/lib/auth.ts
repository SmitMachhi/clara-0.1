import { randomBytes, createHmac, timingSafeEqual, createHash, pbkdf2Sync } from 'crypto';
import { env } from '$env/dynamic/private';
import { getAuthRateLimit, setAuthRateLimit, clearAuthRateLimit } from '$lib/db.js';

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;

function base64UrlEncode(data: Buffer): string {
	return data.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(str: string): Buffer {
	const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
	return Buffer.from(padded, 'base64');
}

export function createSessionToken(): { token: string; expiresAt: number; nonce: string } {
	const nonce = randomBytes(16).toString('hex');
	const expiresAt = Date.now() + SESSION_DURATION_MS;
	const payload = JSON.stringify({ exp: expiresAt, nonce });
	const payloadBase64Url = base64UrlEncode(Buffer.from(payload, 'utf8'));
	
	const secret = getSessionSecret();
	
	const hmac = createHmac('sha256', secret);
	hmac.update(payloadBase64Url);
	const signatureBase64Url = base64UrlEncode(hmac.digest());
	
	const token = `${payloadBase64Url}.${signatureBase64Url}`;
	return { token, expiresAt, nonce };
}

export function verifySessionToken(token: string | undefined): { exp: number; nonce: string } | null {
	if (!token) return null;
	
	const parts = token.split('.');
	if (parts.length !== 2) return null;
	
	const [payloadBase64Url, signatureBase64Url] = parts;
	
	const secret = getSessionSecret();
	
	const hmac = createHmac('sha256', secret);
	hmac.update(payloadBase64Url);
	const expectedSignature = hmac.digest();
	
	try {
		const providedSignature = base64UrlDecode(signatureBase64Url);
		if (providedSignature.length !== expectedSignature.length) return null;
		
		const signaturesMatch = timingSafeEqual(expectedSignature, providedSignature);
		if (!signaturesMatch) return null;
		
		const payloadJson = base64UrlDecode(payloadBase64Url).toString('utf8');
		const payload = JSON.parse(payloadJson) as { exp: number; nonce: string };
		
		if (typeof payload.exp !== 'number' || typeof payload.nonce !== 'string') return null;
		if (Date.now() > payload.exp) return null;
		
		return payload;
	} catch {
		return null;
	}
}

export function checkAuthRateLimit(ip: string): { ok: boolean; retryAfter?: number } {
	const entry = getAuthRateLimit(ip);
	if (!entry) return { ok: true };
	
	const now = Date.now();
	if (now >= entry.resetAt) {
		clearAuthRateLimit(ip);
		return { ok: true };
	}
	
	if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
		const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
		return { ok: false, retryAfter };
	}
	
	return { ok: true };
}

export function recordAuthFailure(ip: string): void {
	const now = Date.now();
	const entry = getAuthRateLimit(ip);
	
	if (!entry || now >= entry.resetAt) {
		setAuthRateLimit(ip, 1, now + RATE_LIMIT_WINDOW_MS);
	} else {
		setAuthRateLimit(ip, entry.count + 1, entry.resetAt);
	}
}

export function clearAuthFailures(ip: string): void {
	clearAuthRateLimit(ip);
}

export function verifyPassphrase(input: string): boolean {
	const expected = env.JOURNAL_PASSPHRASE;
	if (!expected) {
		throw new Error('JOURNAL_PASSPHRASE environment variable is not set');
	}
	// Derive a deterministic salt from the expected passphrase using SHA-256.
	// This avoids needing a stored salt while still preventing rainbow tables.
	const salt = createHash('sha256').update('mcj-passphrase-salt:' + expected, 'utf8').digest();
	const inputKey = pbkdf2Sync(input, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256');
	const expectedKey = pbkdf2Sync(expected, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256');
	return timingSafeEqual(inputKey, expectedKey);
}

function getSessionSecret(): string {
	const secret = env.JOURNAL_SESSION_SECRET;
	if (!secret || secret.length < 32) {
		throw new Error('JOURNAL_SESSION_SECRET must be at least 32 characters');
	}
	return secret;
}
