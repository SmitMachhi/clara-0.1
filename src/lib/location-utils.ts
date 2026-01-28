import type { Location } from './db.js';
import { GPS, DISPLAY } from './constants.js';

/**
 * Calculate the distance between two geographic coordinates using the Haversine formula.
 * @param lat1 - Latitude of first point in degrees
 * @param lng1 - Longitude of first point in degrees
 * @param lat2 - Latitude of second point in degrees
 * @param lng2 - Longitude of second point in degrees
 * @returns Distance in meters
 */
export function calculateDistance(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number
): number {
	const dLat = (lat2 - lat1) * Math.PI / 180;
	const dLng = (lng2 - lng1) * Math.PI / 180;
	const a =
		Math.sin(dLat / 2) * Math.sin(dLat / 2) +
		Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
		Math.sin(dLng / 2) * Math.sin(dLng / 2);
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return GPS.EARTH_RADIUS_METERS * c;
}

export function findMatchingPreset(lat: number, lng: number, locations: Location[]): number | null {
	for (const loc of locations) {
		const distance = calculateDistance(lat, lng, loc.lat, loc.lng);
		if (distance <= GPS.DEFAULT_TOLERANCE_METERS) {
			return loc.id;
		}
	}
	return null;
}

export function formatCoordinate(coord: number): string {
	return coord.toFixed(DISPLAY.COORDINATE_DECIMAL_PLACES);
}

export function handleGeolocationError(error: GeolocationPositionError): string {
	switch (error.code) {
		case error.PERMISSION_DENIED:
			return 'Permission denied';
		case error.POSITION_UNAVAILABLE:
			return 'Location unavailable';
		case error.TIMEOUT:
			return 'Request timed out';
		default:
			return 'Failed to get location';
	}
}
