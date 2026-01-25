<!-- purpose: Display warning when another active session exists -->
<!-- context: Session conflict resolution during login -->
<!-- location: src/lib/components/ExistingSessionWarning.svelte -->

<script lang="ts">
	export let device: string;
	export let location: string;
	export let since: number;
	export let onForceLogout: () => void;
	export let onCancel: () => void;

	function formatTimeAgo(timestamp: number): string {
		const seconds = Math.floor((Date.now() - timestamp) / 1000);
		if (seconds < 60) return 'just now';
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
		const days = Math.floor(hours / 24);
		return `${days} day${days === 1 ? '' : 's'} ago`;
	}
</script>

<div class="existing-session-warning">
	<div class="warning-icon">⚠️</div>
	<h3>Already Logged In</h3>
	<p>You're currently logged in on another device:</p>
	<div class="session-details">
		<div class="detail-row">
			<span class="label">Device:</span>
			<span class="value">{device}</span>
		</div>
		<div class="detail-row">
			<span class="label">Location:</span>
			<span class="value">{location}</span>
		</div>
		<div class="detail-row">
			<span class="label">Since:</span>
			<span class="value">{formatTimeAgo(since)}</span>
		</div>
	</div>
	<p class="warning-text">Continuing will log out the other device.</p>
	<div class="button-group">
		<button class="btn-secondary" on:click={onCancel}>Cancel</button>
		<button class="btn-primary" on:click={onForceLogout}>Log Out Other Device</button>
	</div>
</div>

<style>
	.existing-session-warning {
		background: var(--color-surface, #f5f5f5);
		border: 1px solid var(--color-border, #ddd);
		border-radius: 8px;
		padding: 1.5rem;
		text-align: center;
		max-width: 400px;
		margin: 0 auto;
	}

	.warning-icon {
		font-size: 2rem;
		margin-bottom: 0.5rem;
	}

	h3 {
		margin: 0 0 0.5rem 0;
		color: var(--color-text, #333);
	}

	.session-details {
		background: var(--color-background, #fff);
		border-radius: 4px;
		padding: 1rem;
		margin: 1rem 0;
		text-align: left;
	}

	.detail-row {
		display: flex;
		justify-content: space-between;
		padding: 0.25rem 0;
	}

	.label {
		color: var(--color-text-muted, #666);
	}

	.value {
		font-weight: 500;
	}

	.warning-text {
		color: var(--color-warning, #b86e00);
		font-size: 0.9rem;
		margin: 1rem 0;
	}

	.button-group {
		display: flex;
		gap: 0.5rem;
		justify-content: center;
	}

	.btn-secondary,
	.btn-primary {
		padding: 0.5rem 1rem;
		border-radius: 4px;
		border: none;
		cursor: pointer;
		font-size: 0.9rem;
	}

	.btn-secondary {
		background: var(--color-surface, #e0e0e0);
		color: var(--color-text, #333);
	}

	.btn-primary {
		background: var(--color-primary, #007bff);
		color: white;
	}

	.btn-primary:hover {
		opacity: 0.9;
	}
</style>
