// Avtomatik API testlari: npm test
// Har safar vaqtinchalik bazada alohida server ishga tushiriladi
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

const PORT = 3900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
const dbFile = path.join(os.tmpdir(), `edutest-test-${process.pid}.db`);
let proc;

function client() {
  let cookie = '';
  return async (method, url, body, headers = {}) => {
    const res = await fetch(BASE + url, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, data: type.includes('json') ? await res.json() : await res.text() };
  };
}

before(async () => {
  proc = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), DB_FILE: dbFile }, stdio: 'pipe',
  });
  await new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => { if (String(d).includes('ishga tushdi')) resolve(); });
    proc.on('exit', (c) => reject(new Error('Server to\'xtadi: ' + c)));
    setTimeout(() => reject(new Error('Server ishga tushmadi')), 8000);
  });
});

after(() => {
  proc?.kill();
  for (const s of ['', '-wal', '-shm']) fs.rmSync(dbFile + s, { force: true });
});

test('katalog: fanlar va savollar soni', async () => {
  const api = client();
  const { data } = await api('GET', '/api/subjects');
  assert.ok(data.subjects.length >= 10);
  const total = data.subjects.reduce((s, x) => s + x.question_count, 0);
  assert.ok(total >= 350, `savollar soni ${total}`);
});

test('ro\'yxatdan o\'tish: kuchsiz parol rad etiladi', async () => {
  const api = client();
  const r = await api('POST', '/api/auth/register', { name: 'Ali Valiyev', email: 'ali@test.uz', password: '123' });
  assert.equal(r.status, 400);
});

test('to\'liq imtihon oqimi va nusxa olishga qarshi himoya', async () => {
  const api = client();
  const reg = await api('POST', '/api/auth/register', { name: 'Ali Valiyev', email: 'ali@test.uz', password: 'parol1234', group: '211' });
  assert.equal(reg.status, 201);

  const { data: subj } = await api('GET', '/api/subjects/matematika');
  const t = subj.tests[0];
  const start = await api('POST', `/api/tests/${t.id}/start`, {});
  assert.equal(start.status, 200);
  const id = start.data.attemptId;

  // Qayta boshlash o'sha urinishni qaytaradi (sahifa yangilansa ham davom etadi)
  const again = await api('POST', `/api/tests/${t.id}/start`, {});
  assert.equal(again.data.attemptId, id);

  const { data } = await api('GET', `/api/attempts/${id}`);
  const a = data.attempt;
  assert.equal(a.items.length, t.question_count);
  // To'g'ri javob ham, savol ID si ham mijozga yuborilmaydi
  const raw = JSON.stringify(a);
  assert.ok(!raw.includes('"correct"'));
  assert.ok(!raw.includes('question_id'));

  // Boshqa talaba bu urinishni ko'ra olmaydi
  const other = client();
  await other('POST', '/api/auth/register', { name: 'Vali Aliyev', email: 'vali@test.uz', password: 'parol1234' });
  assert.equal((await other('GET', `/api/attempts/${id}`)).status, 404);

  // Ikkinchi talabada savollar tartibi farq qiladi (ehtimoliy, lekin 20 ta savolda deyarli aniq)
  const s2 = await other('POST', `/api/tests/${t.id}/start`, {});
  const b = (await other('GET', `/api/attempts/${s2.data.attemptId}`)).data.attempt;
  assert.notDeepEqual(a.items.map((x) => x.text), b.items.map((x) => x.text));

  // Javoblar saqlanadi, noto'g'ri variant rad etiladi
  assert.equal((await api('PUT', `/api/attempts/${id}/answer`, { position: 0, choice: 1 })).status, 200);
  assert.equal((await api('PUT', `/api/attempts/${id}/answer`, { position: 0, choice: 99 })).status, 400);

  // Qoidabuzarliklar: chegaraga yetganda test avtomatik yakunlanadi
  let v;
  for (let i = 0; i < t.max_violations; i++) {
    v = (await api('POST', `/api/attempts/${id}/violation`, { type: 'tab_hidden' })).data;
    if (!v.finished) await new Promise((r) => setTimeout(r, 1600));
  }
  assert.equal(v.finished, true);

  const res = (await api('GET', `/api/attempts/${id}`)).data.result;
  assert.equal(res.finishReason, 'violations');
  assert.equal(res.total, t.question_count);
  assert.ok(res.percent >= 0 && res.percent <= 100);

  // Yakunlangan testga javob yozib bo'lmaydi
  assert.equal((await api('PUT', `/api/attempts/${id}/answer`, { position: 1, choice: 0 })).status, 409);
});

test('rollar: talaba admin bo\'limiga kira olmaydi, admin kira oladi', async () => {
  const st = client();
  await st('POST', '/api/auth/login', { email: 'talaba@edutest.uz', password: 'talaba123' });
  assert.equal((await st('GET', '/api/admin/overview')).status, 403);

  const ad = client();
  assert.equal((await ad('POST', '/api/auth/login', { email: 'admin@edutest.uz', password: 'admin123' })).status, 200);
  const o = await ad('GET', '/api/admin/overview');
  assert.equal(o.status, 200);
  assert.ok(o.data.counts.questions >= 350);
});

test('o\'qituvchi savollarni import qiladi', async () => {
  const t = client();
  await t('POST', '/api/auth/login', { email: 'teacher@edutest.uz', password: 'teacher123' });
  const text = 'Poytaxtimiz?\n+Toshkent\n-Samarqand\n-Buxoro\n?Toshkent — poytaxt\n\n2 + 2 = ?\n+4\n-5\n!1';
  const r = await t('POST', '/api/admin/questions/import', { subject_id: 1, text });
  assert.equal(r.status, 201);
  assert.equal(r.data.count, 2);
  const bad = await t('POST', '/api/admin/questions/import', { subject_id: 1, text: 'Savol\n-a\n-b' });
  assert.equal(bad.status, 400);
  // O'qituvchi foydalanuvchilarni boshqara olmaydi
  assert.equal((await t('GET', '/api/admin/users')).status, 403);
});

test('xavfsizlik: CSRF, SQL injeksiya, fayl yo\'li, sarlavhalar', async () => {
  const api = client();
  // JSON bo'lmagan POST rad etiladi
  const form = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'email=a' });
  assert.equal(form.status, 415);
  // Boshqa saytdan kelgan so'rov
  const evil = await api('POST', '/api/auth/login', { email: 'x', password: 'y' }, { Origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
  // SQL injeksiya urinishi
  const inj = await api('POST', '/api/auth/login', { email: "' OR 1=1 --", password: 'x' });
  assert.equal(inj.status, 401);
  // Fayl yo'lini aylanib o'tish
  const trav = await fetch(BASE + '/%2e%2e/server.js');
  assert.ok(!(await trav.text()).includes('require('));
  // Xavfsizlik sarlavhalari
  const home = await fetch(BASE + '/');
  assert.ok(home.headers.get('content-security-policy'));
  assert.equal(home.headers.get('x-frame-options'), 'DENY');
});

test('kirish urinishlari cheklanadi', async () => {
  const api = client();
  let last;
  for (let i = 0; i < 9; i++) last = await api('POST', '/api/auth/login', { email: 'brute@test.uz', password: 'wrong' + i });
  assert.equal(last.status, 429);
});

test('mashq rejimi javobni tekshiradi', async () => {
  const api = client();
  const { data } = await api('GET', '/api/practice/fizika?count=5');
  assert.equal(data.items.length, 5);
  const q = data.items[0];
  const r = await api('POST', '/api/practice/check', { id: q.id, answer: q.options[0] });
  assert.equal(typeof r.data.ok, 'boolean');
  assert.ok(q.options.includes(r.data.correct));
});

test('vaqt tugasa urinish serverda avtomatik yakunlanadi', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const api = client();
  await api('POST', '/api/auth/register', { name: 'Timur Vaqt', email: 'vaqt@test.uz', password: 'parol1234' });
  const { data: subj } = await api('GET', '/api/subjects/kimyo');
  const { data } = await api('POST', `/api/tests/${subj.tests[1].id}/start`, {});
  await api('PUT', `/api/attempts/${data.attemptId}/answer`, { position: 0, choice: 0 });
  // Muddatni o'tmishga suramiz (soatni "aldash" emas, server vaqti hal qiladi)
  const raw = new DatabaseSync(dbFile);
  raw.prepare('UPDATE attempts SET deadline = ? WHERE id = ?').run(Date.now() - 60e3, data.attemptId);
  raw.close();
  assert.equal((await api('PUT', `/api/attempts/${data.attemptId}/answer`, { position: 1, choice: 0 })).status, 409);
  const res = (await api('GET', `/api/attempts/${data.attemptId}`)).data.result;
  assert.equal(res.finishReason, 'timeout');
});

test("ko'p tillilik: fanlar, xatolar va imtihon 3 tilda", async () => {
  const api = client();
  const L = (lang) => ({ 'X-Lang': lang });
  const ru = (await api('GET', '/api/subjects', undefined, L('ru'))).data.subjects;
  assert.equal(ru.length, 11);
  assert.ok(ru.some((s) => s.name === 'Математика'));
  assert.ok(ru.some((s) => s.name === 'Русский язык'));
  const kaa = (await api('GET', '/api/subjects', undefined, L('kaa'))).data.subjects;
  assert.ok(kaa.some((s) => s.name === 'Ximiya'));

  const bad = await api('POST', '/api/auth/login', { email: 'yoq@test.uz', password: 'x' }, L('ru'));
  assert.equal(bad.data.error, 'Неверный email или пароль');

  // Imtihonni qoraqalpoqcha boshlab, natijani ruscha ko'rish: to'g'ri javob indeksi ikkala tilda ham mos bo'lishi kerak
  await api('POST', '/api/auth/register', { name: 'Til Sinov', email: 'til@test.uz', password: 'parol1234' });
  const { data: subj } = await api('GET', '/api/subjects/matematika');
  const id = (await api('POST', `/api/tests/${subj.tests[1].id}/start`, {}, L('kaa'))).data.attemptId;
  const a = (await api('GET', `/api/attempts/${id}`, undefined, L('kaa'))).data.attempt;
  assert.ok(/[ıǵńáóú]/.test(a.items.map((x) => x.text).join(' ')), 'savollar qoraqalpoqcha emas');
  for (const it of a.items) await api('PUT', `/api/attempts/${id}/answer`, { position: it.position, choice: 0 });
  const uz = (await api('POST', `/api/attempts/${id}/finish`, {}, L('uz'))).data.result;
  const r = (await api('GET', `/api/attempts/${id}`, undefined, L('ru'))).data.result;
  assert.equal(r.score, uz.score);
  assert.ok(/[а-я]/.test(r.review[0].text), 'tahlil ruscha emas');
  r.review.forEach((q, i) => {
    assert.equal(q.correct, uz.review[i].correct, 'to\'g\'ri javob o\'rni tillarda farq qiladi');
    // Raqamli javoblar har ikki tilda bir xil bo'ladi
    if (/^[\d\s,./+\-−·√°πx²³]+$/.test(uz.review[i].options[uz.review[i].correct])) {
      assert.equal(q.options[q.correct], uz.review[i].options[uz.review[i].correct]);
    }
  });
  assert.equal(r.grade.label === uz.grade.label, false, 'baho nomi tarjima qilinmagan');
});

test('eski baza yangilanadi: yangi fan va tarjimalar qo\'shiladi', async () => {
  const { DatabaseSync } = require('node:sqlite');
  const raw = new DatabaseSync(dbFile);
  raw.exec("UPDATE subjects SET i18n = NULL; UPDATE questions SET i18n = NULL; UPDATE tests SET i18n = NULL; DELETE FROM subjects WHERE slug = 'rus-tili';");
  raw.close();
  process.env.DB_FILE = dbFile;
  const { syncBank } = require('../db/seed');
  const r = syncBank();
  assert.equal(r.added, 1);
  assert.ok(r.translated > 300, `tarjima qilingan yozuvlar: ${r.translated}`);
  const again = syncBank();
  assert.equal(again.added + again.translated, 0, 'ikkinchi marta hech narsa o\'zgarmasligi kerak');
});
