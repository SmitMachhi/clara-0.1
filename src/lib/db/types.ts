export interface Entry {
	id: number;
	date: string;
	timestamp: string;
	location_id: number | null;
	location_name?: string;
	captured_lat: number | null;
	captured_lng: number | null;
	quote_id?: number | null;
	quote_text?: string | null;
	template_id: number | null;
	created_at: string;
}

export interface EntryYearSummary {
	year: number;
	entryCount: number;
}

export interface EntryWithData extends Entry {
	data: Record<string, string>;
}

export interface TemplatePresetSummary {
	id: number;
	name: string;
	created_at: string;
}

export interface Quote {
	id: number;
	text: string;
	created_at: string;
}

export interface DailyQuote {
	date: string;
	quote_id: number | null;
	text: string;
	created_at: string;
}

export interface QuoteSource {
	id: number;
	sourceText: string;
	created_at: string;
	updated_at: string;
}

export interface ActiveSession {
	nonce: string;
	expiresAt: number;
	deviceInfo: string;
	locationId: number | null;
	locationLat: number | null;
	locationLng: number | null;
	createdAt: number;
}

export interface Location {
	id: number;
	name: string;
	lat: number;
	lng: number;
	address: string | null;
}
