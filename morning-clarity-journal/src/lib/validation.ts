import type { Location } from './db.js';
import { VALIDATION } from './constants.js';

export function validateCoordinates(lat: number, lng: number): { valid: boolean; error?: string } {
	if (typeof lat !== 'number' || lat < VALIDATION.LATITUDE_MIN || lat > VALIDATION.LATITUDE_MAX) {
		return { valid: false, error: 'Invalid latitude' };
	}
	if (typeof lng !== 'number' || lng < VALIDATION.LONGITUDE_MIN || lng > VALIDATION.LONGITUDE_MAX) {
		return { valid: false, error: 'Invalid longitude' };
	}
	return { valid: true };
}

export function validateId(id: string | number): { valid: boolean; error?: string } {
	const num = typeof id === 'number' ? id : parseInt(id, 10);
	if (isNaN(num)) {
		return { valid: false, error: 'Invalid ID' };
	}
	return { valid: true };
}

export function validateLocationName(name: unknown): { valid: boolean; error?: string } {
	if (!name || typeof name !== 'string' || name.trim().length === 0) {
		return { valid: false, error: 'Invalid location name' };
	}
	if (name.trim().length > 100) {
		return { valid: false, error: 'Location name too long (max 100 characters)' };
	}
	return { valid: true };
}

export function validateJournalData(data: unknown): { valid: boolean; error?: string } {
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return { valid: false, error: 'Invalid entry data format' };
	}
	return { valid: true };
}

export interface PassphraseValidationResult {
	valid: boolean;
	errors: string[];
}

export function validatePassphraseStrength(passphrase: string): PassphraseValidationResult {
	const errors: string[] = [];

	// Minimum length of 12 characters
	if (passphrase.length < 12) {
		errors.push('Passphrase must be at least 12 characters long');
	}

	// Maximum length of 128 characters (prevent DoS via PBKDF2)
	if (passphrase.length > 128) {
		errors.push('Passphrase must be at most 128 characters long');
	}

	// Check for at least some complexity (not all same character)
	const uniqueChars = new Set(passphrase).size;
	if (uniqueChars < 4) {
		errors.push('Passphrase must contain at least 4 different characters');
	}

	// Check it's not just repeating patterns
	const normalized = passphrase.toLowerCase();
	if (/^(.+)\\1+$/.test(normalized)) {
		errors.push('Passphrase cannot be a simple repeating pattern');
	}

	return {
		valid: errors.length === 0,
		errors
	};
}
