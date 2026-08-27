/**
 * db.js
 * SQLite database connection and schema setup using better-sqlite3.
 * Data is stored permanently in data/zoeblossom.db on the server disk.
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'zoeblossom.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL CHECK(role IN ('admin','teacher','student')),
    reg_no TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    class_name TEXT,
    subject TEXT,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    last_login TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

module.exports = db;
