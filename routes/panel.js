// Alohida boshqaruv paneli uchun: tashriflar statistikasi va sertifikatlar ro'yxati
const db = require('../db');
const { send, HttpError, clientIp, SECURITY_HEADERS } = require('../lib/http');
const { rateLimiter } = require('../lib/security');
const { t, getCurrent } = require('../lib/i18n');

const STAFF = { roles: ['teacher', 'admin'] };
const visitLimiter = rateLimiter({ windowMs: 60e3, max: 90 });
const TZ = process.env.APP_TZ || 'Asia/Tashkent';
const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const dayOf = (ms) => dayFmt.format(new Date(ms)); // YYYY-MM-DD, mahalliy vaqt bo'yicha
const like = (s) => `%${String(s || '').replace(/[%_\\]/g, '\\$&')}%`;
const PAGE = 25;

// Manzilni guruhlash: /test/15 → /test, /fan/fizika qoladi
function normPath(p) {
  const s = String(p || '/').split('?')[0].slice(0, 80);
  if (!s.startsWith('/')) return '/';
  const parts = s.split('/').filter(Boolean);
  if (!parts.length) return '/';
  if (['test', 'natija', 'sertifikat'].includes(parts[0])) return `/${parts[0]}`;
  if (['fan', 'mashq'].includes(parts[0]) && parts[1]) return `/${parts[0]}/${parts[1].replace(/[^a-z0-9-]/gi, '').slice(0, 40)}`;
  return `/${parts[0].replace(/[^a-z0-9-]/gi, '').slice(0, 30)}`;
}

let lastPurge = 0;

const csvCell = (x) => {
  const s = String(x ?? '');
  return /[",\n;]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s;
};

module.exports = (r) => {
  // ---------- Tashrifni qayd etish (sayt sahifalari ochilganda) ----------
  r.post('/api/visit', ({ req, res, body, user }) => {
    const vid = String(body.vid || '');
    if (!/^[a-z0-9]{12,32}$/.test(vid)) return send(res, 200, { ok: true });
    if (!visitLimiter.hit(clientIp(req)).ok) return send(res, 200, { ok: true });
    const now = Date.now();
    const mobile = /Mobi|Android|iPhone|iPad/i.test(req.headers['user-agent'] || '') ? 1 : 0;
    db.prepare('INSERT INTO visits (day, vid, user_id, path, mobile, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(dayOf(now), vid, user ? user.id : null, normPath(body.path), mobile, now);
    if (now - lastPurge > 864e5) { lastPurge = now; db.prepare('DELETE FROM visits WHERE created_at < ?').run(now - 365 * 864e5); }
    send(res, 200, { ok: true });
  });

  // ---------- Tashriflar statistikasi ----------
  r.get('/api/admin/visits', ({ res, query }) => {
    const days = Math.min(Math.max(Number(query.get('days')) || 30, 7), 90);
    const now = Date.now();
    const today = dayOf(now);
    const since = (d) => dayOf(now - (d - 1) * 864e5);
    const agg = (from) => db.prepare(`SELECT COUNT(DISTINCT vid) AS visitors, COUNT(*) AS views, COUNT(DISTINCT user_id) AS users
      FROM visits WHERE day >= ?`).get(from);
    const rows = db.prepare(`SELECT day, COUNT(DISTINCT vid) AS visitors, COUNT(*) AS views, COUNT(DISTINCT user_id) AS users
      FROM visits WHERE day >= ? GROUP BY day`).all(since(days));
    const map = new Map(rows.map((x) => [x.day, x]));
    const series = Array.from({ length: days }, (_, i) => {
      const d = dayOf(now - (days - 1 - i) * 864e5);
      return { day: d, visitors: map.get(d)?.visitors || 0, views: map.get(d)?.views || 0, users: map.get(d)?.users || 0 };
    });
    const from = since(days);
    // Ro'yxatdan o'tganlar va mehmonlar (bir xil brauzer ham mehmon, ham foydalanuvchi bo'lishi mumkin)
    const split = db.prepare(`SELECT COUNT(DISTINCT CASE WHEN user_id IS NULL THEN vid END) AS guests,
        COUNT(DISTINCT user_id) AS members, COUNT(DISTINCT CASE WHEN mobile = 1 THEN vid END) AS mobile,
        COUNT(DISTINCT CASE WHEN mobile = 0 THEN vid END) AS desktop FROM visits WHERE day >= ?`).get(from);
    const pages = db.prepare(`SELECT path, COUNT(*) AS views, COUNT(DISTINCT vid) AS visitors FROM visits WHERE day >= ?
      GROUP BY path ORDER BY views DESC LIMIT 12`).all(from);
    const names = new Map(db.prepare("SELECT slug, tr(i18n, 'name', name) AS name FROM subjects").all().map((x) => [x.slug, x.name]));
    const recent = db.prepare(`SELECT u.id, u.name, u.email, u.role, u.avatar, u.group_name AS "group", MAX(v.created_at) AS last, COUNT(*) AS views
      FROM visits v JOIN users u ON u.id = v.user_id WHERE v.day >= ? GROUP BY u.id ORDER BY last DESC LIMIT 15`).all(since(7));
    send(res, 200, {
      today: agg(today), week: agg(since(7)), month: agg(since(30)), series, split,
      pages: pages.map((p) => ({ ...p, subject: names.get(p.path.split('/')[2]) || null })),
      recent,
      accounts: {
        total: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'student'").get().c,
        newWeek: db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'student' AND created_at >= ?").get(now - 7 * 864e5).c,
        loginsToday: db.prepare('SELECT last_login FROM users WHERE last_login >= ?').all(now - 2 * 864e5).filter((x) => dayOf(x.last_login) === today).length,
      },
    });
  }, STAFF);

  // ---------- Sertifikatlar: kim oldi, kim ololmadi ----------
  // Har bir talaba + sertifikatli test juftligi uchun eng yaxshi natija
  function certQuery(query) {
    const tid = Number(query.get('test')) || 0;
    const gid = Number(query.get('group')) || 0;
    const status = ['got', 'missed'].includes(query.get('status')) ? query.get('status') : '';
    const q = query.get('q') || '';
    const sql = `SELECT * FROM (
        SELECT a.user_id, a.test_id, MAX(a.percent) AS best, COUNT(*) AS attempts, MAX(a.finished_at) AS last,
          u.name, u.email, u.group_name AS "group", u.avatar, t.cert_percent,
          tr(t.i18n, 'title', t.title) AS title, tr(s.i18n, 'name', s.name) AS subject, s.color,
          (SELECT c.code FROM certificates c JOIN attempts x ON x.id = c.attempt_id
             WHERE x.user_id = a.user_id AND x.test_id = a.test_id ORDER BY c.percent DESC LIMIT 1) AS code,
          (SELECT MAX(x.percent) FROM attempts x WHERE x.user_id = a.user_id AND x.test_id = a.test_id AND x.status = 'finished'
             AND x.finish_reason = 'violations') AS violated
        FROM attempts a JOIN users u ON u.id = a.user_id JOIN tests t ON t.id = a.test_id JOIN subjects s ON s.id = t.subject_id
        WHERE a.status = 'finished' AND t.cert_percent > 0 AND u.role = 'student'
          AND (? = 0 OR a.test_id = ?) AND (? = 0 OR a.user_id IN (SELECT user_id FROM group_members WHERE group_id = ?))
          AND (u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR IFNULL(u.group_name, '') LIKE ? ESCAPE '\\')
        GROUP BY a.user_id, a.test_id)
      WHERE (? = '' OR (? = 'got' AND code IS NOT NULL) OR (? = 'missed' AND code IS NULL))`;
    return { sql, args: [tid, tid, gid, gid, like(q), like(q), like(q), status, status, status] };
  }

  r.get('/api/admin/certificates', ({ res, query }) => {
    const { sql, args } = certQuery(query);
    const all = db.prepare(`${sql} ORDER BY last DESC`).all(...args);
    const page = Math.max(1, Number(query.get('page')) || 1);
    const got = all.filter((x) => x.code).length;
    send(res, 200, {
      summary: { total: all.length, got, missed: all.length - got, rate: all.length ? Math.round((got / all.length) * 100) : null,
        issued: db.prepare('SELECT COUNT(*) AS c FROM certificates').get().c },
      rows: all.slice((page - 1) * PAGE, page * PAGE),
      total: all.length, page, pages: Math.max(1, Math.ceil(all.length / PAGE)),
      tests: db.prepare(`SELECT t.id, tr(t.i18n, 'title', t.title) AS title, t.cert_percent FROM tests t WHERE t.cert_percent > 0 ORDER BY t.subject_id, t.id`).all(),
    });
  }, STAFF);

  r.get('/api/admin/certificates.csv', ({ res, query }) => {
    const { sql, args } = certQuery(query);
    const rows = db.prepare(`${sql} ORDER BY last DESC`).all(...args);
    const L = getCurrent();
    const fmt = (ms) => new Date(ms + 5 * 36e5).toISOString().slice(0, 16).replace('T', ' ');
    const head = ['Talaba', 'Email', 'Guruh', 'Fan', 'Test', 'Eng yaxshi natija (%)', 'Kerakli (%)', 'Urinishlar', 'Holat', 'Sertifikat raqami', 'Oxirgi urinish'].map((h) => t(L, h));
    const lines = [head].concat(rows.map((x) => [x.name, x.email, x.group, x.subject, x.title, x.best, x.cert_percent, x.attempts,
      x.code ? t(L, 'Sertifikat oldi') : t(L, 'Ololmadi'), x.code || '', fmt(x.last)]));
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
      'Content-Disposition': `attachment; filename="edutest-sertifikatlar-${new Date().toISOString().slice(0, 10)}.csv"` });
    res.end('﻿' + lines.map((l) => l.map(csvCell).join(';')).join('\r\n'));
  }, STAFF);
};

module.exports.normPath = normPath;
