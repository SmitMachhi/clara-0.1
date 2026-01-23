import type { RequestHandler } from './$types';
import { createBackup, getBackups } from '$lib/db.js';
import { readFileSync } from 'fs';
import path from 'path';
import { successResponse, errorResponse, notFoundResponse } from '$lib/api-helpers.js';

export const GET: RequestHandler = async ({ url }) => {
	const action = url.searchParams.get('action');

	if (action === 'list') {
		const backups = getBackups();
		return successResponse({
			backups: backups.map(b => ({
				filename: b.filename,
				size: b.size,
				created: b.created.toISOString()
			}))
		});
	}

	if (action === 'download' && url.searchParams.get('filename')) {
		const filename = url.searchParams.get('filename');
		const backups = getBackups();
		const backup = backups.find(b => b.filename === filename);

		if (!backup) {
			return notFoundResponse('Backup not found');
		}

		try {
			const fileBuffer = readFileSync(backup.path);
			return new Response(fileBuffer, {
				headers: {
					'Content-Type': 'application/octet-stream',
					'Content-Disposition': `attachment; filename="${filename}"`,
					'Content-Length': fileBuffer.length.toString()
				}
			});
		} catch (error) {
			return errorResponse('Failed to read backup file', 500);
		}
	}

	return errorResponse('Invalid action - CSV export removed with client-side encryption');
};

export const POST: RequestHandler = async () => {
	try {
		const backupPath = createBackup();
		const backups = getBackups();
		const latest = backups[0];

		return successResponse({
			message: 'Backup created successfully',
			filename: path.basename(backupPath),
			size: latest?.size || 0,
			created: latest?.created.toISOString() || new Date().toISOString()
		});
	} catch (error) {
		console.error('Backup error:', error);
		return errorResponse('Failed to create backup', 500);
	}
};
