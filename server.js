// EduTest — onlayn test platformasi. Ishga tushirish: npm start
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const backup = require('./lib/backup');
const { send, readBody, HttpError, SECURITY_HEADERS } = require('./lib/http');
const i18n = require('./lib/i18n');

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC = path.join(__dirname, 'public');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json', '.webp': 'image/webp', '.jpg': 'image/jpeg',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

// Baza va marshrutlar ishga tushishda yuklanadi (avval zaxiradan tiklash kerak bo'lishi mumkin)
let db, session, exam, router;
function boot() {
  db = require('./db');
  const { seed } = require('./db/seed');
  if (seed()) console.log('Baza yaratildi va boshlang\'ich ma\'lumotlar qo\'shildi.');
  session = require('./lib/session');
  exam = require('./lib/exam');
  const Router = require('./lib/router');
  router = new Router();
  require('./routes/auth')(router);
  require('./routes/student')(router);
  require('./routes/admin')(router);
  require('./routes/extra')(router);
  require('./routes/panel')(router);
}

function serveStatic(req, res, pathname) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { rel = '/'; }
  let file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep) && file !== PUBLIC) { res.writeHead(403, SECURITY_HEADERS); return res.end(); }
  let isFile = false;
  try { isFile = fs.statSync(file).isFile(); } catch { /* yo'q */ }
  // Kengaytmasiz yo'llar — SPA sahifalari, index.html qaytariladi
  if (!isFile) {
    if (path.extname(rel)) { res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Topilmadi'); }
    // Boshqaruv paneli — alohida ilova (/panel), asosiy sayt — index.html
    const isPanel = rel === '/panel' || rel.startsWith('/panel/');
    file = path.join(PUBLIC, isPanel ? 'panel.html' : 'index.html');
    if (isPanel) res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }
  const ext = path.extname(file);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
  });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).pipe(res);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const { pathname } = url;

  if (!pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, SECURITY_HEADERS); return res.end(); }
    return serveStatic(req, res, pathname);
  }

  const lang = i18n.langFrom(req);
  try {
    i18n.setCurrent(lang);
    const found = router.match(req.method, pathname);
    if (!found) throw new HttpError(404, 'Bunday API manzil yo\'q');
    if (found.methodNotAllowed) throw new HttpError(405, 'Bu metod qo\'llab-quvvatlanmaydi');

    // CSRF himoyasi: o'zgartiruvchi so'rovlar faqat shu saytdan va JSON ko'rinishida qabul qilinadi
    if (req.method !== 'GET') {
      const ct = req.headers['content-type'] || '';
      if (!ct.startsWith('application/json')) throw new HttpError(415, 'So\'rov JSON formatida bo\'lishi kerak');
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) throw new HttpError(403, 'Boshqa saytdan yuborilgan so\'rov rad etildi');
    }

    const user = session.userFrom(req);
    const { route, params } = found;
    if (route.auth && !user) throw new HttpError(401, 'Davom etish uchun tizimga kiring');
    if (route.roles && !route.roles.includes(user.role)) throw new HttpError(403, 'Bu bo\'lim sizning rolingiz uchun yopiq');

    const body = req.method === 'GET' ? {} : await readBody(req);
    const secure = req.headers['x-forwarded-proto'] === 'https' || Boolean(req.socket.encrypted);
    i18n.setCurrent(lang); // tana o'qilayotganda boshqa so'rov tilni o'zgartirgan bo'lishi mumkin
    await route.handler({ req, res, params, body, user, query: url.searchParams, secure, lang });
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: i18n.t(lang, e.message, e.params) });
    if (String(e.message).includes('UNIQUE constraint')) return send(res, 409, { error: i18n.t(lang, 'Bunday yozuv allaqachon mavjud') });
    console.error(new Date().toISOString(), req.method, pathname, e);
    send(res, 500, { error: i18n.t(lang, "Serverda kutilmagan xatolik. Birozdan keyin qayta urinib ko'ring") });
  }
});

(async function main() {
  await backup.restore(require('./db/file'));
  boot();
  // Fon jarayonlari: vaqti tugagan testlarni yakunlash va eskirgan sessiyalarni tozalash
  setInterval(() => { try { exam.sweepExpired(); } catch (e) { console.error(e); } }, 15e3).unref();
  setInterval(() => { try { session.purgeExpired(); } catch (e) { console.error(e); } }, 36e5).unref();
  backup.start();
  server.listen(PORT, () => {
    console.log(`EduTest ishga tushdi: http://localhost:${PORT}`);
  });
})().catch((e) => { console.error('Ishga tushirishda xato:', e); process.exit(1); });

let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close();
  setTimeout(() => process.exit(0), 25e3).unref();
  try { await backup.final(); } catch (e) { console.error(e); }
  try { db?.close(); } catch { /* */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

module.exports = server;
