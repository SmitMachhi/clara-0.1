<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		label = '',
		expanded = false,
		children
	}: {
		label?: string;
		expanded?: boolean;
		children: Snippet;
	} = $props();

	let isOpen = $state(expanded);

	function toggle() {
		isOpen = !isOpen;
	}
</script>

<div class="es-wrapper">
	<button type="button" class="es-trigger" onclick={toggle}>
		<span class="es-label">{label}</span>
		<svg
			class="es-chevron"
			class:es-chevron-open={isOpen}
			width="10"
			height="10"
			viewBox="0 0 10 10"
			fill="none"
		>
			<path d="M3 2L7 5L3 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
		</svg>
	</button>
	{#if isOpen}
		<div class="es-content">
			{@render children()}
		</div>
	{/if}
</div>
