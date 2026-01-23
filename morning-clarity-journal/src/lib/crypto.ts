import { randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16;
const PBKDF2_ITERATIONS = 600000;

/**
 * Derives a cryptographic key from password using PBKDF2 (server-side)
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

// Client-side encryption helpers (for browser Web Crypto API)

export interface ClientEncryptedData {
	version: number;
	salt_b64: string;
	iv_b64: string;
	auth_tag_b64: string;
	ciphertext_b64: string;
}

/**
 * Client-side: Derive key from passphrase using PBKDF2 (Web Crypto API)
 */
export async function deriveKeyClient(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const keyMaterial = await crypto.subtle.importKey(
		'raw',
		encoder.encode(passphrase),
		'PBKDF2',
		false,
		['deriveKey']
	);
	
	return crypto.subtle.deriveKey(
		{
			name: 'PBKDF2',
			salt: salt as BufferSource,
			iterations: PBKDF2_ITERATIONS,
			hash: 'SHA-256'
		},
		keyMaterial,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

/**
 * Client-side: Encrypt data using AES-256-GCM with passphrase-derived key
 */
export async function encryptClient(data: string, passphrase: string): Promise<ClientEncryptedData> {
	const salt = crypto.getRandomValues(new Uint8Array(32));
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const key = await deriveKeyClient(passphrase, salt);
	const encoder = new TextEncoder();
	const plaintext = encoder.encode(data);

	const encrypted = await crypto.subtle.encrypt(
		{ name: 'AES-GCM', iv },
		key,
		plaintext
	);

	const encryptedBytes = new Uint8Array(encrypted);
	const authTag = encryptedBytes.slice(-AUTH_TAG_LENGTH);
	const ciphertext = encryptedBytes.slice(0, -AUTH_TAG_LENGTH);

	return {
		version: 2,
		salt_b64: btoa(String.fromCharCode(...salt)),
		iv_b64: btoa(String.fromCharCode(...iv)),
		auth_tag_b64: btoa(String.fromCharCode(...authTag)),
		ciphertext_b64: btoa(String.fromCharCode(...ciphertext))
	};
}

/**
 * Client-side: Decrypt data using AES-256-GCM
 */
export async function decryptClient(encrypted: ClientEncryptedData, passphrase: string): Promise<string> {
	const salt = new Uint8Array(atob(encrypted.salt_b64).split('').map(c => c.charCodeAt(0)));
	const iv = new Uint8Array(atob(encrypted.iv_b64).split('').map(c => c.charCodeAt(0)));
	const authTag = new Uint8Array(atob(encrypted.auth_tag_b64).split('').map(c => c.charCodeAt(0)));
	const ciphertext = new Uint8Array(atob(encrypted.ciphertext_b64).split('').map(c => c.charCodeAt(0)));
	
	const key = await deriveKeyClient(passphrase, salt);
	const combined = new Uint8Array(ciphertext.length + authTag.length);
	combined.set(ciphertext);
	combined.set(authTag, ciphertext.length);
	
	const decrypted = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv },
		key,
		combined
	);
	
	const decoder = new TextDecoder();
	return decoder.decode(decrypted);
}
