<!-- purpose: Settings modal with location management and database backup -->
<!-- context: Manage saved locations and create database backups -->
<!-- location: src/lib/components/SettingsModal.svelte -->

<script lang="ts">
	import { TIME } from '$lib/constants.js';
	import { formatCoordinate } from '$lib/location-utils.js';
	import { captureAndSaveLocation, addLocation, deleteLocation, requestBackup, fetchBackups } from '$lib/journal-actions.js';
	import type { Location } from '$lib/db.js';
	import { apiFetch } from '$lib/api-client.js';
	import Icon from '$lib/components/Icons.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import Dropdown from '$lib/components/Dropdown.svelte';

	let {
		open,
		locations,
		onclose,
		onLocationsChanged,
		onTemplateChanged
	}: {
		open: boolean;
		locations: Location[];
		onclose: () => void;
		onLocationsChanged: () => void;
		onTemplateChanged: () => void;
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
	let isLoadingTemplate = $state(false);
	let isSavingTemplate = $state(false);
	let templateDraft = $state('');
	let templateLoadError = $state('');
	let templateValidationErrors = $state<string[]>([]);
	let templateSuccess = $state('');
	let hasLoadedTemplate = $state(false);
	let activeTab = $state<'locations' | 'database' | 'template'>('locations');
	let templatePresets = $state<{ id: number; name: string; created_at: string }[]>([]);
	let selectedPresetId = $state<number | null>(null);
	let presetName = $state('');
	let presetError = $state('');
	let presetSuccess = $state('');
	let renamingPresetId = $state<number | null>(null);
	let renamingPresetName = $state('');
	const PRESET_LIMIT = 5;

	const TEMPLATE_EXAMPLE = [
		'<hp>Who am I doing this for?',
		'<mp label="Be specific...">What\'s making me anxious right now?</mp>',
		'<mp>What am I avoiding?</mp>',
		'</hp>',
		'<hp label="Enter answer...">What if the fear is wrong?',
		'<mp>Evidence this fear might not be true?</mp>',
		'<mp>Upside if I act despite fear?</mp>',
		'</hp>'
	].join('\\n');

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
			activeTab = 'locations';
		}
	});

	$effect(() => {
		if (open && activeTab === 'template' && !hasLoadedTemplate) {
			loadTemplateSource();
		}
	});

	function downloadBackup(filename: string) {
		window.open(`/api/backup?action=download&filename=${encodeURIComponent(filename)}`, '_blank');
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

	async function loadTemplateSource() {
		isLoadingTemplate = true;
		templateLoadError = '';
		templateValidationErrors = [];
		templateSuccess = '';
		presetError = '';
		presetSuccess = '';

		try {
			const response = await apiFetch('/api/template');
			if (!response.ok) {
				templateLoadError = 'Failed to load template';
				return;
			}
			const data = await response.json();
			if (!data?.sourceText) {
				templateLoadError = 'Failed to load template';
				return;
			}
			templateDraft = data.sourceText;
			templatePresets = Array.isArray(data.presets) ? data.presets : [];
			if (templatePresets.length > 0 && !selectedPresetId) {
				selectedPresetId = templatePresets[0].id;
			}
			hasLoadedTemplate = true;
		} catch (err) {
			templateLoadError = 'Failed to load template';
		} finally {
			isLoadingTemplate = false;
		}
	}

	async function saveTemplate() {
		if (isSavingTemplate) return;
		isSavingTemplate = true;
		templateLoadError = '';
		templateValidationErrors = [];
		templateSuccess = '';
		presetError = '';

		try {
			const response = await apiFetch('/api/template', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sourceText: templateDraft })
			});

			if (response.ok) {
				try {
					sessionStorage.removeItem('mcj-draft');
				} catch (err) {
					console.error('Failed to clear draft', err);
				}
				await onTemplateChanged();
				await loadTemplateSource();
				templateSuccess = 'Template saved.';
				return;
			}

			const payload = await response.json().catch(() => null);
			if (payload?.details?.length) {
				templateValidationErrors = payload.details;
			} else {
				templateLoadError = payload?.error || 'Failed to save template';
			}
		} catch (err) {
			templateLoadError = 'Failed to save template';
		} finally {
			isSavingTemplate = false;
		}
	}

	async function savePreset() {
		if (isSavingTemplate) return;
		presetError = '';
		presetSuccess = '';
		const trimmed = presetName.trim();
		if (!trimmed) {
			presetError = 'Preset name is required';
			return;
		}
		if (templatePresets.length >= PRESET_LIMIT) {
			presetError = 'Preset limit reached';
			return;
		}
		isSavingTemplate = true;
		try {
			const response = await apiFetch('/api/template', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'savePreset', name: trimmed, sourceText: templateDraft })
			});
			if (response.ok) {
				presetSuccess = 'Preset saved.';
				presetName = '';
				await loadTemplateSource();
				return;
			}
			const payload = await response.json().catch(() => null);
			if (payload?.details?.length) {
				templateValidationErrors = payload.details;
			} else {
				presetError = payload?.error || 'Failed to save preset';
			}
		} catch (err) {
			presetError = 'Failed to save preset';
		} finally {
			isSavingTemplate = false;
		}
	}

	async function applyPreset() {
		if (isSavingTemplate || selectedPresetId === null) return;
		presetError = '';
		presetSuccess = '';
		isSavingTemplate = true;
		try {
			const response = await apiFetch('/api/template', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'applyPreset', id: selectedPresetId })
			});
			if (response.ok) {
				try {
					sessionStorage.removeItem('mcj-draft');
				} catch (err) {
					console.error('Failed to clear draft', err);
				}
				await onTemplateChanged();
				await loadTemplateSource();
				presetSuccess = 'Preset applied.';
				return;
			}
			const payload = await response.json().catch(() => null);
			presetError = payload?.error || 'Failed to apply preset';
		} catch (err) {
			presetError = 'Failed to apply preset';
		} finally {
			isSavingTemplate = false;
		}
	}

	function startRenamePreset(presetId: number, currentName: string) {
		renamingPresetId = presetId;
		renamingPresetName = currentName;
		presetError = '';
		presetSuccess = '';
	}

	function cancelRenamePreset() {
		renamingPresetId = null;
		renamingPresetName = '';
	}

	async function submitRenamePreset() {
		if (renamingPresetId === null) return;
		const trimmed = renamingPresetName.trim();
		if (!trimmed) {
			presetError = 'Preset name is required';
			return;
		}
		isSavingTemplate = true;
		presetError = '';
		presetSuccess = '';
		try {
			const response = await apiFetch('/api/template', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'renamePreset', id: renamingPresetId, name: trimmed })
			});
			if (response.ok) {
				presetSuccess = 'Preset renamed.';
				renamingPresetId = null;
				renamingPresetName = '';
				await loadTemplateSource();
				return;
			}
			const payload = await response.json().catch(() => null);
			presetError = payload?.error || 'Failed to rename preset';
		} catch (err) {
			presetError = 'Failed to rename preset';
		} finally {
			isSavingTemplate = false;
		}
	}

	async function deletePreset(presetId: number) {
		if (isSavingTemplate) return;
		isSavingTemplate = true;
		presetError = '';
		presetSuccess = '';
		try {
			const response = await apiFetch('/api/template', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'deletePreset', id: presetId })
			});
			if (response.ok) {
				presetSuccess = 'Preset deleted.';
				if (selectedPresetId === presetId) {
					selectedPresetId = null;
				}
				renamingPresetId = null;
				renamingPresetName = '';
				await loadTemplateSource();
				return;
			}
			const payload = await response.json().catch(() => null);
			presetError = payload?.error || 'Failed to delete preset';
		} catch (err) {
			presetError = 'Failed to delete preset';
		} finally {
			isSavingTemplate = false;
		}
	}

	function setActiveTab(tab: 'locations' | 'database' | 'template') {
		activeTab = tab;
	}
</script>

{#if open}
	<Modal open={open} title="Settings" onclose={onclose} className="settings-modal-extended">
		<div class="settings-tabs">
			<button
				type="button"
				class="settings-tab"
				class:active={activeTab === 'locations'}
				onclick={() => setActiveTab('locations')}
			>
				<Icon name="location" size={14} />
				<span>Locations</span>
			</button>
			<button
				type="button"
				class="settings-tab"
				class:active={activeTab === 'database'}
				onclick={() => setActiveTab('database')}
			>
				<Icon name="download" size={14} />
				<span>Database</span>
			</button>
			<button
				type="button"
				class="settings-tab"
				class:active={activeTab === 'template'}
				onclick={() => setActiveTab('template')}
			>
				<Icon name="settings" size={14} />
				<span>Template</span>
			</button>
		</div>

		{#if activeTab === 'locations'}
			<section class="settings-tab-panel">
				<div class="settings-section-header">
					<h3 class="settings-section-title">Locations</h3>
					<p class="settings-section-subtitle">Saved places for quick tagging.</p>
				</div>

				<div class="settings-card">
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
					{:else}
						<p class="settings-empty">No saved locations yet.</p>
					{/if}
				</div>

				<div class="settings-card">
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
				</div>
			</section>
		{:else if activeTab === 'database'}
			<section class="settings-tab-panel">
				<div class="settings-section-header">
					<h3 class="settings-section-title">Database Backup</h3>
					<p class="settings-section-subtitle">Keep local snapshots of your journal.</p>
				</div>

				<div class="settings-card backup-section">
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
			</section>
		{:else}
			<section class="settings-tab-panel">
				<div class="settings-section-header">
					<h3 class="settings-section-title">Template</h3>
					<p class="settings-section-subtitle">Edit prompts for future entries.</p>
				</div>

				<div class="settings-card">
					<div class="preset-row">
						<div class="preset-dropdown">
							<Dropdown
								items={templatePresets.map(preset => ({ label: preset.name, value: preset.id.toString() }))}
								placeholder="Select preset"
								selectedValue={selectedPresetId?.toString() || null}
								onSelect={(value) => { selectedPresetId = parseInt(value, 10); }}
								onClear={() => { selectedPresetId = null; }}
							/>
						</div>
						<button
							type="button"
							class="backup-btn"
							onclick={applyPreset}
							disabled={selectedPresetId === null || isSavingTemplate || isLoadingTemplate}
						>
							Apply
						</button>
					</div>
					<div class="preset-actions-row">
						<input
							type="text"
							class="preset-name-input"
							placeholder="Preset name"
							bind:value={presetName}
						/>
						<button
							type="button"
							class="backup-btn backup-btn-secondary"
							onclick={savePreset}
							disabled={isSavingTemplate || isLoadingTemplate || templatePresets.length >= PRESET_LIMIT}
						>
							Save Preset
						</button>
					</div>

					{#if presetError}
						<p class="location-error">{presetError}</p>
					{/if}
					{#if presetSuccess}
						<p class="backup-success">{presetSuccess}</p>
					{/if}

					{#if templatePresets.length > 0}
						<div class="preset-list">
							{#each templatePresets as preset}
								<div class="preset-item">
									{#if renamingPresetId === preset.id}
										<input
											type="text"
											class="preset-rename-input"
											bind:value={renamingPresetName}
										/>
									{:else}
										<span class="preset-name">{preset.name}</span>
									{/if}
									<div class="preset-item-actions">
										{#if renamingPresetId === preset.id}
											<button
												type="button"
												class="backup-btn backup-btn-secondary"
												onclick={cancelRenamePreset}
											>
												Cancel
											</button>
											<button
												type="button"
												class="backup-btn"
												onclick={submitRenamePreset}
												disabled={isSavingTemplate}
											>
												Save
											</button>
										{:else}
											<button
												type="button"
												class="backup-btn backup-btn-secondary"
												onclick={() => startRenamePreset(preset.id, preset.name)}
											>
												Rename
											</button>
											<button
												type="button"
												class="backup-btn"
												onclick={() => deletePreset(preset.id)}
												disabled={isSavingTemplate}
											>
												Delete
											</button>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					{/if}

					<div class="template-editor">
						<p class="template-editor-description">
							Wrap sub-questions inside <code>&lt;hp&gt;...&lt;/hp&gt;</code>.
							Optional placeholders use <code>label=\"...\"</code>.
						</p>
						<pre class="template-editor-example">{TEMPLATE_EXAMPLE}</pre>

						{#if templateLoadError}
							<p class="location-error">{templateLoadError}</p>
						{/if}
						{#if templateValidationErrors.length > 0}
							<div class="template-error-list">
								{#each templateValidationErrors as err}
									<p class="location-error">{err}</p>
								{/each}
							</div>
						{/if}
						{#if templateSuccess}
							<p class="backup-success">{templateSuccess}</p>
						{/if}

						<textarea
							class="template-editor-textarea"
							rows="16"
							bind:value={templateDraft}
							disabled={isLoadingTemplate || isSavingTemplate}
						></textarea>

						<div class="template-actions">
							<button
								type="button"
								class="backup-btn backup-btn-secondary"
								onclick={loadTemplateSource}
								disabled={isLoadingTemplate || isSavingTemplate}
							>
								Reload
							</button>
							<button
								type="button"
								class="backup-btn"
								onclick={saveTemplate}
								disabled={isSavingTemplate || isLoadingTemplate}
							>
								{#if isSavingTemplate}
									<Spinner variant="text" size="small" />
									<span>Saving...</span>
								{:else}
									<span>Save Template</span>
								{/if}
							</button>
						</div>
					</div>
				</div>
			</section>
		{/if}
	</Modal>
{/if}
