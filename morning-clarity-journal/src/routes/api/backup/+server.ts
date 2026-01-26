import type { RequestHandler } from './$types';
import { createBackup, getBackups, decryptBackup } from '$lib/db.js';
import { readFileSync } from 'fs';
import { Readable } from 'stream';
import path from 'path';
import { successResponse, errorResponse, notFoundResponse, noStoreHeaders } from '$lib/api-helpers.js';
import { logAuditEvent } from '$lib/audit.js';

function isValidBackupFilename(filename: string): boolean {
	// Allow both encrypted (.db.enc) and legacy unencrypted (.db) backups
	const pattern = /^journal-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.db(\.enc)?$/;
	return pattern.test(filename);
}

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
		}, noStoreHeaders());
	}

	if (action === 'download' && url.searchParams.get('filename')) {
		const filename = url.searchParams.get('filename');

		if (!filename || !isValidBackupFilename(filename)) {
			return errorResponse('Invalid backup filename', 400, noStoreHeaders());
		}

		const backups = getBackups();
		const backup = backups.find(b => b.filename === filename);

		if (!backup) {
			return notFoundResponse('Backup not found');
		}

		logAuditEvent({
			eventType: 'backup_downloaded',
			details: { filename }
		});

		// Verify the backup path is within the expected directory
		const backupDir = path.join(process.env.NODE_ENV === 'production' ? '/data' : './data', 'backups');
		const resolvedPath = path.resolve(backup.path);
		const resolvedBackupDir = path.resolve(backupDir);

		if (!resolvedPath.startsWith(resolvedBackupDir + path.sep)) {
			return errorResponse('Invalid backup path', 400, noStoreHeaders());
		}

		try {
			let responseStream: ReadableStream<Uint8Array>;
			const downloadFilename = filename.replace('.enc', '');

			if (filename.endsWith('.enc')) {
				const decryptedStream = decryptBackup(backup.path);
				responseStream = Readable.toWeb(decryptedStream) as ReadableStream<Uint8Array>;
			} else {
				responseStream = new ReadableStream({
					async start(controller) {
						const fileBuffer = readFileSync(backup.path);
						controller.enqueue(new Uint8Array(fileBuffer));
						controller.close();
					}
				});
			}

			return new Response(responseStream, {
				headers: {
					...noStoreHeaders(),
					'Content-Type': 'application/octet-stream',
					'Content-Disposition': `attachment; filename="${downloadFilename}"`
				}
			});
		} catch (error) {
			return errorResponse('Failed to read backup file', 500);
		}
	}

	return errorResponse('Invalid action');
};

export const POST: RequestHandler = async () => {
	try {
		const backupPath = await createBackup();
		const backups = getBackups();
		const latest = backups[0];
		const backupFilename = path.basename(backupPath);

		logAuditEvent({
			eventType: 'backup_created',
			details: { filename: backupFilename }
		});

		return successResponse({
			message: 'Backup created successfully',
			filename: backupFilename,
			size: latest?.size || 0,
			created: latest?.created.toISOString() || new Date().toISOString()
		});
	} catch (error) {
		console.error('Backup error:', error instanceof Error ? error.message : 'Unknown error');
		return errorResponse('Failed to create backup', 500);
	}
};
