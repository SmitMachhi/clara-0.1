<!-- purpose: Icon component library -->
<!-- context: Reusable SVG icons for consistent UI -->
<!-- location: src/lib/components/Icons.svelte -->

<script lang="ts">
	interface Props {
		name: 'settings' | 'menu' | 'close' | 'chevron' | 'check' | 'trash' | 'location' | 'sun' | 'moon' | 'download' | 'arrow-left' | 'lock' | 'handle';
		size?: number;
	}
	let { name, size = 16 }: Props = $props();
</script>

{#if name === 'settings'}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<circle cx="12" cy="12" r="3"></circle>
		<path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82-.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
	</svg>
{:else if name === 'close'}
	<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<line x1="18" y1="6" x2="6" y2="18"></line>
		<line x1="6" y1="6" x2="18" y2="18"></line>
	</svg>
{:else if name === 'chevron'}
	<svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
		<path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
	</svg>
{:else if name === 'menu'}
	<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
		<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
		<path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
	</svg>
{:else if name === 'check'}
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<polyline points="20 6 9 17 4 12"></polyline>
	</svg>
{:else if name === 'trash'}
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<line x1="18" y1="6" x2="6" y2="18"></line>
		<line x1="6" y1="6" x2="18" y2="18"></line>
	</svg>
{:else if name === 'location'}
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<circle cx="12" cy="12" r="10"></circle>
		<circle cx="12" cy="12" r="3"></circle>
		<line x1="12" y1="2" x2="12" y2="4"></line>
		<line x1="12" y1="20" x2="12" y2="22"></line>
		<line x1="2" y1="12" x2="4" y2="12"></line>
		<line x1="20" y1="12" x2="22" y2="12"></line>
	</svg>
{:else if name === 'sun'}
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<circle cx="12" cy="12" r="5"></circle>
		<line x1="12" y1="1" x2="12" y2="3"></line>
		<line x1="12" y1="21" x2="12" y2="23"></line>
		<line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
		<line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
		<line x1="1" y1="12" x2="3" y2="12"></line>
		<line x1="21" y1="12" x2="23" y2="12"></line>
		<line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
		<line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
	</svg>
{:else if name === 'moon'}
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
	</svg>
{:else if name === 'download'}
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
		<polyline points="7 10 12 15 17 10"></polyline>
		<line x1="12" y1="15" x2="12" y2="3"></line>
	</svg>
{:else if name === 'arrow-left'}
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<path d="M19 12H5M12 19l-7-7 7-7"/>
	</svg>
{:else if name === 'lock'}
	<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
		<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
		<path d="M7 11V7a5 5 0 0110 0v4"/>
	</svg>
{:else if name === 'handle'}
	<svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
		<circle cx="4" cy="3" r="1.25"/>
		<circle cx="10" cy="3" r="1.25"/>
		<circle cx="4" cy="7" r="1.25"/>
		<circle cx="10" cy="7" r="1.25"/>
		<circle cx="4" cy="11" r="1.25"/>
		<circle cx="10" cy="11" r="1.25"/>
	</svg>
{/if}
