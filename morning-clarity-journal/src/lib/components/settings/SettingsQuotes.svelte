<!-- purpose: Quote editor panel with tabbed quote selection -->
<!-- context: Sub-component of SettingsModal for managing quote of the day content -->
<!-- location: src/lib/components/settings/SettingsQuotes.svelte -->

<script lang="ts">
	import type { Quote } from '$lib/db.js';
	import { VALIDATION } from '$lib/constants.js';
	import { getQuoteLabel } from '$lib/quote-helpers.js';
	import { createQuote, deleteQuote, fetchQuotes, updateQuote } from '$lib/quote-actions.js';
	import Spinner from '$lib/components/Spinner.svelte';
	import SettingsGroup from '$lib/components/SettingsGroup.svelte';

	let { onQuotesChanged }: { onQuotesChanged: () => Promise<void | boolean> } = $props();

	let quotes = $state<Quote[]>([]);
	let activeQuoteId = $state<number | 'new' | null>(null);
	let quoteDraft = $state('');
	let newQuoteDraft = $state('');
	let isLoading = $state(false);
	let isSaving = $state(false);
	let isDeleting = $state(false);
	let error = $state('');
	let success = $state('');
	let hasLoaded = $state(false);

	const maxLength = VALIDATION.QUOTE_TEXT_MAX;
	const isNewActive = $derived(activeQuoteId === 'new');
	const activeQuote = $derived(
		typeof activeQuoteId === 'number'
			? quotes.find(quote => quote.id === activeQuoteId) ?? null
			: null
	);

	$effect(() => {
		if (!hasLoaded) {
			loadQuotes();
		}
	});

	$effect(() => {
		if (activeQuote) {
			quoteDraft = activeQuote.text;
		}
	});

	async function loadQuotes() {
		isLoading = true;
		error = '';
		try {
			quotes = await fetchQuotes();
			if (quotes.length > 0) {
				activeQuoteId = quotes[0].id;
			} else {
				activeQuoteId = 'new';
			}
			hasLoaded = true;
		} catch {
			error = 'Failed to load quotes';
		} finally {
			isLoading = false;
		}
	}

	function selectQuote(id: number) {
		activeQuoteId = id;
		success = '';
		error = '';
	}

	function startNewQuote() {
		activeQuoteId = 'new';
		newQuoteDraft = '';
		success = '';
		error = '';
	}

	function cancelNewQuote() {
		if (quotes.length > 0) {
			activeQuoteId = quotes[0].id;
		} else {
			activeQuoteId = null;
		}
		newQuoteDraft = '';
	}

	async function saveQuote() {
		if (isSaving) return;
		error = '';
		success = '';
		isSaving = true;

		try {
			if (isNewActive) {
				const trimmed = newQuoteDraft.trim();
				if (!trimmed) {
					error = 'Quote text is required';
					return;
				}
				const result = await createQuote(trimmed);
				if (!result.ok) {
					error = result.error || 'Failed to create quote';
					return;
				}
				await loadQuotes();
				if (result.id) {
					activeQuoteId = result.id;
				}
				newQuoteDraft = '';
				success = 'Quote added.';
				await onQuotesChanged();
				return;
			}

			if (!activeQuote) {
				error = 'Select a quote to edit';
				return;
			}
			const quoteId = activeQuote.id;
			const trimmed = quoteDraft.trim();
			if (!trimmed) {
				error = 'Quote text is required';
				return;
			}
			const result = await updateQuote(quoteId, trimmed);
			if (!result.ok) {
				error = result.error || 'Failed to update quote';
				return;
			}
			await loadQuotes();
			activeQuoteId = quoteId;
			success = 'Quote updated.';
			await onQuotesChanged();
		} catch {
			error = 'Failed to save quote';
		} finally {
			isSaving = false;
		}
	}

	async function removeQuote() {
		if (!activeQuote || isDeleting) return;
		isDeleting = true;
		error = '';
		success = '';
		try {
			const result = await deleteQuote(activeQuote.id);
			if (!result.ok) {
				error = result.error || 'Failed to delete quote';
				return;
			}
			await loadQuotes();
			success = 'Quote deleted.';
			await onQuotesChanged();
		} catch {
			error = 'Failed to delete quote';
		} finally {
			isDeleting = false;
		}
	}
</script>

<section class="settings-tab-panel">
	<SettingsGroup header="Quotes" footer={`Max ${maxLength} characters each.`}>
		{#if isLoading}
			<div class="sg-empty"><Spinner variant="text" size="small" /></div>
		{:else}
			<div class="sq-tabs">
				{#each quotes as quote}
					<button
						class="sq-tab"
						class:active={activeQuoteId === quote.id}
						onclick={() => selectQuote(quote.id)}
					>
						{getQuoteLabel(quote.text)}
					</button>
				{/each}
				<button
					class="sq-tab sq-tab-new"
					class:active={isNewActive}
					onclick={startNewQuote}
				>
					+ New
				</button>
			</div>

			{#if error}
				<p class="sg-error">{error}</p>
			{/if}
			{#if success}
				<p class="sg-success">{success}</p>
			{/if}

			{#if isNewActive}
				<textarea
					class="sg-textarea"
					placeholder="Write a new quote..."
					maxlength={maxLength}
					bind:value={newQuoteDraft}
				></textarea>
				<div class="sg-action-row">
					<button class="sg-btn sg-btn-secondary" onclick={cancelNewQuote} disabled={isSaving}>
						Cancel
					</button>
					<button class="sg-btn sg-btn-primary" onclick={saveQuote} disabled={isSaving}>
						{#if isSaving}
							<Spinner variant="text" size="small" />
							<span>Saving...</span>
						{:else}
							<span>Add Quote</span>
						{/if}
					</button>
				</div>
			{:else if activeQuote}
				<textarea
					class="sg-textarea"
					maxlength={maxLength}
					bind:value={quoteDraft}
				></textarea>
				<div class="sg-action-row">
					<button
						class="sg-btn sg-btn-secondary"
						onclick={removeQuote}
						disabled={isDeleting || isSaving}
					>
						{isDeleting ? 'Deleting...' : 'Delete'}
					</button>
					<button class="sg-btn sg-btn-primary" onclick={saveQuote} disabled={isSaving}>
						{#if isSaving}
							<Spinner variant="text" size="small" />
							<span>Saving...</span>
						{:else}
							<span>Save Quote</span>
						{/if}
					</button>
				</div>
			{:else}
				<div class="sg-empty">No quotes yet. Add your first one.</div>
			{/if}
		{/if}
	</SettingsGroup>
</section>
