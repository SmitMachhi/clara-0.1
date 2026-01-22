// Journal template - 6 main questions with optional sub-questions

export interface TemplateField {
	id: string;
	label: string;
	placeholder?: string;
	multiline?: boolean;
	type?: 'text' | 'textarea' | 'rating';
}

export interface TemplateQuestion {
	id: string;
	number: number;
	question: string;
	fields: TemplateField[];
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
				multiline: true
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
				label: "What's making me anxious right now?",
				multiline: true 
			},
			{ 
				id: 'whatAvoiding', 
				label: 'What am I avoiding?',
				multiline: true 
			},
			{ 
				id: 'fearUnderneath', 
				label: "What's the fear underneath that?",
				multiline: true 
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
				multiline: true 
			},
			{ 
				id: 'upsideIfAct', 
				label: 'Upside if I act despite fear?',
				multiline: true 
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
				multiline: true 
			},
			{ 
				id: 'exactDistraction', 
				label: 'What distraction will I reach for?',
				multiline: true 
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
				multiline: true 
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
				multiline: true
			},
			{ 
				id: 'commitment2', 
				label: '#2',
				multiline: true
			},
			{ 
				id: 'commitment3', 
				label: '#3',
				multiline: true
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
