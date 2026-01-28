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

<div class="terminal-warning" role="alert" aria-live="polite">
	<div class="terminal-header">
		<span class="title">session-check</span>
	</div>
	<div class="terminal-body">
		<p class="line"><span class="prompt">clara$</span> status --session</p>
		<p class="line"><span class="status warn">WARN</span> already_logged_in</p>
		<p class="line">device: <span class="value">{device}</span></p>
		<p class="line">location: <span class="value">{location}</span></p>
		<p class="line">since: <span class="value">{formatTimeAgo(since)}</span></p>
		<div class="terminal-actions">
			<button class="terminal-btn secondary" on:click={onCancel}>Cancel</button>
			<button class="terminal-btn primary" on:click={onForceLogout}>Logout Other Device</button>
		</div>
	</div>
</div>

<style>
	.terminal-warning {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
		box-shadow: var(--shadow-sm);
		max-width: 420px;
		margin: 0 auto;
		overflow: hidden;
		font-family: var(--font-mono);
	}

	.terminal-header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		background: var(--surface-elevated);
		border-bottom: 1px solid var(--border);
	}

	.terminal-header .title {
		margin-left: 6px;
		font-size: 0.75rem;
		color: var(--text-tertiary);
		letter-spacing: 0.02em;
	}

	.terminal-body {
		padding: 14px 16px 16px;
		color: var(--text);
		text-align: left;
	}

	.line {
		margin: 0 0 6px;
		font-size: 0.82rem;
		line-height: 1.4;
	}

	.prompt {
		color: var(--accent);
		margin-right: 6px;
	}

	.status {
		display: inline-block;
		padding: 1px 6px;
		border-radius: 999px;
		font-size: 0.7rem;
		letter-spacing: 0.03em;
		margin-right: 6px;
	}

	.status.warn {
		color: #fff;
		background: var(--missed);
	}

	.value {
		color: var(--text);
		font-weight: 500;
	}


	.terminal-actions {
		display: flex;
		gap: 8px;
		margin-top: 12px;
	}

	.terminal-btn {
		border-radius: 6px;
		padding: 6px 10px;
		font-size: 0.75rem;
		border: 1px solid var(--border);
		background: var(--surface-elevated);
		color: var(--text);
		cursor: pointer;
		transition: opacity 0.15s ease, background 0.15s ease;
	}

	.terminal-btn.primary {
		background: var(--accent);
		border-color: transparent;
		color: #fff;
	}

	.terminal-btn:hover {
		opacity: 0.88;
	}

	@media (prefers-reduced-motion: reduce) {
		.terminal-btn {
			transition: none;
		}
	}

	@media (max-width: 480px) {
		.terminal-warning {
			max-width: 100%;
			width: 100%;
		}

		.terminal-actions {
			flex-direction: column;
		}

		.terminal-actions .terminal-btn {
			width: 100%;
		}
	}
</style>
