const backupUrl = process.env.JOURNAL_BACKUP_URL;
const backupToken = process.env.JOURNAL_BACKUP_TOKEN;

if (!backupUrl || !backupToken) {
	console.error('Missing JOURNAL_BACKUP_URL or JOURNAL_BACKUP_TOKEN');
	process.exit(1);
}

const response = await fetch(backupUrl, {
	method: 'POST',
	headers: {
		'x-backup-token': backupToken
	}
});

if (!response.ok) {
	const text = await response.text().catch(() => '');
	console.error(`Backup request failed: ${response.status} ${response.statusText} ${text}`);
	process.exit(1);
}

const payload = await response.json().catch(() => null);
const filename = payload?.filename ? ` (${payload.filename})` : '';
console.log(`Backup created${filename}`);
