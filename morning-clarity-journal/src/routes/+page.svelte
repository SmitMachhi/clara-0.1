<script lang="ts">
	import { goto } from '$app/navigation';
	import { TIME } from '$lib/constants.js';

	let password = $state('');
	let error = $state('');
	let isShaking = $state(false);
	let isLoading = $state(false);
	
	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (isLoading) return;
		
		isLoading = true;
		error = '';
		
		try {
			const response = await fetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ password })
			});
			
			if (response.ok) {
				goto('/journal');
			} else {
				error = 'Wrong password';
				isShaking = true;
				setTimeout(() => {
					isShaking = false;
				}, TIME.SHAKE_DURATION_MS);
				password = '';
			}
		} catch (err) {
			error = 'Something went wrong';
		} finally {
			isLoading = false;
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-[var(--bg)] p-[var(--space-lg)]">
	<div class="w-full max-w-[320px] animate-fade-in">
		<!-- Minimal title - just the name, honest -->
		<h1 class="text-center text-xl text-[var(--text)] mb-[var(--space-2xl)] font-serif">
			clara
		</h1>
		
		<form onsubmit={handleSubmit}>
			<div class={isShaking ? 'shake' : ''}>
				<input
					type="password"
					bind:value={password}
					placeholder="Password"
					class="w-full text-center"
					autofocus
				/>
			</div>
			
			{#if error}
				<p class="text-[var(--missed)] text-sm text-center mt-[var(--space-md)] animate-fade-in">
					{error}
				</p>
			{/if}
			
			<button
				type="submit"
				disabled={isLoading || !password}
				class="w-full mt-[var(--space-lg)] py-[var(--space-md)] bg-[var(--surface-elevated)] text-[var(--text)] rounded-[var(--radius-md)] transition-colors hover:bg-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed"
			>
				{isLoading ? '...' : 'Enter'}
			</button>
		</form>
	</div>
</div>
