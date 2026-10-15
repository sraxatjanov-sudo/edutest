// Baza bo'sh bo'lsa: fanlar, savollar banki, testlar, demo foydalanuvchilar va namunaviy natijalar
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const db = require('./index');
const { hashPassword, shuffle } = require('../lib/security');

function loadSubjects() {
  const dir = path.join(__dirname, 'questions');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.js'))
    .map((f) => require(path.join(dir, f)))
    .sort((a, b) => a.sort - b.sort);
}

function seed() {
  if (db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0) return false;
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

    // Fanlar va savollar
    const insSubject = db.prepare('INSERT INTO subjects (slug, name, description, icon, color, sort) VALUES (?, ?, ?, ?, ?, ?)');
    const insQ = db.prepare('INSERT INTO questions (subject_id, text, options, correct, explanation, difficulty, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const insTest = db.prepare(`INSERT INTO tests (subject_id, title, description, question_count, time_limit, difficulty,
      max_attempts, max_violations, show_review, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`);

    const tests = [];
    for (const s of loadSubjects()) {
      const sid = Number(insSubject.run(s.slug, s.name, s.description, s.icon, s.color, s.sort).lastInsertRowid);
      for (const [text, right, wrong, explanation, difficulty] of s.questions) {
        insQ.run(sid, text, JSON.stringify([right, ...wrong]), 0, explanation || null, difficulty || 2, now);
      }
      tests.push(Number(insTest.run(sid, `${s.name}: umumiy test`, `${s.name} fani bo'yicha barcha mavzulardan 20 ta tasodifiy savol.`, 20, 25, 0, 0, 3, 1, now).lastInsertRowid));
      tests.push(Number(insTest.run(sid, `${s.name}: tezkor sinov`, 'Asosiy tushunchalarni tez takrorlash uchun 10 ta oson savol.', 10, 8, 1, 0, 3, 1, now).lastInsertRowid));
    }

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
        const t = testInfo.get(tid);
        const qs = shuffle(pool.all(t.subject_id, t.difficulty, t.difficulty)).slice(0, t.question_count);
        const started = now - (k * 3 + ui + 1) * 864e5 * 0.9 - crypto.randomInt(36e5);
        const duration = Math.round(t.time_limit * 60 * (0.45 + Math.random() * 0.5)) * 1000;
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
        const aid = Number(insAttempt.run(uid, tid, started, started + t.time_limit * 6e4, started + duration,
          score, qs.length, pct, ui % 6 === 5 ? 1 : 0).lastInsertRowid);
        for (const it of items) insItem.run(aid, ...it);
      });
    });
  });
  return true;
}

module.exports = { seed, loadSubjects };

if (require.main === module) {
  console.log(seed() ? 'Boshlang\'ich ma\'lumotlar qo\'shildi.' : 'Baza allaqachon to\'ldirilgan.');
}
