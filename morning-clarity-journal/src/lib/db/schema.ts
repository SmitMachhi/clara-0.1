import type Database from 'better-sqlite3';
import { runMigrations } from './schema-migrations.js';

export function initializeSchema(db: Database.Database): void {
	db.exec(`
		CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT);
		CREATE TABLE IF NOT EXISTS entries (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			date TEXT UNIQUE NOT NULL,
			timestamp TEXT NOT NULL,
			location_id INTEGER,
			location_id_encrypted BLOB,
			captured_lat REAL,
			captured_lng REAL,
			captured_lat_encrypted BLOB,
			captured_lng_encrypted BLOB,
			quote_id_encrypted BLOB,
			quote_text_encrypted BLOB,
			template_id INTEGER,
			encrypted_data BLOB NOT NULL,
			created_at TEXT DEFAULT (datetime('now'))
		);
		CREATE TABLE IF NOT EXISTS quotes (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			text_encrypted BLOB NOT NULL,
			created_at TEXT DEFAULT (datetime('now'))
		);
		CREATE TABLE IF NOT EXISTS daily_quotes (
			date TEXT PRIMARY KEY,
			quote_id_encrypted BLOB,
			quote_text_encrypted BLOB NOT NULL,
			created_at TEXT DEFAULT (datetime('now'))
		);
		CREATE TABLE IF NOT EXISTS templates (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			created_at TEXT DEFAULT (datetime('now')),
			source_text_encrypted BLOB NOT NULL,
			parsed_json TEXT NOT NULL,
			parsed_json_encrypted BLOB NOT NULL
		);
		CREATE TABLE IF NOT EXISTS template_presets (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT NOT NULL,
			created_at TEXT DEFAULT (datetime('now')),
			source_text_encrypted BLOB NOT NULL,
			parsed_json TEXT NOT NULL,
			parsed_json_encrypted BLOB NOT NULL
		);
		CREATE TABLE IF NOT EXISTS locations (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			name TEXT DEFAULT '',
			lat REAL DEFAULT 0,
			lng REAL DEFAULT 0,
			address TEXT,
			name_encrypted BLOB NOT NULL,
			lat_encrypted BLOB NOT NULL,
			lng_encrypted BLOB NOT NULL,
			address_encrypted BLOB
		);
		CREATE TABLE IF NOT EXISTS auth_rate_limits (
			ip TEXT PRIMARY KEY,
			count INTEGER NOT NULL,
			reset_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS api_rate_limits (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			key TEXT NOT NULL,
			timestamp INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_api_rate_limits_key_ts ON api_rate_limits(key, timestamp);
		CREATE TABLE IF NOT EXISTS session_blacklist (
			nonce TEXT PRIMARY KEY,
			blacklisted_at INTEGER NOT NULL,
			expires_at INTEGER NOT NULL
		);
		CREATE TABLE IF NOT EXISTS audit_log (
			id INTEGER PRIMARY KEY AUTOINCREMENT,
			timestamp INTEGER NOT NULL,
			event_type TEXT NOT NULL,
			ip_address TEXT,
			session_id TEXT,
			details TEXT,
			created_at TEXT DEFAULT (datetime('now'))
		);
		CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
		CREATE INDEX IF NOT EXISTS idx_audit_log_event_type ON audit_log(event_type);
		CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);
	`);

	runMigrations(db);
}
