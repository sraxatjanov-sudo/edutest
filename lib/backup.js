// Ma'lumotlar bazasini GitHub'dagi yopiq omborga zaxiralash va qayta tiklash.
// Bepul hostingda (Render free) disk vaqtinchalik: sayt qayta ishga tushganda baza o'chadi.
// Shuning uchun baza vaqti-vaqti bilan siqilgan holda yopiq GitHub omboriga yoziladi va ishga tushishda o'sha yerdan olinadi.
//
// Sozlash (muhit o'zgaruvchilari):
//   BACKUP_REPO   — "foydalanuvchi/ombor" (masalan sraxatjanov-sudo/edutest-data), ombor YOPIQ (private) bo'lishi shart
//   BACKUP_TOKEN  — GitHub tokeni (faqat shu omborga "Contents: Read and write" ruxsati bilan)
//   BACKUP_BRANCH — tarmoq (standart: main)
//   BACKUP_EVERY  — necha daqiqada bir zaxiralash (standart: 3)
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const os = require('node:os');

const API = process.env.BACKUP_API || 'https://api.github.com';
const REPO = String(process.env.BACKUP_REPO || '').trim().replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
const TOKEN = String(process.env.BACKUP_TOKEN || '').trim();
const BRANCH = process.env.BACKUP_BRANCH || 'main';
const FILE = 'edutest.db.gz';
const EVERY_MIN = Math.max(1, Number(process.env.BACKUP_EVERY) || 3);

const status = {
  enabled: Boolean(REPO && TOKEN && /^[\w.-]+\/[\w.-]+$/.test(REPO)),
  repo: REPO || null,
  restoredAt: null,      // qachon zaxiradan tiklandi
  restoredFrom: null,    // zaxira qachon yozilgan edi
  lastBackupAt: null,
  lastError: null,
  blocked: false,        // tiklashda xato bo'lsa, eski zaxirani buzib qo'ymaslik uchun yozish to'xtatiladi
  backups: 0,
};

let lastChanges = -1;
let running = null;
let timer = null;

async function gh(method, url, body, accept = 'application/vnd.github+json') {
  const res = await fetch(`${API}/repos/${REPO}${url}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: accept,
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'EduTest-backup',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30e3),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`GitHub ${method} ${url}: ${res.status} ${text.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  return accept.includes('raw') ? Buffer.from(await res.arrayBuffer()) : res.json();
}

// Ishga tushishda: lokal baza yo'q bo'lsa, zaxiradan tiklash
async function restore(dbFile) {
  if (!status.enabled) {
    if (REPO || TOKEN) console.warn('Zaxira: BACKUP_REPO yoki BACKUP_TOKEN noto\'g\'ri, zaxiralash o\'chirilgan.');
    return false;
  }
  if (fs.existsSync(dbFile) && process.env.BACKUP_RESTORE !== 'force') {
    console.log('Zaxira: lokal baza mavjud, tiklash shart emas.');
    return false;
  }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const gz = await gh('GET', `/contents/${FILE}?ref=${encodeURIComponent(BRANCH)}`, null, 'application/vnd.github.raw');
      const buf = zlib.gunzipSync(gz);
      if (buf.subarray(0, 15).toString() !== 'SQLite format 3') throw new Error('Zaxira fayli SQLite bazasi emas');
      for (const s of ['-wal', '-shm']) fs.rmSync(dbFile + s, { force: true });
      fs.mkdirSync(path.dirname(dbFile), { recursive: true });
      fs.writeFileSync(dbFile, buf);
      status.restoredAt = Date.now();
      console.log(`Zaxira: baza ${REPO} omboridan tiklandi (${Math.round(buf.length / 1024)} KB).`);
      return true;
    } catch (e) {
      if (e.status === 404 || e.status === 409) { // hali zaxira yo'q yoki ombor bo'sh — yangi baza bilan boshlaymiz
        console.log('Zaxira: omborda hali nusxa yo\'q, yangi baza yaratiladi.');
        return false;
      }
      status.lastError = e.message;
      console.error(`Zaxira: tiklashda xato (${attempt}/3):`, e.message);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  // Tiklab bo'lmadi: yangi bo'sh baza bilan ishlaymiz, lekin omboridagi eski zaxirani ustidan yozmaymiz
  status.blocked = true;
  console.error('Zaxira: tiklab bo\'lmadi. Ombordagi zaxirani buzmaslik uchun bu ishga tushishda zaxiralash to\'xtatildi.');
  return false;
}

function snapshot() {
  const db = require('../db');
  const tmp = path.join(os.tmpdir(), `edutest-snap-${process.pid}-${Date.now()}.db`);
  db.exec(`VACUUM INTO '${tmp.replace(/'/g, "''")}'`);
  try { return zlib.gzipSync(fs.readFileSync(tmp), { level: 9 }); } finally { fs.rmSync(tmp, { force: true }); }
}

// Omborda faqat bitta commit saqlanadi (eski nusxalar tarixda to'planib, omborni kattalashtirmasligi uchun)
async function upload(gz) {
  const message = `EduTest zaxira: ${new Date().toISOString()}`;
  try {
    const blob = await gh('POST', '/git/blobs', { content: gz.toString('base64'), encoding: 'base64' });
    const tree = await gh('POST', '/git/trees', { tree: [{ path: FILE, mode: '100644', type: 'blob', sha: blob.sha }] });
    const commit = await gh('POST', '/git/commits', { message, tree: tree.sha, parents: [] });
    try {
      await gh('PATCH', `/git/refs/heads/${BRANCH}`, { sha: commit.sha, force: true });
    } catch (e) {
      if (e.status !== 422 && e.status !== 404) throw e;
      await gh('POST', '/git/refs', { ref: `refs/heads/${BRANCH}`, sha: commit.sha });
    }
  } catch (e) {
    if (e.status !== 409) throw e;
    // Butunlay bo'sh ombor: birinchi faylni oddiy usulda yaratamiz
    await gh('PUT', `/contents/${FILE}`, { message, content: gz.toString('base64'), branch: BRANCH });
  }
}

async function backup({ force = false } = {}) {
  if (!status.enabled || status.blocked) return false;
  if (running) return running;
  const db = require('../db');
  const changes = db.prepare('SELECT total_changes() AS n').get().n;
  if (!force && changes === lastChanges) return false;
  running = (async () => {
    try {
      const gz = snapshot();
      await upload(gz);
      lastChanges = changes;
      status.lastBackupAt = Date.now();
      status.lastError = null;
      status.backups++;
      return true;
    } catch (e) {
      status.lastError = e.message;
      console.error('Zaxira: yozishda xato:', e.message);
      return false;
    } finally { running = null; }
  })();
  return running;
}

function start() {
  if (!status.enabled) return;
  // Birinchi nusxa ishga tushgandan bir daqiqa o'tib (yangi baza bo'lsa ham saqlanadi)
  setTimeout(() => backup(), 60e3).unref();
  timer = setInterval(() => backup(), EVERY_MIN * 60e3);
  timer.unref();
  console.log(`Zaxira: har ${EVERY_MIN} daqiqada ${REPO} omboriga saqlanadi.`);
}

// To'xtash oldidan oxirgi nusxa (Render qayta ishga tushirishdan oldin SIGTERM yuboradi)
async function final() {
  if (timer) clearInterval(timer);
  if (!status.enabled || status.blocked) return;
  await Promise.race([backup(), new Promise((r) => setTimeout(r, 20e3))]);
}

module.exports = { restore, backup, start, final, status, EVERY_MIN };
