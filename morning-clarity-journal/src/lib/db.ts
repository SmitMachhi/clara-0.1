// Re-export all database functionality from sub-modules
// This file maintains backward compatibility with existing imports

export * from './db/types.js';
export { getDb, DATA_DIR, DB_PATH } from './db/connection.js';
export * from './db/crypto-helpers.js';
export * from './db/locations.js';
export * from './db/entries.js';
export * from './db/templates.js';
export * from './db/sessions.js';
export * from './db/backups.js';
