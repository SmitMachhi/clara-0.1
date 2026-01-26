<!-- purpose: Display the quote of the day in a consistent style -->
<!-- context: Shared between journal capture and entry view pages -->
<!-- location: src/lib/components/QuoteBlock.svelte -->

<script lang="ts">
	let { text }: { text: string } = $props();
</script>

<div class="quote-block">
	<p class="quote-caption">Quote of the day</p>
	<p class="quote-text">"{text}"</p>
</div>
