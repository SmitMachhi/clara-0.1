<!-- purpose: Passphrase unlock screen -->
<!-- context: Entry gate requiring passphrase to access journal -->
<!-- location: src/routes/+page.svelte -->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiFetch, setSessionFlag } from '$lib/api-client.js';
	import Icon from '$lib/components/Icons.svelte';
	import { onMount } from 'svelte';

	let passphrase = $state('');
	let error = $state('');
	let isShaking = $state(false);
	let showPassphrase = $state(false);
	let isSubmitting = $state(false);

	onMount(async () => {
		try {
			const res = await apiFetch('/api/session');
			if (res.status === 204) {
				goto('/journal');
			}
		} catch {
			// Ignore errors, show unlock screen
		}
	});

	function handleKeypress(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleSubmit();
		}
	}

	async function handleSubmit() {
		if (!passphrase || isSubmitting) return;

		error = '';
		isSubmitting = true;

		try {
			const res = await apiFetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ passphrase })
			});

			const data = await res.json();

			if (res.ok && data.success) {
				setSessionFlag();
				goto('/journal');
			} else {
				error = 'Invalid passphrase';
				isShaking = true;
				setTimeout(() => isShaking = false, 500);
			}
		} catch {
			error = 'Connection failed';
			isShaking = true;
			setTimeout(() => isShaking = false, 500);
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-[var(--bg)] p-[var(--space-lg)]">
	<div class="w-full max-w-[320px] animate-fade-in">
		<h1 class="text-center text-xl text-[var(--text)] mb-[var(--space-2xl)] font-serif">
			clara
		</h1>

		<div class={isShaking ? 'shake' : ''}>
			<div class="passphrase-wrapper">
				<input
					type={showPassphrase ? 'text' : 'password'}
					bind:value={passphrase}
					placeholder="Passphrase"
					class="w-full text-center"
					onkeydown={handleKeypress}
				/>
				<button
					type="button"
					class="toggle-visibility"
					onclick={() => showPassphrase = !showPassphrase}
					aria-label={showPassphrase ? 'Hide passphrase' : 'Show passphrase'}
				>
					<Icon name={showPassphrase ? 'eye-off' : 'eye'} size={16} />
				</button>
			</div>
		</div>

		{#if error}
			<p class="text-[var(--missed)] text-sm text-center mt-[var(--space-md)] animate-fade-in">
				{error}
			</p>
		{/if}

		<button
			type="button"
			disabled={!passphrase || isSubmitting}
			onclick={handleSubmit}
			class="w-full mt-[var(--space-lg)] py-[var(--space-md)] bg-[var(--surface-elevated)] text-[var(--text)] rounded-[var(--radius-md)] transition-colors hover:bg-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed"
		>
			{isSubmitting ? 'Unlocking...' : 'Unlock'}
		</button>

		<p class="text-xs text-[var(--text-muted)] text-center mt-[var(--space-lg)]">
			All data is encrypted at rest.
		</p>
	</div>
</div>

<style>
	.passphrase-wrapper {
		position: relative;
	}
	.passphrase-wrapper input {
		padding-right: 2.5rem;
	}
	.toggle-visibility {
		position: absolute;
		right: 0.5rem;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		padding: 0.25rem;
		display: flex;
		align-items: center;
		opacity: 0.6;
		transition: opacity 0.15s;
	}
	.toggle-visibility:hover {
		opacity: 1;
	}
</style>
