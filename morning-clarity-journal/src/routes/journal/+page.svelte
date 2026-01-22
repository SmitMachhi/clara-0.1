<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { slide } from 'svelte/transition';
import { journalTemplate, getEmptyJournalData } from '$lib/template.js';
import { formatDateTime, formatDateISO, isPastCutoff, extractTimeFromTimestamp, isDateInPast, getYearDates, isToday, getDateTimeParts } from '$lib/utils.js';
import type { Location, Entry } from '$lib/db.js';
import { GPS, TIME, DISPLAY } from '$lib/constants.js';
import { findMatchingPreset, handleGeolocationError, formatCoordinate } from '$lib/location-utils.js';
	
	let formData = $state(getEmptyJournalData());
	let locations = $state<Location[]>([]);
	let selectedLocationId = $state<number | null>(null);
	let capturedLat = $state<number | null>(null);
	let capturedLng = $state<number | null>(null);
	let isCapturingGps = $state(false);
	let gpsError = $state('');
	let locationDropdownOpen = $state(false);
	let entries = $state<Entry[]>([]);
	let entryDates = $state<string[]>([]);
	let isSaving = $state(false);
	let saveError = $state('');
	let isPastTime = $state(false);
	let hasEntryToday = $state(false);
	let currentTimestamp = $state('');
	let dateParts = $state(getDateTimeParts(new Date()));
	
	// Toggle state for each question section
	let expandedSections = $state<Record<string, boolean>>({});
	
	// Initialize all sections as expanded
	$effect(() => {
		if (Object.keys(expandedSections).length === 0) {
			const initial: Record<string, boolean> = {};
			journalTemplate.forEach((q, i) => {
				initial[q.id] = i === 0; // Only first section expanded initially
			});
			expandedSections = initial;
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
	let isDeletingLocation = $state<number | null>(null); // Track which location is being deleted
	let showManualEntry = $state(false);
	let isLoadingData = $state(true); // Track initial data loading
	
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
		// Apply ritual theme
		document.documentElement.classList.add('ritual');
		
		isPastTime = isPastCutoff();
		currentTimestamp = formatDateTime(new Date());
		
		const interval = setInterval(() => {
			const now = new Date();
			currentTimestamp = formatDateTime(now);
			dateParts = getDateTimeParts(now);
			isPastTime = isPastCutoff();
		}, 1000);
		
		// Load data
		loadAllData().then(() => {
			hasEntryToday = entryDates.includes(today);
		});
		
		return () => {
			clearInterval(interval);
			document.documentElement.classList.remove('ritual');
			document.documentElement.classList.remove('dark');
		};
	});
	
	async function loadLocations() {
		try {
			const res = await fetch('/api/locations');
			locations = await res.json();
		} catch (err) {
			console.error('Failed to load locations', err);
		}
	}
	
	async function loadEntries() {
		try {
			const res = await fetch('/api/entries');
			const data = await res.json();
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
			const res = await fetch('/api/entries', {
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
		if (!navigator.geolocation) {
			gpsError = 'Geolocation not supported';
			return;
		}
		
		isCapturingGps = true;
		gpsError = '';
		
		navigator.geolocation.getCurrentPosition(
			(position) => {
				const lat = position.coords.latitude;
				const lng = position.coords.longitude;

				const matchingPresetId = findMatchingPreset(lat, lng, locations);
				
				if (matchingPresetId !== null) {
					// Match found - use the preset instead of raw coordinates
					selectedLocationId = matchingPresetId;
					capturedLat = null;
					capturedLng = null;
				} else {
					// No match - show raw coordinates
					capturedLat = lat;
					capturedLng = lng;
					selectedLocationId = null;
				}
				
				isCapturingGps = false;
			},
			(error) => {
				isCapturingGps = false;
				gpsError = handleGeolocationError(error);
			},
			GPS.DEFAULT_OPTIONS
		);
	}
	
	function clearCapturedLocation() {
		capturedLat = null;
		capturedLng = null;
		gpsError = '';
	}
	
	function toggleSection(questionId: string) {
		expandedSections[questionId] = !expandedSections[questionId];
	}
	
	function toggleTheme() {
		isDarkMode = !isDarkMode;
		if (isDarkMode) {
			document.documentElement.classList.add('dark');
		} else {
			document.documentElement.classList.remove('dark');
		}
	}
	
	// Handle contenteditable input
	function handleInput(event: Event, fieldId: string) {
		const target = event.target as HTMLElement;
		formData[fieldId] = target.textContent || '';
	}
	
	// Handle paste - strip formatting
	function handlePaste(event: ClipboardEvent) {
		event.preventDefault();
		const text = event.clipboardData?.getData('text/plain') || '';
		document.execCommand('insertText', false, text);
	}
	
	// Handle Tab navigation - auto-expand next section when tabbing into it
	async function handleFieldFocus(questionId: string) {
		if (!expandedSections[questionId]) {
			expandedSections[questionId] = true;
			await tick();
		}
	}
	
	// Sidebar helpers
	function getDayStatus(dateStr: string): 'completed' | 'missed' | 'future' | 'today' {
		if (isToday(dateStr)) return 'today';
		if (entryDates.includes(dateStr)) return 'completed';
		if (isDateInPast(dateStr)) return 'missed';
		return 'future';
	}
	
	function viewEntry(date: string) {
		goto(`/entry/${date}`);
	}
	
	function getStats() {
		const pastDates = yearDates.filter(d => isDateInPast(d));
		const completedCount = pastDates.filter(d => entryDates.includes(d)).length;
		const total = pastDates.length;
		return { completedCount, total };
	}
	
	function getPastDates(): { date: string; completed: boolean; entry?: Entry }[] {
		return yearDates
			.filter(d => isDateInPast(d) || isToday(d))
			.map(d => ({
				date: d,
				completed: entryDates.includes(d),
				entry: entries.find(e => e.date === d)
			}))
			.reverse()
			.slice(0, DISPLAY.RECENT_ENTRIES_LIMIT);
	}
	
	$effect(() => {
		if (hasEntryToday) {
			goto(`/entry/${today}`);
		}
	});
	
	// GPS and location management functions
	function getCurrentLocationAndSave() {
		if (!newLocationName.trim()) {
			locationError = 'Enter a name first';
			return;
		}
		
		if (!navigator.geolocation) {
			locationError = 'Geolocation is not supported by your browser';
			return;
		}
		
		isGettingLocation = true;
		locationError = '';
		
		navigator.geolocation.getCurrentPosition(
			async (position) => {
				const lat = position.coords.latitude;
				const lng = position.coords.longitude;
				
				// Auto-save the location
				try {
					const res = await fetch('/api/locations', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({
							name: newLocationName.trim(),
							lat,
							lng,
							address: null
						})
					});
					
					if (res.ok) {
						await loadLocations();
						newLocationName = '';
						newLocationLat = '';
						newLocationLng = '';
						newLocationAddress = '';
						showManualEntry = false;
					} else {
						const data = await res.json();
						locationError = data.error || 'Failed to save';
					}
				} catch (err) {
					locationError = 'Failed to save location';
				}
				
				isGettingLocation = false;
			},
			(error) => {
				isGettingLocation = false;
				locationError = handleGeolocationError(error);
			},
			GPS.DEFAULT_OPTIONS
		);
	}
	
	async function addLocationPreset() {
		if (!newLocationName.trim() || !newLocationLat || !newLocationLng) {
			locationError = 'Name and coordinates are required';
			return;
		}
		
		const lat = parseFloat(newLocationLat);
		const lng = parseFloat(newLocationLng);
		
		if (isNaN(lat) || isNaN(lng)) {
			locationError = 'Invalid coordinates';
			return;
		}
		
		if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
			locationError = 'Coordinates out of range';
			return;
		}
		
		isAddingLocation = true;
		locationError = '';
		
		try {
			const res = await fetch('/api/locations', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: newLocationName.trim(),
					lat,
					lng,
					address: newLocationAddress.trim() || null
				})
			});
			
			if (res.ok) {
				// Reload locations and reset form
				await loadLocations();
				newLocationName = '';
				newLocationLat = '';
				newLocationLng = '';
				newLocationAddress = '';
				showManualEntry = false;
			} else {
				const data = await res.json();
				locationError = data.error || 'Failed to add location';
			}
		} catch (err) {
			locationError = 'Failed to add location';
		} finally {
			isAddingLocation = false;
		}
	}
	
	async function deleteLocationPreset(id: number) {
		if (isDeletingLocation !== null) return; // Prevent multiple simultaneous deletions
		
		isDeletingLocation = id;
		try {
			const res = await fetch(`/api/locations/${id}`, { method: 'DELETE' });
			if (res.ok) {
				await loadLocations();
				// Clear selection if deleted location was selected
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
			const res = await fetch('/api/backup', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' }
			});

			const data = await res.json();
			if (data.success) {
				backupSuccess = 'Backup created successfully';
				// Clear success message after 3 seconds
				setTimeout(() => {
					backupSuccess = '';
				}, TIME.SUCCESS_MESSAGE_DURATION_MS);
			} else {
				backupError = data.error || 'Failed to create backup';
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
					<div class="spinner"></div>
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
					<div class="spinner"></div>
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
								<!-- Custom Notion-style dropdown -->
								<div class="location-dropdown" class:open={locationDropdownOpen}>
									<button 
										class="location-dropdown-trigger"
										onclick={() => locationDropdownOpen = !locationDropdownOpen}
										type="button"
									>
										{#if selectedLocationId}
											{@const selected = locations.find(l => l.id === selectedLocationId)}
											<span class="location-dropdown-value">{selected?.name || ''}</span>
										{:else}
											<span class="location-dropdown-placeholder">Add location</span>
										{/if}
										<svg class="location-dropdown-arrow" width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
											<path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
										</svg>
									</button>
									
									{#if locationDropdownOpen}
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<div class="location-dropdown-overlay" onclick={() => locationDropdownOpen = false}></div>
										<div class="location-dropdown-menu">
											{#if selectedLocationId}
												<button 
													class="location-dropdown-item clear"
													onclick={() => { selectedLocationId = null; locationDropdownOpen = false; }}
													type="button"
												>
													Clear selection
												</button>
											{/if}
											{#each locations as loc}
												<button 
													class="location-dropdown-item"
													class:selected={selectedLocationId === loc.id}
													onclick={() => { selectedLocationId = loc.id; capturedLat = null; capturedLng = null; locationDropdownOpen = false; }}
													type="button"
												>
													{loc.name}
													{#if selectedLocationId === loc.id}
														<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
															<polyline points="20 6 9 17 4 12"></polyline>
														</svg>
													{/if}
												</button>
											{/each}
											{#if locations.length === 0}
												<div class="location-dropdown-empty">
													No locations saved.<br/>
													<span>Add them in Settings</span>
												</div>
											{/if}
										</div>
									{/if}
								</div>
							{/if}
							
							<button 
								class="gps-capture-btn"
								onclick={captureCurrentLocation}
								disabled={isCapturingGps}
								title={gpsError || 'Capture current location'}
								aria-label="Capture current location"
							>
								{#if isCapturingGps}
									<span class="gps-spinner"></span>
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
										<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
											<circle cx="4" cy="3" r="1.25"/>
											<circle cx="10" cy="3" r="1.25"/>
											<circle cx="4" cy="7" r="1.25"/>
											<circle cx="10" cy="7" r="1.25"/>
											<circle cx="4" cy="11" r="1.25"/>
											<circle cx="10" cy="11" r="1.25"/>
										</svg>
									</button>
								</div>
								
								<!-- Toggle header -->
								<button 
									class="toggle-header"
									onclick={() => toggleSection(question.id)}
									type="button"
								>
									<span class="toggle-icon" class:open={expandedSections[question.id]}>
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
								{#if expandedSections[question.id]}
									<div class="toggle-content" transition:slide={{ duration: TIME.ANIMATION_DURATION_MS }}>
										{#each question.fields as field}
											<div class="field-block">
												<!-- Field controls (appear on hover) -->
												<div class="block-controls">
													<button class="block-handle" tabindex="-1" aria-label="Drag to move">
														<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
															<circle cx="4" cy="3" r="1.25"/>
															<circle cx="10" cy="3" r="1.25"/>
															<circle cx="4" cy="7" r="1.25"/>
															<circle cx="10" cy="7" r="1.25"/>
															<circle cx="4" cy="11" r="1.25"/>
															<circle cx="10" cy="11" r="1.25"/>
														</svg>
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
			<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
				<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
				<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
			</svg>
		</button>
	</div>
	
	<!-- Sidebar -->
	<aside class="sidebar" class:open={sidebarOpen} onmouseleave={() => { if (!settingsOpen) sidebarOpen = false; }}>
		<div class="sidebar-inner">
			<div class="sidebar-header">
				<div>
					<h2 class="sidebar-title">{currentYear}</h2>
					<div class="sidebar-stats">{getStats().completedCount} of {getStats().total} days</div>
				</div>
				<button 
					class="settings-btn"
					onclick={(e) => { e.stopPropagation(); settingsOpen = !settingsOpen; }}
					aria-label="Settings"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<circle cx="12" cy="12" r="3"></circle>
						<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
					</svg>
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
				{#each getPastDates() as item}
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
		{#if isDarkMode}
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<circle cx="12" cy="12" r="5"></circle>
				<line x1="12" y1="1" x2="12" y2="3"></line>
				<line x1="12" y1="21" x2="12" y2="23"></line>
				<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
				<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
				<line x1="1" y1="12" x2="3" y2="12"></line>
				<line x1="21" y1="12" x2="23" y2="12"></line>
				<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
				<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
			</svg>
		{:else}
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
				<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
			</svg>
		{/if}
	</button>
</div>

<!-- Settings Modal -->
{#if settingsOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div 
		class="settings-overlay"
		onclick={() => settingsOpen = false}
		onkeydown={(e) => e.key === 'Escape' && (settingsOpen = false)}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="settings-modal" onclick={(e) => e.stopPropagation()}>
			<div class="settings-modal-header">
				<h2 class="settings-modal-title">Settings</h2>
				<button 
					class="settings-close-btn"
					onclick={() => settingsOpen = false}
					aria-label="Close settings"
				>
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
						<line x1="18" y1="6" x2="6" y2="18"></line>
						<line x1="6" y1="6" x2="18" y2="18"></line>
					</svg>
				</button>
			</div>
			<div class="settings-modal-content">
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
										<span class="gps-spinner-small"></span>
									{:else}
										<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
											<line x1="18" y1="6" x2="6" y2="18"></line>
											<line x1="6" y1="6" x2="18" y2="18"></line>
										</svg>
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
							<span class="gps-spinner-small"></span>
						{:else}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<circle cx="12" cy="12" r="10"></circle>
								<circle cx="12" cy="12" r="3"></circle>
								<line x1="12" y1="2" x2="12" y2="4"></line>
								<line x1="12" y1="20" x2="12" y2="22"></line>
								<line x1="2" y1="12" x2="4" y2="12"></line>
								<line x1="20" y1="12" x2="22" y2="12"></line>
							</svg>
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
							<span class="gps-spinner-small"></span>
							<span>Creating backup...</span>
						{:else}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
								<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
								<polyline points="7 10 12 15 17 10"></polyline>
								<line x1="12" y1="15" x2="12" y2="3"></line>
							</svg>
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
			</div>
		</div>
	</div>
{/if}
