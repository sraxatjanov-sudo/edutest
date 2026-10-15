// v3 imkoniyatlari: sertifikat, guruhlar, jadval, rasmlar, statistika, Excel importi, parol tiklash
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const PORT = 4900 + Math.floor(Math.random() * 90);
const BASE = `http://localhost:${PORT}`;
const dbFile = path.join(os.tmpdir(), `edutest-v3-${process.pid}.db`);
let proc;

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(BASE + url, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return { status: res.status, headers: res.headers, data: type.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer()) };
  };
}
async function login(email, password) {
  const api = client();
  const r = await api('POST', '/api/auth/login', { email, password });
  assert.equal(r.status, 200);
  return api;
}
async function register(name, email) {
  const api = client();
  assert.equal((await api('POST', '/api/auth/register', { name, email, password: 'parol1234' })).status, 201);
  return api;
}
// Testni to'g'ri javoblar bilan yechish (bazadan to'g'ri javobni o'qib)
async function solve(api, testId, wrongCount = 0) {
  const s = await api('POST', `/api/tests/${testId}/start`, {});
  assert.equal(s.status, 200, JSON.stringify(s.data));
  const id = s.data.attemptId;
  const db = new DatabaseSync(dbFile);
  const rows = db.prepare('SELECT ai.position, ai.option_order, q.correct FROM attempt_items ai JOIN questions q ON q.id = ai.question_id WHERE attempt_id = ? ORDER BY position').all(id);
  db.close();
  for (const [i, r] of rows.entries()) {
    const order = JSON.parse(r.option_order);
    const right = order.indexOf(r.correct);
    await api('PUT', `/api/attempts/${id}/answer`, { position: r.position, choice: i < wrongCount ? (right + 1) % order.length : right });
  }
  return (await api('POST', `/api/attempts/${id}/finish`, {})).data.result;
}

before(async () => {
  proc = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(PORT), DB_FILE: dbFile }, stdio: 'pipe' });
  await new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => { if (String(d).includes('ishga tushdi')) resolve(); });
    proc.on('exit', (c) => reject(new Error('Server to\'xtadi: ' + c)));
    setTimeout(() => reject(new Error('Server ishga tushmadi')), 8000);
  });
});
after(() => { proc?.kill(); for (const s of ['', '-wal', '-shm']) fs.rmSync(dbFile + s, { force: true }); });

test('sertifikat: yaxshi natijada beriladi, kod orqali hamma tekshira oladi', async () => {
  const api = await register('Sertifikat Egasi', 'cert@test.uz');
  const { data: subj } = await api('GET', '/api/subjects/kimyo');
  const general = subj.tests.find((x) => x.cert_percent > 0);
  assert.ok(general, 'umumiy testda sertifikat yoqilgan');
  const good = await solve(api, general.id, 1);
  assert.ok(good.percent >= 71);
  assert.match(good.certificate, /^EDU-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  // Begona (tizimga kirmagan) foydalanuvchi tekshiradi
  const anon = client();
  const v = await anon('GET', `/api/certificates/${good.certificate.toLowerCase()}`);
  assert.equal(v.status, 200);
  assert.equal(v.data.certificate.name, 'Sertifikat Egasi');
  assert.equal(v.data.certificate.percent, good.percent);
  assert.equal((await anon('GET', '/api/certificates/EDU-AAAA-AAAA')).status, 404);
  // Past natija — sertifikat yo'q
  const bad = await solve(api, general.id, 12);
  assert.equal(bad.certificate, null);
  assert.equal((await api('GET', '/api/me/certificates')).data.certificates.length, 1);
});

test('guruh: kod bilan qo\'shilish, guruh testi faqat a\'zolarga ko\'rinadi', async () => {
  const teacher = await login('teacher@edutest.uz', 'teacher123');
  const g = await teacher('POST', '/api/admin/groups', { name: '9-A sinf' });
  assert.equal(g.status, 201);
  const { data: detail } = await teacher('GET', `/api/admin/groups/${g.data.id}`);
  const code = detail.group.code;
  assert.match(code, /^[A-Z2-9]{6}$/);
  const { data: subs } = await teacher('GET', '/api/admin/subjects');
  const bio = subs.subjects.find((s) => s.slug === 'biologiya');
  const t = await teacher('POST', '/api/admin/tests', { subject_id: bio.id, title: '9-A nazorat ishi', question_count: 5, time_limit: 10, show_review: true, is_active: true, group_id: g.data.id });
  assert.equal(t.status, 201);

  const outsider = await register('Begona Talaba', 'outsider@test.uz');
  const member = await register('Guruh Azosi', 'member@test.uz');
  const seen = async (api) => (await api('GET', '/api/subjects/biologiya')).data.tests.some((x) => x.id === t.data.id);
  assert.equal(await seen(outsider), false);
  assert.equal((await outsider('POST', `/api/tests/${t.data.id}/start`, {})).status, 403);
  assert.equal((await client()('GET', '/api/subjects/biologiya')).data.tests.some((x) => x.id === t.data.id), false, 'mehmonga ham ko\'rinmaydi');

  assert.equal((await member('POST', '/api/groups/join', { code: 'XXXXXX' })).status, 404);
  const j = await member('POST', '/api/groups/join', { code: code.toLowerCase() });
  assert.equal(j.status, 200);
  assert.equal((await member('POST', '/api/groups/join', { code })).status, 409);
  assert.equal(await seen(member), true);
  assert.equal((await member('POST', `/api/tests/${t.data.id}/start`, {})).status, 200);
  assert.equal((await member('GET', '/api/me/groups')).data.groups[0].name, '9-A sinf');

  // Boshqa o'qituvchi bu guruhni boshqara olmaydi; admin hammasini ko'radi
  const admin = await login('admin@edutest.uz', 'admin123');
  const other = await register('Ikkinchi Oqituvchi', 'teacher2@test.uz');
  const { data: users } = await admin('GET', '/api/admin/users?q=teacher2');
  await admin('PUT', `/api/admin/users/${users.users[0].id}`, { role: 'teacher' });
  assert.equal((await other('GET', `/api/admin/groups/${g.data.id}`)).status, 403);
  assert.ok((await admin('GET', '/api/admin/groups')).data.groups.some((x) => x.id === g.data.id));
  // Natijalarni guruh bo'yicha filtrlash
  const r = await teacher('GET', `/api/admin/attempts?group=${g.data.id}`);
  assert.equal(r.status, 200);
  // Guruhdan chiqish
  assert.equal((await member('POST', `/api/groups/${g.data.id}/leave`, {})).status, 200);
  assert.equal(await seen(member), false);
});

test('jadval: ochilmagan va yopilgan test boshlanmaydi', async () => {
  const admin = await login('admin@edutest.uz', 'admin123');
  const { data: subs } = await admin('GET', '/api/admin/subjects');
  const geo = subs.subjects.find((s) => s.slug === 'geografiya');
  const base = { subject_id: geo.id, title: 'Jadvalli test', question_count: 5, time_limit: 10, show_review: true, is_active: true };
  const soon = await admin('POST', '/api/admin/tests', { ...base, opens_at: Date.now() + 864e5 });
  const closed = await admin('POST', '/api/admin/tests', { ...base, closes_at: Date.now() - 1000 });
  assert.equal((await admin('POST', '/api/admin/tests', { ...base, opens_at: Date.now(), closes_at: Date.now() - 5 })).status, 400);
  const st = await register('Jadval Talaba', 'sched@test.uz');
  const s1 = await st('POST', `/api/tests/${soon.data.id}/start`, {});
  assert.equal(s1.status, 403);
  assert.match(s1.data.error, /ochilmagan/);
  assert.equal((await st('GET', `/api/tests/${soon.data.id}`)).data.test.locked, 'not_open');
  assert.equal((await st('POST', `/api/tests/${closed.data.id}/start`, {})).status, 403);
  const list = (await st('GET', '/api/subjects/geografiya')).data.tests;
  assert.equal(list.find((x) => x.id === soon.data.id).state, 'soon');
  assert.equal(list.find((x) => x.id === closed.data.id).state, 'closed');
  // Yopilishga 2 daqiqa qolgan testda muddat yopilish vaqtidan oshmaydi
  const closing = await admin('POST', '/api/admin/tests', { ...base, closes_at: Date.now() + 120e3 });
  const s2 = await st('POST', `/api/tests/${closing.data.id}/start`, {});
  const a = await st('GET', `/api/attempts/${s2.data.attemptId}`);
  assert.ok(a.data.attempt.deadline <= Date.now() + 121e3);
});

test('rasmlar: faqat haqiqiy rasm qabul qilinadi, savolga biriktiriladi', async () => {
  const teacher = await login('teacher@edutest.uz', 'teacher123');
  const png = fs.readFileSync(path.join(__dirname, '..', 'public', 'img', 'icon-192.png'));
  const up = await teacher('POST', '/api/images', { data: `data:image/png;base64,${png.toString('base64')}` });
  assert.equal(up.status, 201);
  // Rasm niqobidagi HTML/SVG rad etiladi
  const fake = Buffer.from('<svg onload="alert(1)"></svg>').toString('base64');
  assert.equal((await teacher('POST', '/api/images', { data: `data:image/png;base64,${fake}` })).status, 400);
  // Talaba rasm yuklay olmaydi (faqat profil rasmi)
  const st = await register('Rasm Talaba', 'img@test.uz');
  assert.equal((await st('POST', '/api/images', { data: `data:image/png;base64,${png.toString('base64')}` })).status, 403);
  const img = await client()('GET', `/api/images/${up.data.key}`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/png');
  assert.equal(img.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(img.data.equals(png));

  const { data: subs } = await teacher('GET', '/api/admin/subjects');
  const sid = subs.subjects.find((s) => s.slug === 'matematika').id;
  assert.equal((await teacher('POST', '/api/admin/questions', { subject_id: sid, text: 'Rasmli savol?', options: ['A', 'B'], correct: 0, image: 'deadbeef' })).status, 400);
  const q = await teacher('POST', '/api/admin/questions', { subject_id: sid, text: 'Rasmdagi shakl qaysi?', options: ['Yulduz', 'Doira'], correct: 0, difficulty: 1, image: up.data.key });
  assert.equal(q.status, 201);
  const practice = await st('GET', '/api/practice/matematika?count=30&difficulty=1');
  const found = practice.data.items.find((x) => x.id === q.data.id);
  if (found) assert.equal(found.image, up.data.key);
  // Profil rasmi
  const av = await st('PUT', '/api/me/avatar', { data: `data:image/png;base64,${png.toString('base64')}` });
  assert.equal(av.status, 200);
  assert.match(av.data.user.avatar, /^[a-f0-9]{24}$/);
  assert.equal((await st('GET', '/api/auth/me')).data.user.avatar, av.data.user.avatar);
  assert.equal((await st('PUT', '/api/me/avatar', { data: null })).data.user.avatar, null);
});

test('statistika va xatolar ustida mashq', async () => {
  const api = await register('Statistika Talaba', 'stats@test.uz');
  const { data: subj } = await api('GET', '/api/subjects/tarix');
  await solve(api, subj.tests[1].id, 4);
  const s = await api('GET', '/api/me/stats');
  assert.equal(s.status, 200);
  assert.equal(s.data.attempts.length, 1);
  assert.ok(s.data.byDifficulty.length >= 1);
  assert.equal(s.data.mistakes, 4);
  const m = await api('GET', '/api/practice-mistakes');
  assert.equal(m.data.items.length, 4);
  assert.ok(m.data.items.every((x) => x.options.length >= 2 && !('correct' in x)));
});

test('Excel importi (ro\'yxat ko\'rinishida) va vaqtinchalik parol', async () => {
  const teacher = await login('teacher@edutest.uz', 'teacher123');
  const { data: subs } = await teacher('GET', '/api/admin/subjects');
  const sid = subs.subjects.find((s) => s.slug === 'informatika').id;
  const items = [
    { text: 'Excel: 1 bayt necha bit?', options: ['8', '4', '16'], explanation: '', difficulty: 1 },
    { text: 'Excel: CPU nima?', options: ['Markaziy protsessor', 'Monitor'], difficulty: 2 },
  ];
  const dry = await teacher('POST', '/api/admin/questions/import', { subject_id: sid, items, dryRun: true });
  assert.equal(dry.data.count, 2);
  assert.equal((await teacher('POST', '/api/admin/questions/import', { subject_id: sid, items: [{ text: 'x', options: ['a'] }] })).status, 400);
  assert.equal((await teacher('POST', '/api/admin/questions/import', { subject_id: sid, items })).status, 201);
  const q = await teacher('GET', '/api/admin/questions?q=Excel:%201%20bayt');
  assert.equal(q.data.questions[0].options[q.data.questions[0].correct], '8');

  // O'qituvchi faqat o'z guruhidagi talabaga parol bera oladi
  const admin = await login('admin@edutest.uz', 'admin123');
  const { data: u } = await admin('GET', '/api/admin/users?q=talaba@edutest.uz');
  const talabaId = u.users[0].id;
  const r = await teacher('POST', `/api/admin/users/${talabaId}/password`, {});
  assert.equal(r.status, 200, 'talaba namunaviy 211-guruhda');
  assert.equal((await client()('POST', '/api/auth/login', { email: 'talaba@edutest.uz', password: 'talaba123' })).status, 401);
  await login('talaba@edutest.uz', r.data.password);
  const { data: u2 } = await admin('GET', '/api/admin/users?q=stats@test.uz');
  assert.equal((await teacher('POST', `/api/admin/users/${u2.users[0].id}/password`, {})).status, 403);
  assert.equal((await admin('POST', `/api/admin/users/${u2.users[0].id}/password`, {})).status, 200);
});

test('eski (v2) bazadan yangilanish: ustunlar, sertifikatlar va namunaviy guruh qo\'shiladi', async () => {
  // v2 sxemasidagi kichik baza: jadvallar yangi ustunlarsiz
  const old = path.join(os.tmpdir(), `edutest-v2-${process.pid}.db`);
  const d = new DatabaseSync(old);
  d.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'student', group_name TEXT, is_blocked INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, last_login INTEGER);
    CREATE TABLE tests (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT,
      question_count INTEGER NOT NULL DEFAULT 20, time_limit INTEGER NOT NULL DEFAULT 20, difficulty INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 0, max_violations INTEGER NOT NULL DEFAULT 3, show_review INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1, created_at INTEGER NOT NULL, i18n TEXT);
    CREATE TABLE questions (id INTEGER PRIMARY KEY AUTOINCREMENT, subject_id INTEGER NOT NULL, text TEXT NOT NULL, options TEXT NOT NULL, correct INTEGER NOT NULL,
      explanation TEXT, difficulty INTEGER NOT NULL DEFAULT 2, archived INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, i18n TEXT);`);
  d.prepare("INSERT INTO users (name, email, password_hash, role, created_at) VALUES ('O', 'teacher@edutest.uz', 'x', 'teacher', 1)").run();
  d.close();
  const p2 = PORT + 100;
  const pr = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(p2), DB_FILE: old }, stdio: 'pipe' });
  await new Promise((resolve, reject) => {
    let log = '';
    pr.stdout.on('data', (x) => { log += x; if (log.includes('ishga tushdi')) resolve(); });
    pr.stderr.on('data', (x) => { log += x; });
    pr.on('exit', (c) => reject(new Error(`to'xtadi ${c}: ${log}`)));
    setTimeout(() => reject(new Error(log)), 8000);
  });
  pr.kill();
  await new Promise((r) => pr.on('exit', r));
  const db = new DatabaseSync(old);
  const cols = (tb) => db.prepare(`PRAGMA table_info(${tb})`).all().map((c) => c.name);
  assert.ok(cols('tests').includes('cert_percent') && cols('tests').includes('group_id'));
  assert.ok(cols('questions').includes('image') && cols('users').includes('avatar'));
  assert.equal(db.prepare('PRAGMA user_version').get().user_version, 3);
  assert.ok(db.prepare("SELECT COUNT(*) AS c FROM tests WHERE cert_percent = 71").get().c >= 10);
  db.close();
  for (const s of ['', '-wal', '-shm']) fs.rmSync(old + s, { force: true });
});

test('alohida panel: /panel sahifasi, tashriflar va sertifikatlar ro\'yxati', async () => {
  const anon = client();
  const page = await anon('GET', '/panel/sertifikatlar');
  assert.equal(page.status, 200);
  assert.match(page.data.toString(), /js\/panel\.js/);
  assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.doesNotMatch((await anon('GET', '/')).data.toString(), /panel\.js/, 'asosiy sayt paneldan alohida');

  // Tashriflar: noto'g'ri belgi e'tiborsiz qoldiriladi, to'g'risi sanaladi
  await anon('POST', '/api/visit', { vid: 'bad id!', path: '/' });
  await anon('POST', '/api/visit', { vid: 'abcdefghijkl1234', path: '/fan/fizika?x=1' });
  await anon('POST', '/api/visit', { vid: 'abcdefghijkl1234', path: '/test/55' });
  await anon('POST', '/api/visit', { vid: 'zyxwvutsrq987654', path: '/' });
  assert.equal((await anon('GET', '/api/admin/visits')).status, 401);
  const st = await register('Panel Talaba', 'panelst@test.uz');
  assert.equal((await st('GET', '/api/admin/visits')).status, 403);
  const admin = await login('admin@edutest.uz', 'admin123');
  await admin('POST', '/api/visit', { vid: 'adminbrowser0001', path: '/kabinet' });
  const v = await admin('GET', '/api/admin/visits');
  assert.equal(v.status, 200);
  assert.ok(v.data.today.visitors >= 3);
  assert.ok(v.data.today.users >= 1);
  assert.equal(v.data.series.length, 30);
  assert.ok(v.data.pages.some((p) => p.path === '/fan/fizika' && p.subject === 'Fizika'));
  assert.ok(v.data.pages.some((p) => p.path === '/test'));
  assert.ok(v.data.recent.some((u) => u.email === 'admin@edutest.uz'));

  // Sertifikatlar: oldi / ololmadi
  const { data: subj } = await st('GET', '/api/subjects/fizika');
  const general = subj.tests.find((x) => x.cert_percent > 0);
  await solve(st, general.id, 15);
  const c = await admin('GET', '/api/admin/certificates?q=panelst');
  assert.equal(c.status, 200);
  assert.equal(c.data.rows.length, 1);
  assert.equal(c.data.rows[0].code, null);
  assert.ok(c.data.rows[0].best < c.data.rows[0].cert_percent);
  const got = await admin('GET', '/api/admin/certificates?status=got');
  assert.ok(got.data.rows.every((x) => x.code));
  assert.ok(got.data.summary.got >= 1);
  const csv = await admin('GET', '/api/admin/certificates.csv?status=missed');
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.data.toString(), /Panel Talaba/);
});
