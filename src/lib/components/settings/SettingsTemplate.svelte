<!-- purpose: Template editor and preset management panel -->
<!-- context: Sub-component of SettingsModal for editing journal templates -->
<!-- location: src/lib/components/settings/SettingsTemplate.svelte -->
<script lang="ts">
	import { apiFetch } from '$lib/api-client.js';
	import SettingsTemplatePresets from '$lib/components/settings/SettingsTemplatePresets.svelte';
	import SettingsTemplateEditor from '$lib/components/settings/SettingsTemplateEditor.svelte';
	let { onTemplateChanged }: { onTemplateChanged: () => Promise<void | boolean> } = $props();
	let isLoadingTemplate = $state(false), isSavingTemplate = $state(false);
	let templateDraft = $state('');
	let highlightedTemplate = $state(''), templateLoadError = $state(''), templateSuccess = $state('');
	let templateValidationErrors = $state<string[]>([]), hasLoadedTemplate = $state(false);
	let templatePresets = $state<{ id: number; name: string; created_at: string }[]>([]);
	let selectedPresetId = $state<number | null>(null), presetName = $state('');
	let presetError = $state(''), presetSuccess = $state('');
	let renamingPresetId = $state<number | null>(null), renamingPresetName = $state('');
	let defaultPresetId = $state<number | null>(null);
	let highlightTimeout: ReturnType<typeof setTimeout> | null = null; const PRESET_LIMIT = 5;
	$effect(() => {
		const draft = templateDraft;
		if (highlightTimeout) clearTimeout(highlightTimeout);
		highlightTimeout = setTimeout(() => {
			highlightedTemplate = highlightTemplate(draft);
		}, 120);
		return () => { if (highlightTimeout) clearTimeout(highlightTimeout); };
	});
	$effect(() => { if (!hasLoadedTemplate) loadTemplateSource(); });
	function escapeHtml(value: string): string {
		return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}
	function highlightTemplate(source: string): string {
		if (typeof source !== 'string') return '';
		const truncated = source.length > 50000 ? source.slice(0, 50000) : source;
		const escaped = escapeHtml(truncated);
		const withHp = escaped.replace(
			/&lt;\/?hp(?:\s+label=&quot;[^&]*&quot;)?&gt;/gi,
			(match) => `<span class="sg-hl-hp">${match}</span>`
		);
		const withMp = withHp.replace(
			/&lt;\/?mp(?:\s+label=&quot;[^&]*&quot;)?&gt;/gi,
			(match) => `<span class="sg-hl-mp">${match}</span>`
		);
		return withMp.replace(/label=&quot;([^&]*)&quot;/gi, (_match, value) => {
			return `<span class="sg-hl-attr">label</span>=` +
				`<span class="sg-hl-string">&quot;${value}&quot;</span>`;
		});
	}
	function handleTemplateDraftChange(value: string) { templateDraft = value; }
	async function loadTemplateSource() {
		isLoadingTemplate = true; templateLoadError = ''; templateValidationErrors = [];
		templateSuccess = ''; presetError = ''; presetSuccess = '';
		try {
			const response = await apiFetch('/api/template');
			if (!response.ok) { templateLoadError = 'Failed to load template'; return; }
			const data = await response.json();
			if (!data?.sourceText) { templateLoadError = 'Failed to load template'; return; }
			templateDraft = data.sourceText;
			templatePresets = Array.isArray(data.presets) ? data.presets : [];
			defaultPresetId = typeof data.defaultPresetId === 'number' ? data.defaultPresetId : null;
			if (templatePresets.length > 0 && !selectedPresetId) selectedPresetId = templatePresets[0].id;
			hasLoadedTemplate = true;
		} catch { templateLoadError = 'Failed to load template'; }
		finally { isLoadingTemplate = false; }
	}
	async function saveTemplate() {
		if (isSavingTemplate) return;
		isSavingTemplate = true; templateLoadError = ''; templateValidationErrors = [];
		templateSuccess = ''; presetError = '';
		try {
			const response = await apiFetch('/api/template', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sourceText: templateDraft })
			});
			if (response.ok) {
				try {
					sessionStorage.removeItem('mcj-draft');
				} catch (err) {
					console.error('Failed to clear draft', err);
				}
				await onTemplateChanged(); await loadTemplateSource();
				templateSuccess = 'Template saved.'; return;
			}
			const payload = await response.json().catch(() => null);
			if (payload?.details?.length) templateValidationErrors = payload.details;
			else templateLoadError = payload?.error || 'Failed to save template';
		} catch { templateLoadError = 'Failed to save template'; }
		finally { isSavingTemplate = false; }
	}
	async function savePreset() {
		if (isSavingTemplate) return;
		presetError = ''; presetSuccess = '';
		const trimmed = presetName.trim();
		if (!trimmed) { presetError = 'Preset name is required'; return; }
		if (templatePresets.length >= PRESET_LIMIT) { presetError = 'Preset limit reached'; return; }
		isSavingTemplate = true;
		try {
			const response = await apiFetch('/api/template', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'savePreset', name: trimmed, sourceText: templateDraft })
			});
			if (response.ok) {
				presetSuccess = 'Preset saved.'; presetName = '';
				await loadTemplateSource(); return;
			}
			const payload = await response.json().catch(() => null);
			if (payload?.details?.length) templateValidationErrors = payload.details;
			else presetError = payload?.error || 'Failed to save preset';
		} catch { presetError = 'Failed to save preset'; }
		finally { isSavingTemplate = false; }
	}
	async function applyPreset() {
		if (isSavingTemplate || selectedPresetId === null) return;
		presetError = ''; presetSuccess = ''; isSavingTemplate = true;
		try {
			const response = await apiFetch('/api/template', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'applyPreset', id: selectedPresetId })
			});
			if (response.ok) {
				try {
					sessionStorage.removeItem('mcj-draft');
				} catch (err) {
					console.error('Failed to clear draft', err);
				}
				await onTemplateChanged(); await loadTemplateSource();
				presetSuccess = 'Preset applied.'; return;
			}
			const payload = await response.json().catch(() => null);
			presetError = payload?.error || 'Failed to apply preset';
		} catch { presetError = 'Failed to apply preset'; }
		finally { isSavingTemplate = false; }
	}
	function startRenamePreset(presetId: number, currentName: string) {
		renamingPresetId = presetId; renamingPresetName = currentName;
		presetError = ''; presetSuccess = '';
	}
	function cancelRenamePreset() { renamingPresetId = null; renamingPresetName = ''; }
	async function submitRenamePreset() {
		if (renamingPresetId === null) return;
		const trimmed = renamingPresetName.trim();
		if (!trimmed) { presetError = 'Preset name is required'; return; }
		isSavingTemplate = true; presetError = ''; presetSuccess = '';
		try {
			const response = await apiFetch('/api/template', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'renamePreset', id: renamingPresetId, name: trimmed })
			});
			if (response.ok) {
				presetSuccess = 'Preset renamed.';
				renamingPresetId = null; renamingPresetName = '';
				await loadTemplateSource(); return;
			}
			const payload = await response.json().catch(() => null);
			presetError = payload?.error || 'Failed to rename preset';
		} catch { presetError = 'Failed to rename preset'; }
		finally { isSavingTemplate = false; }
	}
	async function deletePreset(presetId: number) {
		if (isSavingTemplate) return;
		isSavingTemplate = true; presetError = ''; presetSuccess = '';
		try {
			const response = await apiFetch('/api/template', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'deletePreset', id: presetId })
			});
			if (response.ok) {
				presetSuccess = 'Preset deleted.';
				if (selectedPresetId === presetId) selectedPresetId = null;
				renamingPresetId = null; renamingPresetName = '';
				await loadTemplateSource(); return;
			}
			const payload = await response.json().catch(() => null);
			presetError = payload?.error || 'Failed to delete preset';
		} catch { presetError = 'Failed to delete preset'; }
		finally { isSavingTemplate = false; }
	}
</script>
	<section class="settings-tab-panel">
		<SettingsTemplatePresets
			templatePresets={templatePresets} selectedPresetId={selectedPresetId}
			presetName={presetName} presetError={presetError} presetSuccess={presetSuccess}
			isSavingTemplate={isSavingTemplate} isLoadingTemplate={isLoadingTemplate}
			presetLimit={PRESET_LIMIT} renamingPresetId={renamingPresetId}
			renamingPresetName={renamingPresetName} defaultPresetId={defaultPresetId}
			onSelectPreset={(value) => { selectedPresetId = parseInt(value, 10); }}
			onClearPreset={() => { selectedPresetId = null; }}
			onPresetNameChange={(value) => { presetName = value; }}
			onSavePreset={savePreset} onApplyPreset={applyPreset}
			onCancelRenamePreset={cancelRenamePreset} onStartRenamePreset={startRenamePreset}
			onSubmitRenamePreset={submitRenamePreset} onDeletePreset={deletePreset}
			onRenamingPresetNameChange={(value) => { renamingPresetName = value; }}
		/>
		<SettingsTemplateEditor
			templateDraft={templateDraft} highlightedTemplate={highlightedTemplate}
			templateLoadError={templateLoadError} templateValidationErrors={templateValidationErrors}
			templateSuccess={templateSuccess} isLoadingTemplate={isLoadingTemplate}
			isSavingTemplate={isSavingTemplate} onTemplateDraftChange={handleTemplateDraftChange}
			onReload={loadTemplateSource} onSave={saveTemplate}
		/>
	</section>
