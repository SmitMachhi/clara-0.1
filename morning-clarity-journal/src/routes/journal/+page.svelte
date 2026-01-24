<!-- purpose: Journal entry capture page -->
<!-- context: Daily morning journaling flow and routing guard -->
<!-- location: src/routes/journal/+page.svelte -->

<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getEmptyJournalData, journalTemplate } from '$lib/template.js';
	import { formatDateISO, isPastCutoff, getYearDates, getDateTimeParts } from '$lib/utils.js';
	import type { Location, Entry } from '$lib/db.js';
	import { TIME } from '$lib/constants.js';
	import { fetchLocations, fetchEntries, captureGps } from '$lib/journal-actions.js';
	import { apiFetch } from '$lib/api-client.js';
	import Spinner from '$lib/components/Spinner.svelte';
	import JournalForm from '$lib/components/JournalForm.svelte';
	import JournalSidebar from '$lib/components/JournalSidebar.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';

	const DRAFT_STORAGE_KEY = 'mcj-draft';
	const DRAFT_DEBOUNCE_MS = 300;

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
	let isLoadingData = $state(true);
	let loadError = $state('');
	let isMounted = $state(false);
	let draftSaveTimeout: ReturnType<typeof setTimeout> | null = null;
	const today = formatDateISO(new Date());
	const currentYear = new Date().getFullYear();
	const yearDates = getYearDates(currentYear);
	const fieldIds = journalTemplate.flatMap(q => q.fields.map(f => f.id));

	let completedFields = $derived(fieldIds.filter(id => formData[id]?.trim().length > 0).length);
	let totalFields = $derived(fieldIds.length);
	let isComplete = $derived(completedFields === totalFields);

	onMount(() => {
		isMounted = true;
		document.documentElement.classList.add('ritual');
		isPastTime = isPastCutoff();
		const interval = setInterval(() => {
			dateParts = getDateTimeParts(new Date());
			isPastTime = isPastCutoff();
		}, TIME.CLOCK_UPDATE_INTERVAL_MS);

		const beforeUnloadHandler = (event: BeforeUnloadEvent) => {
			if (completedFields > 0 && !hasEntryToday) {
				event.preventDefault();
				event.returnValue = '';
			}
		};

		window.addEventListener('beforeunload', beforeUnloadHandler);

		apiFetch('/api/session')
			.then(res => {
				if (res.status === 401) goto('/');
			})
			.catch(() => goto('/'));

		loadAllData()
			.then(ok => {
				if (!ok) return;
				hasEntryToday = entryDates.includes(today);
				restoreDraft();
			})
			.catch(console.error);

		return () => {
			clearInterval(interval);
			window.removeEventListener('beforeunload', beforeUnloadHandler);
			if (draftSaveTimeout) {
				clearTimeout(draftSaveTimeout);
			}
			document.documentElement.classList.remove('ritual');
		};
	});

	async function loadLocations(): Promise<boolean> {
		try {
			locations = await fetchLocations();
			return true;
		} catch (err) {
			console.error('Failed to load locations', err);
			return false;
		}
	}

	async function loadEntries(): Promise<boolean> {
		try {
			const data = await fetchEntries();
			entries = data.entries;
			entryDates = data.entryDates;
			return true;
		} catch (err) {
			console.error('Failed to load entries', err);
			return false;
		}
	}

	async function loadAllData(): Promise<boolean> {
		isLoadingData = true;
		loadError = '';
		const [locationsOk, entriesOk] = await Promise.all([loadLocations(), loadEntries()]);
		isLoadingData = false;
		if (!locationsOk || !entriesOk) {
			loadError = 'Failed to load journal data.';
			return false;
		}
		return true;
	}

	async function retryLoad() {
		const ok = await loadAllData();
		if (ok) {
			hasEntryToday = entryDates.includes(today);
			restoreDraft();
		}
	}

	async function handleSubmit() {
		if (isSaving || isPastTime || hasEntryToday || !isComplete) return;
		isSaving = true;
		saveError = '';

		try {
			const res = await apiFetch('/api/entries', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					locationId: selectedLocationId,
					data: formData,
					capturedLat: selectedLocationId ? null : capturedLat,
					capturedLng: selectedLocationId ? null : capturedLng
				})
			});

			if (res.ok) {
				try {
					sessionStorage.removeItem(DRAFT_STORAGE_KEY);
				} catch (err) {
					console.error('Failed to clear draft', err);
				}
				goto(`/entry/${today}`);
			} else {
				const data = await res.json();
				saveError = data.error || 'Failed to save entry';
			}
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

	function restoreDraft() {
		if (hasEntryToday) return;
		const rawDraft = sessionStorage.getItem(DRAFT_STORAGE_KEY);
		if (!rawDraft) return;

		try {
			const parsedDraft = JSON.parse(rawDraft);
			if (parsedDraft && typeof parsedDraft === 'object') {
				formData = { ...formData, ...parsedDraft };
			}
		} catch (err) {
			console.error('Failed to restore draft', err);
		}
	}

	$effect(() => {
		if (hasEntryToday) goto(`/entry/${today}`);
	});

	$effect(() => {
		if (!isMounted || hasEntryToday) return;

		if (draftSaveTimeout) {
			clearTimeout(draftSaveTimeout);
		}

		draftSaveTimeout = setTimeout(() => {
			try {
				sessionStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(formData));
			} catch (err) {
				console.error('Failed to save draft', err);
			}
		}, DRAFT_DEBOUNCE_MS);
	});
</script>

{#if isLoadingData}
	<div class="notion-page">
		<div class="main-area">
			<main class="content">
				<div class="message-container"><Spinner /></div>
			</main>
		</div>
	</div>
{:else if loadError}
	<div class="notion-page">
		<div class="main-area">
			<main class="content">
				<div class="message-container">
					<p class="message-title">Unable to load journal</p>
					<p class="message-text">{loadError}</p>
					<button type="button" class="primary-btn" onclick={retryLoad}>Retry</button>
				</div>
			</main>
		</div>
	</div>
{:else if isPastTime && !hasEntryToday}
	<div class="notion-page">
		<div class="main-area">
			<main class="content">
				<div class="message-container">
					<p class="message-title">It's past 14:00</p>
					<p class="message-text">Morning journaling closes at 14:00.<br/>Come back tomorrow.</p>
				</div>
			</main>
		</div>
	</div>
{:else if hasEntryToday}
	<div class="notion-page">
		<div class="main-area">
			<main class="content">
				<div class="message-container"><Spinner /></div>
			</main>
		</div>
	</div>
{:else}
	<div class="notion-page">
		<div class="main-area">
			<main class="content">
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
	</div>
{/if}
<SettingsModal open={settingsOpen} {locations} onclose={() => settingsOpen = false} onLocationsChanged={loadLocations} />
