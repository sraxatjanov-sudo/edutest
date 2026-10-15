// Sessiyalar: tasodifiy token cookie'da, bazada esa uning SHA-256 xeshi saqlanadi
const crypto = require('node:crypto');
const db = require('../db');
const { newToken } = require('./security');
const { parseCookies } = require('./http');

const DAYS = 7;
const COOKIE = 'sid';
const hashToken = (t) => crypto.createHash('sha256').update(t).digest('hex');

function create(userId, secure) {
  const token = newToken();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(hashToken(token), userId, Date.now() + DAYS * 864e5);
  db.prepare('UPDATE users SET last_login = ? WHERE id = ?').run(Date.now(), userId);
  return `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${DAYS * 86400}${secure ? '; Secure' : ''}`;
}

function destroy(req) {
  const token = parseCookies(req)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(hashToken(token));
  return `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`;
}

function userFrom(req) {
  const token = parseCookies(req)[COOKIE];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = db.prepare(`SELECT u.id, u.name, u.email, u.role, u.group_name, u.is_blocked, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`).get(hashToken(token));
  if (!row || row.expires_at < Date.now() || row.is_blocked) {
    if (row) db.prepare('DELETE FROM sessions WHERE token = ?').run(hashToken(token));
    return null;
  }
  return { id: row.id, name: row.name, email: row.email, role: row.role, group: row.group_name };
}

function purgeExpired() {
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
}

function revokeAll(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

module.exports = { create, destroy, userFrom, purgeExpired, revokeAll };
