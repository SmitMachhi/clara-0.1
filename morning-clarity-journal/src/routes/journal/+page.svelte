<!-- purpose: Journal entry capture page -->
<!-- context: Daily morning journaling flow and routing guard -->
<!-- location: src/routes/journal/+page.svelte -->

<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import type { TemplateModel } from '$lib/template.js';
	import { formatDateISO, isPastCutoff, getYearDates, getDateTimeParts } from '$lib/utils.js';
	import type { Location, Entry } from '$lib/db.js';
	import { TIME } from '$lib/constants.js';
	import { captureGps } from '$lib/journal-actions.js';
	import { apiFetch } from '$lib/api-client.js';
	import {
		DRAFT_DEBOUNCE_MS,
		DRAFT_STORAGE_KEY,
		loadJournalPageData,
		restoreDraft,
		saveDraft
	} from '$lib/journal-page-helpers.js';
	import Spinner from '$lib/components/Spinner.svelte';
	import JournalForm from '$lib/components/JournalForm.svelte';
	import JournalSidebar from '$lib/components/JournalSidebar.svelte';
	import SettingsModal from '$lib/components/SettingsModal.svelte';

	let template = $state<TemplateModel | null>(null);
	let formData = $state<Record<string, string>>({});
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
	const hpFieldIds = $derived.by(() => {
		if (!template) return [];
		return template.questions
			.flatMap(question => question.fields)
			.filter(field => field.type === 'hp')
			.map(field => field.id);
	});

	let completedFields = $derived(hpFieldIds.filter(id => formData[id]?.trim().length > 0).length);
	let totalFields = $derived(hpFieldIds.length);
	let isComplete = $derived(completedFields === totalFields);

	onMount(() => {
		isMounted = true;
		document.documentElement.classList.add('ritual');
		isPastTime = isPastCutoff();
		const interval = setInterval(() => {
			const nextParts = getDateTimeParts(new Date());
			if (nextParts.time !== dateParts.time || nextParts.day !== dateParts.day) {
				dateParts = nextParts;
			}
			const nextIsPast = isPastCutoff();
			if (nextIsPast !== isPastTime) {
				isPastTime = nextIsPast;
			}
		}, TIME.CLOCK_UPDATE_INTERVAL_MS);

		const beforeUnloadHandler = (event: BeforeUnloadEvent) => {
			if (completedFields > 0 && !hasEntryToday) {
				event.preventDefault();
				event.returnValue = '';
			}
		};

		window.addEventListener('beforeunload', beforeUnloadHandler);

		const init = async () => {
			try {
				const res = await apiFetch('/api/session');
				if (res.status !== 204) {
					goto('/');
					return;
				}
			} catch {
				goto('/');
				return;
			}

			const ok = await loadAllData();
			if (!ok) return;
			hasEntryToday = entryDates.includes(today);
			formData = restoreDraft(formData);
		};

		void init();

		return () => {
			clearInterval(interval);
			window.removeEventListener('beforeunload', beforeUnloadHandler);
			if (draftSaveTimeout) {
				clearTimeout(draftSaveTimeout);
			}
			document.documentElement.classList.remove('ritual');
		};
	});

	async function loadAllData(): Promise<boolean> {
		isLoadingData = true;
		loadError = '';
		const result = await loadJournalPageData();
		isLoadingData = false;
		if (!result.data) {
			loadError = result.error;
			return false;
		}
		locations = result.data.locations;
		entries = result.data.entries;
		entryDates = result.data.entryDates;
		template = result.data.template;
		formData = result.data.formData;
		return true;
	}

	async function retryLoad() {
		const ok = await loadAllData();
		if (ok) {
			hasEntryToday = entryDates.includes(today);
			formData = restoreDraft(formData);
		}
	}

	async function handleTemplateChanged() {
		const result = await loadJournalPageData();
		if (!result.data) {
			console.error('Failed to reload template');
			return;
		}
		template = result.data.template;
		formData = result.data.formData;
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

	async function handleLocationsChanged(): Promise<boolean> {
		try {
			const updatedLocations = await loadJournalPageData();
			if (!updatedLocations.data) return false;
			locations = updatedLocations.data.locations;
			return true;
		} catch {
			return false;
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
			saveDraft(formData);
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
				{#if template}
					<JournalForm
						{formData} {locations} {selectedLocationId}
						{capturedLat} {capturedLng} {isCapturingGps} {gpsError}
						{isSaving} {saveError} {dateParts} {currentYear}
						{template}
						{isComplete} {completedFields} {totalFields}
						onSubmit={handleSubmit}
						onCaptureLocation={captureCurrentLocation}
						onClearLocation={clearCapturedLocation}
						onSelectLocation={(id) => {
							selectedLocationId = id;
							capturedLat = null;
							capturedLng = null;
						}}
						onClearSelectedLocation={() => { selectedLocationId = null; }}
					/>
				{/if}
			</main>
			{#if template}
				<div class="progress-pill">
					<span class="progress-count">{completedFields}</span>
					<span class="progress-text">of {totalFields}</span>
				</div>
			{/if}
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
<SettingsModal
	open={settingsOpen}
	{locations}
	onclose={() => settingsOpen = false}
	onLocationsChanged={handleLocationsChanged}
	onTemplateChanged={handleTemplateChanged}
/>
