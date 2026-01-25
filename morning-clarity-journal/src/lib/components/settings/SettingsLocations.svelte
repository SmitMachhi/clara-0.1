<!-- purpose: Location management panel for settings -->
<!-- context: Sub-component of SettingsModal for adding/deleting locations -->
<!-- location: src/lib/components/settings/SettingsLocations.svelte -->

<script lang="ts">
	import { formatCoordinate } from '$lib/location-utils.js';
	import { captureAndSaveLocation, addLocation, deleteLocation } from '$lib/journal-actions.js';
	import type { Location } from '$lib/db.js';
	import Icon from '$lib/components/Icons.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import SettingsGroup from '$lib/components/SettingsGroup.svelte';
	import SettingsRow from '$lib/components/SettingsRow.svelte';
	import ExpandableSection from '$lib/components/ExpandableSection.svelte';

	let {
		locations,
		onLocationsChanged
	}: {
		locations: Location[];
		onLocationsChanged: () => Promise<void | boolean>;
	} = $props();

	let newLocationName = $state('');
	let newLocationLat = $state('');
	let newLocationLng = $state('');
	let newLocationAddress = $state('');
	let isGettingLocation = $state(false);
	let locationError = $state('');
	let isAddingLocation = $state(false);
	let isDeletingLocation = $state<number | null>(null);

	function getCurrentLocationAndSave() {
		isGettingLocation = true;
		locationError = '';

		captureAndSaveLocation(
			newLocationName,
			async () => {
				await onLocationsChanged();
				newLocationName = '';
				newLocationLat = '';
				newLocationLng = '';
				newLocationAddress = '';
				isGettingLocation = false;
			},
			(error) => {
				locationError = error;
				isGettingLocation = false;
			}
		);
	}

	async function addLocationPreset() {
		isAddingLocation = true;
		locationError = '';

			try {
				const result = await addLocation(
					newLocationName,
					newLocationLat,
					newLocationLng,
					newLocationAddress
				);
			if (result.ok) {
				await onLocationsChanged();
				newLocationName = '';
				newLocationLat = '';
				newLocationLng = '';
				newLocationAddress = '';
			} else {
				locationError = result.error || 'Failed to add location';
			}
		} catch (err) {
			locationError = 'Failed to add location';
		} finally {
			isAddingLocation = false;
		}
	}

	async function deleteLocationPreset(id: number) {
		if (isDeletingLocation !== null) return;

		isDeletingLocation = id;
		try {
			const ok = await deleteLocation(id);
			if (ok) {
				await onLocationsChanged();
			}
		} catch (err) {
			console.error('Failed to delete location', err);
		} finally {
			isDeletingLocation = null;
		}
	}
</script>

<section class="settings-tab-panel">
	<SettingsGroup header="Saved Locations">
		{#if locations.length > 0}
			{#each locations as loc}
				<SettingsRow
					label={loc.name}
					subtitle={loc.address || `${formatCoordinate(loc.lat)}, ${formatCoordinate(loc.lng)}`}
				>
					{#snippet action()}
						<button
							class="sg-delete-btn"
							onclick={() => deleteLocationPreset(loc.id)}
							disabled={isDeletingLocation === loc.id}
							aria-label="Delete {loc.name}"
						>
							{#if isDeletingLocation === loc.id}
								<Spinner variant="text" size="small" />
							{:else}
								<Icon name="trash" size={14} />
							{/if}
						</button>
					{/snippet}
				</SettingsRow>
			{/each}
		{:else}
			<div class="sg-empty">No saved locations yet.</div>
		{/if}
	</SettingsGroup>

	<SettingsGroup
		header="Add Location"
		footer="Enter a name, then use GPS or enter coordinates manually."
	>
		<div class="sg-input-row">
			<input
				type="text"
				class="sg-input"
				placeholder="Location name..."
				bind:value={newLocationName}
			/>
			<button
				class="sg-gps-btn"
				onclick={getCurrentLocationAndSave}
				disabled={isGettingLocation || !newLocationName.trim()}
				title="Save with current GPS"
			>
				{#if isGettingLocation}
					<Spinner variant="text" size="small" />
				{:else}
					<Icon name="location" size={16} />
				{/if}
			</button>
		</div>

		{#if locationError}
			<p class="sg-error">{locationError}</p>
		{/if}

		<ExpandableSection label="Enter Manually">
			<div class="sg-manual-grid">
				<input
					type="text"
					class="sg-input"
					placeholder="Latitude"
					bind:value={newLocationLat}
				/>
				<input
					type="text"
					class="sg-input"
					placeholder="Longitude"
					bind:value={newLocationLng}
				/>
				<input
					type="text"
					class="sg-input full"
					placeholder="Address (optional)"
					bind:value={newLocationAddress}
				/>
			</div>
			<div class="sg-action-row">
				<button
					class="sg-btn sg-btn-primary"
					onclick={addLocationPreset}
					disabled={isAddingLocation || !newLocationName.trim() || !newLocationLat || !newLocationLng}
				>
					{isAddingLocation ? 'Saving...' : 'Save Location'}
				</button>
			</div>
		</ExpandableSection>
	</SettingsGroup>
</section>
