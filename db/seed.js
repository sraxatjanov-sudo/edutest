// Boshlang'ich ma'lumotlar va savollar bankini sinxronlash
// - Baza bo'sh bo'lsa: foydalanuvchilar, fanlar, savollar (tarjimalari bilan), testlar va namunaviy natijalar
// - Baza mavjud bo'lsa: yangi qo'shilgan fanlarni va yetishmayotgan tarjimalarni qo'shadi (o'qituvchi o'zgartirgan narsalarga tegmaydi)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('./index');
const { hashPassword, shuffle } = require('../lib/security');
const { t } = require('../lib/i18n');

const QDIR = path.join(__dirname, 'questions');
const TDIR = path.join(QDIR, 'i18n');
const LANGS = ['ru', 'kaa'];

function loadSubjects() {
  return fs.readdirSync(QDIR).filter((f) => f.endsWith('.js'))
    .map((f) => {
      const s = require(path.join(QDIR, f));
      const tf = path.join(TDIR, f);
      const tr = fs.existsSync(tf) ? require(tf) : {};
      return { ...s, tr };
    })
    .sort((a, b) => a.sort - b.sort);
}

// Fan nomi/tavsifi tarjimalari: tarjima faylidan yoki asosiy fayldagi i18n bo'limidan
function subjectI18n(s) {
  const out = {};
  for (const L of LANGS) {
    const src = s.tr[L] || (s.i18n && s.i18n[L]);
    if (src && (src.name || src.description)) out[L] = { name: src.name, description: src.description };
  }
  return Object.keys(out).length ? out : null;
}

// i-savolning tarjimalari: { ru: { text, options, explanation }, kaa: {...} }
function questionI18n(s, i) {
  if (s.keepOriginal) return null;
  const out = {};
  for (const L of LANGS) {
    const q = s.tr[L]?.questions?.[i];
    if (!q) continue;
    const [text, right, wrong, explanation] = q;
    out[L] = { text, options: [right, ...wrong], ...(explanation ? { explanation } : {}) };
  }
  return Object.keys(out).length ? out : null;
}

const SEED_TESTS = [
  { title: '{name}: umumiy test', description: "{name} fani bo'yicha barcha mavzulardan 20 ta tasodifiy savol.", count: 20, time: 25, diff: 0 },
  { title: '{name}: tezkor sinov', description: 'Asosiy tushunchalarni tez takrorlash uchun 10 ta oson savol.', count: 10, time: 8, diff: 1 },
];

function testI18n(s, tpl) {
  const si = subjectI18n(s) || {};
  const out = {};
  for (const L of LANGS) {
    const name = si[L]?.name || s.name;
    out[L] = { title: t(L, tpl.title, { name }), description: t(L, tpl.description, { name }) };
  }
  return out;
}

const json = (x) => (x ? JSON.stringify(x) : null);

function insertSubject(s, now) {
  const sid = Number(db.prepare('INSERT INTO subjects (slug, name, description, icon, color, sort, i18n) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(s.slug, s.name, s.description, s.icon, s.color, s.sort, json(subjectI18n(s))).lastInsertRowid);
  const insQ = db.prepare('INSERT INTO questions (subject_id, text, options, correct, explanation, difficulty, i18n, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  s.questions.forEach(([text, right, wrong, explanation, difficulty], i) => {
    insQ.run(sid, text, JSON.stringify([right, ...wrong]), 0, explanation || null, difficulty || 2, json(questionI18n(s, i)), now);
  });
  const insTest = db.prepare(`INSERT INTO tests (subject_id, title, description, question_count, time_limit, difficulty,
    max_attempts, max_violations, show_review, is_active, i18n, created_at) VALUES (?, ?, ?, ?, ?, ?, 0, 3, 1, 1, ?, ?)`);
  return SEED_TESTS.map((tpl) => Number(insTest.run(sid, t('uz', tpl.title, { name: s.name }), t('uz', tpl.description, { name: s.name }),
    tpl.count, tpl.time, tpl.diff, json(testI18n(s, tpl)), now).lastInsertRowid));
}

// Mavjud bazani fayllardagi savollar banki bilan moslash
function syncBank() {
  const now = Date.now();
  let added = 0, translated = 0;
  db.tx(() => {
    for (const s of loadSubjects()) {
      const row = db.prepare('SELECT id, name FROM subjects WHERE slug = ?').get(s.slug);
      if (!row) { insertSubject(s, now); added++; continue; }
      const si = subjectI18n(s);
      if (si) translated += db.prepare('UPDATE subjects SET i18n = ? WHERE id = ? AND i18n IS NULL').run(json(si), row.id).changes;
      const upQ = db.prepare('UPDATE questions SET i18n = ? WHERE subject_id = ? AND text = ? AND i18n IS NULL');
      s.questions.forEach((q, i) => {
        const qi = questionI18n(s, i);
        if (qi) translated += upQ.run(json(qi), row.id, q[0]).changes;
      });
      const upT = db.prepare('UPDATE tests SET i18n = ? WHERE subject_id = ? AND title = ? AND i18n IS NULL');
      for (const tpl of SEED_TESTS) translated += upT.run(json(testI18n(s, tpl)), row.id, t('uz', tpl.title, { name: row.name })).changes;
    }
  });
  return { added, translated };
}

function seed() {
  if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0) { syncBank(); return false; }
  const now = Date.now();

  db.tx(() => {
    // Foydalanuvchilar
    const insUser = db.prepare('INSERT INTO users (name, email, password_hash, role, group_name, created_at) VALUES (?, ?, ?, ?, ?, ?)');
    insUser.run('Raxatjanov Shoxrux', 'admin@edutest.uz', hashPassword('admin123'), 'admin', null, now);
    insUser.run('Dilnoza Karimova', 'teacher@edutest.uz', hashPassword('teacher123'), 'teacher', null, now);
    insUser.run('Talaba Namuna', 'talaba@edutest.uz', hashPassword('talaba123'), 'student', '211-guruh', now);

    const demo = [
      ['Aziza Rahimova', '211-guruh'], ['Jasur Toshmatov', '211-guruh'], ['Madina Yusupova', '212-guruh'],
      ['Otabek Nazarov', '212-guruh'], ['Sevara Aliyeva', '211-guruh'], ['Bekzod Ergashev', '213-guruh'],
      ['Nilufar Saidova', '213-guruh'], ['Sardor Qodirov', '212-guruh'],
    ];
    const demoPass = hashPassword(crypto.randomBytes(12).toString('hex'));
    const demoIds = demo.map(([name, g], i) =>
      Number(insUser.run(name, `demo${i + 1}@edutest.uz`, demoPass, 'student', g, now - (30 - i) * 864e5).lastInsertRowid));

    // Fanlar, savollar va testlar
    const tests = loadSubjects().flatMap((s) => insertSubject(s, now));

    // Namunaviy yakunlangan urinishlar (reyting va statistika bo'sh ko'rinmasligi uchun)
    const insAttempt = db.prepare(`INSERT INTO attempts (user_id, test_id, status, started_at, deadline, finished_at,
      finish_reason, score, total, percent, violations) VALUES (?, ?, 'finished', ?, ?, ?, 'submitted', ?, ?, ?, ?)`);
    const insItem = db.prepare('INSERT INTO attempt_items (attempt_id, position, question_id, option_order, chosen) VALUES (?, ?, ?, ?, ?)');
    const testInfo = db.prepare('SELECT * FROM tests WHERE id = ?');
    const pool = db.prepare('SELECT id, options, correct FROM questions WHERE subject_id = ? AND (? = 0 OR difficulty = ?)');

    demoIds.forEach((uid, ui) => {
      const skill = 0.45 + (ui % 5) * 0.11;
      const picks = shuffle(tests).slice(0, 4 + (ui % 4));
      picks.forEach((tid, k) => {
        const tt = testInfo.get(tid);
        const qs = shuffle(pool.all(tt.subject_id, tt.difficulty, tt.difficulty)).slice(0, tt.question_count);
        const started = now - (k * 3 + ui + 1) * 864e5 * 0.9 - crypto.randomInt(36e5);
        const duration = Math.round(tt.time_limit * 60 * (0.45 + Math.random() * 0.5)) * 1000;
        let score = 0;
        const items = qs.map((q, pos) => {
          const order = shuffle([...JSON.parse(q.options).keys()]);
          const right = Math.random() < skill;
          const correctPos = order.indexOf(q.correct);
          const chosen = right ? correctPos : (correctPos + 1 + crypto.randomInt(order.length - 1)) % order.length;
          if (right) score++;
          return [pos, q.id, JSON.stringify(order), chosen];
        });
        const pct = Math.round((score / qs.length) * 100);
        const aid = Number(insAttempt.run(uid, tid, started, started + tt.time_limit * 6e4, started + duration,
          score, qs.length, pct, ui % 6 === 5 ? 1 : 0).lastInsertRowid);
        for (const it of items) insItem.run(aid, ...it);
      });
    });
  });
  return true;
}

module.exports = { seed, syncBank, loadSubjects };

if (require.main === module) {
  console.log(seed() ? 'Boshlang\'ich ma\'lumotlar qo\'shildi.' : 'Baza allaqachon to\'ldirilgan, savollar banki yangilandi.');
}
