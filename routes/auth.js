// Ro'yxatdan o'tish, kirish, chiqish, profil
const db = require('../db');
const session = require('../lib/session');
const v = require('../lib/validate');
const { send, HttpError, clientIp } = require('../lib/http');
const { hashPassword, verifyPassword, rateLimiter } = require('../lib/security');

const loginLimiter = rateLimiter({ windowMs: 15 * 60e3, max: 8 });
const registerLimiter = rateLimiter({ windowMs: 60 * 60e3, max: 10 });

function checkPassword(p) {
  const s = String(p ?? '');
  if (s.length < 8) throw new HttpError(400, 'Parol kamida 8 ta belgidan iborat bo\'lsin');
  if (s.length > 128) throw new HttpError(400, 'Parol juda uzun');
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) throw new HttpError(400, 'Parolda kamida bitta harf va bitta raqam bo\'lsin');
  return s;
}

const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, group: u.group_name ?? u.group ?? null });

module.exports = (r) => {
  r.post('/api/auth/register', ({ req, res, body, secure }) => {
    const lim = registerLimiter.hit(clientIp(req));
    if (!lim.ok) throw new HttpError(429, `Juda ko'p urinish. ${Math.ceil(lim.retryAfter / 60)} daqiqadan keyin qayta urinib ko'ring`);
    const name = v.str(body.name, 'Ism familiya', { min: 3, max: 80 });
    const email = v.email(body.email);
    const password = checkPassword(body.password);
    const group = v.str(body.group, 'Guruh', { max: 40, required: false }) || null;
    if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email)) throw new HttpError(409, 'Bu email bilan hisob allaqachon mavjud. Kirish sahifasidan foydalaning');
    const id = Number(db.prepare('INSERT INTO users (name, email, password_hash, role, group_name, created_at) VALUES (?, ?, ?, \'student\', ?, ?)')
      .run(name, email, hashPassword(password), group, Date.now()).lastInsertRowid);
    send(res, 201, { user: { id, name, email, role: 'student', group } }, { 'Set-Cookie': session.create(id, secure) });
  });

  r.post('/api/auth/login', ({ req, res, body, secure }) => {
    const email = String(body.email ?? '').trim().toLowerCase();
    const key = `${clientIp(req)}|${email}`;
    const lim = loginLimiter.hit(key);
    if (!lim.ok) throw new HttpError(429, `Juda ko'p muvaffaqiyatsiz urinish. ${Math.ceil(lim.retryAfter / 60)} daqiqadan keyin qayta urinib ko'ring`);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !verifyPassword(String(body.password ?? ''), user.password_hash)) {
      throw new HttpError(401, 'Email yoki parol noto\'g\'ri');
    }
    if (user.is_blocked) throw new HttpError(403, 'Hisobingiz bloklangan. Administratorga murojaat qiling');
    loginLimiter.clear(key);
    send(res, 200, { user: publicUser(user) }, { 'Set-Cookie': session.create(user.id, secure) });
  });

  r.post('/api/auth/logout', ({ req, res }) => {
    send(res, 200, { ok: true }, { 'Set-Cookie': session.destroy(req) });
  });

  r.get('/api/auth/me', ({ res, user }) => send(res, 200, { user }));

  r.put('/api/auth/profile', ({ res, body, user }) => {
    const name = v.str(body.name, 'Ism familiya', { min: 3, max: 80 });
    const group = v.str(body.group, 'Guruh', { max: 40, required: false }) || null;
    db.prepare('UPDATE users SET name = ?, group_name = ? WHERE id = ?').run(name, group, user.id);
    send(res, 200, { user: { ...user, name, group } });
  }, { auth: true });

  r.put('/api/auth/password', ({ res, body, user, secure }) => {
    const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(user.id);
    if (!verifyPassword(String(body.current ?? ''), row.password_hash)) throw new HttpError(400, 'Joriy parol noto\'g\'ri');
    const next = checkPassword(body.next);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), user.id);
    session.revokeAll(user.id);
    send(res, 200, { ok: true }, { 'Set-Cookie': session.create(user.id, secure) });
  }, { auth: true });
};

module.exports.publicUser = publicUser;
