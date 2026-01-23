<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { getEmptyJournalData, journalTemplate, type JournalData } from '$lib/template.js';
	import { formatDateISO, isPastCutoff, getYearDates, getDateTimeParts } from '$lib/utils.js';
	import type { Location, Entry } from '$lib/db.js';
	import { TIME } from '$lib/constants.js';
	import { fetchLocations, fetchEntries, captureGps } from '$lib/journal-actions.js';
	import { encryptClient, decryptClient } from '$lib/crypto.js';
	import { apiFetch } from '$lib/api-client.js';
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
	let passphrase = $state('');
	let needsMigration = $state(false);
	let legacyPassphrase = $state('');
	let isMigrating = $state(false);
	let migrationError = $state('');
	let migrationProgress = $state({ current: 0, total: 0 });

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

		const storedPassphrase = localStorage.getItem('journal-passphrase');
		if (!storedPassphrase) {
			goto('/');
			return;
		}
		passphrase = storedPassphrase;

		loadAllData()
			.then(() => {
				hasEntryToday = entryDates.includes(today);
			})
			.catch(console.error);

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

			if (entries.length > 0) {
				const sampleEntry = await apiFetch(`/api/entries/${entries[0].date}`);
				if (sampleEntry.ok) {
					const entryData = await sampleEntry.json();
					const encrypted = entryData.encryption;
					if (encrypted && encrypted.version === 2) {
						try {
							await decryptClient(encrypted, passphrase);
						} catch {
							needsMigration = true;
						}
					} else {
						needsMigration = true;
					}
				}
			}
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
			const dataJson = JSON.stringify(formData);
			const encryption = await encryptClient(dataJson, passphrase);

			const res = await apiFetch('/api/entries', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					locationId: selectedLocationId,
					encryption,
					capturedLat: selectedLocationId ? null : capturedLat,
					capturedLng: selectedLocationId ? null : capturedLng
				})
			});

			if (res.ok) {
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

	async function performMigration() {
		if (!legacyPassphrase || !passphrase) return;

		isMigrating = true;
		migrationError = '';
		migrationProgress = { current: 0, total: entries.length };

		const migratedEntries: { date: string; timestamp: string; encryptedData: string }[] = [];

		for (const entry of entries) {
			try {
				const res = await apiFetch(`/api/entries/${entry.date}`);
				const entryData = await res.json();
				const encrypted = entryData.encryption;

				if (encrypted && encrypted.version === 2) {
					try {
						await decryptClient(encrypted, passphrase);
						migrationProgress.current++;
						continue;
					} catch {
						// Current passphrase failed; try legacy password
					}
				}

				// Decrypt with legacy password, re-encrypt with new passphrase
				const decrypted = await decryptClient(encrypted, legacyPassphrase);
				const journalData = JSON.parse(decrypted) as JournalData;
				const newEncrypted = await encryptClient(JSON.stringify(journalData), passphrase);

				migratedEntries.push({
					date: entry.date,
					timestamp: entry.timestamp,
					encryptedData: JSON.stringify(newEncrypted)
				});

				migrationProgress.current++;
			} catch (err) {
				console.error(`Failed to migrate entry ${entry.date}:`, err);
			}
		}

		if (migratedEntries.length > 0) {
			const res = await apiFetch('/api/entries/migrate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ entries: migratedEntries })
			});

			if (!res.ok) {
				const data = await res.json();
				migrationError = data.error || 'Migration failed';
				isMigrating = false;
				return;
			}
		}

		needsMigration = false;
		isMigrating = false;
		await loadAllData();
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

{#if needsMigration}
	<div class="fixed inset-0 bg-[var(--bg)] flex items-center justify-center p-[var(--space-lg)] z-50">
		<div class="w-full max-w-md">
			<h2 class="text-xl text-[var(--text)] mb-[var(--space-lg)] text-center">Migration Required</h2>
			<p class="text-[var(--text-muted)] text-sm mb-[var(--space-lg)]">
				Your entries use old server-side encryption. Enter the old password to migrate them to client-side encryption.
			</p>
			<input
				type="password"
				bind:value={legacyPassphrase}
				placeholder="Old password"
				class="w-full mb-[var(--space-md)]"
				disabled={isMigrating}
			/>
			{#if migrationError}
				<p class="text-[var(--missed)] text-sm mb-[var(--space-md)]">{migrationError}</p>
			{/if}
			{#if isMigrating}
				<p class="text-[var(--text-muted)] text-sm mb-[var(--space-md)]">
					Migrating {migrationProgress.current} of {migrationProgress.total} entries...
				</p>
			{/if}
			<button
				onclick={performMigration}
				disabled={isMigrating || !legacyPassphrase}
				class="w-full py-[var(--space-md)] bg-[var(--surface-elevated)] text-[var(--text)] rounded-[var(--radius-md)] transition-colors hover:bg-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed"
			>
				{isMigrating ? 'Migrating...' : 'Migrate'}
			</button>
		</div>
	</div>
{:else if isLoadingData}
	<div class="notion-page">
		<div class="main-area">
			<main class="content">
				<div class="message-container"><Spinner /></div>
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
		<button class="theme-btn" onclick={toggleTheme} aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
			<Icon name={isDarkMode ? 'sun' : 'moon'} size={16} />
		</button>
	</div>
{/if}
<SettingsModal open={settingsOpen} {locations} onclose={() => settingsOpen = false} onLocationsChanged={loadLocations} />
