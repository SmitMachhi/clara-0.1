<!-- purpose: Sidebar with year tracker, stats, and recent entries -->
<!-- context: Navigation and progress visualization for journal entries -->
<!-- location: src/lib/components/JournalSidebar.svelte -->

<script lang="ts">
	import { isToday, isDateInPast, extractTimeFromTimestamp } from '$lib/utils.js';
	import { calculateStats, getRecentEntries } from '$lib/stats.js';
	import Icon from '$lib/components/Icons.svelte';

	let {
		entries,
		entryDates,
		yearDates,
		currentYear,
		sidebarOpen,
		settingsOpen,
		onToggleSidebar,
		onCloseSidebar,
		onOpenSidebar,
		onOpenSettings,
		onViewEntry
	}: {
		entries: any[];
		entryDates: string[];
		yearDates: string[];
		currentYear: number;
		sidebarOpen: boolean;
		settingsOpen: boolean;
		onToggleSidebar: () => void;
		onCloseSidebar: () => void;
		onOpenSidebar: () => void;
		onOpenSettings: () => void;
		onViewEntry: (date: string) => void;
	} = $props();

	const stats = $derived(calculateStats(entryDates, yearDates));
	const recentEntries = $derived(getRecentEntries(yearDates, entryDates, entries));

	function getDayStatus(dateStr: string): 'completed' | 'missed' | 'future' | 'today' {
		if (isToday(dateStr)) return 'today';
		if (entryDates.includes(dateStr)) return 'completed';
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

<aside class="sidebar" class:open={sidebarOpen} onmouseleave={() => { if (!settingsOpen) onCloseSidebar(); }}>
	<div class="sidebar-inner">
		<div class="sidebar-header">
			<div>
				<h2 class="sidebar-title">{currentYear}</h2>
				<div class="sidebar-stats">{stats.completedCount} of {stats.total} days</div>
			</div>
			<button
				class="settings-btn"
				onclick={(e) => { e.stopPropagation(); onOpenSettings(); }}
				aria-label="Settings"
			>
				<Icon name="settings" size={16} />
			</button>

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

		<div class="legend">
			<span><span class="legend-dot completed"></span> completed</span>
			<span><span class="legend-dot missed"></span> missed</span>
		</div>

		<h3 class="recent-heading">Recent</h3>
		<div class="recent">
			{#each recentEntries as item}
				{@const dateObj = new Date(item.date + 'T12:00:00')}
				{@const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'short' })}
				{@const monthDay = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
				{@const year = dateObj.getFullYear()}
				{#if item.completed && item.entry}
					<button onclick={() => onViewEntry(item.date)} class="recent-item completed">
						<span class="recent-info">
							<span class="recent-date-text">{dayOfWeek}, {monthDay}</span>
							{#if item.entry.timestamp}
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
