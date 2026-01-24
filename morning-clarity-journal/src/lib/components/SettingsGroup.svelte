<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		header = '',
		footer = '',
		children
	}: {
		header?: string;
		footer?: string;
		children: Snippet;
	} = $props();
</script>

<div class="sg-wrapper">
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
