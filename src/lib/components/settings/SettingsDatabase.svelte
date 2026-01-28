<!-- purpose: Database backup and data management panel -->
<!-- context: Sub-component of SettingsModal for backups, exports, and data wipe -->
<!-- location: src/lib/components/settings/SettingsDatabase.svelte -->

<script lang="ts">
	import { TIME } from '$lib/constants.js';
	import { requestBackup, fetchBackups } from '$lib/journal-actions.js';
	import { apiFetch } from '$lib/api-client.js';
	import Icon from '$lib/components/Icons.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import SettingsGroup from '$lib/components/SettingsGroup.svelte';
	import SettingsRow from '$lib/components/SettingsRow.svelte';

	let { onLocationsChanged, onTemplateChanged }: {
		onLocationsChanged: () => Promise<void | boolean>;
		onTemplateChanged: () => Promise<void | boolean>;
	} = $props();

	let isCreatingBackup = $state(false);
	let backupError = $state('');
	let backupSuccess = $state('');
	let backups = $state<{ filename: string; size: number; created: string }[]>([]);
	let isLoadingBackups = $state(false);
	let isExporting = $state(false);
	let showWipeConfirm = $state(false);
	let isWiping = $state(false);
	let wipeError = $state('');

	async function loadBackups() {
		isLoadingBackups = true;
		try {
			backups = await fetchBackups();
		} catch {
			backups = [];
		} finally {
			isLoadingBackups = false;
		}
	}

	$effect(() => {
		loadBackups();
		showWipeConfirm = false;
		wipeError = '';
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
				setTimeout(() => { backupSuccess = ''; }, TIME.SUCCESS_MESSAGE_DURATION_MS);
			} else {
				backupError = result.error || 'Failed to create backup';
			}
		} catch {
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
		} catch {
			wipeError = 'Failed to erase data';
		} finally {
			isWiping = false;
		}
	}
</script>

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
				<SettingsRow label={formatBackupDate(backup.created)} subtitle={formatFileSize(backup.size)}>
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
				<button class="sg-btn sg-btn-secondary" onclick={() => { showWipeConfirm = false; }}>
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
