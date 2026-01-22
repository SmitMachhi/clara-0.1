import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 100000;

/**
 * Derives a cryptographic key from password using PBKDF2
 */
export function deriveKey(password: string, salt: Buffer): Buffer {
	return pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
}

/**
 * Generates a random salt for key derivation
 */
export function generateSalt(): Buffer {
	return randomBytes(32);
}

/**
 * Generates a random IV for encryption
 */
export function generateIV(): Buffer {
	return randomBytes(IV_LENGTH);
}

/**
 * Encrypts data using AES-256-GCM
 * Returns { encrypted: Buffer, iv: Buffer, authTag: Buffer }
 */
export function encrypt(data: string, key: Buffer): { encrypted: Buffer; iv: Buffer; authTag: Buffer } {
	const iv = generateIV();
	const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
	
	const encrypted = Buffer.concat([
		cipher.update(data, 'utf8'),
		cipher.final()
	]);
	
	const authTag = cipher.getAuthTag();
	
	return { encrypted, iv, authTag };
}

/**
 * Decrypts data using AES-256-GCM
 */
export function decrypt(encrypted: Buffer, key: Buffer, iv: Buffer, authTag: Buffer): string {
	const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
	decipher.setAuthTag(authTag);
	
	const decrypted = Buffer.concat([
		decipher.update(encrypted),
		decipher.final()
	]);
	
	return decrypted.toString('utf8');
}

/**
 * Packs encrypted data with IV and authTag for storage
 */
export function packEncryptedData(encrypted: Buffer, iv: Buffer, authTag: Buffer): Buffer {
	// Format: [IV (16 bytes)][AuthTag (16 bytes)][Encrypted data]
	return Buffer.concat([iv, authTag, encrypted]);
}

/**
 * Unpacks stored encrypted data into components
 */
export function unpackEncryptedData(packed: Buffer): { encrypted: Buffer; iv: Buffer; authTag: Buffer } {
	const iv = packed.subarray(0, IV_LENGTH);
	const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
	const encrypted = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
	
	return { encrypted, iv, authTag };
}

/**
 * Helper to encrypt JSON data
 */
export function encryptJSON(data: object, key: Buffer): Buffer {
	const json = JSON.stringify(data);
	const { encrypted, iv, authTag } = encrypt(json, key);
	return packEncryptedData(encrypted, iv, authTag);
}

/**
 * Helper to decrypt JSON data
 */
export function decryptJSON<T>(packed: Buffer, key: Buffer): T {
	const { encrypted, iv, authTag } = unpackEncryptedData(packed);
	const json = decrypt(encrypted, key, iv, authTag);
	return JSON.parse(json) as T;
}
