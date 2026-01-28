import { createCipheriv, createDecipheriv, randomBytes, createHash, pbkdf2Sync } from 'crypto';
import { env } from '$env/dynamic/private';

const IV_LENGTH = 12; // 96 bits, recommended for GCM
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;

let cachedKey: Buffer | null = null;

function getLegacyKey(): Buffer {
	const secret = env.JOURNAL_ENCRYPTION_KEY;
	if (!secret) {
		throw new Error('JOURNAL_ENCRYPTION_KEY environment variable is not set');
	}
	return createHash('sha256').update(secret).digest();
}

function decryptWithKey(stored: string, key: Buffer): string {
	const { iv, tag, data } = JSON.parse(stored);
	const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
	decipher.setAuthTag(Buffer.from(tag, 'base64'));
	const decrypted = Buffer.concat([
		decipher.update(Buffer.from(data, 'base64')),
		decipher.final()
	]);
	return decrypted.toString('utf8');
}

function encryptWithKey(plaintext: string, key: Buffer): string {
	const iv = randomBytes(IV_LENGTH);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return JSON.stringify({
		iv: iv.toString('base64'),
		tag: tag.toString('base64'),
		data: encrypted.toString('base64')
	});
}

function getKey(): Buffer {
	if (cachedKey) return cachedKey;
	const secret = env.JOURNAL_ENCRYPTION_KEY;
	if (!secret) {
		throw new Error('JOURNAL_ENCRYPTION_KEY environment variable is not set');
	}
	// Deterministic salt from a fixed prefix + the secret itself.
	// Ensures the same key is derived each run (required to decrypt existing data).
	const salt = createHash('sha256').update('mcj-encryption-salt:' + secret, 'utf8').digest();
	cachedKey = pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256');
	return cachedKey;
}

export function decryptWithLegacyKey(stored: string): string {
	const legacyKey = getLegacyKey();
	return decryptWithKey(stored, legacyKey);
}

export function encrypt(plaintext: string): string {
	return encryptWithKey(plaintext, getKey());
}

export function decrypt(stored: string): string {
	return decryptWithKey(stored, getKey());
}
