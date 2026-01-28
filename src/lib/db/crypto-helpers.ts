import { decrypt, encrypt } from '$lib/server/crypto.js';

export function encryptOptionalString(value: string | null | undefined): Buffer | null {
	if (value === null || value === undefined) return null;
	return Buffer.from(encrypt(value), 'utf8');
}

export function encryptOptionalNumber(value: number | null | undefined): Buffer | null {
	if (value === null || value === undefined) return null;
	return Buffer.from(encrypt(value.toString()), 'utf8');
}

export function decryptOptionalString(value: Buffer | null | undefined): string | null {
	if (!value) return null;
	return decrypt(value.toString('utf8'));
}

export function decryptOptionalNumber(value: Buffer | null | undefined): number | null {
	const decrypted = decryptOptionalString(value);
	if (decrypted === null) return null;
	const parsed = Number(decrypted);
	return Number.isFinite(parsed) ? parsed : null;
}
