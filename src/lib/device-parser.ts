/**
 * Parses User-Agent string into a human-readable device description.
 * Examples: "Chrome on macOS", "Safari on iPhone", "Firefox on Windows"
 */
export function parseDeviceInfo(userAgent: string | null): string {
	if (!userAgent) return 'Unknown device';

	let os = 'Unknown OS';
	if (userAgent.includes('iPhone') || userAgent.includes('iPad')) {
		os = userAgent.includes('iPad') ? 'iPad' : 'iPhone';
	} else if (userAgent.includes('Android')) {
		os = 'Android';
	} else if (userAgent.includes('Mac OS X') || userAgent.includes('Macintosh')) {
		os = 'macOS';
	} else if (userAgent.includes('Windows')) {
		os = 'Windows';
	} else if (userAgent.includes('Linux')) {
		os = 'Linux';
	}

	let browser = 'Unknown browser';
	if (userAgent.includes('Edg/')) {
		browser = 'Edge';
	} else if (userAgent.includes('Chrome/') && !userAgent.includes('Edg/')) {
		browser = 'Chrome';
	} else if (userAgent.includes('Safari/') && !userAgent.includes('Chrome/')) {
		browser = 'Safari';
	} else if (userAgent.includes('Firefox/')) {
		browser = 'Firefox';
	}

	return `${browser} on ${os}`;
}
