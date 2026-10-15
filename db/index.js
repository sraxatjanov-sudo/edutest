// Ma'lumotlar bazasi ulanishi va sxemasi (Node.js ichidagi SQLite)
const { DatabaseSync } = require('node:sqlite');
const file = require('./file');
const db = new DatabaseSync(file);

db.exec(`
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),
  group_name TEXT,
  is_blocked INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login INTEGER
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT 'book',
  color TEXT NOT NULL DEFAULT '#1F4FA3',
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  options TEXT NOT NULL,
  correct INTEGER NOT NULL,
  explanation TEXT,
  difficulty INTEGER NOT NULL DEFAULT 2 CHECK (difficulty BETWEEN 1 AND 3),
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_questions_subject ON questions(subject_id);

CREATE TABLE IF NOT EXISTS tests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  question_count INTEGER NOT NULL DEFAULT 20,
  time_limit INTEGER NOT NULL DEFAULT 20,
  difficulty INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 0,
  max_violations INTEGER NOT NULL DEFAULT 3,
  show_review INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  test_id INTEGER NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
  started_at INTEGER NOT NULL,
  deadline INTEGER NOT NULL,
  finished_at INTEGER,
  finish_reason TEXT,
  score INTEGER,
  total INTEGER NOT NULL,
  percent INTEGER,
  violations INTEGER NOT NULL DEFAULT 0,
  ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_test ON attempts(test_id);

CREATE TABLE IF NOT EXISTS attempt_items (
  attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  option_order TEXT NOT NULL,
  chosen INTEGER,
  flagged INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (attempt_id, position)
);

CREATE TABLE IF NOT EXISTS violations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attempt_id INTEGER NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_violations_attempt ON violations(attempt_id);

-- Rasmlar (savol rasmlari va profil rasmlari). Kalit — tasodifiy, taxmin qilib bo'lmaydigan matn
CREATE TABLE IF NOT EXISTS images (
  key TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  size INTEGER NOT NULL,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);

-- Guruhlar / sinflar: o'qituvchi yaratadi, talabalar kod orqali qo'shiladi
CREATE TABLE IF NOT EXISTS groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  teacher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS group_members (
  group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON group_members(user_id);

-- Sertifikatlar: berilgan paytdagi ma'lumotlar nusxasi saqlanadi (test o'zgarsa ham sertifikat o'zgarmaydi)
CREATE TABLE IF NOT EXISTS certificates (
  code TEXT PRIMARY KEY,
  attempt_id INTEGER NOT NULL UNIQUE REFERENCES attempts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  meta TEXT NOT NULL,
  percent INTEGER NOT NULL,
  issued_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cert_user ON certificates(user_id);
`);

// Migratsiya: eski bazalarga yangi ustunlarni qo'shish
function addColumn(table, column, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
}
addColumn('subjects', 'i18n', 'TEXT');
addColumn('tests', 'i18n', 'TEXT');
addColumn('questions', 'i18n', 'TEXT');
// v3: rasmlar, guruhlar, jadval, sertifikatlar
addColumn('questions', 'image', 'TEXT');
addColumn('users', 'avatar', 'TEXT');
addColumn('tests', 'group_id', 'INTEGER REFERENCES groups(id) ON DELETE SET NULL');
addColumn('tests', 'opens_at', 'INTEGER');
addColumn('tests', 'closes_at', 'INTEGER');
addColumn('tests', 'cert_percent', 'INTEGER NOT NULL DEFAULT 0');

// tr(i18n, 'maydon', asosiy_qiymat) — so'rovdagi joriy tilga mos tarjimani qaytaradi
const { pick } = require('../lib/i18n');
db.function('tr', { deterministic: false }, (i18n, field, base) => pick(i18n, field, base));

// Tranzaksiya yordamchisi
db.tx = (fn) => {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
};

module.exports = db;
