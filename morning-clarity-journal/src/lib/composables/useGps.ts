import { GPS } from '../constants.js';
import { findMatchingPreset, handleGeolocationError } from '../location-utils.js';
import type { Location } from '../db.js';

export function useGps(locations: Location[]) {
	let isCapturing = $state(false);
	let capturedLat = $state<number | null>(null);
	let capturedLng = $state<number | null>(null);
	let matchedLocationId = $state<number | null>(null);
	let error = $state('');

	async function captureCurrentLocation() {
		if (!navigator.geolocation) {
			error = 'Geolocation not supported';
			return;
		}

		isCapturing = true;
		error = '';

		try {
			const position = await new Promise<GeolocationPosition>((resolve, reject) => {
				navigator.geolocation.getCurrentPosition(resolve, reject, GPS.DEFAULT_OPTIONS);
			});

			const lat = position.coords.latitude;
			const lng = position.coords.longitude;

			const matchingId = findMatchingPreset(lat, lng, locations);

			if (matchingId !== null) {
				matchedLocationId = matchingId;
				capturedLat = null;
				capturedLng = null;
			} else {
				capturedLat = lat;
				capturedLng = lng;
				matchedLocationId = null;
			}
		} catch (err) {
			error = handleGeolocationError(err as GeolocationPositionError);
		} finally {
			isCapturing = false;
		}
	}

	function clearCapturedLocation() {
		capturedLat = null;
		capturedLng = null;
		matchedLocationId = null;
		error = '';
	}

	return {
		isCapturing,
		capturedLat,
		capturedLng,
		matchedLocationId,
		error,
		captureCurrentLocation,
		clearCapturedLocation
	};
}
