import { createCipheriv, createDecipheriv, randomBytes, createHash, pbkdf2Sync } from 'crypto';
import { env } from '$env/dynamic/private';
import { getDb } from '$lib/db/connection.js';

const IV_LENGTH = 12; // 96 bits, recommended for GCM
const PBKDF2_ITERATIONS = 100000;
const PBKDF2_KEYLEN = 32;

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

/**
 * Derive encryption key from secret and salt using PBKDF2.
 */
function getKey(salt: Buffer): Buffer {
	const secret = env.JOURNAL_ENCRYPTION_KEY;
	if (!secret) {
		throw new Error('JOURNAL_ENCRYPTION_KEY environment variable is not set');
	}
	return pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256');
}

/**
 * Get or create the encryption salt from database.
 * Salt is stored in config table as 'encryption_salt'.
 */
function getEncryptionSalt(): Buffer {
	const database = getDb();
	const row = database.prepare(
		"SELECT value FROM config WHERE key = 'encryption_salt'"
	).get() as { value: string } | undefined;

	if (row?.value) {
		return Buffer.from(row.value, 'hex');
	}

	// Generate new random salt
	const newSalt = randomBytes(32);
	database.prepare(`
		INSERT INTO config (key, value)
		VALUES ('encryption_salt', ?)
		ON CONFLICT(key) DO UPDATE SET value = excluded.value
	`).run(newSalt.toString('hex'));

	return newSalt;
}

/**
 * Get the legacy deterministic salt for backward compatibility.
 * Used to decrypt data encrypted before the salt fix.
 */
function getLegacySalt(): Buffer {
	const secret = env.JOURNAL_ENCRYPTION_KEY;
	if (!secret) {
		throw new Error('JOURNAL_ENCRYPTION_KEY environment variable is not set');
	}
	return createHash('sha256').update('mcj-encryption-salt:' + secret, 'utf8').digest();
}

/**
 * Get the legacy key for backward compatibility (pre-salt-fix data).
 */
function getLegacyKey(): Buffer {
	const secret = env.JOURNAL_ENCRYPTION_KEY;
	if (!secret) {
		throw new Error('JOURNAL_ENCRYPTION_KEY environment variable is not set');
	}
	return createHash('sha256').update(secret).digest();
}

export function decryptWithLegacyKey(stored: string): string {
	const legacyKey = getLegacyKey();
	return decryptWithKey(stored, legacyKey);
}

export function encrypt(plaintext: string): string {
	const salt = getEncryptionSalt();
	const key = getKey(salt);
	return encryptWithKey(plaintext, key);
}

export function decrypt(stored: string): string {
	// Try new salt-based key first
	try {
		const salt = getEncryptionSalt();
		const key = getKey(salt);
		return decryptWithKey(stored, key);
	} catch {
		// Fall back to legacy deterministic salt for backward compatibility
		const legacySalt = getLegacySalt();
		const legacyKey = getKey(legacySalt);
		return decryptWithKey(stored, legacyKey);
	}
}
