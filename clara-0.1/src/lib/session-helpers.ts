/**
 * Information about an existing active session.
 * Used by the auth endpoint to return session details when a user tries to log in
 * but already has an active session, and by the login page to display this info.
 */
export interface ExistingSessionInfo {
	device: string;
	location: string;
	since: number;
}

export async function getOptionalLocation(): Promise<{ lat: number; lng: number } | null> {
	if (!navigator.geolocation) return null;

	try {
		const position = await new Promise<GeolocationPosition>((resolve, reject) => {
			navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
		});
		return {
			lat: position.coords.latitude,
			lng: position.coords.longitude
		};
	} catch {
		return null;
	}
}
