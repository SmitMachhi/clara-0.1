import { EMPTY_COORDINATE_PLACEHOLDER, EMPTY_TEXT_PLACEHOLDER, getDb } from './connection.js';
import {
	decryptOptionalNumber,
	decryptOptionalString,
	encryptOptionalNumber,
	encryptOptionalString
} from './crypto-helpers.js';
import type { Location } from './types.js';
import { calculateDistance } from '../location-utils.js';

const LOCATION_MATCH_TOLERANCE_METERS = 500;
const LOCATION_CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_LOCATION_CACHE_SIZE = 100; // Prevent unbounded memory growth

interface LocationCache {
	data: Location[] | null;
	timestamp: number;
}

const locationCache: LocationCache = {
	data: null,
	timestamp: 0
};

export function invalidateLocationCache(): void {
	locationCache.data = null;
	locationCache.timestamp = 0;
}

function isCacheValid(): boolean {
	return locationCache.data !== null && Date.now() - locationCache.timestamp < LOCATION_CACHE_TTL_MS;
}

function normalizeLocationName(value: string): string {
	return value.trim().toLowerCase();
}

export function getLocations(): Location[] {
	if (isCacheValid()) {
		return locationCache.data!;
	}
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

	const locations = rows
		.map(row => ({
			id: row.id,
			name: decryptOptionalString(row.name_encrypted) ?? EMPTY_TEXT_PLACEHOLDER,
			lat: decryptOptionalNumber(row.lat_encrypted) ?? EMPTY_COORDINATE_PLACEHOLDER,
			lng: decryptOptionalNumber(row.lng_encrypted) ?? EMPTY_COORDINATE_PLACEHOLDER,
			address: decryptOptionalString(row.address_encrypted)
		}))
		.sort((a, b) => a.name.localeCompare(b.name));

	// Enforce cache size limit to prevent unbounded memory growth
	if (locations.length > MAX_LOCATION_CACHE_SIZE) {
		console.warn(
			`Location cache size (${locations.length}) exceeds limit (${MAX_LOCATION_CACHE_SIZE}), skipping cache`
		);
		return locations;
	}

	locationCache.data = locations;
	locationCache.timestamp = Date.now();

	return locations;
}

export function findMatchingLocation(lat: number, lng: number): Location | null {
	const locations = getLocations();
	for (const loc of locations) {
		const distance = calculateDistance(lat, lng, loc.lat, loc.lng);
		if (distance <= LOCATION_MATCH_TOLERANCE_METERS) {
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
	invalidateLocationCache();
	return result.lastInsertRowid as number;
}

export function deleteLocation(id: number): boolean {
	const database = getDb();
	const result = database.prepare('DELETE FROM locations WHERE id = ?').run(id);
	if (result.changes > 0) {
		invalidateLocationCache();
	}
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

export function locationNameExists(name: string, excludeId?: number): boolean {
	const locations = getLocations();
	const normalized = normalizeLocationName(name);
	return locations.some(location => {
		if (excludeId !== undefined && location.id === excludeId) return false;
		return normalizeLocationName(location.name) === normalized;
	});
}
