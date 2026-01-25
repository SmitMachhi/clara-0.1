import { json } from '@sveltejs/kit';
import { parseJsonBody } from '$lib/api-helpers.js';
import type { RequestHandler } from './$types';
import {
	verifyPassphrase,
	createSessionToken,
	checkAuthRateLimit,
	recordAuthFailure,
	clearAuthFailures
} from '$lib/auth.js';
import {
	setActiveSession,
	getActiveSession,
	clearActiveSession,
	findMatchingLocation,
	getLocationById
} from '$lib/db.js';
import { parseDeviceInfo } from '$lib/device-parser.js';

interface AuthRequestBody {
	passphrase?: string;
	lat?: number;
	lng?: number;
	forceLogout?: boolean;
}

export const POST: RequestHandler = async ({ request, cookies, getClientAddress }) => {
	const ip = getClientAddress();

	const rateLimit = checkAuthRateLimit(ip);
	if (!rateLimit.ok) {
		return json({
			success: false,
			error: `Too many attempts. Try again in ${rateLimit.retryAfter} seconds.`
		}, { status: 429 });
	}

	const body = await parseJsonBody<AuthRequestBody>(request, 2048);
	if (body.error) {
		return json({ success: false, error: body.error }, { status: 400 });
	}

	const { passphrase, lat, lng, forceLogout } = body.data ?? {};

	if (!passphrase || typeof passphrase !== 'string') {
		recordAuthFailure(ip);
		return json({ success: false, error: 'Authentication failed' }, { status: 401 });
	}

	const isValid = verifyPassphrase(passphrase);
	if (!isValid) {
		recordAuthFailure(ip);
		return json({ success: false, error: 'Authentication failed' }, { status: 401 });
	}

	if (!forceLogout) {
		const existingSession = getActiveSession();
		if (existingSession && Date.now() < existingSession.expiresAt) {
			let locationDisplay: string;
			if (existingSession.locationId) {
				const loc = getLocationById(existingSession.locationId);
				locationDisplay = loc?.name ?? 'Unknown location';
			} else if (existingSession.locationLat != null && existingSession.locationLng != null) {
				locationDisplay = `${existingSession.locationLat.toFixed(4)}, ${existingSession.locationLng.toFixed(4)}`;
			} else {
				locationDisplay = 'Unknown location';
			}

			return json({
				success: false,
				error: 'already_logged_in',
				existingSession: {
					device: existingSession.deviceInfo,
					location: locationDisplay,
					since: existingSession.createdAt
				}
			}, { status: 409 });
		}
	}

	clearActiveSession();
	clearAuthFailures(ip);

	const userAgent = request.headers.get('User-Agent');
	const deviceInfo = parseDeviceInfo(userAgent);

	let locationId: number | null = null;
	let locationLat: number | null = null;
	let locationLng: number | null = null;

	if (typeof lat === 'number' && typeof lng === 'number') {
		const matchedLocation = findMatchingLocation(lat, lng);
		if (matchedLocation) {
			locationId = matchedLocation.id;
		} else {
			locationLat = lat;
			locationLng = lng;
		}
	}

	const { token, expiresAt, nonce } = createSessionToken();
	setActiveSession(nonce, expiresAt, deviceInfo, locationId, locationLat, locationLng);

	const maxAgeSeconds = Math.floor((expiresAt - Date.now()) / 1000);
	cookies.set('session', token, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: process.env.NODE_ENV === 'production',
		maxAge: maxAgeSeconds
	});

	return json({ success: true });
};
