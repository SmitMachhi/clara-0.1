import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { parseJsonBody, successResponse, errorResponse } from '$lib/api-helpers.js';
import { createTemplateVersion, getActiveTemplate, setActiveTemplate } from '$lib/db.js';
import { parseTemplateSource } from '$lib/template.js';

interface TemplatePayload {
	sourceText: string;
}

export const GET: RequestHandler = async () => {
	const template = getActiveTemplate();
	if (!template) {
		return errorResponse('Failed to load template', 500);
	}

	return successResponse({
		id: template.id,
		sourceText: template.sourceText,
		parsed: template.parsed
	});
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await parseJsonBody<TemplatePayload>(request);
	if (body.error) {
		return errorResponse(body.error);
	}

	const { sourceText } = body.data || {};
	if (!sourceText || typeof sourceText !== 'string') {
		return errorResponse('Invalid template');
	}

	const { parsed, errors } = parseTemplateSource(sourceText);
	if (errors.length > 0) {
		return json({ error: 'Invalid template', details: errors }, { status: 400 });
	}

	try {
		const id = createTemplateVersion(sourceText, parsed);
		setActiveTemplate(id);
		return successResponse({ id });
	} catch {
		return errorResponse('Failed to save template', 500);
	}
};
