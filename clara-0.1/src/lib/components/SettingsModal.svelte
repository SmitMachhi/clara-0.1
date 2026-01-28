<!-- purpose: Settings modal with Apple-style grouped list layout -->
<!-- context: Manage locations, database backups/export/wipe, and template presets -->
<!-- location: src/lib/components/SettingsModal.svelte -->

<script lang="ts">
	import type { Location } from '$lib/db.js';
	import Modal from '$lib/components/Modal.svelte';
	import SegmentedControl from '$lib/components/SegmentedControl.svelte';
	import SettingsLocations from '$lib/components/settings/SettingsLocations.svelte';
	import SettingsDatabase from '$lib/components/settings/SettingsDatabase.svelte';
	import SettingsTemplate from '$lib/components/settings/SettingsTemplate.svelte';
	import SettingsQuotes from '$lib/components/settings/SettingsQuotes.svelte';

	let {
		open,
		locations,
		onclose,
		onLocationsChanged,
		onTemplateChanged,
		onQuotesChanged
	}: {
		open: boolean;
		locations: Location[];
		onclose: () => void;
		onLocationsChanged: () => Promise<void | boolean>;
		onTemplateChanged: () => Promise<void | boolean>;
		onQuotesChanged: () => Promise<void | boolean>;
	} = $props();

	let activeTab = $state<'locations' | 'database' | 'template' | 'quotes'>('locations');

	const segments = [
		{ value: 'locations', label: 'Locations' },
		{ value: 'database', label: 'Database' },
		{ value: 'template', label: 'Template' },
		{ value: 'quotes', label: 'Quotes' }
	];

	$effect(() => {
		if (open) {
			activeTab = 'locations';
		}
	});
</script>

{#if open}
	<Modal open={open} title="Settings" onclose={onclose} className="settings-modal-extended">
		<SegmentedControl
			{segments}
			selected={activeTab}
			onselect={(value) => { activeTab = value as 'locations' | 'database' | 'template'; }}
		/>

		{#if activeTab === 'locations'}
			<SettingsLocations {locations} {onLocationsChanged} />
		{:else if activeTab === 'database'}
			<SettingsDatabase {onLocationsChanged} {onTemplateChanged} />
		{:else if activeTab === 'template'}
			<SettingsTemplate {onTemplateChanged} />
		{:else}
			<SettingsQuotes {onQuotesChanged} />
		{/if}
	</Modal>
{/if}
