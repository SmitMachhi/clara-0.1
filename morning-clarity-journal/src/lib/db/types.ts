export interface JournalData {
	whoAmIDoingThisFor: string;
	whatMakingAnxious: string;
	whatAvoiding: string;
	whyAvoiding: string;
	fearUnderneath: string;
	evidenceFearNotTrue: string;
	upsideIfAct: string;
	consumeInsteadProduce: string;
	exactDistraction: string;
	wasteToday: string;
	commitment1: string;
	commitment2: string;
	commitment3: string;
	// Legacy fields (for backward compatibility with old entries)
	howLikely: string;
	howBad10Days: string;
	howBad10Months: string;
	howBad10Years: string;
	realFear: string;
	kimTest: string;
	whatDoILose: string;
	whatConsumeInsteadProduce: string;
	egoWillTell: string;
	triggerTimeSituation: string;
	temptedWhenWillBecause: string;
	track: string;
	nonNeg1What: string;
	nonNeg1When: string;
	nonNeg2What: string;
	nonNeg2When: string;
	nonNeg3What: string;
	nonNeg3When: string;
	trapRule: string;
}

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

export interface EntryWithData extends Entry {
	data: JournalData;
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
