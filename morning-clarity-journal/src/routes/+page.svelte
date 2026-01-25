<!-- purpose: Passphrase unlock screen -->
<!-- context: Entry gate requiring passphrase to access journal -->
<!-- location: src/routes/+page.svelte -->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiFetch, setSessionFlag } from '$lib/api-client.js';
	import ExistingSessionWarning from '$lib/components/ExistingSessionWarning.svelte';
	import Icon from '$lib/components/Icons.svelte';
	import { getOptionalLocation } from '$lib/session-helpers.js';
	import type { ExistingSessionInfo } from '$lib/session-helpers.js';
	import { onMount } from 'svelte';

	let passphrase = $state('');
	let error = $state('');
	let isShaking = $state(false);
	let showPassphrase = $state(false);
	let isSubmitting = $state(false);
	let existingSessionInfo = $state<ExistingSessionInfo | null>(null);
	let storedPassphrase = $state('');

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

	async function handleLogin(passphraseInput: string, forceLogout = false) {
		if (!passphraseInput || isSubmitting) return;

		error = '';
		isSubmitting = true;

		try {
			const location = await getOptionalLocation();
			const payload: {
				passphrase: string;
				forceLogout: boolean;
				lat?: number;
				lng?: number;
			} = {
				passphrase: passphraseInput,
				forceLogout
			};

			if (location) {
				payload.lat = location.lat;
				payload.lng = location.lng;
			}

			const res = await apiFetch('/api/auth', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(payload)
			});

			const data = await res.json();

			if (data?.error === 'already_logged_in') {
				existingSessionInfo = data.existingSession;
				storedPassphrase = passphraseInput;
				return;
			}

			if (res.ok && data.success) {
				setSessionFlag();
				existingSessionInfo = null;
				storedPassphrase = '';
				goto('/journal');
				return;
			}

			error = typeof data?.error === 'string' ? data.error : 'Invalid passphrase';
		} catch {
			error = 'Connection failed';
		} finally {
			if (error) {
				isShaking = true;
				setTimeout(() => isShaking = false, 500);
			}
			isSubmitting = false;
		}
	}

	async function handleForceLogout() {
		if (!storedPassphrase) return;
		await handleLogin(storedPassphrase, true);
	}

	function handleCancelForceLogout() {
		existingSessionInfo = null;
		storedPassphrase = '';
	}

	async function handleSubmit() {
		await handleLogin(passphrase);
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-[var(--bg)] p-[var(--space-lg)]">
	<div class="w-full max-w-[320px] animate-fade-in">
		<h1 class="text-center text-xl text-[var(--text)] mb-[var(--space-2xl)] font-serif">
			clara
		</h1>

		{#if existingSessionInfo}
			<ExistingSessionWarning
				device={existingSessionInfo.device}
				location={existingSessionInfo.location}
				since={existingSessionInfo.since}
				onForceLogout={handleForceLogout}
				onCancel={handleCancelForceLogout}
			/>
		{:else}
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
				class="w-full mt-[var(--space-lg)] py-[var(--space-md)] bg-[var(--surface-elevated)]
					text-[var(--text)] rounded-[var(--radius-md)] transition-colors
					hover:bg-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed"
			>
				{isSubmitting ? 'Unlocking...' : 'Unlock'}
			</button>
		{/if}

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
