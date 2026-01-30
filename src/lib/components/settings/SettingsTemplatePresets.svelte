<!-- purpose: Preset selection and management panel for templates -->
<!-- context: Sub-component of SettingsTemplate for preset actions -->
<!-- location: src/lib/components/settings/SettingsTemplatePresets.svelte -->

<script lang="ts">
	import Dropdown from '$lib/components/Dropdown.svelte';
	import SettingsGroup from '$lib/components/SettingsGroup.svelte';

	let {
		templatePresets,
		selectedPresetId,
		presetName,
		presetError,
		presetSuccess,
		isSavingTemplate,
		isLoadingTemplate,
		presetLimit,
		renamingPresetId,
		renamingPresetName,
		defaultPresetId,
		onSelectPreset,
		onClearPreset,
		onPresetNameChange,
		onSavePreset,
		onApplyPreset,
		onCancelRenamePreset,
		onStartRenamePreset,
		onSubmitRenamePreset,
		onDeletePreset,
		onRenamingPresetNameChange
	}: {
		templatePresets: { id: number; name: string; created_at: string }[];
		selectedPresetId: number | null;
		presetName: string;
		presetError: string;
		presetSuccess: string;
		isSavingTemplate: boolean;
		isLoadingTemplate: boolean;
		presetLimit: number;
		renamingPresetId: number | null;
		renamingPresetName: string;
		defaultPresetId: number | null;
		onSelectPreset: (value: string) => void;
		onClearPreset: () => void;
		onPresetNameChange: (value: string) => void;
		onSavePreset: () => void;
		onApplyPreset: () => void;
		onCancelRenamePreset: () => void;
		onStartRenamePreset: (id: number, name: string) => void;
		onSubmitRenamePreset: () => void;
		onDeletePreset: (id: number) => void;
		onRenamingPresetNameChange: (value: string) => void;
	} = $props();
</script>

<SettingsGroup header="Presets" className="sg-presets">
	<div class="sg-preset-row">
		<div class="preset-dropdown-wrap">
			<Dropdown
				items={templatePresets.map(preset => ({ label: preset.name, value: preset.id.toString() }))}
				placeholder="Select preset"
				selectedValue={selectedPresetId?.toString() || null}
				onSelect={onSelectPreset}
				onClear={onClearPreset}
			/>
		</div>
		<button
			class="sg-btn sg-btn-primary"
			onclick={onApplyPreset}
			disabled={selectedPresetId === null || isSavingTemplate || isLoadingTemplate}
		>
			Apply
		</button>
	</div>
</SettingsGroup>
<SettingsGroup header="Save & Edit">
	<div class="sg-input-row">
		<input
			type="text"
			class="sg-input"
			placeholder="Preset name"
			value={presetName}
			oninput={(event) => onPresetNameChange((event.target as HTMLInputElement).value)}
		/>
		<button
			class="sg-btn sg-btn-secondary"
			onclick={onSavePreset}
			disabled={isSavingTemplate || isLoadingTemplate || templatePresets.length >= presetLimit}
		>
			Save
		</button>
	</div>
	{#if presetError}<p class="sg-error" style="padding: 0 0 8px;">{presetError}</p>{/if}
	{#if presetSuccess}<p class="sg-success" style="padding: 0 0 8px;">{presetSuccess}</p>{/if}
	{#if templatePresets.length > 0}
		{#each templatePresets as preset}
			<div class="sg-preset-item">
				{#if renamingPresetId === preset.id}
					<input
						type="text"
						class="sg-input"
						style="flex:1"
						value={renamingPresetName}
						oninput={(event) => onRenamingPresetNameChange((event.target as HTMLInputElement).value)}
					/>
					<div class="sg-preset-actions">
						<button class="sg-btn sg-btn-secondary" onclick={onCancelRenamePreset}>Cancel</button>
						<button
							class="sg-btn sg-btn-primary"
							onclick={onSubmitRenamePreset}
							disabled={isSavingTemplate}
						>
							Done
						</button>
					</div>
				{:else}
					<span class="sg-preset-name">{preset.name}</span>
					<div class="sg-preset-actions">
						<button
							class="sg-btn sg-btn-secondary"
							onclick={() => onStartRenamePreset(preset.id, preset.name)}
						>
							Edit
						</button>
						<button
							class="sg-btn sg-btn-secondary"
							onclick={() => onDeletePreset(preset.id)}
							disabled={isSavingTemplate || defaultPresetId === preset.id}
							title={defaultPresetId === preset.id ? 'Cannot delete default preset' : ''}
						>
							Delete
						</button>
					</div>
				{/if}
			</div>
		{/each}
	{/if}
</SettingsGroup>
