export const LEGACY_FIELD_LABELS: Record<string, string> = {
	'whyAvoiding': 'Why am I avoiding it?',
	'realFear': 'The real fear is',
	'howLikely': 'How likely (1-10)',
	'howBad10Days': 'How bad in 10 days',
	'howBad10Months': 'How bad in 10 months',
	'howBad10Years': 'How bad in 10 years',
	'kimTest': 'Kim test reflection',
	'whatDoILose': 'What do I lose if fear wins',
	'whatConsumeInsteadProduce': 'What will I consume instead of produce',
	'egoWillTell': 'My ego will tell me',
	'triggerTimeSituation': 'Trigger time/situation',
	'temptedWhenWillBecause': 'When tempted',
	'track': 'Track',
	'nonNeg1What': 'Non-negotiable #1',
	'nonNeg1When': 'Non-negotiable #1 when',
	'nonNeg2What': 'Non-negotiable #2',
	'nonNeg2When': 'Non-negotiable #2 when',
	'nonNeg3What': 'Non-negotiable #3',
	'nonNeg3When': 'Non-negotiable #3 when',
	'trapRule': 'Trap rule'
};

export function getLegacyFieldLabel(fieldId: string): string {
	return LEGACY_FIELD_LABELS[fieldId] || fieldId;
}
