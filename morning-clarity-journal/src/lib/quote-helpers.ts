export function getQuoteLabel(text: string, maxLength: number = 32): string {
	const normalized = text.replace(/\s+/g, ' ').trim();
	if (!normalized) return 'Untitled quote';
	if (normalized.length <= maxLength) return normalized;
	const clipped = normalized.slice(0, Math.max(0, maxLength - 3)).trim();
	return clipped.length > 0 ? `${clipped}...` : normalized.slice(0, maxLength);
}
