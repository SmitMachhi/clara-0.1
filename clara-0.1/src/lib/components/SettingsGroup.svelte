<!-- purpose: Shared grouped list section for settings panels -->
<!-- context: Base wrapper for Settings modal groups -->
<!-- location: src/lib/components/SettingsGroup.svelte -->

<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		header = '',
		footer = '',
		className = '',
		children
	}: {
		header?: string;
		footer?: string;
		className?: string;
		children: Snippet;
	} = $props();

	const wrapperClassName = $derived(className ? `sg-wrapper ${className}` : 'sg-wrapper');
</script>

<div class={wrapperClassName}>
	{#if header}
		<div class="sg-header">{header}</div>
	{/if}
	<div class="sg-container">
		{@render children()}
	</div>
	{#if footer}
		<div class="sg-footer">{footer}</div>
	{/if}
</div>
