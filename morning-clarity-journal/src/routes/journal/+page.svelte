<!-- purpose: Main journaling interface with form and tracker -->
<!-- context: Core feature for creating daily entries -->
<!-- location: src/routes/journal/+page.svelte -->

<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { slide } from 'svelte/transition';
	import { journalTemplate, getEmptyJournalData } from '$lib/template.js';
	import { formatDateISO, isPastCutoff, extractTimeFromTimestamp, isDateInPast, getYearDates, isToday, getDateTimeParts, toggleSet } from '$lib/utils.js';
	import type { Location, Entry } from '$lib/db.js';
	import { TIME } from '$lib/constants.js';
	import { formatCoordinate } from '$lib/location-utils.js';
	import { calculateStats, getRecentEntries } from '$lib/stats.js';
	import { fetchLocations, fetchEntries, submitEntry, captureGps, captureAndSaveLocation, addLocation, deleteLocation, requestBackup } from '$lib/journal-actions.js';
	import Icon from '$lib/components/Icons.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Dropdown from '$lib/components/Dropdown.svelte';

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

	// Toggle state for each question section
	let expandedSections = $state<Set<string>>(new Set());

	// Initialize first section as expanded
	$effect(() => {
		if (expandedSections.size === 0 && journalTemplate.length > 0) {
			expandedSections = new Set([journalTemplate[0].id]);
		}
	});

	// Sidebar state
	let sidebarOpen = $state(false);

	// Settings popover state
	let settingsOpen = $state(false);

	// Location preset form state
	let newLocationName = $state('');
	let newLocationLat = $state('');
	let newLocationLng = $state('');
	let newLocationAddress = $state('');
	let isGettingLocation = $state(false);
	let locationError = $state('');
	let isAddingLocation = $state(false);
	let isDeletingLocation = $state<number | null>(null);
	let showManualEntry = $state(false);
	let isLoadingData = $state(true);

	// Backup state
	let isCreatingBackup = $state(false);
	let backupError = $state('');
	let backupSuccess = $state('');

	// Theme state
	let isDarkMode = $state(false);

	const today = formatDateISO(new Date());
	const currentYear = new Date().getFullYear();
	const yearDates = getYearDates(currentYear);

	// Calculate completion status
	let completedFields = $derived(() => {
		const allFieldIds = journalTemplate.flatMap(q => q.fields.map(f => f.id));
		return allFieldIds.filter(id => formData[id]?.trim().length > 0).length;
	});

	let totalFields = $derived(() => {
		return journalTemplate.flatMap(q => q.fields.map(f => f.id)).length;
	});

	let isComplete = $derived(() => {
		return completedFields() === totalFields();
	});

	onMount(() => {
		document.documentElement.classList.add('ritual');

		isPastTime = isPastCutoff();

		const interval = setInterval(() => {
			const now = new Date();
			dateParts = getDateTimeParts(now);
			isPastTime = isPastCutoff();
		}, TIME.CLOCK_UPDATE_INTERVAL_MS);

		loadAllData().then(() => {
			hasEntryToday = entryDates.includes(today);
		}).catch((err) => {
			console.error('Failed to load data', err);
		});

		return () => {
			clearInterval(interval);
			document.documentElement.classList.remove('ritual');
			document.documentElement.classList.remove('dark');
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
		try {
			await Promise.all([loadLocations(), loadEntries()]);
		} finally {
			isLoadingData = false;
		}
	}

	async function handleSubmit() {
		if (isSaving || isPastTime || hasEntryToday || !isComplete()) return;

		isSaving = true;
		saveError = '';

		try {
			const result = await submitEntry(formData, selectedLocationId, capturedLat, capturedLng);
			if (result.ok) {
				goto(`/entry/${today}`);
			} else {
				saveError = result.error || 'Failed to save entry';
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

	function toggleSection(questionId: string) {
		expandedSections = toggleSet(expandedSections, questionId);
	}

	function toggleTheme() {
		isDarkMode = !isDarkMode;
		if (isDarkMode) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	}

	function handleInput(event: Event, fieldId: string) {
		const target = event.target as HTMLElement;
		formData[fieldId] = target.textContent || '';
	}

	function handlePaste(event: ClipboardEvent) {
		event.preventDefault();
		const text = event.clipboardData?.getData('text/plain') || '';
		document.execCommand('insertText', false, text);
	}

	async function handleFieldFocus(questionId: string) {
		if (!expandedSections.has(questionId)) {
			const newSet = new Set(expandedSections);
			newSet.add(questionId);
			expandedSections = newSet;
			await tick();
		}
	}

	function getDayStatus(dateStr: string): 'completed' | 'missed' | 'future' | 'today' {
		if (isToday(dateStr)) return 'today';
		if (entryDates.includes(dateStr)) return 'completed';
		if (isDateInPast(dateStr)) return 'missed';
		return 'future';
	}

	function viewEntry(date: string) {
		goto(`/entry/${date}`);
	}

	$effect(() => {
		if (hasEntryToday) {
			goto(`/entry/${today}`);
		}
	});

	function getCurrentLocationAndSave() {
		isGettingLocation = true;
		locationError = '';

		captureAndSaveLocation(
			newLocationName,
			async () => {
				await loadLocations();
				newLocationName = '';
				newLocationLat = '';
				newLocationLng = '';
				newLocationAddress = '';
				showManualEntry = false;
				isGettingLocation = false;
			},
			(error) => {
				locationError = error;
				isGettingLocation = false;
			}
		);
	}

	async function addLocationPreset() {
		isAddingLocation = true;
		locationError = '';

		try {
			const result = await addLocation(newLocationName, newLocationLat, newLocationLng, newLocationAddress);
			if (result.ok) {
				await loadLocations();
				newLocationName = '';
				newLocationLat = '';
				newLocationLng = '';
				newLocationAddress = '';
				showManualEntry = false;
			} else {
				locationError = result.error || 'Failed to add location';
			}
		} catch (err) {
			locationError = 'Failed to add location';
		} finally {
			isAddingLocation = false;
		}
	}

	async function deleteLocationPreset(id: number) {
		if (isDeletingLocation !== null) return;

		isDeletingLocation = id;
		try {
			const ok = await deleteLocation(id);
			if (ok) {
				await loadLocations();
				if (selectedLocationId === id) {
					selectedLocationId = null;
				}
			}
		} catch (err) {
			console.error('Failed to delete location', err);
		} finally {
			isDeletingLocation = null;
		}
	}

	async function createBackup() {
		isCreatingBackup = true;
		backupError = '';
		backupSuccess = '';

		try {
			const result = await requestBackup();
			if (result.ok) {
				backupSuccess = result.message || 'Backup created successfully';
				setTimeout(() => {
					backupSuccess = '';
				}, TIME.SUCCESS_MESSAGE_DURATION_MS);
			} else {
				backupError = result.error || 'Failed to create backup';
			}
		} catch (err) {
			backupError = 'Failed to create backup';
		} finally {
			isCreatingBackup = false;
		}
	}
</script>

<div class="notion-page">
	<!-- Main content area -->
	<div class="main-area">
		<!-- Scrollable content -->
		<main class="content">
			{#if isLoadingData}
				<div class="message-container">
					<Spinner />
				</div>
			{:else if isPastTime && !hasEntryToday}
				<div class="message-container">
					<p class="message-title">It's past 14:00</p>
					<p class="message-text">
						Morning journaling closes at 14:00.<br/>
						Come back tomorrow.
					</p>
				</div>
			{:else if hasEntryToday}
				<div class="message-container">
					<Spinner />
				</div>
			{:else}
				<!-- Notion-style page -->
				<div class="page-container">
					<!-- Floating header inside page -->
					<div class="page-header">
						<div class="page-meta">
							<span class="meta-time">{dateParts.time}</span>
							<span class="meta-sep">·</span>
							<span class="meta-date">{dateParts.dayOfWeekShort}, {dateParts.monthShort} {dateParts.day}</span>
							<span class="meta-sep">·</span>
							<span class="meta-year">{currentYear}</span>
						</div>
						<div class="page-actions">
							{#if capturedLat !== null && capturedLng !== null}
								<div class="captured-location">
									<span class="captured-label">📍 {formatCoordinate(capturedLat)}, {formatCoordinate(capturedLng)}</span>
									<button class="captured-clear" onclick={clearCapturedLocation} aria-label="Clear location">×</button>
								</div>
						{:else}
							<Dropdown
								items={locations.map(loc => ({ label: loc.name, value: loc.id.toString() }))}
								placeholder="Add location"
								selectedValue={selectedLocationId?.toString() || null}
								onSelect={(value) => {
									selectedLocationId = parseInt(value);
									capturedLat = null;
									capturedLng = null;
								}}
								onClear={() => {
									selectedLocationId = null;
								}}
							/>
						{/if}
							
							<button 
								class="gps-capture-btn"
								onclick={captureCurrentLocation}
								disabled={isCapturingGps}
								title={gpsError || 'Capture current location'}
							aria-label="Capture current location"
						>
							{#if isCapturingGps}
								<Spinner variant="gps" size="small" />
							{:else}
								📍
							{/if}
						</button>
					</div>
				</div>
					
					<!-- Page content -->
					<div class="page-content">
						{#each journalTemplate as question}
							<div class="block" role="listitem">
								<!-- Block controls (appear on hover) -->
								<div class="block-controls">
									<button class="block-handle" tabindex="-1" aria-label="Drag to move">
										<Icon name="handle" size={14} />
									</button>
								</div>
								
								<!-- Toggle header -->
								<button 
									class="toggle-header"
									onclick={() => toggleSection(question.id)}
									type="button"
								>
									<span class="toggle-icon" class:open={expandedSections.has(question.id)}>
										<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
											<path d="M2.5 1L7.5 5L2.5 9V1Z"/>
										</svg>
									</span>
									<span class="toggle-title">
										<span class="toggle-number">{question.number}.</span>
										{question.question}
									</span>
								</button>
								
								<!-- Toggle content with slide animation -->
								{#if expandedSections.has(question.id)}
									<div class="toggle-content" transition:slide={{ duration: TIME.ANIMATION_DURATION_MS }}>
										{#each question.fields as field}
											<div class="field-block">
												<!-- Field controls (appear on hover) -->
												<div class="block-controls">
												<button class="block-handle" tabindex="-1" aria-label="Drag to move">
													<Icon name="handle" size={14} />
												</button>
											</div>
											
											{#if field.label}
												<div class="field-label">{field.label}</div>
												{/if}
												
												<!-- Contenteditable input -->
												<div
													class="field-input"
													contenteditable="true"
													role="textbox"
													data-field-id={field.id}
													oninput={(e) => handleInput(e, field.id)}
													onpaste={handlePaste}
													onfocus={() => handleFieldFocus(question.id)}
												>{formData[field.id]}</div>
											</div>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
						
						<!-- Save section -->
						<div class="save-section">
							{#if saveError}
								<p class="error">{saveError}</p>
							{/if}
							
							<button
								type="button"
								onclick={handleSubmit}
								disabled={isSaving || !isComplete()}
								class="save-btn"
								class:ready={isComplete() && !isSaving}
							>
								{#if isSaving}
									Saving...
								{:else if isComplete()}
									Begin the Day
								{:else}
									Save entry
								{/if}
							</button>
						</div>
					</div>
				</div>
			{/if}
		</main>
		
		<!-- Progress pill -->
		<div class="progress-pill">
			<span class="progress-count">{completedFields()}</span>
			<span class="progress-text">of {totalFields()}</span>
		</div>
		
		<!-- Sidebar toggle button -->
		<button 
			class="sidebar-toggle"
			onclick={() => sidebarOpen = !sidebarOpen}
			aria-label={sidebarOpen ? 'Close entries' : 'View entries'}
		>
			<Icon name="menu" size={18} />
		</button>
	</div>
	
	<!-- Sidebar -->
	<aside class="sidebar" class:open={sidebarOpen} onmouseleave={() => { if (!settingsOpen) sidebarOpen = false; }}>
		<div class="sidebar-inner">
			<div class="sidebar-header">
				<div>
					<h2 class="sidebar-title">{currentYear}</h2>
					<div class="sidebar-stats">{calculateStats(entryDates, yearDates).completedCount} of {calculateStats(entryDates, yearDates).total} days</div>
				</div>
				<button 
					class="settings-btn"
					onclick={(e) => { e.stopPropagation(); settingsOpen = !settingsOpen; }}
					aria-label="Settings"
				>
					<Icon name="settings" size={16} />
				</button>
				
			</div>
			
			<div class="tracker">
				{#each yearDates as day}
					{@const status = getDayStatus(day)}
					<div
						class="tracker-day {status}"
						onclick={() => status === 'completed' && viewEntry(day)}
						title={day}
						role={status === 'completed' ? 'button' : 'presentation'}
					></div>
				{/each}
			</div>
			
			<div class="legend">
				<span><span class="legend-dot completed"></span> completed</span>
				<span><span class="legend-dot missed"></span> missed</span>
			</div>
			
			<h3 class="recent-heading">Recent</h3>
			<div class="recent">
				{#each getRecentEntries(yearDates, entryDates, entries) as item}
					{@const dateObj = new Date(item.date + 'T12:00:00')}
					{@const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'short' })}
					{@const monthDay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
					{@const year = dateObj.getFullYear()}
					{#if item.completed && item.entry}
						<button onclick={() => viewEntry(item.date)} class="recent-item completed">
							<span class="recent-info">
								<span class="recent-date-text">{dayOfWeek}, {monthDay}</span>
								{#if item.entry.timestamp}
									<span class="recent-time">{extractTimeFromTimestamp(item.entry.timestamp)}</span>
								{/if}
							</span>
							<span class="recent-year">{year}</span>
						</button>
					{:else}
						<div class="recent-item missed">
							<span class="recent-date-text">{dayOfWeek}, {monthDay}</span>
							<span class="recent-year">{year}</span>
						</div>
					{/if}
				{/each}
			</div>
		</div>
	</aside>
	
	<!-- Edge trigger -->
	{#if !sidebarOpen}
		<div 
			class="edge-trigger"
			role="button"
			tabindex="-1"
			aria-label="Open sidebar"
			onmouseenter={() => sidebarOpen = true}
		></div>
	{/if}
	
	<!-- Theme toggle -->
	<button 
		class="theme-btn"
		onclick={toggleTheme}
		aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
	>
		<Icon name={isDarkMode ? 'sun' : 'moon'} size={16} />
	</button>
</div> 

<!-- Settings Modal -->
{#if settingsOpen}
	<Modal open={settingsOpen} title="Settings" onclose={() => settingsOpen = false}>
		<!-- Locations Section -->
		<h3 class="settings-section-title">Locations</h3>

		<!-- Saved Locations List -->
		{#if locations.length > 0}
			<div class="location-list">
				{#each locations as loc}
					<div class="location-item">
						<div class="location-info">
							<span class="location-name">{loc.name}</span>
							<span class="location-meta">
								{#if loc.address}
									{loc.address}
								{:else}
									{formatCoordinate(loc.lat)}, {formatCoordinate(loc.lng)}
								{/if}
							</span>
						</div>
						<button
							class="location-delete-btn"
							onclick={() => deleteLocationPreset(loc.id)}
							disabled={isDeletingLocation === loc.id}
						aria-label="Delete {loc.name}"
						>
						{#if isDeletingLocation === loc.id}
							<Spinner variant="text" size="small" />
						{:else}
							<Icon name="trash" size={14} />
						{/if}
						</button>
					</div>
				{/each}
			</div>
		{/if}

		<!-- Add Location - Inline -->
		<div class="add-location-row">
			<input
				type="text"
				class="add-location-input"
				placeholder="New location name..."
				bind:value={newLocationName}
			/>
			<button
				type="button"
				class="add-location-gps-btn"
				onclick={getCurrentLocationAndSave}
				disabled={isGettingLocation || !newLocationName.trim()}
			title="Save with current GPS location"
			>
				{#if isGettingLocation}
					<Spinner variant="text" size="small" />
				{:else}
					<Icon name="location" size={16} />
				{/if}
			</button>
		</div>

		{#if locationError}
			<p class="location-error">{locationError}</p>
		{/if}

		<!-- Manual Entry Toggle -->
		<button
			type="button"
			class="manual-entry-toggle"
			onclick={() => showManualEntry = !showManualEntry}
		>
			{showManualEntry ? '− Hide manual entry' : '+ Enter coordinates manually'}
		</button>

		<!-- Manual Entry Form (collapsed by default) -->
		{#if showManualEntry}
			<div class="manual-entry-form">
				<div class="manual-entry-row">
					<input
						type="text"
						class="manual-input"
						placeholder="Latitude"
						bind:value={newLocationLat}
					/>
					<input
						type="text"
						class="manual-input"
						placeholder="Longitude"
						bind:value={newLocationLng}
					/>
				</div>
				<input
					type="text"
					class="manual-input full"
					placeholder="Address (optional)"
					bind:value={newLocationAddress}
				/>
				<button
					type="button"
					class="manual-save-btn"
					onclick={addLocationPreset}
					disabled={isAddingLocation || !newLocationName.trim() || !newLocationLat || !newLocationLng}
				>
					{isAddingLocation ? 'Saving...' : 'Save'}
				</button>
			</div>
		{/if}

		<!-- Database Backup Section -->
		<h3 class="settings-section-title" style="margin-top: 2rem;">Database Backup</h3>
		<div class="backup-section">
			<p class="backup-description">
				Create a backup of your journal database. Backups are stored locally in the backups folder.
			</p>
			<button
				type="button"
				class="backup-btn"
				onclick={createBackup}
				disabled={isCreatingBackup}
				>
				{#if isCreatingBackup}
					<Spinner variant="text" size="small" />
					<span>Creating backup...</span>
				{:else}
					<Icon name="download" size={16} />
					<span>Create Backup</span>
				{/if}
			</button>
			{#if backupError}
				<p class="location-error">{backupError}</p>
			{/if}
			{#if backupSuccess}
				<p class="backup-success">{backupSuccess}</p>
			{/if}
		</div>
	</Modal>
{/if}
