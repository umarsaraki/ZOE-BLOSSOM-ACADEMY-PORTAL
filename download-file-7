/**
 * server.js
 * Serves the single index.html file, plus a JSON API that page talks to
 * via fetch() for every feature: auth, admin, teacher, student.
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

app.use(express.json({ limit: '15mb' }));
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
    maxAge: 1000 * 60 * 60 * 4,
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
function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not logged in.' });
    if (req.session.user.role !== role) return res.status(403).json({ error: 'Access denied.' });
    next();
  };
}
function requireAnyLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in.' });
  next();
}
function genCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// =======================================================================
// AUTH
// =======================================================================
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

// =======================================================================
// SETTINGS (school name, logo, term, session, banner) — shared by all
// =======================================================================
app.get('/api/settings', requireAnyLogin, (req, res) => {
  const settings = db.prepare('SELECT * FROM settings WHERE id = 1').get();
  res.json({ settings });
});

app.put('/api/admin/settings', requireRole('admin'), (req, res) => {
  const { school_name, logo_data, current_term, current_session, banner_message } = req.body;
  db.prepare(
    `UPDATE settings SET school_name = ?, logo_data = COALESCE(?, logo_data),
     current_term = ?, current_session = ?, banner_message = ? WHERE id = 1`
  ).run(school_name, logo_data || null, current_term, current_session, banner_message || '');
  res.json({ ok: true });
});

// =======================================================================
// ADMIN — STATS
// =======================================================================
app.get('/api/admin/stats', requireRole('admin'), (req, res) => {
  const studentCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='student'").get().c;
  const teacherCount = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role='teacher'").get().c;
  const classCount = db.prepare('SELECT COUNT(*) AS c FROM classes').get().c;
  const totalPaid = db.prepare("SELECT COALESCE(SUM(amount),0) AS s FROM payments WHERE status='PAID'").get().s;
  res.json({ studentCount, teacherCount, classCount, totalPaid });
});

// =======================================================================
// ADMIN — STUDENTS
// =======================================================================
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

app.put('/api/admin/students/:id', requireRole('admin'), async (req, res) => {
  const { full_name, class_name, status, password } = req.body;
  const id = req.params.id;
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    db.prepare('UPDATE users SET full_name=?, class_name=?, status=?, password_hash=? WHERE id=? AND role="student"')
      .run(full_name, class_name || null, status || 'active', hash, id);
  } else {
    db.prepare('UPDATE users SET full_name=?, class_name=?, status=? WHERE id=? AND role="student"')
      .run(full_name, class_name || null, status || 'active', id);
  }
  res.json({ ok: true });
});

app.delete('/api/admin/students/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM users WHERE id=? AND role="student"').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/students/export', requireRole('admin'), (req, res) => {
  const students = db.prepare(
    "SELECT reg_no, full_name, class_name, status FROM users WHERE role='student' ORDER BY full_name"
  ).all();
  let csv = '\uFEFFReg No,Full Name,Class,Status\n';
  students.forEach(s => {
    csv += `"${s.reg_no}","${s.full_name}","${s.class_name || ''}","${s.status}"\n`;
  });
  res.setHeader('Content-Type', 'text/csv; charset=UTF-8');
  res.setHeader('Content-Disposition', `attachment; filename="students_${Date.now()}.csv"`);
  res.send(csv);
});

// =======================================================================
// ADMIN — TEACHERS
// =======================================================================
app.get('/api/admin/teachers', requireRole('admin'), (req, res) => {
  const teachers = db.prepare(
    "SELECT id, reg_no, full_name, subject, class_name, status FROM users WHERE role='teacher' ORDER BY full_name"
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

app.put('/api/admin/teachers/:id', requireRole('admin'), async (req, res) => {
  const { full_name, subject, status, password } = req.body;
  const id = req.params.id;
  if (password) {
    const hash = await bcrypt.hash(password, 10);
    db.prepare('UPDATE users SET full_name=?, subject=?, status=?, password_hash=? WHERE id=? AND role="teacher"')
      .run(full_name, subject || null, status || 'active', hash, id);
  } else {
    db.prepare('UPDATE users SET full_name=?, subject=?, status=? WHERE id=? AND role="teacher"')
      .run(full_name, subject || null, status || 'active', id);
  }
  res.json({ ok: true });
});

app.delete('/api/admin/teachers/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM users WHERE id=? AND role="teacher"').run(req.params.id);
  res.json({ ok: true });
});

app.post('/api/admin/teachers/:id/assign', requireRole('admin'), (req, res) => {
  const { class_name } = req.body;
  db.prepare('UPDATE users SET class_name=? WHERE id=? AND role="teacher"').run(class_name || null, req.params.id);
  const teacher = db.prepare('SELECT reg_no FROM users WHERE id=?').get(req.params.id);
  if (teacher && class_name) {
    db.prepare('UPDATE classes SET teacher_reg_no=? WHERE class_name=?').run(teacher.reg_no, class_name);
  }
  res.json({ ok: true });
});

// =======================================================================
// ADMIN — CLASSES
// =======================================================================
app.get('/api/classes', requireAnyLogin, (req, res) => {
  const classes = db.prepare('SELECT * FROM classes ORDER BY class_name').all();
  res.json({ classes });
});

app.post('/api/admin/classes', requireRole('admin'), (req, res) => {
  const { class_name } = req.body;
  if (!class_name) return res.status(400).json({ error: 'Class name is required.' });
  try {
    db.prepare('INSERT INTO classes (class_name) VALUES (?)').run(class_name.trim());
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message.includes('UNIQUE') ? 'That class already exists.' : 'Something went wrong.' });
  }
});

app.delete('/api/admin/classes/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM classes WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// =======================================================================
// RESULTS (admin views all, teacher uploads for own class, student views own)
// =======================================================================
app.get('/api/admin/results', requireRole('admin'), (req, res) => {
  const results = db.prepare('SELECT * FROM results ORDER BY created_at DESC').all();
  res.json({ results });
});

app.post('/api/teacher/results', requireRole('teacher'), (req, res) => {
  const { student_reg_no, subject, term, session, ca1, ca2, exam_score } = req.body;
  if (!student_reg_no || !subject) return res.status(400).json({ error: 'Student and subject are required.' });
  const total = (Number(ca1) || 0) + (Number(ca2) || 0) + (Number(exam_score) || 0);
  let grade = 'F';
  if (total >= 70) grade = 'A';
  else if (total >= 60) grade = 'B';
  else if (total >= 50) grade = 'C';
  else if (total >= 45) grade = 'D';
  else if (total >= 40) grade = 'E';

  db.prepare(
    `INSERT INTO results (student_reg_no, subject, term, session, ca1, ca2, exam_score, total, grade, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(student_reg_no, subject, term, session, ca1 || 0, ca2 || 0, exam_score || 0, total, grade, req.session.user.reg_no);
  res.json({ ok: true, total, grade });
});

app.get('/api/student/results', requireRole('student'), (req, res) => {
  const results = db.prepare('SELECT * FROM results WHERE student_reg_no = ? ORDER BY created_at DESC')
    .all(req.session.user.reg_no);
  res.json({ results });
});

// =======================================================================
// FEES
// =======================================================================
app.get('/api/admin/fees/structure', requireRole('admin'), (req, res) => {
  const rows = db.prepare('SELECT * FROM fee_structure ORDER BY class_name').all();
  res.json({ rows });
});

app.post('/api/admin/fees/structure', requireRole('admin'), (req, res) => {
  const { class_name, fee_type, amount, term, session } = req.body;
  if (!class_name || !fee_type || !amount) return res.status(400).json({ error: 'Class, fee type, and amount are required.' });
  db.prepare('INSERT INTO fee_structure (class_name, fee_type, amount, term, session) VALUES (?,?,?,?,?)')
    .run(class_name, fee_type, amount, term, session);
  res.json({ ok: true });
});

app.delete('/api/admin/fees/structure/:id', requireRole('admin'), (req, res) => {
  db.prepare('DELETE FROM fee_structure WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

app.get('/api/admin/fees/payments', requireRole('admin'), (req, res) => {
  const rows = db.prepare(
    `SELECT p.*, u.full_name, u.class_name FROM payments p
     LEFT JOIN users u ON u.reg_no = p.student_reg_no
     ORDER BY p.payment_date DESC`
  ).all();
  res.json({ rows });
});

app.post('/api/admin/fees/payments', requireRole('admin'), (req, res) => {
  const { student_reg_no, amount, fee_type, term, session, status } = req.body;
  if (!student_reg_no || !amount) return res.status(400).json({ error: 'Student and amount are required.' });
  db.prepare('INSERT INTO payments (student_reg_no, amount, fee_type, term, session, status) VALUES (?,?,?,?,?,?)')
    .run(student_reg_no, amount, fee_type || 'Tuition', term, session, status || 'PAID');
  res.json({ ok: true });
});

app.get('/api/student/fees', requireRole('student'), (req, res) => {
  const regNo = req.session.user.reg_no;
  const account = db.prepare('SELECT * FROM student_accounts WHERE student_reg_no=?').get(regNo);
  const history = db.prepare('SELECT * FROM payments WHERE student_reg_no=? ORDER BY payment_date DESC').all(regNo);
  const totalPaid = history.filter(h => h.status === 'PAID').reduce((s, h) => s + h.amount, 0);
  res.json({ account, history, totalPaid });
});

// Flutterwave: create a dedicated virtual account for a student (admin-triggered)
app.post('/api/admin/students/:regNo/create-virtual-account', requireRole('admin'), async (req, res) => {
  const regNo = req.params.regNo;
  const student = db.prepare("SELECT * FROM users WHERE reg_no=? AND role='student'").get(regNo);
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  const secretKey = process.env.FLW_SECRET_KEY;
  if (!secretKey) return res.status(400).json({ error: 'FLW_SECRET_KEY is not configured on the server.' });

  try {
    const txRef = `ZBA-${regNo}-${Date.now()}`;
    const response = await fetch('https://api.flutterwave.com/v3/virtual-account-numbers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: `${regNo.toLowerCase()}@zoeblossomacademy.com`,
        is_permanent: true,
        bvn: null,
        tx_ref: txRef,
        fullname: `ZOE BLOSSOM - ${student.full_name}`,
        narration: student.full_name,
      }),
    });
    const data = await response.json();
    if (data.status !== 'success') {
      return res.status(400).json({ error: data.message || 'Flutterwave could not create the account.' });
    }
    const accNo = data.data.account_number;
    const bankName = data.data.bank_name || 'Flutterwave Partner Bank';
    db.prepare(
      `INSERT INTO student_accounts (student_reg_no, account_number, bank_name, flutterwave_ref)
       VALUES (?,?,?,?)
       ON CONFLICT(student_reg_no) DO UPDATE SET account_number=excluded.account_number, bank_name=excluded.bank_name`
    ).run(regNo, accNo, bankName, txRef);
    res.json({ ok: true, account_number: accNo, bank_name: bankName });
  } catch (err) {
    console.error('Flutterwave error:', err.message);
    res.status(500).json({ error: 'Could not reach the payment provider.' });
  }
});

// Flutterwave webhook
app.post('/flutterwave/webhook', express.json(), async (req, res) => {
  const signature = req.headers['verif-hash'];
  const secretHash = process.env.FLW_SECRET_HASH;
  if (!signature || !secretHash || signature !== secretHash) {
    return res.status(401).json({ status: 'error', message: 'Invalid signature' });
  }
  const data = req.body.data || {};
  const accountNumber = data.account_number;
  const amount = parseFloat(data.amount || 0);
  if (!accountNumber || amount <= 0) return res.status(200).json({ status: 'ignored' });

  const account = db.prepare('SELECT * FROM student_accounts WHERE account_number=?').get(accountNumber);
  if (!account) return res.status(200).json({ status: 'ignored', reason: 'unknown account' });

  const settings = db.prepare('SELECT * FROM settings WHERE id=1').get();
  db.prepare('INSERT INTO payments (student_reg_no, amount, fee_type, term, session, status, flutterwave_ref) VALUES (?,?,?,?,?,?,?)')
    .run(account.student_reg_no, amount, 'Tuition', settings.current_term, settings.current_session, 'PAID', data.flw_ref || data.tx_ref || null);

  res.status(200).json({ status: 'success' });
});

// =======================================================================
// E-LIBRARY
// =======================================================================
app.get('/api/library', requireAnyLogin, (req, res) => {
  const user = req.session.user;
  let rows;
  if (user.role === 'student') {
    rows = db.prepare('SELECT id,title,description,file_type,file_name,class_name,uploaded_by,created_at FROM library_materials WHERE class_name IS NULL OR class_name=? ORDER BY created_at DESC').all(user.class_name);
  } else {
    rows = db.prepare('SELECT id,title,description,file_type,file_name,class_name,uploaded_by,created_at FROM library_materials ORDER BY created_at DESC').all();
  }
  res.json({ rows });
});

app.get('/api/library/:id/file', requireAnyLogin, (req, res) => {
  const row = db.prepare('SELECT file_data, file_name FROM library_materials WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).send('Not found');
  res.json({ file_data: row.file_data, file_name: row.file_name });
});

app.post('/api/teacher/library', requireRole('teacher'), (req, res) => {
  const { title, description, file_type, file_data, file_name } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  db.prepare(
    `INSERT INTO library_materials (title, description, file_type, file_data, file_name, class_name, uploaded_by)
     VALUES (?,?,?,?,?,?,?)`
  ).run(title, description || '', file_type || 'other', file_data || null, file_name || null, req.session.user.class_name, req.session.user.reg_no);
  res.json({ ok: true });
});

app.post('/api/admin/library', requireRole('admin'), (req, res) => {
  const { title, description, file_type, file_data, file_name, class_name } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required.' });
  db.prepare(
    `INSERT INTO library_materials (title, description, file_type, file_data, file_name, class_name, uploaded_by)
     VALUES (?,?,?,?,?,?,?)`
  ).run(title, description || '', file_type || 'other', file_data || null, file_name || null, class_name || null, req.session.user.reg_no);
  res.json({ ok: true });
});

app.delete('/api/library/:id', requireAnyLogin, (req, res) => {
  if (req.session.user.role === 'student') return res.status(403).json({ error: 'Access denied.' });
  db.prepare('DELETE FROM library_materials WHERE id=?').run(req.params.id);
  res.json({ ok: true });
});

// =======================================================================
// ANNOUNCEMENTS
// =======================================================================
app.get('/api/announcements', requireAnyLogin, (req, res) => {
  const user = req.session.user;
  let rows;
  if (user.role === 'student' || user.role === 'teacher') {
    rows = db.prepare(
      "SELECT * FROM announcements WHERE audience='school' OR class_name=? ORDER BY created_at DESC"
    ).all(user.class_name || '');
  } else {
    rows = db.prepare('SELECT * FROM announcements ORDER BY created_at DESC').all();
  }
  const unreadCount = user.role === 'student'
    ? rows.filter(a => !db.prepare('SELECT 1 FROM announcement_reads WHERE announcement_id=? AND reader_reg_no=?').get(a.id, user.reg_no)).length
    : 0;
  res.json({ rows, unreadCount });
});

app.post('/api/announcements/:id/read', requireAnyLogin, (req, res) => {
  db.prepare('INSERT OR IGNORE INTO announcement_reads (announcement_id, reader_reg_no) VALUES (?,?)')
    .run(req.params.id, req.session.user.reg_no);
  res.json({ ok: true });
});

app.post('/api/admin/announcements', requireRole('admin'), (req, res) => {
  const { title, message } = req.body;
  if (!title || !message) return res.status(400).json({ error: 'Title and message are required.' });
  db.prepare('INSERT INTO announcements (title, message, audience, posted_by) VALUES (?,?,"school",?)')
    .run(title, message, req.session.user.reg_no);
  res.json({ ok: true });
});

app.post('/api/teacher/announcements', requireRole('teacher'), (req, res) => {
  const { title, message } = req.body;
  const user = req.session.user;
  if (!title || !message) return res.status(400).json({ error: 'Title and message are required.' });
  if (!user.class_name) return res.status(400).json({ error: 'You are not assigned to a class yet.' });
  db.prepare('INSERT INTO announcements (title, message, audience, class_name, posted_by) VALUES (?,?,"class",?,?)')
    .run(title, message, user.class_name, user.reg_no);
  res.json({ ok: true });
});

// =======================================================================
// CBT — TESTS & EXAMS
// =======================================================================
app.get('/api/admin/cbt', requireRole('admin'), (req, res) => {
  const rows = db.prepare('SELECT * FROM cbt_assessments ORDER BY created_at DESC').all();
  res.json({ rows });
});

app.post('/api/teacher/cbt', requireRole('teacher'), (req, res) => {
  const { type, title, time_limit_minutes, anti_cheat, questions } = req.body;
  const user = req.session.user;
  if (!type || !title || !questions || !questions.length) {
    return res.status(400).json({ error: 'Title and at least one question are required.' });
  }
  if (!user.class_name) return res.status(400).json({ error: 'You are not assigned to a class yet.' });

  const info = db.prepare(
    `INSERT INTO cbt_assessments (type, title, class_name, subject, teacher_reg_no, time_limit_minutes, anti_cheat)
     VALUES (?,?,?,?,?,?,?)`
  ).run(type, title, user.class_name, user.subject || '', user.reg_no, time_limit_minutes || 30, anti_cheat ? 1 : 0);

  const assessmentId = info.lastInsertRowid;
  const insertQ = db.prepare(
    `INSERT INTO cbt_questions (assessment_id, question_text, option_a, option_b, option_c, option_d, correct_option, marks)
     VALUES (?,?,?,?,?,?,?,?)`
  );
  questions.forEach(q => {
    insertQ.run(assessmentId, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.marks || 1);
  });

  res.json({ ok: true, id: assessmentId });
});

app.get('/api/teacher/cbt', requireRole('teacher'), (req, res) => {
  const rows = db.prepare('SELECT * FROM cbt_assessments WHERE teacher_reg_no=? ORDER BY created_at DESC').all(req.session.user.reg_no);
  res.json({ rows });
});

app.get('/api/student/cbt', requireRole('student'), (req, res) => {
  const user = req.session.user;
  const rows = db.prepare(
    `SELECT a.*, (SELECT status FROM cbt_attempts WHERE assessment_id=a.id AND student_reg_no=?) AS my_status,
     (SELECT score FROM cbt_attempts WHERE assessment_id=a.id AND student_reg_no=?) AS my_score
     FROM cbt_assessments a WHERE a.class_name=? AND a.status='published' ORDER BY a.created_at DESC`
  ).all(user.reg_no, user.reg_no, user.class_name);
  res.json({ rows });
});

app.get('/api/student/cbt/:id/start', requireRole('student'), (req, res) => {
  const assessment = db.prepare('SELECT * FROM cbt_assessments WHERE id=?').get(req.params.id);
  if (!assessment) return res.status(404).json({ error: 'Not found.' });
  const user = req.session.user;

  let attempt = db.prepare('SELECT * FROM cbt_attempts WHERE assessment_id=? AND student_reg_no=?').get(assessment.id, user.reg_no);
  if (!attempt) {
    const info = db.prepare('INSERT INTO cbt_attempts (assessment_id, student_reg_no) VALUES (?,?)').run(assessment.id, user.reg_no);
    attempt = db.prepare('SELECT * FROM cbt_attempts WHERE id=?').get(info.lastInsertRowid);
  }
  if (attempt.status === 'submitted') {
    return res.json({ assessment, attempt, questions: [], alreadySubmitted: true });
  }
  const questions = db.prepare('SELECT id, question_text, option_a, option_b, option_c, option_d FROM cbt_questions WHERE assessment_id=?').all(assessment.id);
  res.json({ assessment, attempt, questions, alreadySubmitted: false });
});

app.post('/api/student/cbt/:id/flag', requireRole('student'), (req, res) => {
  const user = req.session.user;
  db.prepare('UPDATE cbt_attempts SET tab_switch_count = tab_switch_count + 1, flagged = 1 WHERE assessment_id=? AND student_reg_no=?')
    .run(req.params.id, user.reg_no);
  res.json({ ok: true });
});

app.post('/api/student/cbt/:id/submit', requireRole('student'), (req, res) => {
  const { answers } = req.body; // { question_id: selected_option }
  const user = req.session.user;
  const assessmentId = req.params.id;

  const attempt = db.prepare('SELECT * FROM cbt_attempts WHERE assessment_id=? AND student_reg_no=?').get(assessmentId, user.reg_no);
  if (!attempt || attempt.status === 'submitted') return res.status(400).json({ error: 'Already submitted or not started.' });

  const questions = db.prepare('SELECT * FROM cbt_questions WHERE assessment_id=?').all(assessmentId);
  let score = 0;
  const insertAns = db.prepare('INSERT OR REPLACE INTO cbt_answers (attempt_id, question_id, selected_option) VALUES (?,?,?)');
  questions.forEach(q => {
    const selected = (answers && answers[q.id]) || null;
    insertAns.run(attempt.id, q.id, selected);
    if (selected && selected === q.correct_option) score += q.marks;
  });

  db.prepare('UPDATE cbt_attempts SET score=?, status="submitted", submitted_at=CURRENT_TIMESTAMP WHERE id=?').run(score, attempt.id);
  res.json({ ok: true, score });
});

// =======================================================================
// ATTENDANCE
// =======================================================================
app.get('/api/teacher/attendance/today', requireRole('teacher'), (req, res) => {
  const rows = db.prepare(
    `SELECT s.*, (SELECT COUNT(*) FROM attendance_records r WHERE r.session_id=s.id) AS marked_count,
     (SELECT COUNT(*) FROM users u WHERE u.class_name=s.class_name AND u.role='student') AS total_count
     FROM attendance_sessions s WHERE s.teacher_reg_no=? AND date(s.session_date)=date('now') ORDER BY s.session_date DESC`
  ).all(req.session.user.reg_no);
  res.json({ rows });
});

app.post('/api/teacher/attendance/open', requireRole('teacher'), (req, res) => {
  const user = req.session.user;
  if (!user.class_name) return res.status(400).json({ error: 'You are not assigned to a class yet.' });
  const code = genCode();
  db.prepare('INSERT INTO attendance_sessions (class_name, teacher_reg_no, code) VALUES (?,?,?)')
    .run(user.class_name, user.reg_no, code);
  res.json({ ok: true, code });
});

app.post('/api/teacher/attendance/:id/close', requireRole('teacher'), (req, res) => {
  db.prepare('UPDATE attendance_sessions SET status="closed" WHERE id=? AND teacher_reg_no=?')
    .run(req.params.id, req.session.user.reg_no);
  res.json({ ok: true });
});

app.post('/api/student/attendance/submit', requireRole('student'), (req, res) => {
  const { code } = req.body;
  const user = req.session.user;
  const session_ = db.prepare("SELECT * FROM attendance_sessions WHERE code=? AND status='open'").get((code || '').toUpperCase().trim());
  if (!session_) return res.status(400).json({ error: 'Invalid or expired code.' });
  if (session_.class_name !== user.class_name) return res.status(400).json({ error: 'This code is not for your class.' });
  db.prepare('INSERT OR IGNORE INTO attendance_records (session_id, student_reg_no) VALUES (?,?)').run(session_.id, user.reg_no);
  res.json({ ok: true });
});

app.get('/api/student/attendance/history', requireRole('student'), (req, res) => {
  const rows = db.prepare(
    `SELECT s.session_date, s.class_name FROM attendance_records r
     JOIN attendance_sessions s ON s.id=r.session_id WHERE r.student_reg_no=? ORDER BY s.session_date DESC LIMIT 30`
  ).all(req.session.user.reg_no);
  res.json({ rows });
});

app.get('/api/admin/attendance/report', requireRole('admin'), (req, res) => {
  const rows = db.prepare(
    `SELECT class_name, strftime('%Y-%m', session_date) AS month, COUNT(DISTINCT id) AS sessions
     FROM attendance_sessions GROUP BY class_name, month ORDER BY month DESC`
  ).all();
  res.json({ rows });
});

// =======================================================================
// TIMETABLE
// =======================================================================
app.get('/api/timetable', requireAnyLogin, (req, res) => {
  const user = req.session.user;
  const className = req.query.class_name || user.class_name;
  const rows = db.prepare('SELECT * FROM timetable WHERE class_name=? ORDER BY day_of_week, start_time').all(className);
  res.json({ rows });
});

app.post('/api/teacher/timetable', requireRole('teacher'), (req, res) => {
  const { day_of_week, subject, start_time, end_time } = req.body;
  const user = req.session.user;
  if (!user.class_name) return res.status(400).json({ error: 'You are not assigned to a class yet.' });
  db.prepare('INSERT INTO timetable (class_name, day_of_week, subject, teacher_reg_no, start_time, end_time) VALUES (?,?,?,?,?,?)')
    .run(user.class_name, day_of_week, subject, user.reg_no, start_time, end_time);
  res.json({ ok: true });
});

app.delete('/api/teacher/timetable/:id', requireRole('teacher'), (req, res) => {
  db.prepare('DELETE FROM timetable WHERE id=? AND teacher_reg_no=?').run(req.params.id, req.session.user.reg_no);
  res.json({ ok: true });
});

// =======================================================================
// LIVE CLASS
// =======================================================================
app.post('/api/teacher/live/start', requireRole('teacher'), (req, res) => {
  const user = req.session.user;
  if (!user.class_name) return res.status(400).json({ error: 'You are not assigned to a class yet.' });
  const code = genCode();
  const info = db.prepare('INSERT INTO live_classes (class_name, teacher_reg_no, code) VALUES (?,?,?)')
    .run(user.class_name, user.reg_no, code);
  res.json({ ok: true, id: info.lastInsertRowid, code });
});

app.post('/api/teacher/live/:id/end', requireRole('teacher'), (req, res) => {
  db.prepare('UPDATE live_classes SET status="ended", ended_at=CURRENT_TIMESTAMP WHERE id=? AND teacher_reg_no=?')
    .run(req.params.id, req.session.user.reg_no);
  res.json({ ok: true });
});

app.get('/api/live/active', requireAnyLogin, (req, res) => {
  const user = req.session.user;
  const className = user.class_name;
  const row = db.prepare("SELECT * FROM live_classes WHERE class_name=? AND status='live' ORDER BY started_at DESC LIMIT 1").get(className);
  res.json({ row: row || null });
});

// =======================================================================
// Serve the single-page app for everything else
// =======================================================================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Zoe Blossom Academy server running on port ${PORT}`);
});
