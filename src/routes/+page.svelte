<!-- purpose: Passphrase unlock screen -->
<!-- context: Entry gate requiring passphrase to access journal -->
<!-- location: src/routes/+page.svelte -->

<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiFetch, setSessionFlag } from '$lib/api-client.js';
	import ExistingSessionWarning from '$lib/components/ExistingSessionWarning.svelte';
	import { getOptionalLocation } from '$lib/session-helpers.js';
	import type { ExistingSessionInfo } from '$lib/session-helpers.js';
	import { onMount } from 'svelte';

	let passphrase = $state('');
	let error = $state('');
	let isShaking = $state(false);
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
						type="password"
						bind:value={passphrase}
						class="w-full text-center login-input"
						onkeydown={handleKeypress}
					/>
				</div>
			</div>

			{#if error}
				<p class="text-[var(--missed)] text-sm text-center mt-[var(--space-md)] animate-fade-in">
					{error}
				</p>
			{/if}

		{/if}
	</div>
	<div class="brand-mark">
		<span>clara 0.1</span>
	</div>
</div>

<style>
	.passphrase-wrapper {
		position: relative;
	}
	.passphrase-wrapper input {
		padding-right: 0;
	}
	.login-input {
		background: transparent;
		border: none;
		border-radius: 0;
		padding: 0.65rem 0.5rem;
		color: var(--text);
		font-size: 1.05rem;
		letter-spacing: var(--tracking-tight);
		transition: color 0.15s ease;
	}
	.login-input::placeholder {
		color: var(--text-tertiary);
	}
	.login-input:focus {
		outline: none;
	}
	@media (prefers-reduced-motion: reduce) {
		.login-input {
			transition: none;
		}
	}
	.brand-mark {
		position: fixed;
		right: calc(var(--space-lg) + var(--safe-right));
		bottom: calc(var(--space-lg) + var(--safe-bottom));
		color: var(--accent);
		font-size: 1.15rem;
		letter-spacing: 0.02em;
		font-weight: 600;
	}

	@media (max-width: 480px) {
		.brand-mark {
			right: calc(var(--space-md) + var(--safe-right));
			bottom: calc(var(--space-md) + var(--safe-bottom));
			font-size: 1rem;
		}
	}
</style>
