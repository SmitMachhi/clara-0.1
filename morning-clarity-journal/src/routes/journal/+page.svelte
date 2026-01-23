<!-- purpose: Main journaling interface with form and tracker -->
<!-- context: Core feature for creating daily entries -->
<!-- location: src/routes/journal/+page.svelte -->

<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getEmptyJournalData, journalTemplate } from '$lib/template.js';
	import { formatDateISO, isPastCutoff, getYearDates, getDateTimeParts } from '$lib/utils.js';
	import type { Location, Entry } from '$lib/db.js';
	import { TIME } from '$lib/constants.js';
	import { fetchLocations, fetchEntries, submitEntry, captureGps } from '$lib/journal-actions.js';
	import Spinner from '$lib/components/Spinner.svelte';
	import JournalForm from '$lib/components/JournalForm.svelte';
	import JournalSidebar from '$lib/components/JournalSidebar.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';
	import Icon from '$lib/components/Icons.svelte';

	let formData = $state(getEmptyJournalData());
	let locations = $state<Location[]>([]);
	let selectedLocationId = $state<number | null>(null);
	let capturedLat = $state<number | null>(null);
	let capturedLng = $state<number | null>(null);
	let isCapturingGps = $state(false);
	let gpsError = $state('');
	let entries = $state<Entry[]>([]);
	let entryDates = $state<string[]>([]);
	let isSaving = $state(false);
	let saveError = $state('');
	let isPastTime = $state(false);
	let hasEntryToday = $state(false);
	let dateParts = $state(getDateTimeParts(new Date()));
	let sidebarOpen = $state(false);
	let settingsOpen = $state(false);
	let isDarkMode = $state(false);
	let isLoadingData = $state(true);

	const today = formatDateISO(new Date());
	const currentYear = new Date().getFullYear();
	const yearDates = getYearDates(currentYear);
	const fieldIds = journalTemplate.flatMap(q => q.fields.map(f => f.id));

	let completedFields = $derived(fieldIds.filter(id => formData[id]?.trim().length > 0).length);
	let totalFields = $derived(fieldIds.length);
	let isComplete = $derived(completedFields === totalFields);

	onMount(() => {
		document.documentElement.classList.add('ritual');
		isPastTime = isPastCutoff();
		const interval = setInterval(() => {
			dateParts = getDateTimeParts(new Date());
			isPastTime = isPastCutoff();
		}, TIME.CLOCK_UPDATE_INTERVAL_MS);
		loadAllData().then(() => {
			hasEntryToday = entryDates.includes(today);
		}).catch(console.error);
		return () => {
			clearInterval(interval);
			document.documentElement.classList.remove('ritual', 'dark');
		};
	});

	async function loadLocations() {
		try {
			locations = await fetchLocations();
		} catch (err) {
			console.error('Failed to load locations', err);
		}
	}

	async function loadEntries() {
		try {
			const data = await fetchEntries();
			entries = data.entries;
			entryDates = data.entryDates;
		} catch (err) {
			console.error('Failed to load entries', err);
		}
	}

	async function loadAllData() {
		isLoadingData = true;
		await Promise.all([loadLocations(), loadEntries()]);
		isLoadingData = false;
	}

	async function handleSubmit() {
		if (isSaving || isPastTime || hasEntryToday || !isComplete) return;
		isSaving = true;
		saveError = '';
		try {
			const result = await submitEntry(formData, selectedLocationId, capturedLat, capturedLng);
			if (result.ok) goto(`/entry/${today}`);
			else saveError = result.error || 'Failed to save entry';
		} catch (err) {
			saveError = 'Failed to save entry';
		} finally {
			isSaving = false;
		}
	}

	function captureCurrentLocation() {
		isCapturingGps = true;
		gpsError = '';
		captureGps(
			locations,
			(result) => {
				if (result.matchedPresetId !== null) {
					selectedLocationId = result.matchedPresetId;
					capturedLat = null;
					capturedLng = null;
				} else {
					capturedLat = result.lat;
					capturedLng = result.lng;
					selectedLocationId = null;
				}
				isCapturingGps = false;
			},
			(error) => {
				isCapturingGps = false;
				gpsError = error;
			}
		);
	}

	function clearCapturedLocation() {
		capturedLat = null;
		capturedLng = null;
		gpsError = '';
	}

	function toggleTheme() {
		isDarkMode = !isDarkMode;
		document.documentElement.classList.toggle('dark', isDarkMode);
	}

	$effect(() => {
		if (hasEntryToday) goto(`/entry/${today}`);
	});
</script>

<div class="notion-page">
	<div class="main-area">
		<main class="content">
			{#if isLoadingData}
				<div class="message-container"><Spinner /></div>
			{:else if isPastTime && !hasEntryToday}
				<div class="message-container">
					<p class="message-title">It's past 14:00</p>
					<p class="message-text">Morning journaling closes at 14:00.<br/>Come back tomorrow.</p>
				</div>
			{:else if hasEntryToday}
				<div class="message-container"><Spinner /></div>
			{:else}
				<JournalForm
					{formData} {locations} {selectedLocationId}
					{capturedLat} {capturedLng} {isCapturingGps} {gpsError}
					{isSaving} {saveError} {dateParts} {currentYear}
					{isComplete} {completedFields} {totalFields}
					onSubmit={handleSubmit}
					onCaptureLocation={captureCurrentLocation}
					onClearLocation={clearCapturedLocation}
					onSelectLocation={(id) => { selectedLocationId = id; capturedLat = null; capturedLng = null; }}
					onClearSelectedLocation={() => { selectedLocationId = null; }}
				/>
			{/if}
		</main>
		<div class="progress-pill">
			<span class="progress-count">{completedFields}</span>
			<span class="progress-text">of {totalFields}</span>
		</div>
	</div>
	<JournalSidebar
		{entries} {entryDates} {yearDates} {currentYear}
		{sidebarOpen} {settingsOpen}
		onToggleSidebar={() => sidebarOpen = !sidebarOpen}
		onCloseSidebar={() => sidebarOpen = false}
		onOpenSidebar={() => sidebarOpen = true}
		onOpenSettings={() => settingsOpen = !settingsOpen}
		onViewEntry={(date) => goto(`/entry/${date}`)}
	/>
	<button class="theme-btn" onclick={toggleTheme} aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
		<Icon name={isDarkMode ? 'sun' : 'moon'} size={16} />
	</button>
</div>
<SettingsModal open={settingsOpen} {locations} onclose={() => settingsOpen = false} onLocationsChanged={loadLocations} />
