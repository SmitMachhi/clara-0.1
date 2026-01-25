import type { TemplateModel, TemplateQuestion } from './types.js';

const MAX_TEMPLATE_BYTES = 20 * 1024;
const MAX_TEMPLATE_LINES = 200;
const textEncoder = new TextEncoder();

function getTemplateSize(sourceText: string): number {
	return textEncoder.encode(sourceText).length;
}

function parseLabelAttribute(
	attributeText: string,
	lineNumber: number,
	errors: string[]
): string | null {
	const trimmed = attributeText.trim();
	if (!trimmed) return '';
	const match = trimmed.match(/^label="([^"]*)"$/);
	if (!match) {
		errors.push(`Invalid attribute on line ${lineNumber}`);
		return null;
	}
	return match[1];
}

export function parseTemplateSource(
	sourceText: string
): { parsed: TemplateModel; errors: string[] } {
	const errors: string[] = [];
	const emptyParsed = { questions: [], fieldIds: [] };

	if (getTemplateSize(sourceText) > MAX_TEMPLATE_BYTES) {
		return { parsed: emptyParsed, errors: ['Template exceeds 20KB'] };
	}

	const lines = sourceText.split(/\r?\n/);
	if (lines.length > MAX_TEMPLATE_LINES) {
		return { parsed: emptyParsed, errors: ['Template exceeds 200 lines'] };
	}

	const lineStarts = [0];
	for (let i = 0; i < sourceText.length; i += 1) {
		if (sourceText[i] === '\n') {
			lineStarts.push(i + 1);
		}
	}

	function getLineNumber(index: number): number {
		let low = 0;
		let high = lineStarts.length - 1;
		while (low <= high) {
			const mid = Math.floor((low + high) / 2);
			if (lineStarts[mid] <= index) {
				low = mid + 1;
			} else {
				high = mid - 1;
			}
		}
		return Math.max(1, high + 1);
	}

	function reportUnknownTag(index: number) {
		errors.push(`Unknown tag on line ${getLineNumber(index)}`);
	}

	function reportMpWithoutHp(index: number) {
		errors.push(`MP without HP on line ${getLineNumber(index)}`);
	}

	const questions: TemplateQuestion[] = [];
	const fieldIds: string[] = [];
	let questionIndex = 0;
	let fieldIndex = 0;
	const hpRegex = /<hp([^>]*)>([\s\S]*?)<\/hp>/gi;
	const mpRegex = /<mp([^>]*)>([\s\S]*?)<\/mp>/gi;
	const tagRegex = /<\/?([a-zA-Z]+)([^>]*)>/g;
	let lastIndex = 0;
	let hpMatch: RegExpExecArray | null;

	function handleStraySegment(segment: string, offset: number) {
		if (!segment.trim()) return;
		const tagMatch = segment.match(/<\/?([a-zA-Z]+)([^>]*)>/);
		if (tagMatch?.index !== undefined) {
			const tagName = tagMatch[1].toLowerCase();
			const tagIndex = offset + tagMatch.index;
			if (tagName === 'mp') {
				reportMpWithoutHp(tagIndex);
				return;
			}
			reportUnknownTag(tagIndex);
			return;
		}
		const firstNonWhitespace = segment.search(/\S/);
		if (firstNonWhitespace >= 0) {
			reportUnknownTag(offset + firstNonWhitespace);
		}
	}

	while ((hpMatch = hpRegex.exec(sourceText)) !== null) {
		const blockIndex = hpMatch.index;
		handleStraySegment(sourceText.slice(lastIndex, blockIndex), lastIndex);

		const hpLine = getLineNumber(blockIndex);
		const hpPlaceholder = parseLabelAttribute(hpMatch[1], hpLine, errors);
		const hpContent = hpMatch[2];
		const hpContentStart = blockIndex + hpMatch[0].indexOf(hpContent);

		mpRegex.lastIndex = 0;
		const hpText = hpContent.replace(mpRegex, '').trim();
		if (!hpText) {
			errors.push(`Empty tag content on line ${hpLine}`);
		}

		mpRegex.lastIndex = 0;
		const invalidMpTag = hpContent.replace(mpRegex, '');
		const strayMpMatch = invalidMpTag.match(/<\/?mp\b/i);
		if (strayMpMatch?.index !== undefined) {
			reportUnknownTag(hpContentStart + strayMpMatch.index);
		}

		tagRegex.lastIndex = 0;
		let tagMatch: RegExpExecArray | null;
		while ((tagMatch = tagRegex.exec(hpContent)) !== null) {
			const tagName = tagMatch[1].toLowerCase();
			if (tagName !== 'mp') {
				reportUnknownTag(hpContentStart + tagMatch.index);
			}
		}

		questionIndex += 1;
		const question: TemplateQuestion = {
			id: `q${questionIndex}`,
			number: questionIndex,
			question: hpText,
			fields: []
		};

		if (hpPlaceholder !== null) {
			fieldIndex += 1;
			const hpFieldId = `f${fieldIndex}`;
			question.fields.push({
				id: hpFieldId,
				label: '',
				placeholder: hpPlaceholder,
				type: 'hp'
			});
			fieldIds.push(hpFieldId);
		}

		mpRegex.lastIndex = 0;
		let mpMatch: RegExpExecArray | null;
		while ((mpMatch = mpRegex.exec(hpContent)) !== null) {
			const mpIndex = hpContentStart + mpMatch.index;
			const mpLine = getLineNumber(mpIndex);
			const mpPlaceholder = parseLabelAttribute(mpMatch[1], mpLine, errors);
			const mpText = mpMatch[2].trim();
			if (!mpText) {
				errors.push(`Empty tag content on line ${mpLine}`);
				continue;
			}
			if (mpPlaceholder === null) continue;

			fieldIndex += 1;
			const mpFieldId = `f${fieldIndex}`;
			question.fields.push({
				id: mpFieldId,
				label: mpText,
				placeholder: mpPlaceholder,
				type: 'mp'
			});
			fieldIds.push(mpFieldId);
		}

		questions.push(question);
		lastIndex = hpRegex.lastIndex;
	}

	handleStraySegment(sourceText.slice(lastIndex), lastIndex);

	return {
		parsed: errors.length > 0 ? emptyParsed : { questions, fieldIds },
		errors
	};
}
