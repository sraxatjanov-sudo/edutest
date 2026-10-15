// Boshqaruv paneli: o'qituvchi (teacher) va administrator (admin) uchun
const db = require('../db');
const v = require('../lib/validate');
const exam = require('../lib/exam');
const session = require('../lib/session');
const { send, HttpError, SECURITY_HEADERS } = require('../lib/http');

const STAFF = { roles: ['teacher', 'admin'] };
const ADMIN = { roles: ['admin'] };
const PAGE = 25;

const page = (query) => Math.max(1, Number(query.get('page')) || 1);
const like = (s) => `%${String(s || '').replace(/[%_\\]/g, '\\$&')}%`;

function subjectInput(body) {
  const name = v.str(body.name, 'Fan nomi', { min: 2, max: 60 });
  const slug = v.str(body.slug || name, 'Qisqa nom', { min: 2, max: 40 }).toLowerCase()
    .replace(/[ʻʼ'`]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) throw new HttpError(400, 'Qisqa nom faqat lotin harflari va raqamlardan iborat bo\'lsin');
  const color = /^#[0-9a-fA-F]{6}$/.test(body.color || '') ? body.color : '#1F4FA3';
  const icon = ['sigma', 'atom', 'flask', 'leaf', 'quill', 'globe-text', 'column', 'compass', 'chip', 'code', 'book'].includes(body.icon) ? body.icon : 'book';
  return { name, slug, color, icon, description: v.str(body.description, 'Tavsif', { max: 300, required: false }) || null };
}

function testInput(body) {
  const subject_id = v.int(body.subject_id, 'Fan', { min: 1 });
  if (!db.prepare('SELECT 1 FROM subjects WHERE id = ?').get(subject_id)) throw new HttpError(400, 'Fan topilmadi');
  return {
    subject_id,
    title: v.str(body.title, 'Test nomi', { min: 3, max: 120 }),
    description: v.str(body.description, 'Tavsif', { max: 400, required: false }) || null,
    question_count: v.int(body.question_count, 'Savollar soni', { min: 1, max: 200 }),
    time_limit: v.int(body.time_limit, 'Vaqt', { min: 1, max: 240 }),
    difficulty: v.int(body.difficulty ?? 0, 'Qiyinlik', { min: 0, max: 3 }),
    max_attempts: v.int(body.max_attempts ?? 0, 'Urinishlar soni', { min: 0, max: 100 }),
    max_violations: v.int(body.max_violations ?? 3, 'Qoidabuzarlik chegarasi', { min: 0, max: 50 }),
    show_review: v.bool(body.show_review),
    is_active: v.bool(body.is_active),
  };
}

// "Savol / +to'g'ri / -noto'g'ri / ?izoh" formatidagi matnni o'qish
function parseImport(text) {
  const blocks = String(text || '').replace(/\r/g, '').split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  if (!blocks.length) throw new HttpError(400, 'Import uchun matn bo\'sh');
  if (blocks.length > 500) throw new HttpError(400, 'Bir martada 500 tagacha savol import qilish mumkin');
  return blocks.map((b, i) => {
    const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
    const q = { text: lines[0], options: [], correct: -1, explanation: '', difficulty: 2 };
    for (const l of lines.slice(1)) {
      if (l.startsWith('+')) { q.correct = q.options.length; q.options.push(l.slice(1).trim()); }
      else if (l.startsWith('-')) q.options.push(l.slice(1).trim());
      else if (l.startsWith('?')) q.explanation = l.slice(1).trim();
      else if (/^!\s*[123]$/.test(l)) q.difficulty = Number(l.slice(1));
      else throw new HttpError(400, `${i + 1}-blok: "${l.slice(0, 30)}" qatori +, -, ? yoki ! bilan boshlanishi kerak`);
    }
    if (q.correct < 0) throw new HttpError(400, `${i + 1}-blok: to'g'ri javob "+" bilan belgilanmagan`);
    return v.question(q, i);
  });
}

const csvCell = (x) => {
  const s = String(x ?? '');
  return /[",\n;]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s;
};

module.exports = (r) => {
  // ---------- Umumiy ko'rinish ----------
  r.get('/api/admin/overview', ({ res }) => {
    const one = (sql, ...a) => db.prepare(sql).get(...a).c;
    const day = 864e5;
    const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
    const from = startToday.getTime() - 13 * day;
    const perDay = db.prepare(`SELECT finished_at FROM attempts WHERE status = 'finished' AND finished_at >= ?`).all(from);
    const days = Array.from({ length: 14 }, (_, i) => ({ date: from + i * day, count: 0 }));
    for (const p of perDay) { const i = Math.floor((p.finished_at - from) / day); if (days[i]) days[i].count++; }
    send(res, 200, {
      counts: {
        students: one("SELECT COUNT(*) AS c FROM users WHERE role = 'student'"),
        questions: one('SELECT COUNT(*) AS c FROM questions WHERE archived = 0'),
        tests: one('SELECT COUNT(*) AS c FROM tests'),
        attempts: one("SELECT COUNT(*) AS c FROM attempts WHERE status = 'finished'"),
        active: one("SELECT COUNT(*) AS c FROM attempts WHERE status = 'active' AND deadline > ?", Date.now()),
        avg: one("SELECT COALESCE(ROUND(AVG(percent)), 0) AS c FROM attempts WHERE status = 'finished'"),
        flagged: one("SELECT COUNT(*) AS c FROM attempts WHERE violations > 0"),
      },
      days,
      bySubject: db.prepare(`SELECT s.name, s.color, COUNT(a.id) AS attempts, ROUND(AVG(a.percent)) AS avg
        FROM subjects s LEFT JOIN tests t ON t.subject_id = s.id LEFT JOIN attempts a ON a.test_id = t.id AND a.status = 'finished'
        GROUP BY s.id ORDER BY s.sort`).all(),
      recentViolations: db.prepare(`SELECT v.type, v.created_at, a.id AS attempt_id, u.name, t.title FROM violations v
        JOIN attempts a ON a.id = v.attempt_id JOIN users u ON u.id = a.user_id JOIN tests t ON t.id = a.test_id
        ORDER BY v.id DESC LIMIT 8`).all().map((x) => ({ ...x, label: exam.VIOLATION_TYPES[x.type] || x.type })),
      hardest: db.prepare(`SELECT q.id, q.text, s.name AS subject, COUNT(*) AS shown,
          ROUND(100.0 * SUM(CASE WHEN json_extract(ai.option_order, '$[' || ai.chosen || ']') = q.correct THEN 1 ELSE 0 END) / COUNT(*)) AS rate
        FROM attempt_items ai JOIN attempts a ON a.id = ai.attempt_id AND a.status = 'finished'
        JOIN questions q ON q.id = ai.question_id JOIN subjects s ON s.id = q.subject_id
        GROUP BY q.id HAVING shown >= 3 ORDER BY rate ASC LIMIT 6`).all(),
    });
  }, STAFF);

  // ---------- Fanlar ----------
  r.get('/api/admin/subjects', ({ res }) => {
    send(res, 200, { subjects: db.prepare(`SELECT s.*, (SELECT COUNT(*) FROM questions q WHERE q.subject_id = s.id AND q.archived = 0) AS question_count,
      (SELECT COUNT(*) FROM tests t WHERE t.subject_id = s.id) AS test_count FROM subjects s ORDER BY s.sort, s.name`).all() });
  }, STAFF);

  r.post('/api/admin/subjects', ({ res, body }) => {
    const s = subjectInput(body);
    if (db.prepare('SELECT 1 FROM subjects WHERE slug = ?').get(s.slug)) throw new HttpError(409, 'Bunday qisqa nomli fan mavjud');
    const sort = db.prepare('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM subjects').get().n;
    const id = Number(db.prepare('INSERT INTO subjects (slug, name, description, icon, color, sort) VALUES (?, ?, ?, ?, ?, ?)')
      .run(s.slug, s.name, s.description, s.icon, s.color, sort).lastInsertRowid);
    send(res, 201, { id });
  }, STAFF);

  r.put('/api/admin/subjects/:id', ({ res, body, params }) => {
    const s = subjectInput(body);
    const clash = db.prepare('SELECT id FROM subjects WHERE slug = ? AND id != ?').get(s.slug, Number(params.id));
    if (clash) throw new HttpError(409, 'Bunday qisqa nomli fan mavjud');
    const r2 = db.prepare('UPDATE subjects SET slug = ?, name = ?, description = ?, icon = ?, color = ? WHERE id = ?')
      .run(s.slug, s.name, s.description, s.icon, s.color, Number(params.id));
    if (!r2.changes) throw new HttpError(404, 'Fan topilmadi');
    send(res, 200, { ok: true });
  }, STAFF);

  r.delete('/api/admin/subjects/:id', ({ res, params }) => {
    if (!db.prepare('DELETE FROM subjects WHERE id = ?').run(Number(params.id)).changes) throw new HttpError(404, 'Fan topilmadi');
    send(res, 200, { ok: true });
  }, ADMIN);

  // ---------- Savollar banki ----------
  r.get('/api/admin/questions', ({ res, query }) => {
    const sid = Number(query.get('subject')) || 0;
    const diff = Number(query.get('difficulty')) || 0;
    const q = query.get('q') || '';
    const archived = query.get('archived') === '1' ? 1 : 0;
    const where = `WHERE q.archived = ? AND (? = 0 OR q.subject_id = ?) AND (? = 0 OR q.difficulty = ?) AND (q.text LIKE ? ESCAPE '\\' OR q.options LIKE ? ESCAPE '\\')`;
    const args = [archived, sid, sid, diff, diff, like(q), like(q)];
    const total = db.prepare(`SELECT COUNT(*) AS c FROM questions q ${where}`).get(...args).c;
    const p = page(query);
    const rows = db.prepare(`SELECT q.id, q.subject_id, q.text, q.options, q.correct, q.explanation, q.difficulty, q.archived, s.name AS subject, s.color,
        (SELECT COUNT(*) FROM attempt_items ai WHERE ai.question_id = q.id) AS used
      FROM questions q JOIN subjects s ON s.id = q.subject_id ${where} ORDER BY q.id DESC LIMIT ? OFFSET ?`)
      .all(...args, PAGE, (p - 1) * PAGE).map((x) => ({ ...x, options: JSON.parse(x.options) }));
    send(res, 200, { questions: rows, total, page: p, pages: Math.max(1, Math.ceil(total / PAGE)) });
  }, STAFF);

  r.post('/api/admin/questions', ({ res, body }) => {
    const sid = v.int(body.subject_id, 'Fan', { min: 1 });
    if (!db.prepare('SELECT 1 FROM subjects WHERE id = ?').get(sid)) throw new HttpError(400, 'Fan topilmadi');
    const q = v.question(body);
    const id = Number(db.prepare('INSERT INTO questions (subject_id, text, options, correct, explanation, difficulty, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(sid, q.text, JSON.stringify(q.options), q.correct, q.explanation, q.difficulty, Date.now()).lastInsertRowid);
    send(res, 201, { id });
  }, STAFF);

  r.put('/api/admin/questions/:id', ({ res, body, params }) => {
    const id = Number(params.id);
    const old = db.prepare('SELECT * FROM questions WHERE id = ?').get(id);
    if (!old) throw new HttpError(404, 'Savol topilmadi');
    const sid = v.int(body.subject_id, 'Fan', { min: 1 });
    const q = v.question(body);
    const used = db.prepare('SELECT COUNT(*) AS c FROM attempt_items WHERE question_id = ?').get(id).c;
    // Ishlatilgan savolda variantlar soni o'zgarsa, eski natijalar buzilmasligi uchun yangi savol yaratib, eskisini arxivlaymiz
    if (used && JSON.parse(old.options).length !== q.options.length) {
      db.tx(() => {
        db.prepare('UPDATE questions SET archived = 1 WHERE id = ?').run(id);
        db.prepare('INSERT INTO questions (subject_id, text, options, correct, explanation, difficulty, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .run(sid, q.text, JSON.stringify(q.options), q.correct, q.explanation, q.difficulty, Date.now());
      });
      return send(res, 200, { ok: true, replaced: true });
    }
    db.prepare('UPDATE questions SET subject_id = ?, text = ?, options = ?, correct = ?, explanation = ?, difficulty = ? WHERE id = ?')
      .run(sid, q.text, JSON.stringify(q.options), q.correct, q.explanation, q.difficulty, id);
    send(res, 200, { ok: true });
  }, STAFF);

  r.patch('/api/admin/questions/:id/archive', ({ res, body, params }) => {
    const n = db.prepare('UPDATE questions SET archived = ? WHERE id = ?').run(v.bool(body.archived), Number(params.id)).changes;
    if (!n) throw new HttpError(404, 'Savol topilmadi');
    send(res, 200, { ok: true });
  }, STAFF);

  r.delete('/api/admin/questions/:id', ({ res, params }) => {
    const id = Number(params.id);
    const used = db.prepare('SELECT COUNT(*) AS c FROM attempt_items WHERE question_id = ?').get(id).c;
    if (used) throw new HttpError(409, 'Bu savol talabalar natijalarida ishlatilgan. O\'chirish o\'rniga arxivlang');
    if (!db.prepare('DELETE FROM questions WHERE id = ?').run(id).changes) throw new HttpError(404, 'Savol topilmadi');
    send(res, 200, { ok: true });
  }, STAFF);

  r.post('/api/admin/questions/import', ({ res, body }) => {
    const sid = v.int(body.subject_id, 'Fan', { min: 1 });
    if (!db.prepare('SELECT 1 FROM subjects WHERE id = ?').get(sid)) throw new HttpError(400, 'Fan topilmadi');
    const list = parseImport(body.text);
    if (body.dryRun) return send(res, 200, { count: list.length, preview: list.slice(0, 3) });
    const ins = db.prepare('INSERT INTO questions (subject_id, text, options, correct, explanation, difficulty, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const now = Date.now();
    db.tx(() => { for (const q of list) ins.run(sid, q.text, JSON.stringify(q.options), q.correct, q.explanation, q.difficulty, now); });
    send(res, 201, { count: list.length });
  }, STAFF);

  // ---------- Testlar ----------
  r.get('/api/admin/tests', ({ res }) => {
    send(res, 200, { tests: db.prepare(`SELECT t.*, s.name AS subject, s.color,
        (SELECT COUNT(*) FROM questions q WHERE q.subject_id = t.subject_id AND q.archived = 0 AND (t.difficulty = 0 OR q.difficulty = t.difficulty)) AS pool,
        (SELECT COUNT(*) FROM attempts a WHERE a.test_id = t.id AND a.status = 'finished') AS attempts,
        (SELECT ROUND(AVG(percent)) FROM attempts a WHERE a.test_id = t.id AND a.status = 'finished') AS avg
      FROM tests t JOIN subjects s ON s.id = t.subject_id ORDER BY s.sort, t.id`).all() });
  }, STAFF);

  r.post('/api/admin/tests', ({ res, body }) => {
    const t = testInput(body);
    const id = Number(db.prepare(`INSERT INTO tests (subject_id, title, description, question_count, time_limit, difficulty, max_attempts,
      max_violations, show_review, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(t.subject_id, t.title, t.description, t.question_count, t.time_limit, t.difficulty, t.max_attempts, t.max_violations,
        t.show_review, t.is_active, Date.now()).lastInsertRowid);
    send(res, 201, { id });
  }, STAFF);

  r.put('/api/admin/tests/:id', ({ res, body, params }) => {
    const t = testInput(body);
    const n = db.prepare(`UPDATE tests SET subject_id = ?, title = ?, description = ?, question_count = ?, time_limit = ?, difficulty = ?,
      max_attempts = ?, max_violations = ?, show_review = ?, is_active = ? WHERE id = ?`)
      .run(t.subject_id, t.title, t.description, t.question_count, t.time_limit, t.difficulty, t.max_attempts, t.max_violations,
        t.show_review, t.is_active, Number(params.id)).changes;
    if (!n) throw new HttpError(404, 'Test topilmadi');
    send(res, 200, { ok: true });
  }, STAFF);

  r.delete('/api/admin/tests/:id', ({ res, params }) => {
    if (!db.prepare('DELETE FROM tests WHERE id = ?').run(Number(params.id)).changes) throw new HttpError(404, 'Test topilmadi');
    send(res, 200, { ok: true });
  }, ADMIN);

  // ---------- Natijalar ----------
  function attemptsQuery(query) {
    const tid = Number(query.get('test')) || 0;
    const sid = Number(query.get('subject')) || 0;
    const flagged = query.get('flagged') === '1' ? 1 : 0;
    const q = query.get('q') || '';
    const where = `WHERE a.status = 'finished' AND (? = 0 OR a.test_id = ?) AND (? = 0 OR t.subject_id = ?) AND (? = 0 OR a.violations > 0)
      AND (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR IFNULL(u.group_name, '') LIKE ? ESCAPE '\\')`;
    return { where, args: [tid, tid, sid, sid, flagged, like(q), like(q), like(q)] };
  }
  const attemptsFrom = `FROM attempts a JOIN users u ON u.id = a.user_id JOIN tests t ON t.id = a.test_id JOIN subjects s ON s.id = t.subject_id`;

  r.get('/api/admin/attempts', ({ res, query }) => {
    const { where, args } = attemptsQuery(query);
    const total = db.prepare(`SELECT COUNT(*) AS c ${attemptsFrom} ${where}`).get(...args).c;
    const p = page(query);
    const rows = db.prepare(`SELECT a.id, a.score, a.total, a.percent, a.violations, a.started_at, a.finished_at, a.finish_reason,
        u.name, u.email, u.group_name AS "group", t.title, s.name AS subject, s.color ${attemptsFrom} ${where}
      ORDER BY a.finished_at DESC LIMIT ? OFFSET ?`).all(...args, PAGE, (p - 1) * PAGE);
    send(res, 200, { attempts: rows, total, page: p, pages: Math.max(1, Math.ceil(total / PAGE)) });
  }, STAFF);

  r.get('/api/admin/attempts.csv', ({ res, query }) => {
    const { where, args } = attemptsQuery(query);
    const rows = db.prepare(`SELECT a.id, u.name, u.email, u.group_name, s.name AS subject, t.title, a.score, a.total, a.percent,
        a.violations, a.finish_reason, a.started_at, a.finished_at ${attemptsFrom} ${where} ORDER BY a.finished_at DESC`).all(...args);
    const reasons = { submitted: 'Topshirildi', timeout: 'Vaqt tugadi', violations: 'Qoidabuzarlik' };
    const fmt = (ms) => new Date(ms + 5 * 36e5).toISOString().slice(0, 16).replace('T', ' ');
    const lines = [['ID', 'Talaba', 'Email', 'Guruh', 'Fan', 'Test', 'Ball', 'Jami', 'Foiz', 'Baho', 'Qoidabuzarlik', 'Yakunlanish', 'Boshlangan', 'Yakunlangan', 'Davomiyligi (daq)']]
      .concat(rows.map((x) => [x.id, x.name, x.email, x.group_name, x.subject, x.title, x.score, x.total, x.percent, exam.grade(x.percent).mark,
        x.violations, reasons[x.finish_reason] || x.finish_reason, fmt(x.started_at), fmt(x.finished_at), Math.round((x.finished_at - x.started_at) / 6e4)]));
    const csv = '﻿' + lines.map((l) => l.map(csvCell).join(';')).join('\r\n');
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="edutest-natijalar-${new Date().toISOString().slice(0, 10)}.csv"` });
    res.end(csv);
  }, STAFF);

  r.get('/api/admin/attempts/:id', ({ res, params, user }) => {
    const a = db.prepare('SELECT * FROM attempts WHERE id = ?').get(Number(params.id));
    if (!a) throw new HttpError(404, 'Urinish topilmadi');
    if (a.status !== 'finished') throw new HttpError(409, 'Urinish hali yakunlanmagan');
    send(res, 200, { result: exam.resultPayload(a, user) });
  }, STAFF);

  r.delete('/api/admin/attempts/:id', ({ res, params }) => {
    if (!db.prepare('DELETE FROM attempts WHERE id = ?').run(Number(params.id)).changes) throw new HttpError(404, 'Urinish topilmadi');
    send(res, 200, { ok: true });
  }, STAFF);

  // ---------- Foydalanuvchilar (faqat admin) ----------
  r.get('/api/admin/users', ({ res, query }) => {
    const q = query.get('q') || '';
    const role = ['student', 'teacher', 'admin'].includes(query.get('role')) ? query.get('role') : '';
    const where = `WHERE (? = '' OR u.role = ?) AND (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR IFNULL(u.group_name, '') LIKE ? ESCAPE '\\')`;
    const args = [role, role, like(q), like(q), like(q)];
    const total = db.prepare(`SELECT COUNT(*) AS c FROM users u ${where}`).get(...args).c;
    const p = page(query);
    const rows = db.prepare(`SELECT u.id, u.name, u.email, u.role, u.group_name AS "group", u.is_blocked, u.created_at, u.last_login,
        (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.status = 'finished') AS attempts,
        (SELECT ROUND(AVG(percent)) FROM attempts a WHERE a.user_id = u.id AND a.status = 'finished') AS avg
      FROM users u ${where} ORDER BY u.id DESC LIMIT ? OFFSET ?`).all(...args, PAGE, (p - 1) * PAGE);
    send(res, 200, { users: rows, total, page: p, pages: Math.max(1, Math.ceil(total / PAGE)) });
  }, ADMIN);

  r.put('/api/admin/users/:id', ({ res, body, params, user }) => {
    const id = Number(params.id);
    if (id === user.id) throw new HttpError(400, 'O\'z rolingiz yoki holatingizni o\'zgartira olmaysiz');
    const target = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
    if (!target) throw new HttpError(404, 'Foydalanuvchi topilmadi');
    if (body.role !== undefined) {
      if (!['student', 'teacher', 'admin'].includes(body.role)) throw new HttpError(400, 'Noto\'g\'ri rol');
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(body.role, id);
    }
    if (body.is_blocked !== undefined) {
      db.prepare('UPDATE users SET is_blocked = ? WHERE id = ?').run(v.bool(body.is_blocked), id);
      if (v.bool(body.is_blocked)) session.revokeAll(id);
    }
    send(res, 200, { ok: true });
  }, ADMIN);

  r.delete('/api/admin/users/:id', ({ res, params, user }) => {
    const id = Number(params.id);
    if (id === user.id) throw new HttpError(400, 'O\'zingizni o\'chira olmaysiz');
    if (!db.prepare('DELETE FROM users WHERE id = ?').run(id).changes) throw new HttpError(404, 'Foydalanuvchi topilmadi');
    send(res, 200, { ok: true });
  }, ADMIN);
};
