// v3 imkoniyatlari: rasmlar, guruhlar, sertifikatlar, shaxsiy statistika, xatolar ustida mashq, zaxira holati
const crypto = require('node:crypto');
const db = require('../db');
const v = require('../lib/validate');
const images = require('../lib/images');
const cert = require('../lib/cert');
const backup = require('../lib/backup');
const session = require('../lib/session');
const { send, HttpError, clientIp, SECURITY_HEADERS } = require('../lib/http');
const { hashPassword, shuffle, rateLimiter } = require('../lib/security');

const STAFF = { roles: ['teacher', 'admin'] };
const ADMIN = { roles: ['admin'] };
const joinLimiter = rateLimiter({ windowMs: 15 * 60e3, max: 20 });
const uploadLimiter = rateLimiter({ windowMs: 60 * 60e3, max: 60 });
const certLimiter = rateLimiter({ windowMs: 60e3, max: 30 });

// Guruh kodi: 6 belgi, chalkash harflarsiz
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newGroupCode = () => Array.from({ length: 6 }, () => ALPHA[crypto.randomInt(ALPHA.length)]).join('');

function ownGroup(id, user) {
  const g = db.prepare('SELECT * FROM groups WHERE id = ?').get(Number(id));
  if (!g) throw new HttpError(404, 'Guruh topilmadi');
  if (user.role !== 'admin' && g.teacher_id !== user.id) throw new HttpError(403, 'Bu guruh boshqa o\'qituvchiga tegishli');
  return g;
}

// Vaqtinchalik parol: o'qish oson, lekin taxmin qilib bo'lmaydigan (harf + raqam)
function tempPassword() {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const pick = (set, n) => Array.from({ length: n }, () => set[crypto.randomInt(set.length)]).join('');
  return `${pick(letters, 4)}-${pick('23456789', 4)}`;
}

module.exports = (r) => {
  // ---------- Rasmlar ----------
  r.get('/api/images/:key', ({ res, params }) => {
    const img = images.get(params.key);
    if (!img) throw new HttpError(404, 'Rasm topilmadi');
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': img.mime, 'Content-Length': img.size,
      'Cache-Control': 'private, max-age=31536000, immutable', 'Content-Disposition': 'inline' });
    res.end(Buffer.from(img.data));
  });

  r.post('/api/images', ({ req, res, body, user }) => {
    if (!uploadLimiter.hit(`${user.id}`).ok) throw new HttpError(429, "Juda ko'p so'rov. Bir daqiqadan keyin davom eting");
    send(res, 201, { key: images.saveDataUrl(body.data, user.id) });
  }, STAFF);

  r.put('/api/me/avatar', ({ res, body, user }) => {
    let key = null;
    if (body.data) {
      if (!uploadLimiter.hit(`${user.id}`).ok) throw new HttpError(429, "Juda ko'p so'rov. Bir daqiqadan keyin davom eting");
      key = images.saveDataUrl(body.data, user.id);
    }
    const old = db.prepare('SELECT avatar FROM users WHERE id = ?').get(user.id).avatar;
    db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(key, user.id);
    if (old) db.prepare('DELETE FROM images WHERE key = ?').run(old);
    send(res, 200, { user: { ...user, avatar: key } });
  }, { auth: true });

  // ---------- Sertifikatlar ----------
  r.get('/api/certificates/:code', ({ req, res, params }) => {
    if (!certLimiter.hit(clientIp(req)).ok) throw new HttpError(429, "Juda ko'p so'rov. Bir daqiqadan keyin davom eting");
    const c = cert.byCode(params.code);
    if (!c) throw new HttpError(404, 'Sertifikat topilmadi');
    send(res, 200, { certificate: c });
  });

  r.get('/api/me/certificates', ({ res, user }) => send(res, 200, { certificates: cert.forUser(user.id) }), { auth: true });

  // ---------- Guruhlar: talaba tomoni ----------
  r.get('/api/me/groups', ({ res, user }) => {
    const groups = db.prepare(`SELECT g.id, g.name, u.name AS teacher, m.joined_at,
        (SELECT COUNT(*) FROM group_members x WHERE x.group_id = g.id) AS members,
        (SELECT COUNT(*) FROM tests t WHERE t.group_id = g.id AND t.is_active = 1) AS tests
      FROM group_members m JOIN groups g ON g.id = m.group_id LEFT JOIN users u ON u.id = g.teacher_id
      WHERE m.user_id = ? ORDER BY m.joined_at DESC`).all(user.id);
    send(res, 200, { groups });
  }, { auth: true });

  r.post('/api/groups/join', ({ req, res, body, user }) => {
    const lim = joinLimiter.hit(`${clientIp(req)}|${user.id}`);
    if (!lim.ok) throw new HttpError(429, "Juda ko'p urinish. {min} daqiqadan keyin qayta urinib ko'ring", { min: Math.ceil(lim.retryAfter / 60) });
    const code = String(body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const g = code.length === 6 ? db.prepare('SELECT id, name FROM groups WHERE code = ?').get(code) : null;
    if (!g) throw new HttpError(404, "Bunday kodli guruh topilmadi. Kodni o'qituvchingizdan tekshiring");
    const r2 = db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)').run(g.id, user.id, Date.now());
    if (!r2.changes) throw new HttpError(409, "Siz allaqachon bu guruh a'zosisiz");
    send(res, 200, { group: g });
  }, { auth: true });

  r.post('/api/groups/:id/leave', ({ res, params, user }) => {
    if (!db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(Number(params.id), user.id).changes) throw new HttpError(404, 'Guruh topilmadi');
    send(res, 200, { ok: true });
  }, { auth: true });

  // ---------- Guruhlar: o'qituvchi tomoni ----------
  r.get('/api/admin/groups', ({ res, user }) => {
    const all = user.role === 'admin' ? 1 : 0;
    const groups = db.prepare(`SELECT g.id, g.name, g.code, g.created_at, g.teacher_id, u.name AS teacher,
        (SELECT COUNT(*) FROM group_members m WHERE m.group_id = g.id) AS members,
        (SELECT COUNT(*) FROM tests t WHERE t.group_id = g.id) AS tests,
        (SELECT ROUND(AVG(a.percent)) FROM attempts a JOIN group_members m ON m.user_id = a.user_id AND m.group_id = g.id WHERE a.status = 'finished') AS avg
      FROM groups g LEFT JOIN users u ON u.id = g.teacher_id
      WHERE (? = 1 OR g.teacher_id = ?) ORDER BY g.name`).all(all, user.id);
    send(res, 200, { groups });
  }, STAFF);

  r.post('/api/admin/groups', ({ res, body, user }) => {
    const name = v.str(body.name, 'Guruh nomi', { min: 2, max: 60 });
    for (let i = 0; i < 5; i++) {
      try {
        const id = Number(db.prepare('INSERT INTO groups (name, code, teacher_id, created_at) VALUES (?, ?, ?, ?)')
          .run(name, newGroupCode(), user.id, Date.now()).lastInsertRowid);
        return send(res, 201, { id });
      } catch (e) { if (!String(e.message).includes('UNIQUE')) throw e; }
    }
    throw new HttpError(500, "Serverda kutilmagan xatolik. Birozdan keyin qayta urinib ko'ring");
  }, STAFF);

  r.get('/api/admin/groups/:id', ({ res, params, user }) => {
    const g = ownGroup(params.id, user);
    const members = db.prepare(`SELECT u.id, u.name, u.email, u.avatar, m.joined_at, u.last_login,
        (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.status = 'finished') AS attempts,
        (SELECT ROUND(AVG(a.percent)) FROM attempts a WHERE a.user_id = u.id AND a.status = 'finished') AS avg,
        (SELECT MAX(a.finished_at) FROM attempts a WHERE a.user_id = u.id AND a.status = 'finished') AS last_attempt,
        (SELECT COUNT(*) FROM attempts a WHERE a.user_id = u.id AND a.violations > 0) AS flagged
      FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = ? ORDER BY u.name`).all(g.id);
    const tests = db.prepare(`SELECT t.id, tr(t.i18n, 'title', t.title) AS title, t.opens_at, t.closes_at, t.is_active,
        (SELECT COUNT(DISTINCT a.user_id) FROM attempts a JOIN group_members m ON m.user_id = a.user_id AND m.group_id = ?
          WHERE a.test_id = t.id AND a.status = 'finished') AS done,
        (SELECT ROUND(AVG(a.percent)) FROM attempts a JOIN group_members m ON m.user_id = a.user_id AND m.group_id = ?
          WHERE a.test_id = t.id AND a.status = 'finished') AS avg
      FROM tests t WHERE t.group_id = ? ORDER BY t.id DESC`).all(g.id, g.id, g.id);
    send(res, 200, { group: { id: g.id, name: g.name, code: g.code, created_at: g.created_at }, members, tests });
  }, STAFF);

  r.put('/api/admin/groups/:id', ({ res, params, body, user }) => {
    const g = ownGroup(params.id, user);
    db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(v.str(body.name, 'Guruh nomi', { min: 2, max: 60 }), g.id);
    send(res, 200, { ok: true });
  }, STAFF);

  r.post('/api/admin/groups/:id/code', ({ res, params, user }) => {
    const g = ownGroup(params.id, user);
    let code;
    for (let i = 0; i < 5; i++) {
      code = newGroupCode();
      try { db.prepare('UPDATE groups SET code = ? WHERE id = ?').run(code, g.id); break; } catch (e) { if (!String(e.message).includes('UNIQUE')) throw e; }
    }
    send(res, 200, { code });
  }, STAFF);

  r.delete('/api/admin/groups/:id', ({ res, params, user }) => {
    const g = ownGroup(params.id, user);
    db.prepare('DELETE FROM groups WHERE id = ?').run(g.id);
    send(res, 200, { ok: true });
  }, STAFF);

  r.post('/api/admin/groups/:id/members', ({ res, params, body, user }) => {
    const g = ownGroup(params.id, user);
    const email = v.email(body.email);
    const u = db.prepare('SELECT id, role FROM users WHERE email = ?').get(email);
    if (!u) throw new HttpError(404, "Bu email bilan ro'yxatdan o'tgan foydalanuvchi yo'q");
    const n = db.prepare('INSERT OR IGNORE INTO group_members (group_id, user_id, joined_at) VALUES (?, ?, ?)').run(g.id, u.id, Date.now()).changes;
    if (!n) throw new HttpError(409, "Bu foydalanuvchi allaqachon guruh a'zosi");
    send(res, 201, { ok: true });
  }, STAFF);

  r.delete('/api/admin/groups/:id/members/:uid', ({ res, params, user }) => {
    const g = ownGroup(params.id, user);
    if (!db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(g.id, Number(params.uid)).changes) throw new HttpError(404, 'Foydalanuvchi topilmadi');
    send(res, 200, { ok: true });
  }, STAFF);

  // O'qituvchi o'z guruhidagi talabaga, admin istalgan foydalanuvchiga vaqtinchalik parol beradi
  r.post('/api/admin/users/:id/password', ({ res, params, user }) => {
    const id = Number(params.id);
    const target = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
    if (!target) throw new HttpError(404, 'Foydalanuvchi topilmadi');
    if (id === user.id) throw new HttpError(400, "O'z parolingizni profil sahifasida o'zgartiring");
    if (user.role !== 'admin') {
      const mine = db.prepare(`SELECT 1 FROM group_members m JOIN groups g ON g.id = m.group_id WHERE m.user_id = ? AND g.teacher_id = ?`).get(id, user.id);
      if (target.role !== 'student' || !mine) throw new HttpError(403, "Faqat o'z guruhingizdagi talabalar parolini tiklay olasiz");
    }
    const password = tempPassword() + crypto.randomInt(10);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
    session.revokeAll(id);
    send(res, 200, { password });
  }, STAFF);

  // ---------- Shaxsiy statistika ----------
  r.get('/api/me/stats', ({ res, user }) => {
    const attempts = db.prepare(`SELECT a.id, a.percent, a.score, a.total, a.started_at, a.finished_at,
        tr(s.i18n, 'name', s.name) AS subject, s.slug, s.color, tr(t.i18n, 'title', t.title) AS title
      FROM attempts a JOIN tests t ON t.id = a.test_id JOIN subjects s ON s.id = t.subject_id
      WHERE a.user_id = ? AND a.status = 'finished' ORDER BY a.finished_at`).all(user.id);
    const byDifficulty = db.prepare(`SELECT q.difficulty, COUNT(*) AS shown,
        SUM(CASE WHEN ai.chosen IS NOT NULL AND json_extract(ai.option_order, '$[' || ai.chosen || ']') = q.correct THEN 1 ELSE 0 END) AS right
      FROM attempt_items ai JOIN attempts a ON a.id = ai.attempt_id JOIN questions q ON q.id = ai.question_id
      WHERE a.user_id = ? AND a.status = 'finished' GROUP BY q.difficulty ORDER BY q.difficulty`).all(user.id);
    const bySubject = db.prepare(`SELECT tr(s.i18n, 'name', s.name) AS name, s.slug, s.color, COUNT(*) AS shown,
        SUM(CASE WHEN ai.chosen IS NOT NULL AND json_extract(ai.option_order, '$[' || ai.chosen || ']') = q.correct THEN 1 ELSE 0 END) AS right,
        SUM(CASE WHEN ai.chosen IS NULL THEN 1 ELSE 0 END) AS skipped
      FROM attempt_items ai JOIN attempts a ON a.id = ai.attempt_id JOIN questions q ON q.id = ai.question_id JOIN subjects s ON s.id = q.subject_id
      WHERE a.user_id = ? AND a.status = 'finished' GROUP BY s.id ORDER BY s.sort`).all(user.id);
    send(res, 200, {
      attempts: attempts.map((x) => ({ ...x, duration: Math.round((x.finished_at - x.started_at) / 1000) })),
      byDifficulty, bySubject, mistakes: mistakeIds(user.id).length,
    });
  }, { auth: true });

  // Oxirgi marta noto'g'ri (yoki javobsiz) qolgan savollar — "xatolar ustida ishlash" mashqi uchun
  function mistakeIds(uid) {
    const rows = db.prepare(`SELECT ai.question_id AS id, a.finished_at,
        (ai.chosen IS NOT NULL AND json_extract(ai.option_order, '$[' || ai.chosen || ']') = q.correct) AS ok
      FROM attempt_items ai JOIN attempts a ON a.id = ai.attempt_id JOIN questions q ON q.id = ai.question_id
      WHERE a.user_id = ? AND a.status = 'finished' AND q.archived = 0 ORDER BY a.finished_at`).all(uid);
    const last = new Map();
    for (const x of rows) last.set(x.id, x.ok);
    return [...last].filter(([, ok]) => !ok).map(([id]) => id);
  }

  r.get('/api/practice-mistakes', ({ res, query, user }) => {
    const count = Math.min(Math.max(Number(query.get('count')) || 15, 5), 30);
    const ids = shuffle(mistakeIds(user.id)).slice(0, count);
    const get = db.prepare(`SELECT q.id, tr(q.i18n, 'text', q.text) AS text, tr(q.i18n, 'options', q.options) AS options, q.difficulty, q.image,
        tr(s.i18n, 'name', s.name) AS subject, s.slug, s.color FROM questions q JOIN subjects s ON s.id = q.subject_id WHERE q.id = ?`);
    const items = ids.map((id) => get.get(id)).filter(Boolean)
      .map((q) => ({ id: q.id, text: q.text, image: q.image || null, difficulty: q.difficulty, subject: q.subject, color: q.color, options: shuffle(JSON.parse(q.options)) }));
    send(res, 200, { items, total: ids.length });
  }, { auth: true });

  // ---------- Zaxira holati (admin) ----------
  r.get('/api/admin/backup', ({ res }) => send(res, 200, { backup: { ...backup.status, every: backup.EVERY_MIN } }), ADMIN);
  r.post('/api/admin/backup', async ({ res }) => {
    if (!backup.status.enabled) throw new HttpError(400, 'Zaxiralash sozlanmagan');
    const ok = await backup.backup({ force: true });
    if (!ok) throw new HttpError(502, 'Zaxira saqlanmadi: {error}', { error: backup.status.lastError || '—' });
    send(res, 200, { backup: { ...backup.status, every: backup.EVERY_MIN } });
  }, ADMIN);
};
