<!-- purpose: Loading spinner component -->
<!-- context: Reusable spinner for loading states -->
<!-- location: src/lib/components/Spinner.svelte -->

<script lang="ts">
	interface Props {
		size?: 'small' | 'medium' | 'large';
		variant?: 'default' | 'gps' | 'text';
	}
	let { size = 'medium', variant = 'default' }: Props = $props();

	const sizeMap = {
		small: '14px',
		medium: '20px',
		large: '24px'
	};
</script>

<div class="spinner {variant}" style="width: {sizeMap[size]}; height: {sizeMap[size]};"></div>

<style>
	.spinner {
		border: 2px solid var(--border);
		border-top-color: var(--text-secondary);
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.spinner.gps {
		border-color: var(--border);
		border-top-color: var(--accent);
	}

	.spinner.text {
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}
</style>
