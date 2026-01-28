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
}

export interface TemplateBlock {
	type: 'hp' | 'mp';
	text: string;
	placeholder?: string;
}

export interface TemplateField {
	id: string;
	label: string;
	placeholder: string;
	type: 'hp' | 'mp';
}

export interface TemplateQuestion {
	id: string;
	number: number;
	question: string;
	fields: TemplateField[];
}

export interface TemplateModel {
	questions: TemplateQuestion[];
	fieldIds: string[];
}
