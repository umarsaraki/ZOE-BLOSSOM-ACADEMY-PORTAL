/**
 * db.js
 * SQLite database connection and full schema setup using better-sqlite3.
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

  CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_name TEXT NOT NULL UNIQUE,
    teacher_reg_no TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    school_name TEXT NOT NULL DEFAULT 'ZOE BLOSSOM ACADEMY',
    logo_data TEXT,
    current_term TEXT NOT NULL DEFAULT 'First Term',
    current_session TEXT NOT NULL DEFAULT '2026/2027',
    banner_message TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_reg_no TEXT NOT NULL,
    subject TEXT NOT NULL,
    term TEXT NOT NULL,
    session TEXT NOT NULL,
    ca1 REAL DEFAULT 0,
    ca2 REAL DEFAULT 0,
    exam_score REAL DEFAULT 0,
    total REAL DEFAULT 0,
    grade TEXT,
    remark TEXT,
    uploaded_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS fee_structure (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_name TEXT NOT NULL,
    fee_type TEXT NOT NULL,
    amount REAL NOT NULL,
    term TEXT NOT NULL,
    session TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_reg_no TEXT NOT NULL,
    amount REAL NOT NULL,
    fee_type TEXT,
    term TEXT NOT NULL,
    session TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'PAID',
    flutterwave_ref TEXT,
    payment_date TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS student_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_reg_no TEXT NOT NULL UNIQUE,
    account_number TEXT,
    bank_name TEXT,
    flutterwave_ref TEXT
  );

  CREATE TABLE IF NOT EXISTS library_materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    file_type TEXT,
    file_data TEXT,
    file_name TEXT,
    class_name TEXT,
    uploaded_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    audience TEXT NOT NULL DEFAULT 'school',
    class_name TEXT,
    posted_by TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS announcement_reads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    announcement_id INTEGER NOT NULL,
    reader_reg_no TEXT NOT NULL,
    UNIQUE(announcement_id, reader_reg_no)
  );

  CREATE TABLE IF NOT EXISTS cbt_assessments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('test','exam')),
    title TEXT NOT NULL,
    class_name TEXT NOT NULL,
    subject TEXT,
    teacher_reg_no TEXT NOT NULL,
    time_limit_minutes INTEGER NOT NULL DEFAULT 30,
    anti_cheat INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'published',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cbt_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id INTEGER NOT NULL,
    question_text TEXT NOT NULL,
    option_a TEXT, option_b TEXT, option_c TEXT, option_d TEXT,
    correct_option TEXT NOT NULL,
    marks INTEGER NOT NULL DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS cbt_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    assessment_id INTEGER NOT NULL,
    student_reg_no TEXT NOT NULL,
    score REAL,
    tab_switch_count INTEGER NOT NULL DEFAULT 0,
    flagged INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'in_progress',
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    submitted_at TEXT,
    UNIQUE(assessment_id, student_reg_no)
  );

  CREATE TABLE IF NOT EXISTS cbt_answers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    attempt_id INTEGER NOT NULL,
    question_id INTEGER NOT NULL,
    selected_option TEXT,
    UNIQUE(attempt_id, question_id)
  );

  CREATE TABLE IF NOT EXISTS attendance_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_name TEXT NOT NULL,
    teacher_reg_no TEXT NOT NULL,
    code TEXT NOT NULL,
    session_date TEXT DEFAULT CURRENT_TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'open'
  );

  CREATE TABLE IF NOT EXISTS attendance_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL,
    student_reg_no TEXT NOT NULL,
    marked_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id, student_reg_no)
  );

  CREATE TABLE IF NOT EXISTS timetable (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_name TEXT NOT NULL,
    day_of_week TEXT NOT NULL,
    subject TEXT,
    teacher_reg_no TEXT,
    start_time TEXT,
    end_time TEXT
  );

  CREATE TABLE IF NOT EXISTS live_classes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    class_name TEXT NOT NULL,
    teacher_reg_no TEXT NOT NULL,
    code TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'live',
    started_at TEXT DEFAULT CURRENT_TIMESTAMP,
    ended_at TEXT
  );
`);

const settingsRow = db.prepare('SELECT id FROM settings WHERE id = 1').get();
if (!settingsRow) {
  db.prepare(
    `INSERT INTO settings (id, school_name, current_term, current_session, banner_message)
     VALUES (1, 'ZOE BLOSSOM ACADEMY', 'First Term', '2026/2027', 'Welcome to the new term!')`
  ).run();
}

module.exports = db;
