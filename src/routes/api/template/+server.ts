import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { parseJsonBody, successResponse, errorResponse } from '$lib/api-helpers.js';
import {
	createTemplatePreset,
	createTemplateVersion,
	deleteTemplatePreset,
	getActiveTemplate,
	getTemplatePresetById,
	getTemplatePresets,
	renameTemplatePreset,
	setActiveTemplate
} from '$lib/db.js';
import { parseTemplateSource } from '$lib/template.js';

interface TemplatePayload {
	sourceText: string;
	action?: 'savePreset' | 'applyPreset' | 'renamePreset' | 'deletePreset';
	id?: number;
	name?: string;
}

const MAX_PRESETS = 5;
const MAX_PRESET_NAME_LENGTH = 64;

export const GET: RequestHandler = async () => {
	const template = getActiveTemplate();
	if (!template) {
		return errorResponse('Failed to load template', 500);
	}

	return successResponse({
		id: template.id,
		sourceText: template.sourceText,
		parsed: template.parsed,
		presets: getTemplatePresets()
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await parseJsonBody<TemplatePayload>(request, 32768);
	if (body.error) {
		return errorResponse(body.error);
	}

	const { sourceText, action, id, name } = body.data || {};

	if (action === 'applyPreset') {
		if (typeof id !== 'number') {
			return errorResponse('Invalid preset');
		}
		const preset = getTemplatePresetById(id);
		if (!preset) {
			return errorResponse('Preset not found', 404);
		}
		const templateId = createTemplateVersion(preset.sourceText);
		setActiveTemplate(templateId);
		return successResponse({ id: templateId });
	}

	if (action === 'renamePreset') {
		if (typeof id !== 'number' || typeof name !== 'string') {
			return errorResponse('Invalid preset');
		}
		const trimmed = name.trim();
		if (!trimmed || trimmed.length > MAX_PRESET_NAME_LENGTH) {
			return errorResponse('Invalid preset name');
		}
		if (!renameTemplatePreset(id, trimmed)) {
			return errorResponse('Preset not found', 404);
		}
		return successResponse();
	}

	if (action === 'deletePreset') {
		if (typeof id !== 'number') {
			return errorResponse('Invalid preset');
		}
		if (!deleteTemplatePreset(id)) {
			return errorResponse('Preset not found', 404);
		}
		return successResponse();
	}

	if (action === 'savePreset') {
		if (typeof name !== 'string' || typeof sourceText !== 'string') {
			return errorResponse('Invalid preset');
		}
		const trimmed = name.trim();
		if (!trimmed || trimmed.length > MAX_PRESET_NAME_LENGTH) {
			return errorResponse('Invalid preset name');
		}
		const presets = getTemplatePresets();
		if (presets.length >= MAX_PRESETS) {
			return errorResponse('Preset limit reached');
		}
		const presetId = createTemplatePreset(trimmed, sourceText);
		return successResponse({ id: presetId });
	}

	if (!sourceText || typeof sourceText !== 'string') {
		return errorResponse('Invalid template');
	}

	try {
		const id = createTemplateVersion(sourceText);
		setActiveTemplate(id);
		return successResponse({ id });
	} catch {
		return errorResponse('Failed to save template', 500);
	}
};
