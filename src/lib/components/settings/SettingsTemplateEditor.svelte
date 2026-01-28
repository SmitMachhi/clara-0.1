<!-- purpose: Template editor panel with syntax help -->
<!-- context: Sub-component of SettingsTemplate for editing source text -->
<!-- location: src/lib/components/settings/SettingsTemplateEditor.svelte -->

<script lang="ts">
	import Icon from '$lib/components/Icons.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import SettingsGroup from '$lib/components/SettingsGroup.svelte';

	let {
		templateDraft,
		highlightedTemplate,
		templateLoadError,
		templateValidationErrors,
		templateSuccess,
		isLoadingTemplate,
		isSavingTemplate,
		onTemplateDraftChange,
		onReload,
		onSave
	}: {
		templateDraft: string;
		highlightedTemplate: string;
		templateLoadError: string;
		templateValidationErrors: string[];
		templateSuccess: string;
		isLoadingTemplate: boolean;
		isSavingTemplate: boolean;
		onTemplateDraftChange: (value: string) => void;
		onReload: () => void;
		onSave: () => void;
	} = $props();

	const TEMPLATE_EXAMPLE = [
		'<hp>Section title',
		'<mp>Question</mp>',
		'</hp>'
	].join('\n');
	const templateLineNumbers = $derived.by(() => {
		const count = Math.max(1, templateDraft.split(/\r?\n/).length);
		return Array.from({ length: count }, (_, i) => i + 1);
	});
	let templateEditorRef = $state<HTMLTextAreaElement | null>(null);
	let templateHighlightRef = $state<HTMLPreElement | null>(null);
	let templateLineRef = $state<HTMLDivElement | null>(null);

	function syncTemplateScroll() {
		if (!templateEditorRef) return;
		if (templateHighlightRef) {
			templateHighlightRef.scrollTop = templateEditorRef.scrollTop;
			templateHighlightRef.scrollLeft = templateEditorRef.scrollLeft;
		}
		if (templateLineRef) templateLineRef.scrollTop = templateEditorRef.scrollTop;
	}
</script>

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
						<span class="sg-syntax-tag">label=\"...\"</span>
						<span class="sg-syntax-label">Placeholder</span>
					</div>
				</div>
				<p class="sg-syntax-example" aria-hidden="true">{TEMPLATE_EXAMPLE}</p>
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
				<pre
					class="sg-ide-highlight"
					bind:this={templateHighlightRef}
					aria-hidden="true"
				>{@html highlightedTemplate}</pre>
				<textarea
					class="sg-ide-textarea"
					rows="12"
					bind:this={templateEditorRef}
					value={templateDraft}
					oninput={(event) => onTemplateDraftChange((event.target as HTMLTextAreaElement).value)}
					onscroll={syncTemplateScroll}
					disabled={isLoadingTemplate || isSavingTemplate}
				></textarea>
			</div>
		</div>
		<div class="sg-action-row">
			<button
				class="sg-btn sg-btn-secondary"
				onclick={onReload}
				disabled={isLoadingTemplate || isSavingTemplate}
			>
				Reload
			</button>
			<button
				class="sg-btn sg-btn-primary"
				onclick={onSave}
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
