import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { PassThrough, Readable } from 'stream';
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

export async function createBackup(): Promise<string> {
	const database = getDb();

	database.pragma('wal_checkpoint(TRUNCATE)');

	const backupDir = path.join(DATA_DIR, 'backups');
	if (!fs.existsSync(backupDir)) {
		fs.mkdirSync(backupDir, { recursive: true });
	}

	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
	const backupPath = path.join(backupDir, `journal-backup-${timestamp}.db.enc`);
	const tempPath = `${backupPath}.tmp`;

	const key = getBackupEncryptionKey();
	const iv = randomBytes(BACKUP_IV_LENGTH);
	const cipher = createCipheriv(BACKUP_ENCRYPTION_ALGO, key, iv);

	const readStream = fs.createReadStream(DB_PATH);
	const writeStream = fs.createWriteStream(tempPath);
	try {
		await pipeline(readStream, cipher, writeStream);

		const authTag = cipher.getAuthTag();

		const finalWriteStream = fs.createWriteStream(backupPath);
		finalWriteStream.write(iv);
		finalWriteStream.write(authTag);
		const encryptedStream = fs.createReadStream(tempPath);
		await pipeline(encryptedStream, finalWriteStream);
	} finally {
		if (fs.existsSync(tempPath)) {
			fs.unlinkSync(tempPath);
		}
	}

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
