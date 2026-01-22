import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createBackup, getBackups } from '$lib/db.js';
import { readFileSync } from 'fs';
import path from 'path';

export const GET: RequestHandler = async ({ url }) => {
	const action = url.searchParams.get('action');
	
	if (action === 'list') {
		const backups = getBackups();
		return json({ 
			success: true, 
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
			return json({ success: false, error: 'Backup not found' }, { status: 404 });
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
			return json({ success: false, error: 'Failed to read backup file' }, { status: 500 });
		}
	}
	
	return json({ success: false, error: 'Invalid action' }, { status: 400 });
};

export const POST: RequestHandler = async () => {
	try {
		const backupPath = createBackup();
		const backups = getBackups();
		const latest = backups[0];
		
		return json({ 
			success: true, 
			message: 'Backup created successfully',
			filename: path.basename(backupPath),
			size: latest?.size || 0,
			created: latest?.created.toISOString() || new Date().toISOString()
		});
	} catch (error) {
		console.error('Backup error:', error);
		return json({ success: false, error: 'Failed to create backup' }, { status: 500 });
	}
};
