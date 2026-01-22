import { randomBytes, createHash } from 'crypto';

// Session store (in-memory for simplicity - sessions reset on server restart)
const sessions = new Map<string, { expires: Date }>();

const SESSION_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a secure session token
 */
export function generateSessionToken(): string {
	return randomBytes(32).toString('hex');
}

/**
 * Create a new session
 */
export function createSession(): string {
	const token = generateSessionToken();
	const expires = new Date(Date.now() + SESSION_DURATION_MS);
	sessions.set(token, { expires });
	return token;
}

/**
 * Validate a session token
 */
export function validateSession(token: string | undefined): boolean {
	if (!token) return false;
	
	const session = sessions.get(token);
	if (!session) return false;
	
	if (session.expires < new Date()) {
		sessions.delete(token);
		return false;
	}
	
	return true;
}

/**
 * Invalidate a session
 */
export function invalidateSession(token: string): void {
	sessions.delete(token);
}

/**
 * Hash password for comparison (simple comparison for single user)
 */
export function hashPassword(password: string): string {
	return createHash('sha256').update(password).digest('hex');
}

// The expected password hash
const EXPECTED_PASSWORD = 'ismathrelatedtoscience';

/**
 * Verify the password
 */
export function verifyPassword(input: string): boolean {
	return input === EXPECTED_PASSWORD;
}
