<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label = '',
		subtitle = '',
		destructive = false,
		accent = false,
		showChevron = false,
		disabled = false,
		onclick,
		action
	}: {
		label?: string;
		subtitle?: string;
		destructive?: boolean;
		accent?: boolean;
		showChevron?: boolean;
		disabled?: boolean;
		onclick?: () => void;
		action?: Snippet;
	} = $props();
</script>

{#if onclick}
	<button
		type="button"
		class="sr-row"
		class:sr-destructive={destructive}
		class:sr-accent={accent}
		class:sr-tappable={true}
		{disabled}
		{onclick}
	>
		<div class="sr-content">
			<span class="sr-label">{label}</span>
			{#if subtitle}
				<span class="sr-subtitle">{subtitle}</span>
			{/if}
		</div>
		{#if action}
			<div class="sr-action">
				{@render action()}
			</div>
		{:else if showChevron}
			<svg class="sr-chevron" width="7" height="12" viewBox="0 0 7 12" fill="none">
				<path d="M1 1L6 6L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		{/if}
	</button>
{:else}
	<div
		class="sr-row"
		class:sr-destructive={destructive}
		class:sr-accent={accent}
	>
		<div class="sr-content">
			<span class="sr-label">{label}</span>
			{#if subtitle}
				<span class="sr-subtitle">{subtitle}</span>
			{/if}
		</div>
		{#if action}
			<div class="sr-action">
				{@render action()}
			</div>
		{:else if showChevron}
			<svg class="sr-chevron" width="7" height="12" viewBox="0 0 7 12" fill="none">
				<path d="M1 1L6 6L1 11" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
			</svg>
		{/if}
	</div>
{/if}
