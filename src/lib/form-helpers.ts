export function handlePaste(event: ClipboardEvent): string | null {
	event.preventDefault();
	const text = event.clipboardData?.getData('text/plain') || '';
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return null;
	const range = selection.getRangeAt(0);
	range.deleteContents();
	const textNode = document.createTextNode(text);
	range.insertNode(textNode);
	range.setStartAfter(textNode);
	range.setEndAfter(textNode);
	selection.removeAllRanges();
	selection.addRange(range);
	const target = event.currentTarget as HTMLElement;
	return target?.textContent || '';
}

export function syncContent(node: HTMLElement, value: string | undefined) {
	const update = (nextValue: string | undefined) => {
		if (document.activeElement === node) return;
		const content = nextValue ?? '';
		if ((node.textContent || '') !== content) {
			node.textContent = content;
		}
	};

	update(value);

	return { update };
}
