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
