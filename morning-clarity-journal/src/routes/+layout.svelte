<!-- purpose: Root layout with theme management -->
<!-- context: Wraps all pages, provides theme toggle -->
<!-- location: src/routes/+layout.svelte -->

<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import type { Snippet } from 'svelte';
	
	let { children }: { children: Snippet } = $props();
	
	let isDark = $state(true);
	let mounted = $state(false);
	
	onMount(() => {
		const saved = localStorage.getItem('theme');
		if (saved) {
			isDark = saved === 'dark';
		}
		mounted = true;
	});
	
	function updateTheme() {
		document.documentElement.classList.toggle('dark', isDark);
	}
	
	function toggleTheme() {
		isDark = !isDark;
		localStorage.setItem('theme', isDark ? 'dark' : 'light');
	}
	
	$effect(() => {
		if (typeof document !== 'undefined') {
			updateTheme();
		}
	});
 </script>

<svelte:head>
	<link rel="preconnect" href="https://fonts.googleapis.com">
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous">
	<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Serif:wght@400;500;600&display=swap" rel="stylesheet">
	<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
	<title>clara</title>
	<meta name="viewport" content="width=device-width, initial-scale=1">
</svelte:head>

{#if $page.url.pathname === '/'}
	<!-- Login page - no theme toggle -->
	{@render children()}
{:else}
	<!-- Main app with subtle theme toggle -->
	<div class="min-h-screen relative">
		<!-- Theme toggle - unobtrusive, bottom left -->
		{#if mounted}
			<button
				onclick={toggleTheme}
				class="theme-btn"
				title={isDark ? 'Light mode' : 'Dark mode'}
				aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
			>
			{#if isDark}
				☀️
			{:else}
				🌙
			{/if}
			</button>
		{/if}
		
		{@render children()}
	</div>
{/if}
