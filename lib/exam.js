// Imtihon mantig'i: urinish yaratish, savollarni tanlash, baholash, natija va tahlil
const db = require('../db');
const { shuffle } = require('./security');
const { HttpError } = require('./http');

const GRACE_MS = 3000; // tarmoq kechikishi uchun kichik zaxira
const VIOLATION_TYPES = {
  tab_hidden: 'Boshqa oyna yoki ilovaga o\'tildi',
  window_blur: 'Test oynasidan chiqildi',
  fullscreen_exit: 'To\'liq ekran rejimidan chiqildi',
  copy_attempt: 'Nusxa olishga urinildi',
  paste_attempt: 'Matn qo\'yishga urinildi',
  context_menu: 'Sichqonchaning o\'ng tugmasi bosildi',
  devtools: 'Dasturchi vositalarini ochishga urinildi',
  print_attempt: 'Sahifani chop etish yoki saqlashga urinildi',
  screenshot_key: 'Ekran rasmini olish tugmasi bosildi',
};

function grade(p) {
  if (p >= 86) return { mark: 5, label: 'A\'lo' };
  if (p >= 71) return { mark: 4, label: 'Yaxshi' };
  if (p >= 56) return { mark: 3, label: 'Qoniqarli' };
  return { mark: 2, label: 'Qoniqarsiz' };
}

const getTest = (id) => db.prepare(`SELECT t.*, s.name AS subject_name, s.slug AS subject_slug, s.color AS subject_color
  FROM tests t JOIN subjects s ON s.id = t.subject_id WHERE t.id = ?`).get(id);

function finalize(attemptId, reason) {
  return db.tx(() => {
    const a = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
    if (!a || a.status === 'finished') return a;
    const items = db.prepare(`SELECT ai.option_order, ai.chosen, q.correct FROM attempt_items ai
      JOIN questions q ON q.id = ai.question_id WHERE ai.attempt_id = ?`).all(attemptId);
    let score = 0;
    for (const it of items) {
      if (it.chosen !== null && JSON.parse(it.option_order)[it.chosen] === it.correct) score++;
    }
    const total = items.length;
    const percent = total ? Math.round((score / total) * 100) : 0;
    const finishedAt = Math.min(Date.now(), a.deadline);
    db.prepare(`UPDATE attempts SET status = 'finished', finished_at = ?, finish_reason = ?, score = ?, total = ?, percent = ?
      WHERE id = ?`).run(finishedAt, reason, score, total, percent, attemptId);
    return db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
  });
}

// Vaqti o'tgan faol urinishlarni yakunlash (fon jarayoni)
function sweepExpired() {
  const rows = db.prepare('SELECT id FROM attempts WHERE status = \'active\' AND deadline + ? < ?').all(GRACE_MS, Date.now());
  for (const r of rows) finalize(r.id, 'timeout');
  return rows.length;
}

function loadOwned(attemptId, user) {
  const a = db.prepare('SELECT * FROM attempts WHERE id = ?').get(attemptId);
  if (!a) throw new HttpError(404, 'Urinish topilmadi');
  const staff = user.role === 'admin' || user.role === 'teacher';
  if (a.user_id !== user.id && !staff) throw new HttpError(404, 'Urinish topilmadi');
  if (a.status === 'active' && Date.now() > a.deadline + GRACE_MS) return finalize(a.id, 'timeout');
  return a;
}

function start(testId, user, ip) {
  const test = getTest(testId);
  if (!test || (!test.is_active && user.role === 'student')) throw new HttpError(404, 'Test topilmadi yoki yopilgan');

  const active = db.prepare('SELECT * FROM attempts WHERE user_id = ? AND test_id = ? AND status = \'active\' ORDER BY id DESC').get(user.id, test.id);
  if (active) {
    if (Date.now() <= active.deadline) return active.id;
    finalize(active.id, 'timeout');
  }

  if (test.max_attempts > 0 && user.role === 'student') {
    const used = db.prepare('SELECT COUNT(*) AS c FROM attempts WHERE user_id = ? AND test_id = ?').get(user.id, test.id).c;
    if (used >= test.max_attempts) throw new HttpError(403, `Bu test uchun urinishlar soni tugagan (${test.max_attempts} ta)`);
  }

  const pool = db.prepare(`SELECT id, options FROM questions WHERE subject_id = ? AND archived = 0
    AND (? = 0 OR difficulty = ?)`).all(test.subject_id, test.difficulty, test.difficulty);
  if (!pool.length) throw new HttpError(409, 'Bu testda hali savollar yo\'q. O\'qituvchiga xabar bering');

  const picked = shuffle(pool).slice(0, test.question_count);
  const now = Date.now();
  return db.tx(() => {
    const id = Number(db.prepare(`INSERT INTO attempts (user_id, test_id, status, started_at, deadline, total, ip)
      VALUES (?, ?, 'active', ?, ?, ?, ?)`).run(user.id, test.id, now, now + test.time_limit * 60e3, picked.length, ip).lastInsertRowid);
    const ins = db.prepare('INSERT INTO attempt_items (attempt_id, position, question_id, option_order) VALUES (?, ?, ?, ?)');
    picked.forEach((q, pos) => ins.run(id, pos, q.id, JSON.stringify(shuffle([...JSON.parse(q.options).keys()]))));
    return id;
  });
}

// Faol urinish: savollar aralashtirilgan tartibda, to'g'ri javobsiz
function activePayload(a) {
  const test = getTest(a.test_id);
  const items = db.prepare(`SELECT ai.position, ai.option_order, ai.chosen, ai.flagged, q.text, q.options
    FROM attempt_items ai JOIN questions q ON q.id = ai.question_id WHERE ai.attempt_id = ? ORDER BY ai.position`).all(a.id)
    .map((it) => {
      const opts = JSON.parse(it.options);
      return { position: it.position, text: it.text, options: JSON.parse(it.option_order).map((i) => opts[i]), chosen: it.chosen, flagged: !!it.flagged };
    });
  return {
    id: a.id, status: a.status, serverNow: Date.now(), startedAt: a.started_at, deadline: a.deadline,
    violations: a.violations, maxViolations: test.max_violations,
    test: { id: test.id, title: test.title, subject: test.subject_name, color: test.subject_color, timeLimit: test.time_limit },
    items,
  };
}

function resultPayload(a, viewer) {
  const test = getTest(a.test_id);
  const staff = viewer.role === 'admin' || viewer.role === 'teacher';
  const others = db.prepare('SELECT percent FROM attempts WHERE test_id = ? AND status = \'finished\'').all(a.test_id).map((r) => r.percent);
  const below = others.filter((p) => p < a.percent).length;
  const out = {
    id: a.id, status: a.status, score: a.score, total: a.total, percent: a.percent, grade: grade(a.percent),
    duration: Math.round(((a.finished_at || a.deadline) - a.started_at) / 1000), finishedAt: a.finished_at,
    finishReason: a.finish_reason, violations: a.violations,
    betterThan: others.length > 1 ? Math.round((below / (others.length - 1)) * 100) : null,
    test: { id: test.id, title: test.title, subject: test.subject_name, slug: test.subject_slug, color: test.subject_color, timeLimit: test.time_limit },
    reviewAvailable: Boolean(test.show_review || staff),
    review: null,
  };
  if (out.reviewAvailable) {
    out.review = db.prepare(`SELECT ai.position, ai.option_order, ai.chosen, q.text, q.options, q.correct, q.explanation, q.difficulty
      FROM attempt_items ai JOIN questions q ON q.id = ai.question_id WHERE ai.attempt_id = ? ORDER BY ai.position`).all(a.id)
      .map((it) => {
        const opts = JSON.parse(it.options);
        const order = JSON.parse(it.option_order);
        const correctPos = order.indexOf(it.correct);
        return { position: it.position, text: it.text, options: order.map((i) => opts[i]), chosen: it.chosen,
          correct: correctPos, ok: it.chosen === correctPos, explanation: it.explanation, difficulty: it.difficulty };
      });
  }
  if (staff) {
    out.student = db.prepare('SELECT id, name, email, group_name AS "group" FROM users WHERE id = ?').get(a.user_id);
    out.violationLog = db.prepare('SELECT type, created_at FROM violations WHERE attempt_id = ? ORDER BY id').all(a.id)
      .map((x) => ({ ...x, label: VIOLATION_TYPES[x.type] || x.type }));
    out.ip = a.ip;
  }
  return out;
}

function saveAnswer(a, body) {
  if (a.status !== 'active') throw new HttpError(409, 'Test yakunlangan, javobni o\'zgartirib bo\'lmaydi');
  if (Date.now() > a.deadline + GRACE_MS) { finalize(a.id, 'timeout'); throw new HttpError(409, 'Vaqt tugadi'); }
  const pos = Number(body.position);
  const item = db.prepare('SELECT option_order FROM attempt_items WHERE attempt_id = ? AND position = ?').get(a.id, pos);
  if (!item) throw new HttpError(400, 'Savol topilmadi');
  if ('choice' in body) {
    const c = body.choice;
    const n = JSON.parse(item.option_order).length;
    if (c !== null && !(Number.isInteger(c) && c >= 0 && c < n)) throw new HttpError(400, 'Noto\'g\'ri variant');
    db.prepare('UPDATE attempt_items SET chosen = ? WHERE attempt_id = ? AND position = ?').run(c, a.id, pos);
  }
  if ('flagged' in body) {
    db.prepare('UPDATE attempt_items SET flagged = ? WHERE attempt_id = ? AND position = ?').run(body.flagged ? 1 : 0, a.id, pos);
  }
}

function addViolation(a, type) {
  if (a.status !== 'active') return { violations: a.violations, finished: true };
  if (!VIOLATION_TYPES[type]) throw new HttpError(400, 'Noma\'lum qoidabuzarlik turi');
  const test = getTest(a.test_id);
  // Bir hodisa ikki marta sanalmasin (masalan, blur va visibilitychange birga keladi)
  const last = db.prepare('SELECT created_at FROM violations WHERE attempt_id = ? ORDER BY id DESC LIMIT 1').get(a.id);
  if (last && Date.now() - last.created_at < 1500) {
    return { violations: a.violations, max: test.max_violations, finished: false, label: VIOLATION_TYPES[type], ignored: true };
  }
  db.prepare('INSERT INTO violations (attempt_id, type, created_at) VALUES (?, ?, ?)').run(a.id, type, Date.now());
  db.prepare('UPDATE attempts SET violations = violations + 1 WHERE id = ?').run(a.id);
  const count = a.violations + 1;
  let finished = false;
  if (test.max_violations > 0 && count >= test.max_violations) { finalize(a.id, 'violations'); finished = true; }
  return { violations: count, max: test.max_violations, finished, label: VIOLATION_TYPES[type] };
}

module.exports = { start, finalize, sweepExpired, loadOwned, activePayload, resultPayload, saveAnswer, addViolation, grade, getTest, VIOLATION_TYPES };
