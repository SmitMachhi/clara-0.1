import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveEntry, hasEntryForDate, type JournalData } from '$lib/db.js';

export const POST: RequestHandler = async () => {
	// Create a test entry for yesterday
	const yesterday = new Date();
	yesterday.setDate(yesterday.getDate() - 1);
	const date = yesterday.toISOString().split('T')[0];
	
	// Check if entry already exists
	if (hasEntryForDate(date)) {
		return json({ success: false, error: 'Entry already exists for ' + date }, { status: 400 });
	}
	
	const timestamp = `${yesterday.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} · ${yesterday.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${yesterday.getFullYear()}`;
	
	const testData: JournalData = {
		whoAmIDoingThisFor: 'For my future self. For the person I want to become - someone who shows up consistently, even when it\'s hard. For my family who believes in me.',
		whatMakingAnxious: 'The big presentation next week. I keep thinking about all the ways it could go wrong.',
		whatAvoiding: 'Actually sitting down and preparing the slides. I keep finding other "urgent" tasks instead.',
		fearUnderneath: 'Fear of being seen as incompetent. Fear that people will realize I don\'t belong here.',
		evidenceFearNotTrue: 'I\'ve done presentations before that went well. My manager specifically asked me to present because they trust my knowledge. Last quarter\'s review was positive.',
		upsideIfAct: 'I could actually nail this presentation and build more confidence. It could lead to new opportunities. I\'d feel proud of myself for facing the fear.',
		consumeInsteadProduce: 'Scrolling Twitter for "inspiration", watching YouTube tutorials without actually applying them, checking email obsessively.',
		exactDistraction: 'My phone. Specifically Reddit and Twitter when I feel stuck or uncomfortable.',
		wasteToday: 'Spending all morning in shallow work - emails, Slack, meetings that should have been emails. Not making progress on what actually matters.',
		commitment1: 'Two hours of deep work on the presentation before checking any messages',
		commitment2: 'Phone in another room until lunch',
		commitment3: '30 minute walk outside to clear my head',
		// Legacy fields (empty)
		whyAvoiding: '',
		howLikely: '',
		howBad10Days: '',
		howBad10Months: '',
		howBad10Years: '',
		realFear: '',
		kimTest: '',
		whatDoILose: '',
		whatConsumeInsteadProduce: '',
		egoWillTell: '',
		triggerTimeSituation: '',
		temptedWhenWillBecause: '',
		track: '',
		nonNeg1What: '',
		nonNeg1When: '',
		nonNeg2What: '',
		nonNeg2When: '',
		nonNeg3What: '',
		nonNeg3When: '',
		trapRule: ''
	};
	
	try {
		const id = saveEntry(date, timestamp, null, testData);
		return json({ success: true, id, date });
	} catch (error) {
		return json({ success: false, error: 'Failed to create test entry' }, { status: 500 });
	}
};
