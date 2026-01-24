<!-- purpose: Reusable dropdown component -->
<!-- context: Notion-style dropdown with overlay -->
<!-- location: src/lib/components/Dropdown.svelte -->

<script lang="ts">
	import Icon from './Icons.svelte';

	interface DropdownItem {
		label: string;
		value: string;
		selected?: boolean;
		disabled?: boolean;
	}

	interface Props {
		items: DropdownItem[];
		placeholder?: string;
		selectedValue?: string | null;
		onSelect: (value: string) => void;
		onClear?: () => void;
	}
	let { items, placeholder, selectedValue, onSelect, onClear }: Props = $props();

	let open = $state(false);

	function handleSelect(value: string) {
		onSelect(value);
		open = false;
	}

	function handleClear() {
		onClear?.();
		open = false;
	}
</script>

<div class="dropdown" class:open={open}>
	<button class="dropdown-trigger" onclick={() => open = !open} type="button">
		{#if selectedValue}
			<span class="dropdown-value">{items.find(i => i.value === selectedValue)?.label}</span>
		{:else}
			<span class="dropdown-placeholder">{placeholder}</span>
		{/if}
		<span style="display: inline-flex; transform: {open ? 'rotate(180deg)' : 'rotate(0deg)'}; transition: transform 0.1s;">
			<Icon name="chevron" size={10} />
		</span>
	</button>

	{#if open}
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div class="dropdown-overlay" onclick={() => open = false}></div>
		<div class="dropdown-menu">
			{#if selectedValue && onClear}
				<button class="dropdown-item clear" onclick={handleClear} type="button">
					Clear selection
				</button>
			{/if}
			{#each items as item}
				<button
					class="dropdown-item"
					class:selected={item.value === selectedValue}
					class:disabled={item.disabled}
					onclick={() => !item.disabled && handleSelect(item.value)}
					type="button"
				>
					{item.label}
					{#if item.value === selectedValue}
						<Icon name="check" size={14} />
					{/if}
				</button>
			{/each}
			{#if items.length === 0}
				<div class="dropdown-empty">
					{placeholder || 'No items'}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.dropdown {
		position: relative;
	}

	.dropdown-trigger {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 4px 8px;
		border-radius: 4px;
		font-size: 0.875rem;
		color: var(--text-tertiary);
		transition: background 0.1s;
		min-width: 0;
	}

	.dropdown-trigger:hover {
		background: var(--surface-elevated);
		color: var(--text-secondary);
	}

	.dropdown.open .dropdown-trigger {
		background: var(--surface-elevated);
	}

	.dropdown-value {
		color: var(--text);
	}

	.dropdown-placeholder {
		color: var(--text-tertiary);
	}

	.dropdown-overlay {
		position: fixed;
		inset: 0;
		z-index: 99;
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		min-width: 180px;
		max-width: 280px;
		background: var(--surface);
		border-radius: 6px;
		box-shadow: var(--shadow-lg);
		z-index: 100;
		padding: 4px;
		animation: dropdownFadeIn 0.15s ease;
	}

	:global(.dark) .dropdown-menu {
		background: #2f2f2f;
		box-shadow: var(--shadow-lg-dark);
	}

	@keyframes dropdownFadeIn {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 6px 10px;
		border-radius: 4px;
		font-size: 0.875rem;
		color: var(--text);
		text-align: left;
		transition: background 0.08s;
	}

	.dropdown-item:hover {
		background: var(--surface-elevated);
	}

	.dropdown-item.selected {
		color: var(--accent);
	}

	.dropdown-item.clear {
		color: var(--text-tertiary);
		font-size: 0.8125rem;
		border-bottom: 1px solid var(--border);
		border-radius: 4px 4px 0 0;
		margin-bottom: 4px;
		padding-bottom: 8px;
	}

	.dropdown-item.disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.dropdown-empty {
		padding: 12px;
		font-size: 0.8125rem;
		color: var(--text-tertiary);
		text-align: center;
		line-height: 1.5;
	}
</style>
