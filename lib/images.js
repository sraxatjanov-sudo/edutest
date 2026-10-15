// Rasmlarni qabul qilish va saqlash (savol rasmlari, profil rasmlari)
const crypto = require('node:crypto');
const db = require('../db');
const { HttpError } = require('./http');

const MAX = 900 * 1024; // brauzerda kichraytirilgandan keyin odatda 50–300 KB bo'ladi

// Fayl turini kengaytma emas, ichidagi "sehrli baytlar" bo'yicha aniqlaymiz (SVG va boshqa xavfli turlar qabul qilinmaydi)
function sniff(buf) {
  if (buf.length > 8 && buf[0] === 0x89 && buf.subarray(1, 4).toString() === 'PNG') return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  if (buf.length > 6 && /^GIF8[79]a$/.test(buf.subarray(0, 6).toString())) return 'image/gif';
  return null;
}

// data:image/...;base64,... ko'rinishidagi matndan rasm saqlaydi, kalitini qaytaradi
function saveDataUrl(dataUrl, ownerId) {
  const m = /^data:image\/[a-z+.-]+;base64,([A-Za-z0-9+/=\s]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new HttpError(400, 'Rasm formati noto\'g\'ri');
  const buf = Buffer.from(m[1], 'base64');
  if (buf.length > MAX) throw new HttpError(413, 'Rasm hajmi juda katta (1 MB gacha)');
  const mime = sniff(buf);
  if (!mime) throw new HttpError(400, 'Faqat PNG, JPEG, WebP yoki GIF rasm yuklash mumkin');
  const key = crypto.randomBytes(12).toString('hex');
  db.prepare('INSERT INTO images (key, mime, data, size, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(key, mime, buf, buf.length, ownerId || null, Date.now());
  return key;
}

const validKey = (k) => typeof k === 'string' && /^[a-f0-9]{24}$/.test(k);
const get = (key) => (validKey(key) ? db.prepare('SELECT mime, data, size FROM images WHERE key = ?').get(key) : null);
const exists = (key) => validKey(key) && Boolean(db.prepare('SELECT 1 FROM images WHERE key = ?').get(key));

// Hech qayerda ishlatilmayotgan rasmlarni o'chirish (bir kundan eski — yangi yuklanib, hali saqlanmaganlarini qoldiramiz)
function purgeOrphans() {
  return db.prepare(`DELETE FROM images WHERE created_at < ? AND key NOT IN (SELECT image FROM questions WHERE image IS NOT NULL)
    AND key NOT IN (SELECT avatar FROM users WHERE avatar IS NOT NULL)`).run(Date.now() - 864e5).changes;
}

module.exports = { saveDataUrl, get, exists, validKey, purgeOrphans };
