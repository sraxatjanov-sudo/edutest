// Fanlar katalogi, mashq rejimi, test urinishlari, reyting va shaxsiy kabinet
const db = require('../db');
const exam = require('../lib/exam');
const { send, HttpError, clientIp } = require('../lib/http');
const { shuffle, rateLimiter } = require('../lib/security');
const { pick } = require('../lib/i18n');

const practiceLimiter = rateLimiter({ windowMs: 60e3, max: 120 });

function subjectBySlug(slug) {
  const s = db.prepare('SELECT * FROM subjects WHERE slug = ?').get(String(slug));
  if (!s) throw new HttpError(404, 'Fan topilmadi');
  return s;
}

function periodStart(period) {
  const day = 864e5;
  if (period === 'week') return Date.now() - 7 * day;
  if (period === 'month') return Date.now() - 30 * day;
  return 0;
}

module.exports = (r) => {
  // ---------- Katalog ----------
  r.get('/api/stats', ({ res }) => {
    const one = (sql) => db.prepare(sql).get().c;
    send(res, 200, {
      subjects: one('SELECT COUNT(*) AS c FROM subjects'),
      questions: one('SELECT COUNT(*) AS c FROM questions WHERE archived = 0'),
      tests: one('SELECT COUNT(*) AS c FROM tests WHERE is_active = 1'),
      students: one("SELECT COUNT(*) AS c FROM users WHERE role = 'student'"),
      attempts: one("SELECT COUNT(*) AS c FROM attempts WHERE status = 'finished'"),
    });
  });

  r.get('/api/subjects', ({ res }) => {
    const rows = db.prepare(`SELECT s.id, s.slug, tr(s.i18n, 'name', s.name) AS name, tr(s.i18n, 'description', s.description) AS description, s.icon, s.color,
        (SELECT COUNT(*) FROM questions q WHERE q.subject_id = s.id AND q.archived = 0) AS question_count,
        (SELECT COUNT(*) FROM tests t WHERE t.subject_id = s.id AND t.is_active = 1) AS test_count,
        (SELECT ROUND(AVG(a.percent)) FROM attempts a JOIN tests t ON t.id = a.test_id
           WHERE t.subject_id = s.id AND a.status = 'finished') AS avg_percent
      FROM subjects s ORDER BY s.sort, s.name`).all();
    send(res, 200, { subjects: rows });
  });

  r.get('/api/subjects/:slug', ({ res, params, user }) => {
    const s = subjectBySlug(params.slug);
    const counts = db.prepare(`SELECT difficulty, COUNT(*) AS c FROM questions WHERE subject_id = ? AND archived = 0 GROUP BY difficulty`).all(s.id);
    const tests = db.prepare(`SELECT t.id, tr(t.i18n, 'title', t.title) AS title, tr(t.i18n, 'description', t.description) AS description, t.question_count, t.time_limit, t.difficulty, t.max_attempts, t.max_violations,
        (SELECT COUNT(*) FROM attempts a WHERE a.test_id = t.id AND a.status = 'finished') AS attempts,
        (SELECT ROUND(AVG(a.percent)) FROM attempts a WHERE a.test_id = t.id AND a.status = 'finished') AS avg_percent
      FROM tests t WHERE t.subject_id = ? AND t.is_active = 1 ORDER BY t.id`).all(s.id);
    if (user) {
      const mine = db.prepare(`SELECT test_id, COUNT(*) AS used, MAX(percent) AS best,
          SUM(status = 'active') AS active FROM attempts WHERE user_id = ? GROUP BY test_id`).all(user.id);
      const map = new Map(mine.map((m) => [m.test_id, m]));
      for (const t of tests) {
        const m = map.get(t.id);
        t.my = m ? { used: m.used, best: m.best, active: m.active > 0 } : { used: 0, best: null, active: false };
      }
    }
    send(res, 200, {
      subject: { id: s.id, slug: s.slug, name: pick(s.i18n, 'name', s.name), description: pick(s.i18n, 'description', s.description), icon: s.icon, color: s.color },
      difficulty: Object.fromEntries(counts.map((c) => [c.difficulty, c.c])),
      tests,
    });
  });

  // ---------- Mashq rejimi: javob darhol tekshiriladi, natija saqlanmaydi ----------
  r.get('/api/practice/:slug', ({ req, res, params, query }) => {
    const lim = practiceLimiter.hit(clientIp(req));
    if (!lim.ok) throw new HttpError(429, 'Juda ko\'p so\'rov. Bir daqiqadan keyin davom eting');
    const s = subjectBySlug(params.slug);
    const count = Math.min(Math.max(Number(query.get('count')) || 10, 5), 30);
    const difficulty = [1, 2, 3].includes(Number(query.get('difficulty'))) ? Number(query.get('difficulty')) : 0;
    const pool = db.prepare(`SELECT id, tr(i18n, 'text', text) AS text, tr(i18n, 'options', options) AS options, difficulty FROM questions WHERE subject_id = ? AND archived = 0
      AND (? = 0 OR difficulty = ?)`).all(s.id, difficulty, difficulty);
    const items = shuffle(pool).slice(0, count).map((q) => ({ id: q.id, text: q.text, difficulty: q.difficulty, options: shuffle(JSON.parse(q.options)) }));
    send(res, 200, { subject: { name: pick(s.i18n, 'name', s.name), slug: s.slug, color: s.color }, items });
  });

  r.post('/api/practice/check', ({ req, res, body }) => {
    const lim = practiceLimiter.hit(clientIp(req));
    if (!lim.ok) throw new HttpError(429, 'Juda ko\'p so\'rov. Bir daqiqadan keyin davom eting');
    const q = db.prepare(`SELECT tr(i18n, 'options', options) AS options, correct, tr(i18n, 'explanation', explanation) AS explanation
      FROM questions WHERE id = ? AND archived = 0`).get(Number(body.id));
    if (!q) throw new HttpError(404, 'Savol topilmadi');
    const right = JSON.parse(q.options)[q.correct];
    send(res, 200, { ok: String(body.answer) === right, correct: right, explanation: q.explanation });
  });

  // Bosh sahifadagi namunaviy savol
  r.get('/api/sample', ({ res }) => {
    const q = db.prepare(`SELECT q.id, tr(q.i18n, 'text', q.text) AS text, tr(q.i18n, 'options', q.options) AS options, tr(s.i18n, 'name', s.name) AS subject
      FROM questions q JOIN subjects s ON s.id = q.subject_id
      WHERE q.archived = 0 AND q.difficulty = 1 AND q.text NOT LIKE '%\`%' ORDER BY RANDOM() LIMIT 1`).get();
    send(res, 200, q ? { id: q.id, text: q.text, subject: q.subject, options: shuffle(JSON.parse(q.options)) } : {});
  });

  // ---------- Test urinishlari ----------
  r.get('/api/tests/:id', ({ res, params, user }) => {
    const t = exam.getTest(Number(params.id));
    if (!t || (!t.is_active && user.role === 'student')) throw new HttpError(404, 'Test topilmadi yoki yopilgan');
    const pool = db.prepare(`SELECT COUNT(*) AS c FROM questions WHERE subject_id = ? AND archived = 0 AND (? = 0 OR difficulty = ?)`)
      .get(t.subject_id, t.difficulty, t.difficulty).c;
    const used = db.prepare('SELECT COUNT(*) AS c FROM attempts WHERE user_id = ? AND test_id = ?').get(user.id, t.id).c;
    const active = db.prepare('SELECT id, deadline FROM attempts WHERE user_id = ? AND test_id = ? AND status = \'active\' AND deadline > ? ORDER BY id DESC')
      .get(user.id, t.id, Date.now());
    send(res, 200, {
      test: { id: t.id, title: t.title, description: t.description, subject: t.subject_name, slug: t.subject_slug, color: t.subject_color,
        questionCount: Math.min(t.question_count, pool), timeLimit: t.time_limit, difficulty: t.difficulty, maxAttempts: t.max_attempts,
        maxViolations: t.max_violations, showReview: Boolean(t.show_review) },
      used, active: active ? { id: active.id, remaining: Math.round((active.deadline - Date.now()) / 1000) } : null,
    });
  }, { auth: true });

  r.post('/api/tests/:id/start', ({ req, res, params, user }) => {
    const id = exam.start(Number(params.id), user, clientIp(req));
    send(res, 200, { attemptId: id });
  }, { auth: true });

  r.get('/api/attempts/:id', ({ res, params, user }) => {
    const a = exam.loadOwned(Number(params.id), user);
    if (a.status === 'active') {
      if (a.user_id !== user.id) throw new HttpError(409, 'Urinish hali yakunlanmagan');
      return send(res, 200, { attempt: exam.activePayload(a) });
    }
    send(res, 200, { result: exam.resultPayload(a, user) });
  }, { auth: true });

  r.put('/api/attempts/:id/answer', ({ res, params, body, user }) => {
    const a = exam.loadOwned(Number(params.id), user);
    if (a.user_id !== user.id) throw new HttpError(403, 'Ruxsat yo\'q');
    exam.saveAnswer(a, body);
    send(res, 200, { ok: true, serverNow: Date.now() });
  }, { auth: true });

  r.post('/api/attempts/:id/violation', ({ res, params, body, user }) => {
    const a = exam.loadOwned(Number(params.id), user);
    if (a.user_id !== user.id) throw new HttpError(403, 'Ruxsat yo\'q');
    send(res, 200, exam.addViolation(a, String(body.type)));
  }, { auth: true });

  r.post('/api/attempts/:id/finish', ({ res, params, user }) => {
    const a = exam.loadOwned(Number(params.id), user);
    if (a.user_id !== user.id) throw new HttpError(403, 'Ruxsat yo\'q');
    const done = a.status === 'finished' ? a : exam.finalize(a.id, 'submitted');
    send(res, 200, { result: exam.resultPayload(done, user) });
  }, { auth: true });

  // ---------- Shaxsiy kabinet ----------
  r.get('/api/me/dashboard', ({ res, user }) => {
    const rows = db.prepare(`SELECT a.id, a.status, a.score, a.total, a.percent, a.started_at, a.finished_at, a.deadline,
        a.finish_reason, a.violations, t.id AS test_id, tr(t.i18n, 'title', t.title) AS title, tr(s.i18n, 'name', s.name) AS subject, s.slug, s.color
      FROM attempts a JOIN tests t ON t.id = a.test_id JOIN subjects s ON s.id = t.subject_id
      WHERE a.user_id = ? ORDER BY a.id DESC`).all(user.id);
    const done = rows.filter((x) => x.status === 'finished');
    const bySubject = db.prepare(`SELECT tr(s.i18n, 'name', s.name) AS name, s.slug, s.color, COUNT(*) AS attempts, ROUND(AVG(a.percent)) AS avg, MAX(a.percent) AS best
      FROM attempts a JOIN tests t ON t.id = a.test_id JOIN subjects s ON s.id = t.subject_id
      WHERE a.user_id = ? AND a.status = 'finished' GROUP BY s.id ORDER BY avg DESC`).all(user.id);
    const rankRows = db.prepare(`SELECT a.user_id, AVG(a.percent) AS avg FROM attempts a JOIN users u ON u.id = a.user_id
      WHERE a.status = 'finished' AND u.role = 'student' GROUP BY a.user_id ORDER BY avg DESC`).all();
    const rankIdx = rankRows.findIndex((x) => x.user_id === user.id);
    send(res, 200, {
      summary: {
        attempts: done.length,
        avg: done.length ? Math.round(done.reduce((s, x) => s + x.percent, 0) / done.length) : null,
        best: done.length ? Math.max(...done.map((x) => x.percent)) : null,
        correct: done.reduce((s, x) => s + x.score, 0),
        answered: done.reduce((s, x) => s + x.total, 0),
        rank: rankIdx >= 0 ? rankIdx + 1 : null,
        ranked: rankRows.length,
      },
      bySubject,
      active: rows.filter((x) => x.status === 'active' && x.deadline > Date.now()),
      history: done.slice(0, 50).map((x) => ({ ...x, duration: Math.round((x.finished_at - x.started_at) / 1000) })),
    });
  }, { auth: true });

  // ---------- Reyting ----------
  r.get('/api/leaderboard', ({ res, query, user }) => {
    const slug = query.get('subject') || '';
    const since = periodStart(query.get('period'));
    const subject = slug ? subjectBySlug(slug) : null;
    const rows = db.prepare(`SELECT u.id, u.name, u.group_name AS "group", COUNT(a.id) AS attempts, ROUND(AVG(a.percent)) AS avg,
        MAX(a.percent) AS best, SUM(a.score) AS points
      FROM attempts a JOIN users u ON u.id = a.user_id JOIN tests t ON t.id = a.test_id
      WHERE a.status = 'finished' AND u.role = 'student' AND a.finished_at >= ? AND (? = 0 OR t.subject_id = ?)
      GROUP BY u.id ORDER BY avg DESC, points DESC, attempts DESC LIMIT 50`).all(since, subject ? subject.id : 0, subject ? subject.id : 0);
    send(res, 200, { leaders: rows.map((x) => ({ ...x, me: user ? x.id === user.id : false, id: undefined })) });
  });
};
