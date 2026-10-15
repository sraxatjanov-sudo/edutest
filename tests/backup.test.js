// Zaxiralash: GitHub API o'rniga soxta server. Baza yoziladi, server qayta ishga tushganda tiklanadi.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const zlib = require('node:zlib');

// --- Soxta GitHub ---
const store = { blobs: new Map(), trees: new Map(), commits: new Map(), ref: null, calls: [] };
let seq = 0;
const sha = () => String(++seq).padStart(40, '0');
const gh = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const j = body ? JSON.parse(body) : {};
    const url = req.url.replace(/^\/repos\/me\/data/, '');
    store.calls.push(`${req.method} ${url.split('?')[0]}`);
    const json = (status, x) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(x)); };
    if (req.headers.authorization !== 'Bearer secret') return json(401, { message: 'Bad credentials' });
    if (req.method === 'GET' && url.startsWith('/contents/edutest.db.gz')) {
      if (!store.ref) return json(404, { message: 'Not Found' });
      const tree = store.trees.get(store.commits.get(store.ref).tree);
      res.writeHead(200, { 'Content-Type': 'application/octet-stream' });
      return res.end(store.blobs.get(tree[0].sha));
    }
    if (req.method === 'POST' && url === '/git/blobs') {
      if (!store.ref) return json(409, { message: 'Git Repository is empty.' });
      const s = sha(); store.blobs.set(s, Buffer.from(j.content, 'base64')); return json(201, { sha: s });
    }
    if (req.method === 'POST' && url === '/git/trees') { const s = sha(); store.trees.set(s, j.tree); return json(201, { sha: s }); }
    if (req.method === 'POST' && url === '/git/commits') { const s = sha(); store.commits.set(s, { tree: j.tree, parents: j.parents }); return json(201, { sha: s }); }
    if (req.method === 'PATCH' && url === '/git/refs/heads/main') { store.ref = j.sha; return json(200, { object: { sha: j.sha } }); }
    if (req.method === 'PUT' && url === '/contents/edutest.db.gz') {
      const b = sha(), tr = sha(), c = sha();
      store.blobs.set(b, Buffer.from(j.content, 'base64'));
      store.trees.set(tr, [{ path: 'edutest.db.gz', sha: b }]);
      store.commits.set(c, { tree: tr, parents: [] });
      store.ref = c;
      return json(201, { content: { sha: b } });
    }
    json(404, { message: 'Not Found' });
  });
});

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'edutest-bk-'));
let ghPort;

function startApp(dbFile, port) {
  const proc = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(port), DB_FILE: dbFile, BACKUP_API: `http://127.0.0.1:${ghPort}`, BACKUP_REPO: 'me/data', BACKUP_TOKEN: 'secret' },
    stdio: 'pipe',
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  const ready = new Promise((resolve, reject) => {
    proc.stdout.on('data', () => { if (log.includes('ishga tushdi')) resolve(); });
    proc.on('exit', (c) => reject(new Error(`Server to'xtadi: ${c}\n${log}`)));
    setTimeout(() => reject(new Error('Server ishga tushmadi\n' + log)), 10000);
  });
  return { proc, ready, log: () => log };
}

function client(base) {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(base + url, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
}

before(async () => { await new Promise((r) => gh.listen(0, '127.0.0.1', r)); ghPort = gh.address().port; });
after(() => { gh.close(); fs.rmSync(dir, { recursive: true, force: true }); });

test('baza GitHub omboriga saqlanadi va yangi serverda tiklanadi', async () => {
  const p1 = 4100 + Math.floor(Math.random() * 400);
  const a = startApp(path.join(dir, 'one.db'), p1);
  await a.ready;
  assert.match(a.log(), /omborda hali nusxa yo'q/);
  const api = client(`http://localhost:${p1}`);
  assert.equal((await api('POST', '/api/auth/register', { name: 'Zaxira Sinov', email: 'backup@test.uz', password: 'parol1234' })).status, 201);

  const admin = client(`http://localhost:${p1}`);
  await admin('POST', '/api/auth/login', { email: 'admin@edutest.uz', password: 'admin123' });
  const r1 = await admin('POST', '/api/admin/backup', {});
  assert.equal(r1.status, 200, JSON.stringify(r1.data));
  assert.ok(r1.data.backup.lastBackupAt);
  assert.ok(store.calls.includes('PUT /contents/edutest.db.gz'), 'birinchi nusxa bo\'sh omborga yaratiladi');

  // Ikkinchi nusxa — bitta commit bilan, majburiy yangilash (tarix o'smaydi)
  await api('POST', '/api/auth/register', { name: 'Ikkinchi Sinov', email: 'backup2@test.uz', password: 'parol1234' });
  a.proc.kill('SIGTERM'); // to'xtashda oxirgi nusxa
  await new Promise((r) => a.proc.on('exit', r));
  assert.ok(store.calls.includes('PATCH /git/refs/heads/main'));
  assert.deepEqual(store.commits.get(store.ref).parents, []);
  const tree = store.trees.get(store.commits.get(store.ref).tree);
  assert.equal(zlib.gunzipSync(store.blobs.get(tree[0].sha)).subarray(0, 15).toString(), 'SQLite format 3');

  // Yangi "konteyner": lokal baza yo'q, zaxiradan tiklanadi
  const p2 = p1 + 1;
  const b = startApp(path.join(dir, 'two.db'), p2);
  await b.ready;
  assert.match(b.log(), /tiklandi/);
  const api2 = client(`http://localhost:${p2}`);
  assert.equal((await api2('POST', '/api/auth/login', { email: 'backup2@test.uz', password: 'parol1234' })).status, 200);
  assert.equal((await api2('POST', '/api/auth/login', { email: 'backup@test.uz', password: 'parol1234' })).status, 200);
  b.proc.kill('SIGTERM');
  await new Promise((r) => b.proc.on('exit', r));
});

test('tiklashda xato bo\'lsa, ombordagi nusxa ustidan yozilmaydi', async () => {
  const p = 4600 + Math.floor(Math.random() * 300);
  const before = store.ref;
  const proc = spawn(process.execPath, ['--no-warnings', path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(p), DB_FILE: path.join(dir, 'three.db'), BACKUP_API: `http://127.0.0.1:${ghPort}`, BACKUP_REPO: 'me/data', BACKUP_TOKEN: 'wrong' },
    stdio: 'pipe',
  });
  let log = '';
  proc.stdout.on('data', (d) => { log += d; });
  proc.stderr.on('data', (d) => { log += d; });
  await new Promise((resolve, reject) => {
    proc.stdout.on('data', () => { if (log.includes('ishga tushdi')) resolve(); });
    setTimeout(() => reject(new Error(log)), 20000);
  });
  assert.match(log, /zaxiralash to'xtatildi/);
  proc.kill('SIGTERM');
  await new Promise((r) => proc.on('exit', r));
  assert.equal(store.ref, before);
});
