// Imtihon mantig'i: urinish yaratish, savollarni tanlash, baholash, natija va tahlil
const db = require('../db');
const { shuffle } = require('./security');
const { HttpError } = require('./http');
const { t, getCurrent } = require('./i18n');
const cert = require('./cert');
const tl = (key) => t(getCurrent(), key);

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
  if (p >= 86) return { mark: 5, label: tl("A'lo") };
  if (p >= 71) return { mark: 4, label: tl('Yaxshi') };
  if (p >= 56) return { mark: 3, label: tl('Qoniqarli') };
  return { mark: 2, label: tl('Qoniqarsiz') };
}

const getTest = (id) => {
  const row = db.prepare(`SELECT t.*, tr(t.i18n, 'title', t.title) AS l_title, tr(t.i18n, 'description', t.description) AS l_description,
      tr(s.i18n, 'name', s.name) AS subject_name, s.slug AS subject_slug, s.color AS subject_color
    FROM tests t JOIN subjects s ON s.id = t.subject_id WHERE t.id = ?`).get(id);
  return row ? { ...row, title: row.l_title, description: row.l_description } : row;
};

function finalize(attemptId, reason) {
  const out = finalizeTx(attemptId, reason);
  if (out && out.status === 'finished') { try { cert.issueFor(out.id); } catch (e) { console.error('Sertifikat:', e); } }
  return out;
}

function finalizeTx(attemptId, reason) {
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

// Talaba testga kira oladimi: guruh va ochilish/yopilish vaqti
function access(test, user) {
  if (user.role !== 'student') return { ok: true };
  if (test.group_id && !db.prepare('SELECT 1 FROM group_members WHERE group_id = ? AND user_id = ?').get(test.group_id, user.id)) {
    return { ok: false, status: 403, error: 'Bu test faqat ma\'lum guruh a\'zolari uchun' };
  }
  const now = Date.now();
  if (test.opens_at && now < test.opens_at) return { ok: false, status: 403, error: 'Test hali ochilmagan', reason: 'not_open' };
  if (test.closes_at && now > test.closes_at) return { ok: false, status: 403, error: 'Test topshirish muddati tugagan', reason: 'closed' };
  return { ok: true };
}

function start(testId, user, ip) {
  const test = getTest(testId);
  if (!test || (!test.is_active && user.role === 'student')) throw new HttpError(404, 'Test topilmadi yoki yopilgan');

  const active = db.prepare('SELECT * FROM attempts WHERE user_id = ? AND test_id = ? AND status = \'active\' ORDER BY id DESC').get(user.id, test.id);
  if (active) {
    if (Date.now() <= active.deadline) return active.id;
    finalize(active.id, 'timeout');
  }
  const acc = access(test, user);
  if (!acc.ok) throw new HttpError(acc.status, acc.error);

  if (test.max_attempts > 0 && user.role === 'student') {
    const used = db.prepare('SELECT COUNT(*) AS c FROM attempts WHERE user_id = ? AND test_id = ?').get(user.id, test.id).c;
    if (used >= test.max_attempts) throw new HttpError(403, 'Bu test uchun urinishlar soni tugagan ({n} ta)', { n: test.max_attempts });
  }

  const pool = db.prepare(`SELECT id, options FROM questions WHERE subject_id = ? AND archived = 0
    AND (? = 0 OR difficulty = ?)`).all(test.subject_id, test.difficulty, test.difficulty);
  if (!pool.length) throw new HttpError(409, 'Bu testda hali savollar yo\'q. O\'qituvchiga xabar bering');

  const picked = shuffle(pool).slice(0, test.question_count);
  const now = Date.now();
  // Yopilish vaqti belgilangan bo'lsa, imtihon undan keyin davom etmaydi
  let deadline = now + test.time_limit * 60e3;
  if (test.closes_at && user.role === 'student') deadline = Math.min(deadline, test.closes_at);
  return db.tx(() => {
    const id = Number(db.prepare(`INSERT INTO attempts (user_id, test_id, status, started_at, deadline, total, ip)
      VALUES (?, ?, 'active', ?, ?, ?, ?)`).run(user.id, test.id, now, deadline, picked.length, ip).lastInsertRowid);
    const ins = db.prepare('INSERT INTO attempt_items (attempt_id, position, question_id, option_order) VALUES (?, ?, ?, ?)');
    picked.forEach((q, pos) => ins.run(id, pos, q.id, JSON.stringify(shuffle([...JSON.parse(q.options).keys()]))));
    return id;
  });
}

// Faol urinish: savollar aralashtirilgan tartibda, to'g'ri javobsiz
function activePayload(a) {
  const test = getTest(a.test_id);
  const items = db.prepare(`SELECT ai.position, ai.option_order, ai.chosen, ai.flagged, tr(q.i18n, 'text', q.text) AS text, tr(q.i18n, 'options', q.options) AS options, q.image
    FROM attempt_items ai JOIN questions q ON q.id = ai.question_id WHERE ai.attempt_id = ? ORDER BY ai.position`).all(a.id)
    .map((it) => {
      const opts = JSON.parse(it.options);
      return { position: it.position, text: it.text, image: it.image || null, options: JSON.parse(it.option_order).map((i) => opts[i]), chosen: it.chosen, flagged: !!it.flagged };
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
    certificate: cert.forAttempt(a.id),
    certPercent: test.cert_percent || 0,
  };
  if (out.reviewAvailable) {
    out.review = db.prepare(`SELECT ai.position, ai.option_order, ai.chosen, tr(q.i18n, 'text', q.text) AS text, tr(q.i18n, 'options', q.options) AS options,
        q.correct, tr(q.i18n, 'explanation', q.explanation) AS explanation, q.difficulty, q.image
      FROM attempt_items ai JOIN questions q ON q.id = ai.question_id WHERE ai.attempt_id = ? ORDER BY ai.position`).all(a.id)
      .map((it) => {
        const opts = JSON.parse(it.options);
        const order = JSON.parse(it.option_order);
        const correctPos = order.indexOf(it.correct);
        return { position: it.position, text: it.text, image: it.image || null, options: order.map((i) => opts[i]), chosen: it.chosen,
          correct: correctPos, ok: it.chosen === correctPos, explanation: it.explanation, difficulty: it.difficulty };
      });
  }
  if (staff) {
    out.student = db.prepare('SELECT id, name, email, group_name AS "group" FROM users WHERE id = ?').get(a.user_id);
    out.violationLog = db.prepare('SELECT type, created_at FROM violations WHERE attempt_id = ? ORDER BY id').all(a.id)
      .map((x) => ({ ...x, label: VIOLATION_TYPES[x.type] ? tl(VIOLATION_TYPES[x.type]) : x.type }));
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
    return { violations: a.violations, max: test.max_violations, finished: false, label: tl(VIOLATION_TYPES[type]), ignored: true };
  }
  db.prepare('INSERT INTO violations (attempt_id, type, created_at) VALUES (?, ?, ?)').run(a.id, type, Date.now());
  db.prepare('UPDATE attempts SET violations = violations + 1 WHERE id = ?').run(a.id);
  const count = a.violations + 1;
  let finished = false;
  if (test.max_violations > 0 && count >= test.max_violations) { finalize(a.id, 'violations'); finished = true; }
  return { violations: count, max: test.max_violations, finished, label: tl(VIOLATION_TYPES[type]) };
}

module.exports = { access, start, finalize, sweepExpired, loadOwned, activePayload, resultPayload, saveAnswer, addViolation, grade, getTest, VIOLATION_TYPES };
