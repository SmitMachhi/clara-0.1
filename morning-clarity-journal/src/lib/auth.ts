import { randomBytes, createHmac, timingSafeEqual, createHash, pbkdf2Sync } from 'crypto';
import { env } from '$env/dynamic/private';

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;

interface RateLimitEntry {
	count: number;
	resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function base64UrlEncode(data: Buffer): string {
	return data.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64UrlDecode(str: string): Buffer {
	const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
	const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
	return Buffer.from(padded, 'base64');
}

export function createSessionToken(): { token: string; expiresAt: number } {
	const nonce = randomBytes(16).toString('hex');
	const expiresAt = Date.now() + SESSION_DURATION_MS;
	const payload = JSON.stringify({ exp: expiresAt, nonce });
	const payloadBase64Url = base64UrlEncode(Buffer.from(payload, 'utf8'));
	
	const secret = getSessionSecret();
	
	const hmac = createHmac('sha256', secret);
	hmac.update(payloadBase64Url);
	const signatureBase64Url = base64UrlEncode(hmac.digest());
	
	const token = `${payloadBase64Url}.${signatureBase64Url}`;
	return { token, expiresAt };
}

export function verifySessionToken(token: string | undefined): boolean {
	if (!token) return false;
	
	const parts = token.split('.');
	if (parts.length !== 2) return false;
	
	const [payloadBase64Url, signatureBase64Url] = parts;
	
	const secret = getSessionSecret();
	
	const hmac = createHmac('sha256', secret);
	hmac.update(payloadBase64Url);
	const expectedSignature = hmac.digest();
	
	try {
		const providedSignature = base64UrlDecode(signatureBase64Url);
		if (providedSignature.length !== expectedSignature.length) return false;
		
		const signaturesMatch = timingSafeEqual(expectedSignature, providedSignature);
		if (!signaturesMatch) return false;
		
		const payloadJson = base64UrlDecode(payloadBase64Url).toString('utf8');
		const payload = JSON.parse(payloadJson);
		
		if (typeof payload.exp !== 'number') return false;
		if (Date.now() > payload.exp) return false;
		
		return true;
	} catch {
		return false;
	}
}

export function checkAuthRateLimit(ip: string): { ok: boolean; retryAfter?: number } {
	const entry = rateLimitMap.get(ip);
	if (!entry) return { ok: true };
	
	const now = Date.now();
	if (now >= entry.resetAt) {
		rateLimitMap.delete(ip);
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
	const entry = rateLimitMap.get(ip);
	
	if (!entry || now >= entry.resetAt) {
		rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
	} else {
		entry.count++;
		rateLimitMap.set(ip, entry);
	}
}

export function clearAuthFailures(ip: string): void {
	rateLimitMap.delete(ip);
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
