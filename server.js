/**
 * server.js
 * Serves the single index.html file, plus a small JSON API that page
 * talks to via fetch() for login, admin actions, and dashboard data.
 * Session cookie identifies the logged-in user on every request.
 */

require('dotenv').config();

const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);

const db = require('./db');

const app = express();
const PORT = process.env.PORT || process.env.APP_PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: path.join(__dirname, 'data') }),
  secret: process.env.SESSION_SECRET || 'change_this_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 2,
  },
}));

// ---------------------------------------------------------------------
// Ensure the admin account exists (from .env) on every server start
// ---------------------------------------------------------------------
(async () => {
  const adminRegNo = process.env.ADMIN_REG_NO;
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminRegNo && adminPassword) {
    const existing = db.prepare('SELECT id FROM users WHERE reg_no = ?').get(adminRegNo);
    if (!existing) {
      const hash = await bcrypt.hash(adminPassword, 10);
      db.prepare(
        `INSERT INTO users (role, reg_no, full_name, password_hash, status)
         VALUES ('admin', ?, 'Administrator', ?, 'active')`
      ).run(adminRegNo, hash);
      console.log(`Admin account created from .env: ${adminRegNo}`);
    }
  }
})();

// ---------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------
function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in.' });
  next();
}
function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not logged in.' });
    if (req.session.user.role !== role) return res.status(403).json({ error: 'Access denied.' });
    next();
  };
}

// ---------------------------------------------------------------------
// AUTH API
// ---------------------------------------------------------------------
app.post('/api/login', async (req, res) => {
  const { reg_no, password } = req.body;
  if (!reg_no || !password) {
    return res.status(400).json({ error: 'Please enter both Registration Number and Password.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE reg_no = ?').get(reg_no.trim());
  if (!user) return res.status(401).json({ error: 'Invalid Registration Number or Password.' });
  if (user.status !== 'active') return res.status(403).json({ error: 'This account has been suspended.' });

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) return res.status(401).json({ error: 'Invalid Registration Number or Password.' });

  req.session.regenerate((err) => {
    if (err) return res.status(500).json({ error: 'Something went wrong. Please try again.' });

    req.session.user = {
      id: user.id, role: user.role, full_name: user.full_name,
      reg_no: user.reg_no, class_name: user.class_name, subject: user.subject,
    };
    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    res.json({ user: req.session.user });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  res.json({ user: req.session.user || null });
});

// ---------------------------------------------------------------------
// ADMIN API
// ---------------------------------------------------------------------
app.get('/api/admin/stats', requireRole('admin'), (req, res) => {
  const studentCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='student'").get().c;
  const teacherCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='teacher'").get().c;
  res.json({ studentCount, teacherCount });
});

app.get('/api/admin/students', requireRole('admin'), (req, res) => {
  const students = db.prepare(
    "SELECT id, reg_no, full_name, class_name, status FROM users WHERE role='student' ORDER BY full_name"
  ).all();
  res.json({ students });
});

app.post('/api/admin/students', requireRole('admin'), async (req, res) => {
  const { reg_no, full_name, class_name, password } = req.body;
  if (!reg_no || !full_name || !password) {
    return res.status(400).json({ error: 'Registration Number, Full Name, and Password are required.' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    db.prepare(
      `INSERT INTO users (role, reg_no, full_name, class_name, password_hash, status)
       VALUES ('student', ?, ?, ?, ?, 'active')`
    ).run(reg_no.trim(), full_name, class_name || null, hash);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'That Registration Number already exists.' : 'Something went wrong.' });
  }
});

app.get('/api/admin/teachers', requireRole('admin'), (req, res) => {
  const teachers = db.prepare(
    "SELECT id, reg_no, full_name, subject, status FROM users WHERE role='teacher' ORDER BY full_name"
  ).all();
  res.json({ teachers });
});

app.post('/api/admin/teachers', requireRole('admin'), async (req, res) => {
  const { reg_no, full_name, subject, password } = req.body;
  if (!reg_no || !full_name || !password) {
    return res.status(400).json({ error: 'Registration Number, Full Name, and Password are required.' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    db.prepare(
      `INSERT INTO users (role, reg_no, full_name, subject, password_hash, status)
       VALUES ('teacher', ?, ?, ?, ?, 'active')`
    ).run(reg_no.trim(), full_name, subject || null, hash);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'That Registration Number already exists.' : 'Something went wrong.' });
  }
});

// ---------------------------------------------------------------------
// TEACHER API
// ---------------------------------------------------------------------
app.get('/api/teacher/students', requireRole('teacher'), (req, res) => {
  const students = db.prepare(
    "SELECT reg_no, full_name, class_name FROM users WHERE role='student' ORDER BY full_name"
  ).all();
  res.json({ students });
});

// ---------------------------------------------------------------------
// STUDENT API
// ---------------------------------------------------------------------
app.get('/api/student/me', requireRole('student'), (req, res) => {
  const info = db.prepare('SELECT reg_no, full_name, class_name FROM users WHERE id = ?').get(req.session.user.id);
  res.json({ info });
});

// ---------------------------------------------------------------------
// Serve the single-page app for everything else
// ---------------------------------------------------------------------
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Zoe Blossom Academy server running on port ${PORT}`);
});
