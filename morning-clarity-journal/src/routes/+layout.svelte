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
		updateTheme();
		mounted = true;
	});
	
	function updateTheme() {
		if (isDark) {
			document.documentElement.classList.remove('light');
		} else {
			document.documentElement.classList.add('light');
		}
	}
	
	function toggleTheme() {
		isDark = !isDark;
		localStorage.setItem('theme', isDark ? 'dark' : 'light');
		updateTheme();
	}
	
	$effect(() => {
		if (typeof document !== 'undefined') {
			updateTheme();
		}
	});
	
	// Hide theme toggle on login page
	$effect(() => {
		// Check current route
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
		<!-- Theme toggle - unobtrusive, bottom right -->
		{#if mounted}
			<button
				onclick={toggleTheme}
				class="fixed bottom-[var(--space-lg)] right-[var(--space-lg)] z-50 w-8 h-8 flex items-center justify-center rounded-full text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:bg-[var(--surface)] transition-all opacity-50 hover:opacity-100"
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
