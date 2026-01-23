<!-- purpose: Settings modal with location management and database backup -->
<!-- context: Manage saved locations and create database backups -->
<!-- location: src/lib/components/SettingsModal.svelte -->

<script lang="ts">
	import { TIME } from '$lib/constants.js';
	import { formatCoordinate } from '$lib/location-utils.js';
	import { captureAndSaveLocation, addLocation, deleteLocation, requestBackup, fetchBackups } from '$lib/journal-actions.js';
	import type { Location } from '$lib/db.js';
	import Icon from '$lib/components/Icons.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import Modal from '$lib/components/Modal.svelte';

	let {
		open,
		locations,
		onclose,
		onLocationsChanged
	}: {
		open: boolean;
		locations: Location[];
		onclose: () => void;
		onLocationsChanged: () => void;
	} = $props();

	let newLocationName = $state('');
	let newLocationLat = $state('');
	let newLocationLng = $state('');
	let newLocationAddress = $state('');
	let isGettingLocation = $state(false);
	let locationError = $state('');
	let isAddingLocation = $state(false);
	let isDeletingLocation = $state<number | null>(null);
	let showManualEntry = $state(false);
	let isCreatingBackup = $state(false);
	let backupError = $state('');
	let backupSuccess = $state('');
	let backups = $state<{ filename: string; size: number; created: string }[]>([]);
	let isLoadingBackups = $state(false);

	function getCurrentLocationAndSave() {
		isGettingLocation = true;
		locationError = '';

		captureAndSaveLocation(
			newLocationName,
			async () => {
				await onLocationsChanged();
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
				await onLocationsChanged();
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
				await onLocationsChanged();
			}
		} catch (err) {
			console.error('Failed to delete location', err);
		} finally {
			isDeletingLocation = null;
		}
	}

	async function loadBackups() {
		isLoadingBackups = true;
		try {
			backups = await fetchBackups();
		} catch (err) {
			backups = [];
		} finally {
			isLoadingBackups = false;
		}
	}

	$effect(() => {
		if (open) {
			loadBackups();
		}
	});

	function downloadBackup(filename: string) {
		window.open(`/api/backup?action=download&filename=${encodeURIComponent(filename)}`, '_blank');
	}

	function exportCsv() {
		window.open('/api/backup?action=export-csv', '_blank');
	}

	function formatBackupDate(dateStr: string): string {
		const date = new Date(dateStr);
		return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
			' ' + date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
	}

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return bytes + ' B';
		if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
		return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
	}

	async function createBackup() {
		isCreatingBackup = true;
		backupError = '';
		backupSuccess = '';

		try {
			const result = await requestBackup();
			if (result.ok) {
				backupSuccess = result.message || 'Backup created successfully';
				await loadBackups();
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

{#if open}
	<Modal open={open} title="Settings" onclose={onclose}>
		<h3 class="settings-section-title">Locations</h3>

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

		<button
			type="button"
			class="manual-entry-toggle"
			onclick={() => showManualEntry = !showManualEntry}
		>
			{showManualEntry ? '− Hide manual entry' : '+ Enter coordinates manually'}
		</button>

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

		<h3 class="settings-section-title" style="margin-top: 2rem;">Database Backup</h3>
		<div class="backup-section">
			<p class="backup-description">
				Create a backup of your journal database. Backups are stored locally in the backups folder.
			</p>
			<div class="backup-actions">
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
				<button
					type="button"
					class="backup-btn backup-btn-secondary"
					onclick={exportCsv}
				>
					<Icon name="download" size={16} />
					<span>Export CSV</span>
				</button>
			</div>
			{#if backupError}
				<p class="location-error">{backupError}</p>
			{/if}
			{#if backupSuccess}
				<p class="backup-success">{backupSuccess}</p>
			{/if}

			{#if isLoadingBackups}
				<div class="backup-loading">
					<Spinner variant="text" size="small" />
				</div>
			{:else if backups.length > 0}
				<div class="backup-list">
					{#each backups as backup}
						<div class="backup-item">
							<div class="backup-item-info">
								<span class="backup-item-date">{formatBackupDate(backup.created)}</span>
								<span class="backup-item-size">{formatFileSize(backup.size)}</span>
							</div>
							<button
								type="button"
								class="backup-download-btn"
								onclick={() => downloadBackup(backup.filename)}
								title="Download {backup.filename}"
							>
								<Icon name="download" size={14} />
							</button>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</Modal>
{/if}
