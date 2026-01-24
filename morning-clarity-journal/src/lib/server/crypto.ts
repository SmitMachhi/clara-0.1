import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { env } from '$env/dynamic/private';

const IV_LENGTH = 12; // 96 bits, recommended for GCM

let cachedKey: Buffer | null = null;

function getKey(): Buffer {
	if (cachedKey) return cachedKey;
	const secret = env.JOURNAL_ENCRYPTION_KEY;
	if (!secret) {
		throw new Error('JOURNAL_ENCRYPTION_KEY environment variable is not set');
	}
	cachedKey = createHash('sha256').update(secret).digest();
	return cachedKey;
}

export function encrypt(plaintext: string): string {
	const key = getKey();
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

export function decrypt(stored: string): string {
	const key = getKey();
	const { iv, tag, data } = JSON.parse(stored);
	const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
	decipher.setAuthTag(Buffer.from(tag, 'base64'));
	const decrypted = Buffer.concat([
		decipher.update(Buffer.from(data, 'base64')),
		decipher.final()
	]);
	return decrypted.toString('utf8');
}
