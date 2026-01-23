<!-- purpose: Settings modal with location management and database backup -->
<!-- context: Manage saved locations and create database backups -->
<!-- location: src/lib/components/SettingsModal.svelte -->

<script lang="ts">
	import { TIME } from '$lib/constants.js';
	import { formatCoordinate } from '$lib/location-utils.js';
	import { captureAndSaveLocation, addLocation, deleteLocation, requestBackup, fetchBackups, fetchEntries } from '$lib/journal-actions.js';
	import type { Location } from '$lib/db.js';
	import { PUBLIC_API_TOKEN } from '$env/static/public';
	import { encryptClient, decryptClient } from '$lib/crypto.js';
	import { apiFetch } from '$lib/api-client.js';
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

	// Passphrase change state
	let showPassphraseChange = $state(false);
	let currentPassphrase = $state('');
	let newPassphrase = $state('');
	let confirmPassphrase = $state('');
	let passphraseError = $state('');
	let passphraseSuccess = $state('');
	let isChangingPassphrase = $state(false);
	let passphraseProgress = $state({ current: 0, total: 0 });

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
		window.open(`/api/backup?action=download&filename=${encodeURIComponent(filename)}&token=${encodeURIComponent(PUBLIC_API_TOKEN)}`, '_blank');
	}

	function exportCsv() {
		window.open(`/api/backup?action=export-csv&token=${encodeURIComponent(PUBLIC_API_TOKEN)}`, '_blank');
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

	async function changePassphrase() {
		passphraseError = '';
		passphraseSuccess = '';

		if (!currentPassphrase || !newPassphrase || !confirmPassphrase) {
			passphraseError = 'All fields are required';
			return;
		}

		if (newPassphrase !== confirmPassphrase) {
			passphraseError = 'New passphrases do not match';
			return;
		}

		if (newPassphrase === currentPassphrase) {
			passphraseError = 'New passphrase must be different';
			return;
		}

		const storedPassphrase = localStorage.getItem('journal-passphrase');
		if (currentPassphrase !== storedPassphrase) {
			passphraseError = 'Current passphrase is incorrect';
			return;
		}

		isChangingPassphrase = true;

		try {
			// Fetch all entries
			const { entries } = await fetchEntries();
			passphraseProgress = { current: 0, total: entries.length };

			const migratedEntries: { date: string; timestamp: string; encryptedData: string }[] = [];

			for (const entry of entries) {
				const res = await apiFetch(`/api/entries/${entry.date}`);
				if (!res.ok) {
					passphraseError = `Failed to load entry ${entry.date}`;
					isChangingPassphrase = false;
					return;
				}

				const entryData = await res.json();
				const encrypted = entryData.encryption;

				// Decrypt with current passphrase
				const decrypted = await decryptClient(encrypted, currentPassphrase);

				// Re-encrypt with new passphrase
				const newEncrypted = await encryptClient(decrypted, newPassphrase);

				migratedEntries.push({
					date: entry.date,
					timestamp: entry.timestamp,
					encryptedData: JSON.stringify(newEncrypted)
				});

				passphraseProgress.current++;
			}

			// Send all re-encrypted entries to server
			if (migratedEntries.length > 0) {
				const res = await apiFetch('/api/entries/migrate', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ entries: migratedEntries })
				});

				if (!res.ok) {
					const data = await res.json();
					passphraseError = data.error || 'Failed to save re-encrypted entries';
					isChangingPassphrase = false;
					return;
				}
			}

			// Update localStorage with new passphrase
			localStorage.setItem('journal-passphrase', newPassphrase);

			passphraseSuccess = 'Passphrase changed successfully';
			currentPassphrase = '';
			newPassphrase = '';
			confirmPassphrase = '';
			showPassphraseChange = false;

			setTimeout(() => {
				passphraseSuccess = '';
			}, TIME.SUCCESS_MESSAGE_DURATION_MS);
		} catch (err) {
			passphraseError = 'Failed to change passphrase. Your old passphrase is still active.';
		} finally {
			isChangingPassphrase = false;
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

		<h3 class="settings-section-title" style="margin-top: 2rem;">Security</h3>
		<div class="backup-section">
			{#if passphraseSuccess}
				<p class="backup-success">{passphraseSuccess}</p>
			{/if}

			{#if !showPassphraseChange}
				<button
					type="button"
					class="backup-btn"
					onclick={() => showPassphraseChange = true}
				>
					<Icon name="lock" size={16} />
					<span>Change Passphrase</span>
				</button>
			{:else}
				<div class="passphrase-form">
					<input
						type="password"
						class="passphrase-input"
						placeholder="Current passphrase"
						bind:value={currentPassphrase}
						disabled={isChangingPassphrase}
					/>
					<input
						type="password"
						class="passphrase-input"
						placeholder="New passphrase"
						bind:value={newPassphrase}
						disabled={isChangingPassphrase}
					/>
					<input
						type="password"
						class="passphrase-input"
						placeholder="Confirm new passphrase"
						bind:value={confirmPassphrase}
						disabled={isChangingPassphrase}
					/>
					{#if passphraseError}
						<p class="location-error">{passphraseError}</p>
					{/if}
					{#if isChangingPassphrase}
						<p class="backup-description">
							Re-encrypting {passphraseProgress.current} of {passphraseProgress.total} entries...
						</p>
					{/if}
					<div class="backup-actions">
						<button
							type="button"
							class="backup-btn"
							onclick={changePassphrase}
							disabled={isChangingPassphrase || !currentPassphrase || !newPassphrase || !confirmPassphrase}
						>
							{#if isChangingPassphrase}
								<Spinner variant="text" size="small" />
								<span>Changing...</span>
							{:else}
								<span>Change Passphrase</span>
							{/if}
						</button>
						<button
							type="button"
							class="backup-btn backup-btn-secondary"
							onclick={() => { showPassphraseChange = false; passphraseError = ''; currentPassphrase = ''; newPassphrase = ''; confirmPassphrase = ''; }}
							disabled={isChangingPassphrase}
						>
							<span>Cancel</span>
						</button>
					</div>
				</div>
			{/if}
		</div>
	</Modal>
{/if}
