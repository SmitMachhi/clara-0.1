<script lang="ts">
	import { goto } from '$app/navigation';

	let passphrase = $state('');
	let error = $state('');
	let isShaking = $state(false);

	const LEGACY_PASSWORD = 'ismathrelatedtoscience';

	function handleKeypress(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			e.preventDefault();
			handleSubmit();
		}
	}

	function handleSubmit() {
		if (!passphrase) {
			error = 'Enter a passphrase';
			isShaking = true;
			setTimeout(() => isShaking = false, 500);
			return;
		}

		if (passphrase === LEGACY_PASSWORD) {
			error = 'Please set a new passphrase for client-side encryption';
			isShaking = true;
			setTimeout(() => isShaking = false, 500);
			return;
		}

		localStorage.setItem('journal-passphrase', passphrase);
		goto('/journal');
	}
</script>

<div class="min-h-screen flex items-center justify-center bg-[var(--bg)] p-[var(--space-lg)]">
	<div class="w-full max-w-[320px] animate-fade-in">
		<h1 class="text-center text-xl text-[var(--text)] mb-[var(--space-2xl)] font-serif">
			clara
		</h1>
		
		<div class={isShaking ? 'shake' : ''}>
			<input
				type="password"
				bind:value={passphrase}
				placeholder="Passphrase"
				class="w-full text-center"
				autofocus
				onkeydown={handleKeypress}
			/>
		</div>
		
		{#if error}
			<p class="text-[var(--missed)] text-sm text-center mt-[var(--space-md)] animate-fade-in">
				{error}
			</p>
		{/if}
		
		<button
			type="button"
			disabled={!passphrase}
			onclick={handleSubmit}
			class="w-full mt-[var(--space-lg)] py-[var(--space-md)] bg-[var(--surface-elevated)] text-[var(--text)] rounded-[var(--radius-md)] transition-colors hover:bg-[var(--border)] disabled:opacity-40 disabled:cursor-not-allowed"
		>
			Unlock
		</button>
		
		<p class="text-xs text-[var(--text-muted)] text-center mt-[var(--space-lg)]">
			Your passphrase encrypts data on your device.<br/>Lost passphrase = lost data.
		</p>
	</div>
</div>
