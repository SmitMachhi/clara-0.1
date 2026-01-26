<!-- purpose: Batch quote editor using <q> blocks -->
<!-- context: Sub-component of SettingsModal for editing quote source text -->
<!-- location: src/lib/components/settings/SettingsQuotes.svelte -->

<script lang="ts">
	import { fetchQuoteSource, saveQuoteSource } from '$lib/quote-actions.js';
	import { TIME, VALIDATION } from '$lib/constants.js';
	import Icon from '$lib/components/Icons.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import SettingsGroup from '$lib/components/SettingsGroup.svelte';

	let { onQuotesChanged }: { onQuotesChanged: () => Promise<void | boolean> } = $props();

	let sourceDraft = $state('');
	let highlightedSource = $state('');
	let loadError = $state('');
	let saveError = $state('');
	let saveSuccess = $state('');
	let validationErrors = $state<string[]>([]);
	let isLoading = $state(false);
	let isSaving = $state(false);
	let hasLoaded = $state(false);
	let highlightTimeout: ReturnType<typeof setTimeout> | null = null;

	const quoteLineNumbers = $derived.by(() => {
		const count = Math.max(1, sourceDraft.split(/\r?\n/).length);
		return Array.from({ length: count }, (_, i) => i + 1);
	});

	let editorRef = $state<HTMLTextAreaElement | null>(null);
	let highlightRef = $state<HTMLPreElement | null>(null);
	let lineRef = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (!hasLoaded) {
			loadSource();
		}
	});

	$effect(() => {
		const draft = sourceDraft;
		if (highlightTimeout) {
			clearTimeout(highlightTimeout);
		}
		highlightTimeout = setTimeout(() => {
			highlightedSource = highlightSource(draft);
		}, 120);
		return () => {
			if (highlightTimeout) clearTimeout(highlightTimeout);
		};
	});

	function escapeHtml(value: string): string {
		return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}

	function highlightSource(source: string): string {
		if (typeof source !== 'string') return '';
		const truncated = source.length > VALIDATION.QUOTE_SOURCE_MAX
			? source.slice(0, VALIDATION.QUOTE_SOURCE_MAX)
			: source;
		const escaped = escapeHtml(truncated);
		return escaped.replace(/&lt;\/?q&gt;/gi, (match) => `<span class="sq-hl-tag">${match}</span>`);
	}

	function syncScroll() {
		if (!editorRef) return;
		if (highlightRef) {
			highlightRef.scrollTop = editorRef.scrollTop;
			highlightRef.scrollLeft = editorRef.scrollLeft;
		}
		if (lineRef) lineRef.scrollTop = editorRef.scrollTop;
	}

	function handleInput(event: Event) {
		const target = event.currentTarget as HTMLTextAreaElement;
		const inputEvent = event as InputEvent;
		const value = target.value;
		const cursor = target.selectionStart ?? value.length;
		const data = inputEvent.data;
		const inputType = inputEvent.inputType;

		if (inputType === 'insertText' && data === '>' && cursor >= 3) {
			const before = value.slice(0, cursor).toLowerCase();
			if (before.endsWith('<q>')) {
				const newValue = value.slice(0, cursor - 3) + '<q></q>' + value.slice(cursor);
				const newCursor = cursor - 3 + 3;
				sourceDraft = newValue;
				target.value = newValue;
				requestAnimationFrame(() => {
					if (!editorRef) return;
					editorRef.selectionStart = newCursor;
					editorRef.selectionEnd = newCursor;
				});
				return;
			}
		}

		sourceDraft = value;
	}

	async function loadSource() {
		isLoading = true;
		loadError = '';
		saveError = '';
		saveSuccess = '';
		validationErrors = [];
		try {
			sourceDraft = await fetchQuoteSource();
			hasLoaded = true;
		} catch {
			loadError = 'Failed to load quote source';
		} finally {
			isLoading = false;
		}
	}

	async function saveSource() {
		if (isSaving) return;
		isSaving = true;
		saveError = '';
		saveSuccess = '';
		validationErrors = [];
		try {
			const result = await saveQuoteSource(sourceDraft);
			if (!result.ok) {
				saveError = result.error || 'Failed to save quotes';
				if (result.details?.length) {
					validationErrors = result.details;
				}
				return;
			}
			saveSuccess = 'Quotes saved.';
			setTimeout(() => { saveSuccess = ''; }, TIME.SUCCESS_MESSAGE_DURATION_MS);
			await onQuotesChanged();
		} catch {
			saveError = 'Failed to save quotes';
		} finally {
			isSaving = false;
		}
	}
</script>

<section class="settings-tab-panel">
	<SettingsGroup header="Quote Editor">
		<div class="sg-info-row">
			<span class="sg-info-label">Syntax</span>
			<div class="sg-info-wrap">
				<button class="sg-info-icon" type="button" aria-label="Syntax help">
					<Icon name="info" size={14} />
				</button>
				<div class="sg-info-tooltip" role="tooltip">
					<div class="sg-syntax-help">
						<div class="sg-syntax-row">
							<span class="sg-syntax-tag">&lt;q&gt;Quote&lt;/q&gt;</span>
							<span class="sg-syntax-label">One quote</span>
						</div>
					</div>
					<p class="sg-syntax-example" aria-hidden="true">
						&lt;q&gt;Do the thing.&lt;/q&gt;
					</p>
				</div>
			</div>
		</div>
		<div class="es-content" style="padding-top: 8px;">
			{#if loadError}
				<p class="sg-error" style="padding: 0 0 8px;">{loadError}</p>
			{/if}
			{#if saveError}
				<p class="sg-error" style="padding: 0 0 8px;">{saveError}</p>
			{/if}
			{#if validationErrors.length > 0}
				{#each validationErrors as err}
					<p class="sg-error" style="padding: 0 0 4px;">{err}</p>
				{/each}
			{/if}
			{#if saveSuccess}
				<p class="sg-success" style="padding: 0 0 8px;">{saveSuccess}</p>
			{/if}
			<div class="sg-ide">
				<div class="sg-ide-gutter">
					<div class="sg-ide-lines" bind:this={lineRef}>
						{#each quoteLineNumbers as lineNumber}
							<span>{lineNumber}</span>
						{/each}
					</div>
				</div>
				<div class="sg-ide-editor">
					<pre class="sg-ide-highlight" bind:this={highlightRef} aria-hidden="true">
{@html highlightedSource}</pre>
					<textarea
						class="sg-ide-textarea"
						rows="12"
						bind:this={editorRef}
						value={sourceDraft}
						oninput={handleInput}
						onscroll={syncScroll}
						disabled={isLoading || isSaving}
					></textarea>
				</div>
			</div>
			<div class="sg-action-row">
				<button
					class="sg-btn sg-btn-secondary"
					onclick={loadSource}
					disabled={isLoading || isSaving}
				>
					Reload
				</button>
				<button
					class="sg-btn sg-btn-primary"
					onclick={saveSource}
					disabled={isSaving || isLoading}
				>
					{#if isSaving}
						<Spinner variant="text" size="small" />
						<span>Saving...</span>
					{:else}
						<span>Save Quotes</span>
					{/if}
				</button>
			</div>
		</div>
	</SettingsGroup>
</section>
