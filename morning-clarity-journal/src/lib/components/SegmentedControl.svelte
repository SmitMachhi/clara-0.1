<script lang="ts">
	let {
		segments,
		selected,
		onselect
	}: {
		segments: { value: string; label: string }[];
		selected: string;
		onselect: (value: string) => void;
	} = $props();

	let activeIndex = $derived(segments.findIndex(s => s.value === selected));
</script>

<div class="sc-container">
	<div
		class="sc-indicator"
		style="transform: translateX({activeIndex * 100}%); width: {100 / segments.length}%"
	></div>
	{#each segments as segment}
		<button
			type="button"
			class="sc-segment"
			class:sc-active={segment.value === selected}
			onclick={() => onselect(segment.value)}
		>
			{segment.label}
		</button>
	{/each}
</div>
