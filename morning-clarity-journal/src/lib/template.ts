// Journal template - 6 main questions with optional sub-questions

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

const MAX_TEMPLATE_BYTES = 20 * 1024;
const MAX_TEMPLATE_LINES = 200;
const textEncoder = new TextEncoder();

function getTemplateSize(sourceText: string): number {
	return textEncoder.encode(sourceText).length;
}

function parseLabelAttribute(
	attributeText: string,
	lineNumber: number,
	errors: string[]
): string | null {
	const trimmed = attributeText.trim();
	if (!trimmed) return '';
	const match = trimmed.match(/^label="([^"]*)"$/);
	if (!match) {
		errors.push(`Invalid attribute on line ${lineNumber}`);
		return null;
	}
	return match[1];
}

export function parseTemplateSource(sourceText: string): { parsed: TemplateModel; errors: string[] } {
	const errors: string[] = [];
	const emptyParsed = { questions: [], fieldIds: [] };

	if (getTemplateSize(sourceText) > MAX_TEMPLATE_BYTES) {
		return { parsed: emptyParsed, errors: ['Template exceeds 20KB'] };
	}

	const lines = sourceText.split(/\r?\n/);
	if (lines.length > MAX_TEMPLATE_LINES) {
		return { parsed: emptyParsed, errors: ['Template exceeds 200 lines'] };
	}

	const lineStarts = [0];
	for (let i = 0; i < sourceText.length; i += 1) {
		if (sourceText[i] === '\n') {
			lineStarts.push(i + 1);
		}
	}

	function getLineNumber(index: number): number {
		let low = 0;
		let high = lineStarts.length - 1;
		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			if (lineStarts[mid] <= index) {
				low = mid + 1;
			} else {
				high = mid - 1;
			}
		}
		return Math.max(1, high + 1);
	}

	function reportUnknownTag(index: number) {
		errors.push(`Unknown tag on line ${getLineNumber(index)}`);
	}

	function reportMpWithoutHp(index: number) {
		errors.push(`MP without HP on line ${getLineNumber(index)}`);
	}

	const questions: TemplateQuestion[] = [];
	const fieldIds: string[] = [];
	let questionIndex = 0;
	let fieldIndex = 0;
	const hpRegex = /<hp([^>]*)>([\s\S]*?)<\/hp>/gi;
	const mpRegex = /<mp([^>]*)>([\s\S]*?)<\/mp>/gi;
	const tagRegex = /<\/?([a-zA-Z]+)([^>]*)>/g;
	let lastIndex = 0;
	let hpMatch: RegExpExecArray | null;

	function handleStraySegment(segment: string, offset: number) {
		if (!segment.trim()) return;
		const tagMatch = segment.match(/<\/?([a-zA-Z]+)([^>]*)>/);
		if (tagMatch?.index !== undefined) {
			const tagName = tagMatch[1].toLowerCase();
			const tagIndex = offset + tagMatch.index;
			if (tagName === 'mp') {
				reportMpWithoutHp(tagIndex);
				return;
			}
			reportUnknownTag(tagIndex);
			return;
		}
		const firstNonWhitespace = segment.search(/\S/);
		if (firstNonWhitespace >= 0) {
			reportUnknownTag(offset + firstNonWhitespace);
		}
	}

	while ((hpMatch = hpRegex.exec(sourceText)) !== null) {
		const blockIndex = hpMatch.index;
		handleStraySegment(sourceText.slice(lastIndex, blockIndex), lastIndex);

		const hpLine = getLineNumber(blockIndex);
		const hpPlaceholder = parseLabelAttribute(hpMatch[1], hpLine, errors);
		const hpContent = hpMatch[2];
		const hpContentStart = blockIndex + hpMatch[0].indexOf(hpContent);

		mpRegex.lastIndex = 0;
		let hpText = hpContent.replace(mpRegex, '').trim();
		if (!hpText) {
			errors.push(`Empty tag content on line ${hpLine}`);
		}

		mpRegex.lastIndex = 0;
		const invalidMpTag = hpContent.replace(mpRegex, '');
		const strayMpMatch = invalidMpTag.match(/<\/?mp\b/i);
		if (strayMpMatch?.index !== undefined) {
			reportUnknownTag(hpContentStart + strayMpMatch.index);
		}

		tagRegex.lastIndex = 0;
		let tagMatch: RegExpExecArray | null;
		while ((tagMatch = tagRegex.exec(hpContent)) !== null) {
			const tagName = tagMatch[1].toLowerCase();
			if (tagName !== 'mp') {
				reportUnknownTag(hpContentStart + tagMatch.index);
			}
		}

		questionIndex += 1;
		const question: TemplateQuestion = {
			id: `q${questionIndex}`,
			number: questionIndex,
			question: hpText,
			fields: []
		};

		if (hpPlaceholder !== null) {
			fieldIndex += 1;
			const hpFieldId = `f${fieldIndex}`;
			question.fields.push({
				id: hpFieldId,
				label: '',
				placeholder: hpPlaceholder,
				type: 'hp'
			});
			fieldIds.push(hpFieldId);
		}

		mpRegex.lastIndex = 0;
		let mpMatch: RegExpExecArray | null;
		while ((mpMatch = mpRegex.exec(hpContent)) !== null) {
			const mpIndex = hpContentStart + mpMatch.index;
			const mpLine = getLineNumber(mpIndex);
			const mpPlaceholder = parseLabelAttribute(mpMatch[1], mpLine, errors);
			const mpText = mpMatch[2].trim();
			if (!mpText) {
				errors.push(`Empty tag content on line ${mpLine}`);
				continue;
			}
			if (mpPlaceholder === null) continue;

			fieldIndex += 1;
			const mpFieldId = `f${fieldIndex}`;
			question.fields.push({
				id: mpFieldId,
				label: mpText,
				placeholder: mpPlaceholder,
				type: 'mp'
			});
			fieldIds.push(mpFieldId);
		}

		questions.push(question);
		lastIndex = hpRegex.lastIndex;
	}

	handleStraySegment(sourceText.slice(lastIndex), lastIndex);

	return {
		parsed: errors.length > 0 ? emptyParsed : { questions, fieldIds },
		errors
	};
}

export const journalTemplate: TemplateQuestion[] = [
	{
		id: 'q1',
		number: 1,
		question: 'Who am I doing this for?',
		fields: [
			{
				id: 'whoAmIDoingThisFor',
				label: '',
				placeholder: '',
				type: 'hp'
			}
		]
	},
	{
		id: 'q2',
		number: 2,
		question: 'What is the real fear underneath?',
		fields: [
			{
				id: 'whatMakingAnxious',
				label: 'What\'s making me anxious right now?',
				placeholder: '',
				type: 'mp'
			},
			{
				id: 'whatAvoiding',
				label: 'What am I avoiding?',
				placeholder: '',
				type: 'mp'
			},
			{
				id: 'fearUnderneath',
				label: 'What\'s the fear underneath that?',
				placeholder: '',
				type: 'mp'
			}
		]
	},
	{
		id: 'q3',
		number: 3,
		question: 'What if the fear is wrong?',
		fields: [
			{
				id: 'evidenceFearNotTrue',
				label: 'Evidence this fear might not be true?',
				placeholder: '',
				type: 'mp'
			},
			{
				id: 'upsideIfAct',
				label: 'Upside if I act despite fear?',
				placeholder: '',
				type: 'mp'
			}
		]
	},
	{
		id: 'q4',
		number: 4,
		question: 'Which trap will try to get me today?',
		fields: [
			{
				id: 'consumeInsteadProduce',
				label: 'What will I consume instead of produce?',
				placeholder: '',
				type: 'mp'
			},
			{
				id: 'exactDistraction',
				label: 'What distraction will I reach for?',
				placeholder: '',
				type: 'mp'
			}
		]
	},
	{
		id: 'q5',
		number: 5,
		question: 'What would make today a waste?',
		fields: [
			{
				id: 'wasteToday',
				label: '',
				placeholder: '',
				type: 'hp'
			}
		]
	},
	{
		id: 'q6',
		number: 6,
		question: 'What are my 3 non-negotiables?',
		fields: [
			{
				id: 'commitment1',
				label: '#1',
				placeholder: '',
				type: 'mp'
			},
			{
				id: 'commitment2',
				label: '#2',
				placeholder: '',
				type: 'mp'
			},
			{
				id: 'commitment3',
				label: '#3',
				placeholder: '',
				type: 'mp'
			}
		]
	}
];

// Legacy field mapping for displaying old entries
export const legacyFieldIds = [
	'whoAmIDoingThisFor',
	'whatMakingAnxious',
	'whatAvoiding',
	'whyAvoiding',
	'fearUnderneath',
	'howLikely',
	'howBad10Days',
	'howBad10Months',
	'howBad10Years',
	'realFear',
	'evidenceFearNotTrue',
	'kimTest',
	'whatDoILose',
	'upsideIfAct',
	'whatConsumeInsteadProduce',
	'egoWillTell',
	'exactDistraction',
	'triggerTimeSituation',
	'temptedWhenWillBecause',
	'wasteToday',
	'track',
	'nonNeg1What',
	'nonNeg1When',
	'nonNeg2What',
	'nonNeg2When',
	'nonNeg3What',
	'nonNeg3When',
	'trapRule',
	'consumeInsteadProduce',
	'commitment1',
	'commitment2',
	'commitment3',
	'likelihood'
];

export function serializeDefaultTemplate(): string {
	const lines: string[] = [];
	for (const question of journalTemplate) {
		lines.push(`<hp>${question.question}`);
		for (const field of question.fields) {
			if (!field.label) continue;
			lines.push(`<mp>${field.label}</mp>`);
		}
		lines.push(`</hp>`);
	}
	return lines.join('\n');
}

export function createEmptyFormData(template: TemplateModel): Record<string, string> {
	const data: Record<string, string> = {};
	for (const fieldId of template.fieldIds) {
		data[fieldId] = '';
	}
	return data;
}

// Helper to get empty journal data
export function getEmptyJournalData(): Record<string, string> {
	const data: Record<string, string> = {};
	for (const question of journalTemplate) {
		for (const field of question.fields) {
			data[field.id] = '';
		}
	}
	return data;
}

// Get all current field IDs
export function getCurrentFieldIds(): string[] {
	return journalTemplate.flatMap(q => q.fields.map(f => f.id));
}
