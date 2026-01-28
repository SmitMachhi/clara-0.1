import type { TemplateModel } from './types.js';

export function createEmptyFormData(template: TemplateModel): Record<string, string> {
	const data: Record<string, string> = {};
	for (const fieldId of template.fieldIds) {
		data[fieldId] = '';
	}
	return data;
}

export function validateFormData(
	data: Record<string, string>,
	template: TemplateModel
): boolean {
	for (const fieldId of template.fieldIds) {
		if (!(fieldId in data)) {
			return false;
		}
	}
	return true;
}
