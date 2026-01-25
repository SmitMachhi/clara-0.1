<!-- purpose: Journal question/answer form with collapsible sections and save functionality -->
<!-- context: Core journaling UI for capturing daily reflections -->
<!-- location: src/lib/components/JournalForm.svelte -->
<script lang="ts">
	import { tick } from 'svelte';
	import { slide } from 'svelte/transition';
	import type { TemplateModel } from '$lib/template.js';
	import { toggleSet } from '$lib/utils.js';
	import { handlePaste, syncContent } from '$lib/form-helpers.js';
	import { TIME } from '$lib/constants.js';
	import { formatCoordinate } from '$lib/location-utils.js';
	import Icon from '$lib/components/Icons.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import Dropdown from '$lib/components/Dropdown.svelte';
	interface DateParts {
		time: string;
		dayOfWeekShort: string;
		monthShort: string;
		day: string;
	}
	let {
		formData,
		locations,
		selectedLocationId,
		capturedLat,
		capturedLng,
		isCapturingGps,
		gpsError,
		isSaving,
		saveError,
		dateParts,
		currentYear,
		template,
		isComplete,
		completedFields,
		totalFields,
		onSubmit,
		onCaptureLocation,
		onClearLocation,
		onSelectLocation,
		onClearSelectedLocation
	}: {
		formData: Record<string, string>;
		locations: any[];
		selectedLocationId: number | null;
		capturedLat: number | null;
		capturedLng: number | null;
		isCapturingGps: boolean;
		gpsError: string;
		isSaving: boolean;
		saveError: string;
		dateParts: DateParts;
		currentYear: number;
		template: TemplateModel;
		isComplete: boolean;
		completedFields: number;
		totalFields: number;
		onSubmit: () => void;
		onCaptureLocation: () => void;
		onClearLocation: () => void;
		onSelectLocation: (id: number) => void;
		onClearSelectedLocation: () => void;
	} = $props();
	let expandedSections = $state<Set<string>>(new Set());
	$effect(() => {
		if (expandedSections.size === 0 && template.questions.length > 0) {
			expandedSections = new Set([template.questions[0].id]);
		}
	});
	function toggleSection(questionId: string) {
		expandedSections = toggleSet(expandedSections, questionId);
	}
	function handleInput(event: Event, fieldId: string) {
		const target = event.currentTarget as HTMLElement;
		formData[fieldId] = target.textContent || '';
	}
	async function handleFieldFocus(questionId: string) {
		if (!expandedSections.has(questionId)) {
			const newSet = new Set(expandedSections);
			newSet.add(questionId);
			expandedSections = newSet;
			await tick();
		}
	}
</script>
<div class="page-container">
	<div class="page-header">
		<div class="page-meta">
			<span class="meta-time">{dateParts.time}</span>
			<span class="meta-sep">·</span>
			<span class="meta-date">{dateParts.dayOfWeekShort}, {dateParts.monthShort} {dateParts.day}</span>
			<span class="meta-sep">·</span>
			<span class="meta-year">{currentYear}</span>
		</div>
		<div class="page-actions">
			{#if capturedLat !== null && capturedLng !== null}
				<div class="captured-location">
					<span class="captured-label">
						📍 {formatCoordinate(capturedLat)}, {formatCoordinate(capturedLng)}
					</span>
					<button class="captured-clear" onclick={onClearLocation}
						aria-label="Clear location">×</button>
				</div>
			{:else}
				<Dropdown
					items={locations.map(loc => ({ label: loc.name, value: loc.id.toString() }))}
					placeholder="Add location"
					selectedValue={selectedLocationId?.toString() || null}
					onSelect={(value) => onSelectLocation(parseInt(value))}
					onClear={onClearSelectedLocation}
				/>
			{/if}
			<button class="gps-capture-btn" onclick={onCaptureLocation} disabled={isCapturingGps}
				title={gpsError || 'Capture current location'} aria-label="Capture current location">
				{#if isCapturingGps}
					<Spinner variant="gps" size="small" />
				{:else}
					📍
				{/if}
			</button>
		</div>
	</div>
	<div class="page-content">
		{#each template.questions as question}
			<div class="block" role="listitem">
				<div class="block-controls">
					<button class="block-handle" tabindex="-1" aria-label="Drag to move">
						<Icon name="handle" size={14} /></button>
				</div>
				<button class="toggle-header" onclick={() => toggleSection(question.id)} type="button">
					<span class="toggle-icon" class:open={expandedSections.has(question.id)}>
						<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
							<path d="M2.5 1L7.5 5L2.5 9V1Z"/>
						</svg>
					</span>
					<span class="toggle-title">
						<span class="toggle-number">{question.number}.</span>
						{question.question}
					</span>
				</button>
				{#if expandedSections.has(question.id)}
					<div class="toggle-content" transition:slide={{ duration: TIME.ANIMATION_DURATION_MS }}>
						{#each question.fields as field}
							<div class="field-block">
								<div class="block-controls">
									<button class="block-handle" tabindex="-1" aria-label="Drag to move">
										<Icon name="handle" size={14} /></button>
								</div>
								{#if field.label}
									<div
										class="field-label"
										class:mp-label={field.type === 'mp' || (!field.type && field.label)}
									>{field.label}</div>
								{/if}
								<div
									class="field-input"
									contenteditable="true"
									role="textbox"
									aria-label={field.label || question.question}
									data-field-id={field.id}
									data-placeholder={field.placeholder || undefined}
									use:syncContent={formData[field.id]}
									oninput={(e) => handleInput(e, field.id)}
									onpaste={(event) => {
										const updated = handlePaste(event);
										if (!updated) return;
										formData[field.id] = updated;
									}}
									onfocus={() => handleFieldFocus(question.id)}
								></div>
							</div>
						{/each}
					</div>
				{/if}
			</div>
		{/each}
		<div class="save-section">
			{#if saveError}
				<p class="error">{saveError}</p>
			{/if}
			<button
				type="button"
				onclick={onSubmit}
				disabled={isSaving || !isComplete}
				class="save-btn"
				class:ready={isComplete && !isSaving}
			>
				{#if isSaving}
					Saving...
				{:else if isComplete}
					Begin the Day
				{:else}
					Save entry
				{/if}
			</button>
		</div>
	</div>
</div>
