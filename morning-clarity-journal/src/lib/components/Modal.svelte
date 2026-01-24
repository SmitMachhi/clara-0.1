<!-- purpose: Reusable modal component -->
<!-- context: Modal with overlay, header, close button -->
<!-- location: src/lib/components/Modal.svelte -->

<script lang="ts">
	import Icon from './Icons.svelte';

	interface Props {
		open: boolean;
		title: string;
		onclose: () => void;
		children: any;
	}
	let { open, title, onclose, children }: Props = $props();

	function handleOverlayKey(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			onclose();
		}
	}
</script>

{#if open}
	<div
		class="modal-overlay"
		role="button"
		tabindex="0"
		onclick={onclose}
		onkeydown={handleOverlayKey}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal" onclick={(e) => e.stopPropagation()}>
			<div class="modal-header">
				<h2 class="modal-title">{title}</h2>
				<button class="modal-close-btn" onclick={onclose} aria-label="Close">
					<Icon name="close" size={16} />
				</button>
			</div>
			<div class="modal-content">
				{@render children()}
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(15, 15, 15, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		animation: fadeIn 150ms ease;
		padding: 24px;
	}

	:global(.dark) .modal-overlay {
		background: rgba(0, 0, 0, 0.7);
	}

	.modal {
		width: 100%;
		max-width: 520px;
		max-height: calc(100vh - 48px);
		background: var(--surface);
		border-radius: 12px;
		box-shadow: var(--shadow-md);
		display: flex;
		flex-direction: column;
		animation: modalSlideUp 200ms cubic-bezier(0.32, 0.72, 0, 1);
		overflow: hidden;
	}

	:global(.dark) .modal {
		background: #2f2f2f;
		box-shadow: var(--shadow-md-dark);
	}

	@keyframes modalSlideUp {
		from {
			opacity: 0;
			transform: translateY(8px) scale(0.98);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid var(--border);
	}

	.modal-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--text);
		margin: 0;
		letter-spacing: -0.01em;
	}

	.modal-close-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-tertiary);
		border-radius: 4px;
		transition: all 0.1s;
	}

	.modal-close-btn:hover {
		background: rgba(55, 53, 47, 0.08);
		color: var(--text);
	}

	:global(.dark) .modal-close-btn:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.modal-content {
		padding: 20px;
		min-height: 300px;
		overflow-y: auto;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}
</style>
