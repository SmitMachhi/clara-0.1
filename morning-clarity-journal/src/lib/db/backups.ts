import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import fs from 'fs';
import path from 'path';
import { DB_PATH, DATA_DIR, getDb } from './connection.js';

const BACKUP_ENCRYPTION_ALGO = 'aes-256-gcm';
const BACKUP_IV_LENGTH = 12;
const BACKUP_AUTH_TAG_LENGTH = 16;

function getBackupEncryptionKey(): Buffer {
	const secret = process.env.JOURNAL_ENCRYPTION_KEY;
	if (!secret) {
		throw new Error('JOURNAL_ENCRYPTION_KEY environment variable is not set');
	}
	return scryptSync(secret, 'mcj-backup-encryption-salt', 32);
}

export function createBackup(): string {
	const database = getDb();

	database.pragma('wal_checkpoint(TRUNCATE)');

	const backupDir = path.join(DATA_DIR, 'backups');
	if (!fs.existsSync(backupDir)) {
		fs.mkdirSync(backupDir, { recursive: true });
	}

	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
	const backupPath = path.join(backupDir, `journal-backup-${timestamp}.db.enc`);

	const dbContent = fs.readFileSync(DB_PATH);

	const key = getBackupEncryptionKey();
	const iv = randomBytes(BACKUP_IV_LENGTH);
	const cipher = createCipheriv(BACKUP_ENCRYPTION_ALGO, key, iv);

	const encrypted = Buffer.concat([cipher.update(dbContent), cipher.final()]);
	const authTag = cipher.getAuthTag();

	const backupData = Buffer.concat([iv, authTag, encrypted]);
	fs.writeFileSync(backupPath, backupData);

	const backups = getBackups();
	const RETENTION_COUNT = 5;
	if (backups.length > RETENTION_COUNT) {
		const backupsToDelete = backups.slice(RETENTION_COUNT);
		for (const backup of backupsToDelete) {
			fs.unlinkSync(backup.path);
		}
	}

	return backupPath;
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
		.filter(file =>
			(file.startsWith('journal-backup-') && file.endsWith('.db')) ||
			(file.startsWith('journal-backup-') && file.endsWith('.db.enc'))
		)
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

export function decryptBackup(encryptedPath: string): Buffer {
	const encryptedData = fs.readFileSync(encryptedPath);

	const iv = encryptedData.subarray(0, BACKUP_IV_LENGTH);
	const authTag = encryptedData.subarray(
		BACKUP_IV_LENGTH,
		BACKUP_IV_LENGTH + BACKUP_AUTH_TAG_LENGTH
	);
	const encrypted = encryptedData.subarray(BACKUP_IV_LENGTH + BACKUP_AUTH_TAG_LENGTH);

	const key = getBackupEncryptionKey();
	const decipher = createDecipheriv(BACKUP_ENCRYPTION_ALGO, key, iv);
	decipher.setAuthTag(authTag);

	return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
