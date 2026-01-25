<!-- purpose: Settings modal with Apple-style grouped list layout -->
<!-- context: Manage locations, database backups/export/wipe, and template presets -->
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
	import SegmentedControl from '$lib/components/SegmentedControl.svelte';
	import SettingsGroup from '$lib/components/SettingsGroup.svelte';
	import SettingsRow from '$lib/components/SettingsRow.svelte';
	import ExpandableSection from '$lib/components/ExpandableSection.svelte';

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
	let isCreatingBackup = $state(false);
	let backupError = $state('');
	let backupSuccess = $state('');
	let backups = $state<{ filename: string; size: number; created: string }[]>([]);
	let isLoadingBackups = $state(false);
	let isLoadingTemplate = $state(false);
	let isSavingTemplate = $state(false);
	let templateDraft = $state('');
	let highlightedTemplate = $state('');
	let highlightTimeout: ReturnType<typeof setTimeout> | null = null;
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
	let isExporting = $state(false);
	let showWipeConfirm = $state(false);
	let isWiping = $state(false);
	let wipeError = $state('');
	let templateEditorRef = $state<HTMLTextAreaElement | null>(null);
	let templateHighlightRef = $state<HTMLPreElement | null>(null);
	let templateLineRef = $state<HTMLDivElement | null>(null);
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
	].join('\n');

	const segments = [
		{ value: 'locations', label: 'Locations' },
		{ value: 'database', label: 'Database' },
		{ value: 'template', label: 'Template' }
	];

	const templateLineNumbers = $derived.by(() => {
		const count = Math.max(1, templateDraft.split(/\r?\n/).length);
		return Array.from({ length: count }, (_, i) => i + 1);
	});

	$effect(() => {
		const draft = templateDraft;
		if (highlightTimeout) {
			clearTimeout(highlightTimeout);
		}
		highlightTimeout = setTimeout(() => {
			highlightedTemplate = highlightTemplate(draft);
		}, 120);

		return () => {
			if (highlightTimeout) {
				clearTimeout(highlightTimeout);
			}
		};
	});

	function syncTemplateScroll() {
		if (!templateEditorRef) return;
		if (templateHighlightRef) {
			templateHighlightRef.scrollTop = templateEditorRef.scrollTop;
			templateHighlightRef.scrollLeft = templateEditorRef.scrollLeft;
		}
		if (templateLineRef) {
			templateLineRef.scrollTop = templateEditorRef.scrollTop;
		}
	}

	function escapeHtml(value: string): string {
		return value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	function highlightTemplate(source: string): string {
		if (typeof source !== 'string') {
			return '';
		}

		// Limit input length to prevent DoS
		const truncated = source.length > 50000 ? source.slice(0, 50000) : source;

		const escaped = escapeHtml(truncated);
		const withHp = escaped.replace(/&lt;\/?hp(?:\s+label=&quot;[^&]*&quot;)?&gt;/gi, (match) => {
			return `<span class="sg-hl-hp">${match}</span>`;
		});
		const withMp = withHp.replace(/&lt;\/?mp(?:\s+label=&quot;[^&]*&quot;)?&gt;/gi, (match) => {
			return `<span class="sg-hl-mp">${match}</span>`;
		});
		return withMp.replace(/label=&quot;([^&]*)&quot;/gi, (_match, value) => {
			return `<span class="sg-hl-attr">label</span>=<span class="sg-hl-string">&quot;${value}&quot;</span>`;
		});
	}

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
			showWipeConfirm = false;
			wipeError = '';
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
				backupSuccess = result.message || 'Backup created';
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

	function exportAllData() {
		isExporting = true;
		window.open('/api/export', '_blank');
		setTimeout(() => { isExporting = false; }, 1000);
	}

	async function wipeAllData() {
		if (isWiping) return;
		isWiping = true;
		wipeError = '';

		try {
			const response = await apiFetch('/api/wipe', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ confirm: 'DELETE_ALL_MY_DATA' })
			});

			if (response.ok) {
				showWipeConfirm = false;
				await onLocationsChanged();
				await onTemplateChanged();
				backups = [];
			} else {
				const payload = await response.json().catch(() => null);
				wipeError = payload?.error || 'Failed to erase data';
			}
		} catch (err) {
			wipeError = 'Failed to erase data';
		} finally {
			isWiping = false;
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
</script>

{#if open}
	<Modal open={open} title="Settings" onclose={onclose} className="settings-modal-extended">
		<SegmentedControl
			{segments}
			selected={activeTab}
			onselect={(v) => { activeTab = v as 'locations' | 'database' | 'template'; }}
		/>

		{#if activeTab === 'locations'}
			<section class="settings-tab-panel">
				<SettingsGroup header="Saved Locations">
					{#if locations.length > 0}
						{#each locations as loc}
							<SettingsRow
								label={loc.name}
								subtitle={loc.address || `${formatCoordinate(loc.lat)}, ${formatCoordinate(loc.lng)}`}
							>
								{#snippet action()}
									<button
										class="sg-delete-btn"
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
								{/snippet}
							</SettingsRow>
						{/each}
					{:else}
						<div class="sg-empty">No saved locations yet.</div>
					{/if}
				</SettingsGroup>

				<SettingsGroup header="Add Location" footer="Enter a name, then use GPS or enter coordinates manually.">
					<div class="sg-input-row">
						<input
							type="text"
							class="sg-input"
							placeholder="Location name..."
							bind:value={newLocationName}
						/>
						<button
							class="sg-gps-btn"
							onclick={getCurrentLocationAndSave}
							disabled={isGettingLocation || !newLocationName.trim()}
							title="Save with current GPS"
						>
							{#if isGettingLocation}
								<Spinner variant="text" size="small" />
							{:else}
								<Icon name="location" size={16} />
							{/if}
						</button>
					</div>

					{#if locationError}
						<p class="sg-error">{locationError}</p>
					{/if}

					<ExpandableSection label="Enter Manually">
						<div class="sg-manual-grid">
							<input
								type="text"
								class="sg-input"
								placeholder="Latitude"
								bind:value={newLocationLat}
							/>
							<input
								type="text"
								class="sg-input"
								placeholder="Longitude"
								bind:value={newLocationLng}
							/>
							<input
								type="text"
								class="sg-input full"
								placeholder="Address (optional)"
								bind:value={newLocationAddress}
							/>
						</div>
						<div class="sg-action-row">
							<button
								class="sg-btn sg-btn-primary"
								onclick={addLocationPreset}
								disabled={isAddingLocation || !newLocationName.trim() || !newLocationLat || !newLocationLng}
							>
								{isAddingLocation ? 'Saving...' : 'Save Location'}
							</button>
						</div>
					</ExpandableSection>
				</SettingsGroup>
			</section>

		{:else if activeTab === 'database'}
			<section class="settings-tab-panel">
				<SettingsGroup header="Backup" footer="Backups are stored locally in the backups folder.">
					<SettingsRow
						label="Create Backup"
						subtitle={isCreatingBackup ? 'Creating...' : 'Snapshot your journal database'}
						onclick={createBackup}
						disabled={isCreatingBackup}
					>
						{#snippet action()}
							{#if isCreatingBackup}
								<Spinner variant="text" size="small" />
							{:else}
								<Icon name="download" size={16} />
							{/if}
						{/snippet}
					</SettingsRow>
				</SettingsGroup>

				{#if backupError}
					<p class="sg-error">{backupError}</p>
				{/if}
				{#if backupSuccess}
					<p class="sg-success">{backupSuccess}</p>
				{/if}

				{#if backups.length > 0}
					<SettingsGroup header="Backup History">
						{#each backups as backup}
							<SettingsRow
								label={formatBackupDate(backup.created)}
								subtitle={formatFileSize(backup.size)}
							>
								{#snippet action()}
									<button
										class="sg-download-btn"
										onclick={() => downloadBackup(backup.filename)}
										title="Download {backup.filename}"
									>
										<Icon name="download" size={14} />
									</button>
								{/snippet}
							</SettingsRow>
						{/each}
					</SettingsGroup>
				{:else if isLoadingBackups}
					<SettingsGroup header="Backup History">
						<div class="sg-empty"><Spinner variant="text" size="small" /></div>
					</SettingsGroup>
				{/if}

				<SettingsGroup header="Data">
					<SettingsRow
						label="Export All Data"
						subtitle="Download entries, locations, and templates as JSON"
						accent={true}
						onclick={exportAllData}
						disabled={isExporting}
					/>
					<SettingsRow
						label="Erase All Data"
						subtitle="Permanently delete all entries and settings"
						destructive={true}
						onclick={() => { showWipeConfirm = !showWipeConfirm; }}
					/>
					{#if showWipeConfirm}
						<div class="sg-confirm-row">
							<span class="sg-confirm-text">This cannot be undone. Are you sure?</span>
							<button
								class="sg-btn sg-btn-secondary"
								onclick={() => { showWipeConfirm = false; }}
							>
								Cancel
							</button>
							<button
								class="sg-btn sg-btn-destructive"
								onclick={wipeAllData}
								disabled={isWiping}
							>
								{isWiping ? 'Erasing...' : 'Erase'}
							</button>
						</div>
					{/if}
					{#if wipeError}
						<p class="sg-error">{wipeError}</p>
					{/if}
				</SettingsGroup>
			</section>

		{:else}
			<section class="settings-tab-panel">
				<SettingsGroup header="Presets">
					<div class="sg-preset-row">
						<div class="preset-dropdown-wrap">
							<Dropdown
								items={templatePresets.map(preset => ({ label: preset.name, value: preset.id.toString() }))}
								placeholder="Select preset"
								selectedValue={selectedPresetId?.toString() || null}
								onSelect={(value) => { selectedPresetId = parseInt(value, 10); }}
								onClear={() => { selectedPresetId = null; }}
							/>
						</div>
						<button
							class="sg-btn sg-btn-primary"
							onclick={applyPreset}
							disabled={selectedPresetId === null || isSavingTemplate || isLoadingTemplate}
						>
							Apply
						</button>
					</div>
				</SettingsGroup>

				<SettingsGroup header="Manage Presets">
					<ExpandableSection label="Save & Edit Presets">
						<div class="sg-input-row" style="padding: 0 0 8px;">
							<input
								type="text"
								class="sg-input"
								placeholder="New preset name"
								bind:value={presetName}
							/>
							<button
								class="sg-btn sg-btn-secondary"
								onclick={savePreset}
								disabled={isSavingTemplate || isLoadingTemplate || templatePresets.length >= PRESET_LIMIT}
							>
								Save New
							</button>
						</div>

						{#if presetError}
							<p class="sg-error" style="padding: 0 0 8px;">{presetError}</p>
						{/if}
						{#if presetSuccess}
							<p class="sg-success" style="padding: 0 0 8px;">{presetSuccess}</p>
						{/if}

						{#if templatePresets.length > 0}
							{#each templatePresets as preset}
								<div class="sg-preset-item">
									{#if renamingPresetId === preset.id}
										<input
											type="text"
											class="sg-input"
											style="flex:1"
											bind:value={renamingPresetName}
										/>
										<div class="sg-preset-actions">
											<button class="sg-btn sg-btn-secondary" onclick={cancelRenamePreset}>
												Cancel
											</button>
											<button class="sg-btn sg-btn-primary" onclick={submitRenamePreset} disabled={isSavingTemplate}>
												Save
											</button>
										</div>
									{:else}
										<span class="sg-preset-name">{preset.name}</span>
										<div class="sg-preset-actions">
											<button class="sg-btn sg-btn-secondary" onclick={() => startRenamePreset(preset.id, preset.name)}>
												Rename
											</button>
											<button class="sg-btn sg-btn-secondary" onclick={() => deletePreset(preset.id)} disabled={isSavingTemplate}>
												Delete
											</button>
										</div>
									{/if}
								</div>
							{/each}
						{/if}
					</ExpandableSection>
				</SettingsGroup>

				<SettingsGroup header="Template Editor">
					<div class="sg-info-row">
						<span class="sg-info-label">Syntax</span>
						<div class="sg-info-wrap">
							<button class="sg-info-icon" type="button" aria-label="Syntax help">
								<Icon name="info" size={14} />
							</button>
							<div class="sg-info-tooltip" role="tooltip">
								<div class="sg-syntax-help">
									<div class="sg-syntax-row">
										<span class="sg-syntax-tag">&lt;hp&gt;...&lt;/hp&gt;</span>
										<span class="sg-syntax-label">Section</span>
									</div>
									<div class="sg-syntax-row sg-syntax-row-nested">
										<span class="sg-syntax-tag">&lt;mp&gt;...&lt;/mp&gt;</span>
										<span class="sg-syntax-label">Question</span>
										<span class="sg-syntax-note">Always nested</span>
									</div>
									<div class="sg-syntax-row">
										<span class="sg-syntax-tag">label="..."</span>
										<span class="sg-syntax-label">Placeholder</span>
									</div>
								</div>
							</div>
						</div>
					</div>

					<div class="es-content" style="padding-top: 8px;">
						{#if templateLoadError}
							<p class="sg-error" style="padding: 0 0 8px;">{templateLoadError}</p>
						{/if}
						{#if templateValidationErrors.length > 0}
							{#each templateValidationErrors as err}
								<p class="sg-error" style="padding: 0 0 4px;">{err}</p>
							{/each}
						{/if}
						{#if templateSuccess}
							<p class="sg-success" style="padding: 0 0 8px;">{templateSuccess}</p>
						{/if}

						<div class="sg-ide">
							<div class="sg-ide-gutter">
								<div class="sg-ide-lines" bind:this={templateLineRef}>
									{#each templateLineNumbers as lineNumber}
										<span>{lineNumber}</span>
									{/each}
								</div>
							</div>
							<div class="sg-ide-editor">
								<pre class="sg-ide-highlight" bind:this={templateHighlightRef} aria-hidden="true">{@html highlightedTemplate}</pre>
								<textarea
									class="sg-ide-textarea"
									rows="12"
									bind:this={templateEditorRef}
									bind:value={templateDraft}
									onscroll={syncTemplateScroll}
									disabled={isLoadingTemplate || isSavingTemplate}
								></textarea>
							</div>
						</div>

						<div class="sg-action-row">
							<button
								class="sg-btn sg-btn-secondary"
								onclick={loadTemplateSource}
								disabled={isLoadingTemplate || isSavingTemplate}
							>
								Reload
							</button>
							<button
								class="sg-btn sg-btn-primary"
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
				</SettingsGroup>
			</section>
		{/if}
	</Modal>
{/if}
