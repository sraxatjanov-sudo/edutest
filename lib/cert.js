// Sertifikatlar: yaxshi natija uchun avtomatik beriladi, kodi orqali istalgan kishi haqiqiyligini tekshira oladi
const crypto = require('node:crypto');
const db = require('../db');
const { pick } = require('./i18n');

// Chalkash belgilarsiz (0/O, 1/I yo'q) 10 belgili kod: EDU-XXXX-XXXX
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const rand = (n) => Array.from({ length: n }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join('');
const newCode = () => `EDU-${rand(4)}-${rand(4)}`;

// Yakunlangan urinish uchun (shartlar bajarilsa) sertifikat beradi. Qaytaradi: kod yoki null
function issueFor(attemptId) {
  const a = db.prepare(`SELECT a.id, a.user_id, a.status, a.percent, a.finish_reason, a.finished_at,
      t.title, t.i18n AS t_i18n, t.cert_percent, s.name AS subject, s.i18n AS s_i18n, u.name AS user_name, u.role
    FROM attempts a JOIN tests t ON t.id = a.test_id JOIN subjects s ON s.id = t.subject_id JOIN users u ON u.id = a.user_id
    WHERE a.id = ?`).get(attemptId);
  if (!a || a.status !== 'finished' || !a.cert_percent || a.percent < a.cert_percent || a.finish_reason === 'violations') return null;
  const existing = db.prepare('SELECT code FROM certificates WHERE attempt_id = ?').get(a.id);
  if (existing) return existing.code;
  const meta = {
    title: a.title, title_i18n: safeJson(a.t_i18n), subject: a.subject, subject_i18n: safeJson(a.s_i18n),
  };
  for (let i = 0; i < 5; i++) {
    const code = newCode();
    try {
      db.prepare('INSERT INTO certificates (code, attempt_id, user_id, name, meta, percent, issued_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(code, a.id, a.user_id, a.user_name, JSON.stringify(meta), a.percent, a.finished_at || Date.now());
      return code;
    } catch (e) { if (!String(e.message).includes('UNIQUE')) throw e; }
  }
  return null;
}

function safeJson(s) { try { return s ? JSON.parse(s) : null; } catch { return null; } }

// Talaba yoki tekshiruvchi uchun ko'rinish (joriy tilga moslab)
function view(row) {
  if (!row) return null;
  const m = safeJson(row.meta) || {};
  const tr = (obj, field, base) => pick(obj ? JSON.stringify(obj) : null, field, base);
  const mark = row.percent >= 86 ? 5 : row.percent >= 71 ? 4 : row.percent >= 56 ? 3 : 2;
  return {
    code: row.code, name: row.name, percent: row.percent, mark, issuedAt: row.issued_at, attemptId: row.attempt_id,
    test: tr(m.title_i18n, 'title', m.title), subject: tr(m.subject_i18n, 'name', m.subject),
  };
}

const byCode = (code) => view(db.prepare('SELECT * FROM certificates WHERE code = ?').get(String(code).toUpperCase().trim()));
const forAttempt = (id) => db.prepare('SELECT code FROM certificates WHERE attempt_id = ?').get(id)?.code || null;
const forUser = (uid) => db.prepare('SELECT * FROM certificates WHERE user_id = ? ORDER BY issued_at DESC').all(uid).map(view);

// Eski natijalar uchun ham sertifikat berish (yangi funksiya qo'shilganda bir marta)
function backfill() {
  const rows = db.prepare(`SELECT a.id FROM attempts a JOIN tests t ON t.id = a.test_id
    WHERE a.status = 'finished' AND t.cert_percent > 0 AND a.percent >= t.cert_percent AND a.finish_reason != 'violations'
      AND NOT EXISTS (SELECT 1 FROM certificates c WHERE c.attempt_id = a.id)`).all();
  for (const r of rows) issueFor(r.id);
  return rows.length;
}

module.exports = { issueFor, byCode, forAttempt, forUser, backfill };
