import { EMPTY_COORDINATE_PLACEHOLDER, EMPTY_TEXT_PLACEHOLDER, getDb } from './connection.js';
import {
	decryptOptionalNumber,
	decryptOptionalString,
	encryptOptionalNumber,
	encryptOptionalString
} from './crypto-helpers.js';
import type { Location } from './types.js';

const LOCATION_MATCH_TOLERANCE_KM = 0.5;

function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
	const R = 6371;
	const dLat = (lat2 - lat1) * Math.PI / 180;
	const dLng = (lng2 - lng1) * Math.PI / 180;
	const a = Math.sin(dLat / 2) ** 2 +
		Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
		Math.sin(dLng / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
}

function normalizeLocationName(value: string): string {
	return value.trim().toLowerCase();
}

export function getLocations(): Location[] {
	const database = getDb();
	const rows = database.prepare(
		'SELECT id, name_encrypted, lat_encrypted, lng_encrypted, address_encrypted FROM locations'
	).all() as Array<{
		id: number;
		name_encrypted: Buffer | null;
		lat_encrypted: Buffer | null;
		lng_encrypted: Buffer | null;
		address_encrypted: Buffer | null;
	}>;

	return rows
		.map(row => ({
			id: row.id,
			name: decryptOptionalString(row.name_encrypted) ?? EMPTY_TEXT_PLACEHOLDER,
			lat: decryptOptionalNumber(row.lat_encrypted) ?? EMPTY_COORDINATE_PLACEHOLDER,
			lng: decryptOptionalNumber(row.lng_encrypted) ?? EMPTY_COORDINATE_PLACEHOLDER,
			address: decryptOptionalString(row.address_encrypted)
		}))
		.sort((a, b) => a.name.localeCompare(b.name));
}

export function findMatchingLocation(lat: number, lng: number): Location | null {
	const locations = getLocations();
	for (const loc of locations) {
		if (haversineDistanceKm(lat, lng, loc.lat, loc.lng) < LOCATION_MATCH_TOLERANCE_KM) {
			return loc;
		}
	}
	return null;
}

export function addLocation(name: string, lat: number, lng: number, address?: string): number {
	const database = getDb();
	const nameEncrypted = encryptOptionalString(name);
	const latEncrypted = encryptOptionalNumber(lat);
	const lngEncrypted = encryptOptionalNumber(lng);
	const addressEncrypted = encryptOptionalString(address ?? null);
	const result = database.prepare(`
		INSERT INTO locations (
			name, lat, lng, address,
			name_encrypted, lat_encrypted, lng_encrypted, address_encrypted
		)
		VALUES ('', 0, 0, NULL, ?, ?, ?, ?)
	`).run(
		nameEncrypted,
		latEncrypted,
		lngEncrypted,
		addressEncrypted
	);
	return result.lastInsertRowid as number;
}

export function deleteLocation(id: number): boolean {
	const database = getDb();
	const result = database.prepare('DELETE FROM locations WHERE id = ?').run(id);
	return result.changes > 0;
}

export function getLocationById(id: number): Location | null {
	const database = getDb();
	const row = database.prepare(
		'SELECT id, name_encrypted, lat_encrypted, lng_encrypted, address_encrypted' +
		' FROM locations WHERE id = ?'
	).get(id) as {
		id: number;
		name_encrypted: Buffer | null;
		lat_encrypted: Buffer | null;
		lng_encrypted: Buffer | null;
		address_encrypted: Buffer | null;
	} | undefined;

	if (!row) return null;

	return {
		id: row.id,
		name: decryptOptionalString(row.name_encrypted) ?? EMPTY_TEXT_PLACEHOLDER,
		lat: decryptOptionalNumber(row.lat_encrypted) ?? EMPTY_COORDINATE_PLACEHOLDER,
		lng: decryptOptionalNumber(row.lng_encrypted) ?? EMPTY_COORDINATE_PLACEHOLDER,
		address: decryptOptionalString(row.address_encrypted)
	};
}

export function locationNameExists(name: string): boolean {
	const database = getDb();
	const rows = database.prepare(
		'SELECT name_encrypted FROM locations'
	).all() as Array<{ name_encrypted: Buffer | null }>;
	const normalized = normalizeLocationName(name);
	return rows.some(row => {
		const decrypted = decryptOptionalString(row.name_encrypted);
		if (!decrypted) return false;
		return normalizeLocationName(decrypted) === normalized;
	});
}
