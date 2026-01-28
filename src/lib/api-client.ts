const SESSION_FLAG_KEY = 'mcj-session-present';

export function setSessionFlag(): void {
	sessionStorage.setItem(SESSION_FLAG_KEY, '1');
}

export function clearSessionFlag(): void {
	sessionStorage.removeItem(SESSION_FLAG_KEY);
}

export function hasSessionFlag(): boolean {
	return sessionStorage.getItem(SESSION_FLAG_KEY) === '1';
}

export function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
	return fetch(url, { ...options, credentials: 'same-origin' });
}
