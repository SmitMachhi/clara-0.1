<!-- purpose: Sidebar with year tracker, stats, and recent entries -->
<!-- context: Navigation and progress visualization for journal entries -->
<!-- location: src/lib/components/JournalSidebar.svelte -->

<script lang="ts">
	import { formatDateISO, isDateInPast, extractTimeFromTimestamp } from '$lib/utils.js';
	import type { EntryYearSummary } from '$lib/db.js';
	import { calculateStats, calculateStreaks, getRecentEntries } from '$lib/stats.js';
	import { getYearOptions, getPastYearSummaries } from '$lib/year-helpers.js';
	import Icon from '$lib/components/Icons.svelte';

	let {
		entries,
		entryDates,
		yearDates,
		currentYear,
		selectedYear,
		yearSummaries,
		isYearLoading,
		yearLoadError,
		sidebarOpen,
		settingsOpen,
		onToggleSidebar,
		onCloseSidebar,
		onOpenSidebar,
		onOpenSettings,
		onSelectYear,
		onViewEntry
	}: {
		entries: any[];
		entryDates: string[];
		yearDates: string[];
		currentYear: number;
		selectedYear: number;
		yearSummaries: EntryYearSummary[];
		isYearLoading: boolean;
		yearLoadError: string;
		sidebarOpen: boolean;
		settingsOpen: boolean;
		onToggleSidebar: () => void;
		onCloseSidebar: () => void;
		onOpenSidebar: () => void;
		onOpenSettings: () => void;
		onSelectYear: (year: number) => void;
		onViewEntry: (date: string) => void;
	} = $props();

	const stats = $derived(calculateStats(entryDates, yearDates));
	const streaks = $derived(calculateStreaks(entryDates, yearDates));
	const recentEntries = $derived(getRecentEntries(yearDates, entryDates, entries));
	const entryDateSet = $derived(new Set(entryDates));
	const today = $derived(formatDateISO(new Date()));
	const yearOptions = $derived(getYearOptions(yearSummaries, currentYear));
	const pastYears = $derived(getPastYearSummaries(yearOptions, selectedYear, currentYear));

	function handleYearChange(event: Event): void {
		const value = parseInt((event.currentTarget as HTMLSelectElement).value, 10);
		if (!isNaN(value)) {
			onSelectYear(value);
		}
	}

	function getDayStatus(dateStr: string): 'completed' | 'missed' | 'future' | 'today' {
		if (dateStr === today) return 'today';
		if (entryDateSet.has(dateStr)) return 'completed';
		if (isDateInPast(dateStr)) return 'missed';
		return 'future';
	}
</script>

<button
	class="sidebar-toggle"
	onclick={onToggleSidebar}
	aria-label={sidebarOpen ? 'Close entries' : 'View entries'}
>
	<Icon name="menu" size={18} />
</button>

{#if sidebarOpen}
	<div class="sidebar-overlay" onclick={onCloseSidebar} aria-hidden="true"></div>
{/if}

<aside class="sidebar" class:open={sidebarOpen} onmouseleave={() => { if (!settingsOpen) onCloseSidebar(); }}>
	<div class="sidebar-inner">
		<div class="sidebar-header">
			<div>
				<div class="sidebar-title-row">
					<div class="year-select">
						<select
							value={selectedYear}
							onchange={handleYearChange}
							disabled={isYearLoading}
							aria-label="Select year"
						>
							{#each yearOptions as summary}
								<option value={summary.year}>{summary.year}</option>
							{/each}
						</select>
						<span class="year-select-icon" aria-hidden="true">
							<Icon name="chevron" size={10} />
						</span>
					</div>
				</div>
				<div class="sidebar-stats">{stats.completedCount} of {stats.total} days</div>
				{#if yearLoadError}
					<div class="year-error">{yearLoadError}</div>
				{:else if isYearLoading}
					<div class="year-loading-text">Loading year…</div>
				{/if}
			</div>
			<button
				class="sidebar-close-btn"
				onclick={(e) => { e.stopPropagation(); onCloseSidebar(); }}
				aria-label="Close sidebar"
			>
				<Icon name="close" size={16} />
			</button>
			<button
				class="settings-btn"
				onclick={(e) => { e.stopPropagation(); onOpenSettings(); }}
				aria-label="Settings"
			>
				<Icon name="settings" size={16} />
			</button>

		</div>

		<div class="tracker-card" class:loading={isYearLoading} aria-busy={isYearLoading}>
			{#if isYearLoading}
				<div class="tracker-loading">Loading year…</div>
			{/if}
			<div class="tracker-content">
				<div class="tracker-summary">
					<div class="tracker-summary-item">
						<div class="tracker-summary-value">
							{streaks.current}
							<span class="tracker-summary-unit">
								{streaks.current === 1 ? 'day' : 'days'}
							</span>
						</div>
						<div class="tracker-summary-label">current streak</div>
					</div>
					<div class="tracker-summary-divider" aria-hidden="true"></div>
					<div class="tracker-summary-item">
						<div class="tracker-summary-value">
							{streaks.best}
							<span class="tracker-summary-unit">
								{streaks.best === 1 ? 'day' : 'days'}
							</span>
						</div>
						<div class="tracker-summary-label">best streak</div>
					</div>
				</div>
				<div class="tracker">
					{#each yearDates as day}
						{@const status = getDayStatus(day)}
						<div
							class="tracker-day {status}"
							onclick={() => status === 'completed' && onViewEntry(day)}
							title={day}
							role={status === 'completed' ? 'button' : 'presentation'}
						></div>
					{/each}
				</div>

			</div>
		</div>

		<h3 class="recent-heading">Recent</h3>
		<div class="recent">
			{#each recentEntries as item}
				{@const dateObj = new Date(item.date + 'T12:00:00')}
				{@const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'short' })}
				{@const monthDay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
				{@const year = dateObj.getFullYear()}
				{#if item.completed}
					<button onclick={() => onViewEntry(item.date)} class="recent-item completed">
						<span class="recent-info">
							<span class="recent-date-text">{dayOfWeek}, {monthDay}</span>
							{#if item.entry?.timestamp}
								<span class="recent-time">{extractTimeFromTimestamp(item.entry.timestamp)}</span>
							{/if}
						</span>
						<span class="recent-year">{year}</span>
					</button>
				{:else}
					<div class="recent-item missed">
						<span class="recent-date-text">{dayOfWeek}, {monthDay}</span>
						<span class="recent-year">{year}</span>
					</div>
				{/if}
			{/each}
		</div>
	</div>
</aside>

{#if !sidebarOpen}
	<div
		class="edge-trigger"
		role="button"
		tabindex="-1"
		aria-label="Open sidebar"
		onmouseenter={() => onOpenSidebar()}
	></div>
{/if}

<style>
	.sidebar-close-btn {
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--text-tertiary);
		border-radius: 4px;
		transition: all 0.1s;
		margin-right: 8px;
	}

	.sidebar-close-btn:hover {
		background: var(--surface-elevated);
		color: var(--text);
	}
</style>
