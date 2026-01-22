<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { slide } from 'svelte/transition';
import { journalTemplate, getCurrentFieldIds } from '$lib/template.js';
import type { EntryWithData } from '$lib/db.js';
import { DISPLAY } from '$lib/constants.js';
import { formatCoordinate } from '$lib/location-utils.js';
import { getLegacyFieldLabel } from '$lib/legacy-field-labels.js';
import Icon from '$lib/components/Icons.svelte';
import Spinner from '$lib/components/Spinner.svelte';
	
	let entry = $state<EntryWithData | null>(null);
	let loading = $state(true);
	let error = $state('');
	let expandedQuestions = $state<Set<string>>(new Set());
	
	$effect(() => {
		loadEntry($page.params.date);
	});
	
	async function loadEntry(date: string) {
		loading = true;
		error = '';
		
		try {
			const res = await fetch(`/api/entries/${date}`);
			if (res.ok) {
				entry = await res.json();
				// Debug: log entry to see location data
				if (entry) {
					console.log('Entry loaded:', { 
						location_id: entry.location_id, 
						location_name: entry.location_name,
						captured_lat: entry.captured_lat,
						captured_lng: entry.captured_lng
					});
					// Auto-expand all questions that have content
					const questionsWithContent = new Set<string>();
					for (const question of journalTemplate) {
						for (const field of question.fields) {
							if (entry.data[field.id as keyof typeof entry.data]) {
								questionsWithContent.add(question.id);
								break;
							}
						}
					}
					expandedQuestions = questionsWithContent;
				}
			} else if (res.status === 404) {
				error = 'Entry not found';
			} else {
				error = 'Failed to load entry';
			}
		} catch (err) {
			error = 'Failed to load entry';
		} finally {
			loading = false;
		}
	}
	
	function goBack() {
		goto('/journal');
	}
	
	function toggleQuestion(questionId: string) {
		const newSet = new Set(expandedQuestions);
		if (newSet.has(questionId)) {
			newSet.delete(questionId);
		} else {
			newSet.add(questionId);
		}
		expandedQuestions = newSet;
	}
	
	// Check if entry has legacy fields (from old template)
	function hasLegacyContent(): boolean {
		if (!entry) return false;
		const currentFieldIds = new Set(getCurrentFieldIds());
		return Object.entries(entry.data).some(([key, value]) => 
			value && !currentFieldIds.has(key)
		);
	}

	// Parse timestamp parts for display
	function getTimestampParts(timestamp: string) {
		// Format: "HH:MM:SS day month, year" or similar
		const parts = timestamp.split(' ');
		const time = parts[0]?.split(':').slice(0, 2).join(':') || '';
		const rest = parts.slice(1).join(' ');
		return { time, rest };
	}
</script>

<div class="notion-page">
	<div class="main-area">
		<main class="content">
			{#if loading}
				<div class="message-container">
					<Spinner />
				</div>
			{:else if error}
				<div class="message-container">
					<p class="message-title">{error}</p>
					<button onclick={goBack} class="back-link">← Go back</button>
				</div>
			{:else if entry}
				{@const tp = getTimestampParts(entry.timestamp)}
				<div class="page-container">
					<!-- Page header -->
					<div class="page-header">
						<div class="page-meta">
							<span class="meta-time">{tp.time}</span>
							<span class="meta-sep">·</span>
							<span class="meta-date">{tp.rest}</span>
						</div>
						{#if entry.location_name}
							<div class="page-location">{entry.location_name} 📍</div>
						{:else if entry.captured_lat !== null && entry.captured_lng !== null}
							<div class="page-location">{formatCoordinate(entry.captured_lat)}, {formatCoordinate(entry.captured_lng)} 📍</div>
						{/if}
					</div>
					
					<!-- Page content -->
					<div class="page-content">
						{#each journalTemplate as question}
							{@const hasContent = question.fields.some(f => entry?.data[f.id as keyof typeof entry.data])}
							{#if hasContent}
								<div class="block">
									<!-- Toggle header -->
									<button 
										class="toggle-header"
										onclick={() => toggleQuestion(question.id)}
										type="button"
									>
										<span class="toggle-icon" class:open={expandedQuestions.has(question.id)}>
											<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
												<path d="M2.5 1L7.5 5L2.5 9V1Z"/>
											</svg>
										</span>
										<span class="toggle-title">
											<span class="toggle-number">{question.number}.</span>
											{question.question}
										</span>
									</button>
									
									<!-- Toggle content -->
									{#if expandedQuestions.has(question.id)}
										<div class="toggle-content" transition:slide={{ duration: 150 }}>
											{#each question.fields as field}
												{@const value = entry.data[field.id as keyof typeof entry.data]}
												{#if value}
													<div class="field-block">
														{#if field.label}
															<div class="field-label">{field.label}</div>
														{/if}
														<div class="field-value">{value}</div>
													</div>
												{/if}
											{/each}
										</div>
									{/if}
								</div>
							{/if}
						{/each}
						
						<!-- Legacy content -->
						{#if hasLegacyContent()}
							<div class="legacy-section">
								<button 
									class="toggle-header"
									onclick={() => toggleQuestion('legacy')}
									type="button"
								>
									<span class="toggle-icon" class:open={expandedQuestions.has('legacy')}>
										<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
											<path d="M2.5 1L7.5 5L2.5 9V1Z"/>
										</svg>
									</span>
									<span class="toggle-title legacy">Additional notes</span>
								</button>
								
								{#if expandedQuestions.has('legacy')}
									<div class="toggle-content" transition:slide={{ duration: 150 }}>
										{#each Object.entries(entry.data) as [key, value]}
											{@const isLegacy = !getCurrentFieldIds().includes(key)}
											{#if isLegacy && value}
												<div class="field-block">
													<div class="field-label">{getLegacyFieldLabel(key)}</div>
													<div class="field-value">{value}</div>
												</div>
											{/if}
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</main>
		
		<!-- Back button -->
		<button class="nav-btn back" onclick={goBack} aria-label="Back to journal">
			<Icon name="arrow-left" size={16} />
		</button>
	</div>
</div>
