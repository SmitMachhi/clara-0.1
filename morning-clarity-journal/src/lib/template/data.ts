import type { TemplateModel, TemplateQuestion } from './types.js';

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
		lines.push('</hp>');
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

export function getEmptyJournalData(): Record<string, string> {
	const data: Record<string, string> = {};
	for (const question of journalTemplate) {
		for (const field of question.fields) {
			data[field.id] = '';
		}
	}
	return data;
}

export function getCurrentFieldIds(): string[] {
	return journalTemplate.flatMap(q => q.fields.map(f => f.id));
}
