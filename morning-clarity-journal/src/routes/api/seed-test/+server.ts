import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { saveEntry, updateEntry, hasEntryForDate, getLocations, locationNameExists, addLocation, type JournalData } from '$lib/db.js';

export const POST: RequestHandler = async () => {
	// Create a test entry for January 21, 2026
	const date = '2026-01-21';
	const entryDate = new Date('2026-01-21T09:03:00');
	
	// Get or create "Home" location
	let homeLocationId: number | null = null;
	const locations = getLocations();
	const homeLocation = locations.find(loc => loc.name.toLowerCase() === 'home');
	
	if (homeLocation) {
		homeLocationId = homeLocation.id;
	} else {
		// Create "Home" location if it doesn't exist (using default coordinates)
		if (!locationNameExists('Home')) {
			homeLocationId = addLocation('Home', 37.7749, -122.4194, undefined); // Default SF coordinates, can be updated
		} else {
			// If it exists but wasn't found (case sensitivity issue), find it
			const allLocations = getLocations();
			const found = allLocations.find(loc => loc.name.toLowerCase() === 'home');
			if (found) {
				homeLocationId = found.id;
			}
		}
	}
	
	const hours = entryDate.getHours().toString().padStart(2, '0');
	const minutes = entryDate.getMinutes().toString().padStart(2, '0');
	const timestamp = `${hours}:${minutes} ${entryDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${entryDate.getFullYear()}`;
	
	const testData: JournalData = {
		whoAmIDoingThisFor: 'For my future self. For the person I want to become - someone who shows up consistently, even when it\'s hard. For my family who believes in me.',
		whatMakingAnxious: 'The big presentation next week. I keep thinking about all the ways it could go wrong.',
		whatAvoiding: 'Actually sitting down and preparing for slides. I keep finding other "urgent" tasks instead.',
		fearUnderneath: 'Fear of being seen as incompetent. Fear that people will realize I don\'t belong here.',
		evidenceFearNotTrue: 'I\'ve done presentations before that went well. My manager specifically asked me to present because they trust my knowledge. Last quarter\'s review was positive.',
		upsideIfAct: 'I could actually nail this presentation and build more confidence. It could lead to new opportunities. I\'d feel proud of myself for facing the fear.',
		consumeInsteadProduce: 'Scrolling Twitter for "inspiration", watching YouTube tutorials without actually applying them, checking email obsessively.',
		exactDistraction: 'My phone. Specifically Reddit and Twitter when I feel stuck or uncomfortable.',
		wasteToday: 'Spending all morning in shallow work - emails, Slack, meetings that should have been emails. Not making progress on what actually matters.',
		commitment1: 'Two hours of deep work on presentation before checking any messages',
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
		if (hasEntryForDate(date)) {
			// Update existing entry
			const updated = updateEntry(date, timestamp, homeLocationId, testData);
			if (updated) {
				return json({ success: true, message: 'Entry updated', date, locationId: homeLocationId });
			} else {
				return json({ success: false, error: 'Failed to update entry' }, { status: 500 });
			}
		} else {
			// Create new entry
			const id = saveEntry(date, timestamp, homeLocationId, testData);
			return json({ success: true, id, date, locationId: homeLocationId });
		}
	} catch (error) {
		console.error('Seed test error:', error);
		return json({ success: false, error: 'Failed to create/update test entry' }, { status: 500 });
	}
};
