import { randomBytes, createHmac, timingSafeEqual, pbkdf2 } from 'crypto';
import { promisify } from 'util';
import { env } from '$env/dynamic/private';
import { getAuthRateLimit, setAuthRateLimit, clearAuthRateLimit, getPassphraseSalt } from '$lib/db.js';
import { validatePassphraseStrength } from '$lib/validation.js';

const pbkdf2Async = promisify(pbkdf2);

const SESSION_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours
export const SESSION_REFRESH_THRESHOLD_MS = 30 * 60 * 1000; // Refresh if less than 30 minutes remaining
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

export function refreshSessionToken(existingNonce: string): { token: string; expiresAt: number } {
	const expiresAt = Date.now() + SESSION_DURATION_MS;
	const payload = JSON.stringify({ exp: expiresAt, nonce: existingNonce });
	const payloadBase64Url = base64UrlEncode(Buffer.from(payload, 'utf8'));

	const secret = getSessionSecret();

	const hmac = createHmac('sha256', secret);
	hmac.update(payloadBase64Url);
	const signatureBase64Url = base64UrlEncode(hmac.digest());

	const token = `${payloadBase64Url}.${signatureBase64Url}`;
	return { token, expiresAt };
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

export async function verifyPassphrase(input: string): Promise<boolean> {
	const expected = env.JOURNAL_PASSPHRASE;
	if (!expected) {
		throw new Error('JOURNAL_PASSPHRASE environment variable is not set');
	}

	// Use a random salt stored in the database (generated on first use)
	const saltHex = getPassphraseSalt();
	const salt = Buffer.from(saltHex, 'hex');

	const inputKey = await pbkdf2Async(input, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256') as Buffer;
	const expectedKey = await pbkdf2Async(expected, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256') as Buffer;
	return timingSafeEqual(inputKey, expectedKey);
}

function getSessionSecret(): string {
	const secret = env.JOURNAL_SESSION_SECRET;
	if (!secret || secret.length < 32) {
		throw new Error('JOURNAL_SESSION_SECRET must be at least 32 characters');
	}
	return secret;
}

export function validateConfiguredPassphrase(): void {
	const passphrase = env.JOURNAL_PASSPHRASE;
	if (!passphrase) {
		throw new Error('JOURNAL_PASSPHRASE environment variable is not set');
	}

	const validation = validatePassphraseStrength(passphrase);
	if (!validation.valid) {
		console.warn('WARNING: Configured passphrase does not meet security requirements:');
		for (const error of validation.errors) {
			console.warn(`  - ${error}`);
		}
		console.warn('Consider updating JOURNAL_PASSPHRASE in your environment.');
	}
}
