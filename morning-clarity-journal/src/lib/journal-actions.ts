import type { Location, Entry } from '$lib/db.js';
import { GPS } from '$lib/constants.js';
import { handleGeolocationError, findMatchingPreset } from '$lib/location-utils.js';
import { validateCoordinates } from '$lib/validation.js';
import { apiFetch } from '$lib/api-client.js';

export interface GpsCaptureResult {
	matchedPresetId: number | null;
	lat: number | null;
	lng: number | null;
}

export async function fetchLocations(): Promise<Location[]> {
	const res = await apiFetch('/api/locations');
	const data = await res.json();
	return data.locations || [];
}

export async function fetchEntries(): Promise<{ entries: Entry[]; entryDates: string[] }> {
	const res = await apiFetch('/api/entries');
	const data = await res.json();
	return { entries: data.entries, entryDates: data.entryDates };
}

export async function submitEntry(
	formData: Record<string, string>,
	locationId: number | null,
	capturedLat: number | null,
	capturedLng: number | null
): Promise<{ ok: boolean; error?: string }> {
	const res = await apiFetch('/api/entries', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			locationId,
			data: formData,
			capturedLat: locationId ? null : capturedLat,
			capturedLng: locationId ? null : capturedLng
		})
	});

	if (res.ok) {
		return { ok: true };
	}
	const data = await res.json();
	return { ok: false, error: data.error || 'Failed to save entry' };
}

export function captureGps(
	locations: Location[],
	onSuccess: (result: GpsCaptureResult) => void,
	onError: (error: string) => void
): void {
	if (!navigator.geolocation) {
		onError('Geolocation not supported');
		return;
	}

	navigator.geolocation.getCurrentPosition(
		(position) => {
			const lat = position.coords.latitude;
			const lng = position.coords.longitude;
			const matchedPresetId = findMatchingPreset(lat, lng, locations);

			if (matchedPresetId !== null) {
				onSuccess({ matchedPresetId, lat: null, lng: null });
			} else {
				onSuccess({ matchedPresetId: null, lat, lng });
			}
		},
		(error) => {
			onError(handleGeolocationError(error));
		},
		GPS.DEFAULT_OPTIONS
	);
}

export function captureAndSaveLocation(
	name: string,
	onSuccess: () => void,
	onError: (error: string) => void
): void {
	if (!name.trim()) {
		onError('Enter a name first');
		return;
	}

	if (!navigator.geolocation) {
		onError('Geolocation is not supported by your browser');
		return;
	}

	navigator.geolocation.getCurrentPosition(
		async (position) => {
			const lat = position.coords.latitude;
			const lng = position.coords.longitude;

			try {
				const res = await apiFetch('/api/locations', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ name: name.trim(), lat, lng, address: null })
				});

				if (res.ok) {
					onSuccess();
				} else {
					const data = await res.json();
					onError(data.error || 'Failed to save');
				}
			} catch (err) {
				onError('Failed to save location');
			}
		},
		(error) => {
			onError(handleGeolocationError(error));
		},
		GPS.DEFAULT_OPTIONS
	);
}

export async function addLocation(
	name: string,
	latStr: string,
	lngStr: string,
	address: string
): Promise<{ ok: boolean; error?: string }> {
	if (!name.trim() || !latStr || !lngStr) {
		return { ok: false, error: 'Name and coordinates are required' };
	}

	const lat = parseFloat(latStr);
	const lng = parseFloat(lngStr);

	if (isNaN(lat) || isNaN(lng)) {
		return { ok: false, error: 'Invalid coordinates' };
	}

	const coordValidation = validateCoordinates(lat, lng);
	if (!coordValidation.valid) {
		return { ok: false, error: coordValidation.error };
	}

	const res = await apiFetch('/api/locations', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			name: name.trim(),
			lat,
			lng,
			address: address.trim() || null
		})
	});

	if (res.ok) {
		return { ok: true };
	}
	const data = await res.json();
	return { ok: false, error: data.error || 'Failed to add location' };
}

export async function deleteLocation(id: number): Promise<boolean> {
	const res = await apiFetch(`/api/locations/${id}`, { method: 'DELETE' });
	return res.ok;
}

export async function fetchBackups(): Promise<{ filename: string; size: number; created: string }[]> {
	const res = await apiFetch('/api/backup?action=list');
	const data = await res.json();
	return data.success ? data.backups : [];
}

export async function requestBackup(): Promise<{ ok: boolean; error?: string; message?: string }> {
	const res = await apiFetch('/api/backup', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' }
	});

	const data = await res.json();
	if (data.success) {
		return { ok: true, message: 'Backup created successfully' };
	}
	return { ok: false, error: data.error || 'Failed to create backup' };
}
