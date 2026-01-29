import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { PassThrough, Readable } from 'stream';
import Database from 'better-sqlite3';
import { DB_PATH, DATA_DIR, getDb } from './connection.js';

const BACKUP_ENCRYPTION_ALGO = 'aes-256-gcm';
const BACKUP_IV_LENGTH = 12;
const BACKUP_AUTH_TAG_LENGTH = 16;
const BACKUP_CHUNK_PAGES = 100; // Pages per backup step (balance of speed vs locking)

function getBackupEncryptionKey(): Buffer {
	const secret = process.env.JOURNAL_ENCRYPTION_KEY;
	if (!secret) {
		throw new Error('JOURNAL_ENCRYPTION_KEY environment variable is not set');
	}
	return scryptSync(secret, 'mcj-backup-encryption-salt', 32);
}

/**
 * Verify that a backup file is a valid SQLite database.
 */
function verifyBackupIntegrity(backupPath: string): { valid: boolean; error?: string } {
	try {
		const testDb = new Database(backupPath, { readonly: true });
		try {
			// Run SQLite integrity check
			const result = testDb.pragma('integrity_check') as string | string[];
			const isValid = Array.isArray(result) ? result[0] === 'ok' : result === 'ok';

			if (!isValid) {
				return { valid: false, error: 'SQLite integrity check failed' };
			}

			// Verify required tables exist
			const tables = testDb.prepare(
				"SELECT name FROM sqlite_master WHERE type='table' AND name IN ('entries', 'config')"
			).all() as Array<{ name: string }>;

			if (tables.length < 2) {
				return { valid: false, error: 'Backup missing required tables' };
			}

			return { valid: true };
		} finally {
			testDb.close();
		}
	} catch (error) {
		return {
			valid: false,
			error: error instanceof Error ? error.message : 'Unknown error'
		};
	}
}

/**
 * Apply retention policy to remove old backups.
 */
function applyRetentionPolicy(backupDir: string): void {
	const RETENTION_COUNT = 5;
	const backups = getBackups();

	if (backups.length > RETENTION_COUNT) {
		const backupsToDelete = backups.slice(RETENTION_COUNT);
		for (const backup of backupsToDelete) {
			try {
				fs.unlinkSync(backup.path);
			} catch (error) {
				console.error(`Failed to delete old backup ${backup.filename}:`, error);
			}
		}
	}
}

export async function createBackup(): Promise<string> {
	const database = getDb();

	// Ensure backup directory exists
	const backupDir = path.join(DATA_DIR, 'backups');
	if (!fs.existsSync(backupDir)) {
		fs.mkdirSync(backupDir, { recursive: true });
	}

	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
	const backupPath = path.join(backupDir, `journal-backup-${timestamp}.db`);
	const tempPath = `${backupPath}.tmp`;

	try {
		// Use SQLite's native backup API with progress callback
		const metadata = await database.backup(tempPath, {
			progress: (info) => {
				return Math.min(BACKUP_CHUNK_PAGES, info.remainingPages);
			}
		});

		// Verify backup integrity before finalizing
		const integrityCheck = verifyBackupIntegrity(tempPath);
		if (!integrityCheck.valid) {
			throw new Error(`Backup integrity check failed: ${integrityCheck.error}`);
		}

		// Atomically move temp file to final location
		fs.renameSync(tempPath, backupPath);

		// Apply retention policy
		applyRetentionPolicy(backupDir);

		return backupPath;
	} catch (error) {
		// Clean up temp file on any error
		if (fs.existsSync(tempPath)) {
			fs.unlinkSync(tempPath);
		}
		throw error;
	}
}

export function getBackups(): Array<{
	filename: string;
	path: string;
	size: number;
	created: Date;
}> {
	const backupDir = path.join(DATA_DIR, 'backups');
	if (!fs.existsSync(backupDir)) {
		return [];
	}

	const files = fs.readdirSync(backupDir)
		.filter(file => {
			// Support both encrypted (.db.enc) and unencrypted (.db) backups
			return file.startsWith('journal-backup-') &&
				(file.endsWith('.db') || file.endsWith('.db.enc'));
		})
		.map(file => {
			const filePath = path.join(backupDir, file);
			const stats = fs.statSync(filePath);
			return {
				filename: file,
				path: filePath,
				size: stats.size,
				created: stats.birthtime
			};
		})
		.sort((a, b) => b.created.getTime() - a.created.getTime());

	return files;
}

export function decryptBackup(encryptedPath: string): Readable {
	const key = getBackupEncryptionKey();

	const ivStream = fs.createReadStream(encryptedPath, { start: 0, end: BACKUP_IV_LENGTH - 1 });
	const iv = new Promise<Buffer>((resolve, reject) => {
		const chunks: Buffer[] = [];
		ivStream.on('data', (chunk: Buffer | string) => {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		});
		ivStream.on('end', () => resolve(Buffer.concat(chunks)));
		ivStream.on('error', reject);
	});

	const authTagStart = BACKUP_IV_LENGTH;
	const authTagEnd = BACKUP_IV_LENGTH + BACKUP_AUTH_TAG_LENGTH - 1;
	const authTagStream = fs.createReadStream(encryptedPath, { start: authTagStart, end: authTagEnd });
	const authTag = new Promise<Buffer>((resolve, reject) => {
		const chunks: Buffer[] = [];
		authTagStream.on('data', (chunk: Buffer | string) => {
			chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
		});
		authTagStream.on('end', () => resolve(Buffer.concat(chunks)));
		authTagStream.on('error', reject);
	});

	const passThrough = new PassThrough();

	Promise.all([iv, authTag]).then(([ivData, authTagData]) => {
		const decipher = createDecipheriv(BACKUP_ENCRYPTION_ALGO, key, ivData);
		decipher.setAuthTag(authTagData);
		const encryptedStream = fs.createReadStream(encryptedPath, {
			start: BACKUP_IV_LENGTH + BACKUP_AUTH_TAG_LENGTH
		});
		pipeline(encryptedStream, decipher, passThrough).catch((err) => {
			passThrough.destroy(err);
		});
	}).catch((err) => {
		passThrough.destroy(err);
	});

	return passThrough;
}
