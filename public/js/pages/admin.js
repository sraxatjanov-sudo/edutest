// Boshqaruv paneli (o'qituvchi va administrator)
import { get, post, put, patch, del } from '../api.js';
import {
  esc, rich, icon, ICON_NAMES, toast, modal, confirmDialog, skeleton, emptyState, pager, vbars, hbars,
  fmtDate, fmtNum, pctClass, diffDots, diffLabel, roleLabel, initials, markOf, KEYS,
} from '../ui.js';
import { resultView, reviewList } from './result.js';

const SECTIONS = [
  ['overview', 'Umumiy ko\'rinish', 'chart'],
  ['savollar', 'Savollar banki', 'layers'],
  ['testlar', 'Testlar', 'list'],
  ['natijalar', 'Natijalar', 'target'],
  ['fanlar', 'Fanlar', 'book'],
  ['foydalanuvchilar', 'Foydalanuvchilar', 'users', 'admin'],
];
const COLORS = ['#1F4FA3', '#138A84', '#7A3FB8', '#2E8B57', '#C2552B', '#B23A48', '#8A6D1F', '#0E7490', '#334155', '#4338CA'];
let subjectsCache = null;
const subjects = async (fresh) => (subjectsCache && !fresh ? subjectsCache : (subjectsCache = (await get('/api/admin/subjects')).subjects));

export default async function admin(main, { section = 'overview', id }, ctx) {
  const { state, setTitle } = ctx;
  const allowed = SECTIONS.filter((s) => !s[3] || s[3] === state.user.role);
  if (!allowed.some((s) => s[0] === section)) section = 'overview';
  setTitle(SECTIONS.find((s) => s[0] === section)[1]);

  main.innerHTML = `<div class="admin">
    <aside class="side"><h4>Boshqaruv</h4><nav aria-label="Boshqaruv bo'limlari">
      ${allowed.map(([k, t, ic]) => `<a href="/boshqaruv${k === 'overview' ? '' : '/' + k}" data-link ${k === section ? 'aria-current="page"' : ''}>${icon(ic)} ${t}</a>`).join('')}
    </nav></aside>
    <div class="admin-main" id="am">${skeleton(8)}</div></div>`;
  const root = main.querySelector('#am');
  const views = { overview, savollar: questions, testlar: tests, natijalar: id ? attemptDetail : attempts, fanlar: subjectsView, foydalanuvchilar: users };
  await views[section](root, { id, ...ctx });
}

const head = (title, sub, actions = '') => `<div class="page-head"><div><h1 style="font-size:1.6rem">${esc(title)}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="row">${actions}</div></div>`;

// ---------- Umumiy ko'rinish ----------
async function overview(root) {
  const d = await get('/api/admin/overview');
  const c = d.counts;
  root.innerHTML = `${head('Umumiy ko\'rinish', 'Platformadagi faollik va natijalar')}
    <div class="kpis" style="margin-bottom:20px">
      <div class="kpi"><div class="v">${fmtNum(c.students)}</div><div class="l">talaba</div></div>
      <div class="kpi"><div class="v">${fmtNum(c.questions)}</div><div class="l">savol bankda</div></div>
      <div class="kpi"><div class="v">${fmtNum(c.tests)}</div><div class="l">test</div></div>
      <div class="kpi"><div class="v">${fmtNum(c.attempts)}</div><div class="l">yakunlangan urinish</div></div>
      <div class="kpi"><div class="v">${c.avg}%</div><div class="l">o'rtacha natija</div></div>
      <div class="kpi"><div class="v">${fmtNum(c.active)}</div><div class="l">hozir test yechmoqda</div></div>
    </div>
    <div class="grid-2" style="margin-bottom:20px">
      <section class="panel"><div class="panel-head"><h2>So'nggi 14 kunda yakunlangan testlar</h2></div><div class="panel-body"><div id="days"></div></div></section>
      <section class="panel"><div class="panel-head"><h2>Fanlar bo'yicha o'rtacha natija</h2></div><div class="panel-body">
        ${hbars(d.bySubject.filter((x) => x.attempts).map((x) => ({ name: x.name, color: x.color, value: x.avg })))}</div></section>
    </div>
    <div class="grid-2">
      <section class="panel"><div class="panel-head"><h2>So'nggi qoidabuzarliklar</h2><a class="btn btn-ghost btn-sm" href="/boshqaruv/natijalar?flagged=1" data-link>Shubhali natijalar (${c.flagged})</a></div>
        <div class="panel-body">${d.recentViolations.length ? `<div class="list">${d.recentViolations.map((v) => `
          <div class="list-item"><span class="tag tag-bad">${icon('alert')}</span><div class="grow"><b>${esc(v.name)}</b>, ${esc(v.label.toLowerCase())}
            <div class="tiny muted">${esc(v.title)}, ${fmtDate(v.created_at)}</div></div>
            <a class="btn btn-quiet btn-sm" href="/boshqaruv/natijalar/${v.attempt_id}" data-link>Ko'rish</a></div>`).join('')}</div>`
          : '<p class="muted">Qoidabuzarliklar qayd etilmagan.</p>'}</div></section>
      <section class="panel"><div class="panel-head"><h2>Eng qiyin savollar</h2></div>
        <div class="panel-body">${d.hardest.length ? `<div class="list">${d.hardest.map((q) => `
          <div class="list-item"><span class="pct ${pctClass(q.rate)} num" style="min-width:44px">${q.rate}%</span><div class="grow"><div class="clip">${rich(q.text)}</div>
            <div class="tiny muted">${esc(q.subject)}, ${q.shown} marta berilgan</div></div></div>`).join('')}</div>`
          : '<p class="muted">Statistika yig\'ilishi uchun savollar kamida 3 marta berilishi kerak.</p>'}</div></section>
    </div>`;
  const days = d.days.map((x) => ({ label: fmtDate(x.date, false), value: x.count }));
  vbars(root.querySelector('#days'), days, { unit: 'ta test' });
}

// ---------- Savollar banki ----------
async function questions(root) {
  const subs = await subjects();
  const qs = new URLSearchParams(location.search);
  const f = { subject: qs.get('subject') || '', difficulty: qs.get('difficulty') || '', q: qs.get('q') || '', archived: qs.get('archived') || '0', page: Number(qs.get('page')) || 1 };

  root.innerHTML = `${head('Savollar banki', 'Testlar shu bankdan har bir talaba uchun tasodifiy tanlanadi',
    `<button class="btn btn-ghost" id="imp">${icon('upload')} Import</button><button class="btn" id="add">${icon('plus')} Yangi savol</button>`)}
    <section class="panel">
      <div class="toolbar">
        <div class="input-icon">${icon('search')}<input class="input" id="fq" placeholder="Savol yoki variant matni bo'yicha qidirish" value="${esc(f.q)}"></div>
        <select class="select" id="fs"><option value="">Barcha fanlar</option>${subs.map((s) => `<option value="${s.id}" ${String(s.id) === f.subject ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        <select class="select" id="fd"><option value="">Har qanday qiyinlik</option>${[1, 2, 3].map((d) => `<option value="${d}" ${String(d) === f.difficulty ? 'selected' : ''}>${diffLabel[d]}</option>`).join('')}</select>
        <div class="seg" id="fa"><button data-a="0" aria-pressed="${f.archived === '0'}">Faol</button><button data-a="1" aria-pressed="${f.archived === '1'}">Arxiv</button></div>
      </div>
      <div id="tbl">${skeleton(8)}</div>
    </section>`;

  const tbl = root.querySelector('#tbl');
  let data = null;
  async function load() {
    const p = new URLSearchParams(Object.entries(f).filter(([, v]) => v !== '' && v !== '0' && v !== 1));
    history.replaceState({}, '', `/boshqaruv/savollar${p.toString() ? '?' + p : ''}`);
    data = await get(`/api/admin/questions?${new URLSearchParams(f)}`);
    tbl.innerHTML = data.questions.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Savol</th><th>Fan</th><th>Qiyinlik</th><th>To'g'ri javob</th><th>Ishlatilgan</th><th></th></tr></thead>
      <tbody>${data.questions.map((q) => `<tr>
        <td class="clip" title="${esc(q.text)}">${rich(q.text)}</td>
        <td><span class="tag"><i class="dot" style="--c:${esc(q.color)}"></i>${esc(q.subject)}</span></td>
        <td>${diffDots(q.difficulty)}</td>
        <td class="clip" style="max-width:200px">${rich(q.options[q.correct])}</td>
        <td class="num">${q.used}</td>
        <td class="actions">
          <button class="btn btn-quiet btn-sm" data-edit="${q.id}" aria-label="Tahrirlash">${icon('edit')}</button>
          <button class="btn btn-quiet btn-sm" data-arch="${q.id}" aria-label="${q.archived ? 'Arxivdan qaytarish' : 'Arxivlash'}" title="${q.archived ? 'Arxivdan qaytarish' : 'Arxivlash'}">${icon(q.archived ? 'restore' : 'archive')}</button>
          ${q.used ? '' : `<button class="btn btn-quiet btn-sm" data-del="${q.id}" aria-label="O'chirish">${icon('trash')}</button>`}
        </td></tr>`).join('')}</tbody></table></div>${pager(data.page, data.pages, data.total)}`
      : emptyState('Savol topilmadi', 'Filtrlarni o\'zgartiring yoki yangi savol qo\'shing.');
  }

  let t;
  root.querySelector('#fq').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); f.page = 1; load(); }, 250); });
  root.querySelector('#fs').addEventListener('change', (e) => { f.subject = e.target.value; f.page = 1; load(); });
  root.querySelector('#fd').addEventListener('change', (e) => { f.difficulty = e.target.value; f.page = 1; load(); });
  root.querySelector('#fa').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    f.archived = b.dataset.a; f.page = 1;
    root.querySelectorAll('#fa button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); load();
  });
  tbl.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.page) { f.page = Number(b.dataset.page); return load(); }
    if (b.dataset.edit) return questionEditor(subs, data.questions.find((q) => q.id === Number(b.dataset.edit)), load);
    if (b.dataset.arch) {
      const q = data.questions.find((x) => x.id === Number(b.dataset.arch));
      await patch(`/api/admin/questions/${q.id}/archive`, { archived: !q.archived });
      toast(q.archived ? 'Savol faol bankka qaytarildi' : 'Savol arxivlandi. U yangi testlarga tushmaydi', 'good'); return load();
    }
    if (b.dataset.del && await confirmDialog({ title: 'Savolni o\'chirasizmi?', text: 'Bu amalni bekor qilib bo\'lmaydi.', ok: 'O\'chirish', danger: true })) {
      try { await del(`/api/admin/questions/${b.dataset.del}`); toast('Savol o\'chirildi', 'good'); load(); } catch (err) { toast(err.message, 'bad'); }
    }
  });
  root.querySelector('#add').addEventListener('click', () => questionEditor(subs, { subject_id: Number(f.subject) || subs[0]?.id, options: ['', '', '', ''], correct: 0, difficulty: 2 }, load));
  root.querySelector('#imp').addEventListener('click', () => importDialog(subs, Number(f.subject) || subs[0]?.id, load));
  load();
}

function questionEditor(subs, q, onSaved) {
  const draft = { ...q, options: [...q.options] };
  const m = modal({
    title: q.id ? 'Savolni tahrirlash' : 'Yangi savol', wide: true,
    body: `<form class="stack" id="qe" novalidate>
      <div class="form-grid">
        <div class="field"><label for="qs">Fan</label><select class="select" id="qs">${subs.map((s) => `<option value="${s.id}" ${s.id === draft.subject_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
        <div class="field"><label for="qd">Qiyinlik</label><select class="select" id="qd">${[1, 2, 3].map((d) => `<option value="${d}" ${d === draft.difficulty ? 'selected' : ''}>${diffLabel[d]}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="qt">Savol matni</label><textarea class="textarea" id="qt" maxlength="1000">${esc(draft.text || '')}</textarea>
        <span class="hint">Kodni \`teskari qo'shtirnoq\` ichiga oling, u maxsus shriftda ko'rinadi.</span></div>
      <div class="field"><span class="label">Javob variantlari <span class="muted small">(to'g'ri javobni yashil doiracha bilan belgilang)</span></span><div id="opts"></div>
        <button type="button" class="btn btn-ghost btn-sm" id="addo" style="align-self:flex-start">${icon('plus')} Variant qo'shish</button></div>
      <div class="field"><label for="qx">Izoh <span class="muted">(ixtiyoriy, natija tahlilida ko'rsatiladi)</span></label><textarea class="textarea" id="qx" maxlength="1000" style="min-height:70px">${esc(draft.explanation || '')}</textarea></div>
      <p class="form-error" id="qerr"></p></form>`,
    foot: '<button class="btn btn-ghost" data-close>Bekor qilish</button><button class="btn" id="qsave">Saqlash</button>',
  });
  const box = m.el.querySelector('#opts');
  const draw = () => {
    box.innerHTML = draft.options.map((o, i) => `<div class="opt-edit">
      <input type="radio" name="corr" value="${i}" ${draft.correct === i ? 'checked' : ''} aria-label="${KEYS[i]} variant to'g'ri">
      <input class="input" data-o="${i}" value="${esc(o)}" placeholder="${KEYS[i]} variant" maxlength="300">
      <button type="button" class="btn btn-quiet btn-sm" data-rm="${i}" ${draft.options.length <= 2 ? 'disabled' : ''} aria-label="Variantni o'chirish">${icon('x')}</button></div>`).join('');
    m.el.querySelector('#addo').disabled = draft.options.length >= 6;
  };
  draw();
  box.addEventListener('input', (e) => { if (e.target.dataset.o) draft.options[Number(e.target.dataset.o)] = e.target.value; });
  box.addEventListener('change', (e) => { if (e.target.name === 'corr') draft.correct = Number(e.target.value); });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    const i = Number(b.dataset.rm);
    draft.options.splice(i, 1);
    if (draft.correct === i) draft.correct = 0; else if (draft.correct > i) draft.correct--;
    draw();
  });
  m.el.querySelector('#addo').addEventListener('click', () => { draft.options.push(''); draw(); box.querySelector(`[data-o="${draft.options.length - 1}"]`).focus(); });
  m.el.querySelector('#qsave').addEventListener('click', async () => {
    const body = { subject_id: Number(m.el.querySelector('#qs').value), difficulty: Number(m.el.querySelector('#qd').value),
      text: m.el.querySelector('#qt').value, explanation: m.el.querySelector('#qx').value, options: draft.options, correct: draft.correct };
    try {
      const r = q.id ? await put(`/api/admin/questions/${q.id}`, body) : await post('/api/admin/questions', body);
      m.close();
      toast(r.replaced ? 'Variantlar soni o\'zgargani uchun yangi savol yaratildi, eskisi arxivlandi' : 'Savol saqlandi', 'good');
      subjectsCache = null; onSaved();
    } catch (err) { m.el.querySelector('#qerr').textContent = err.message; }
  });
}

function importDialog(subs, sid, onDone) {
  const sample = `Suvning kimyoviy formulasi?\n+H₂O\n-CO₂\n-NaCl\n-O₂\n?Ikki vodorod va bitta kislorod atomi\n!1\n\n2 + 2 × 2 = ?\n+6\n-8\n-4`;
  const m = modal({
    title: 'Savollarni import qilish', wide: true,
    body: `<div class="stack">
      <div class="import-help"><b>Format:</b> har bir savol bo'sh qator bilan ajratiladi. Birinchi qator — savol matni,
        <code>+</code> to'g'ri javob, <code>-</code> noto'g'ri javob, <code>?</code> izoh, <code>!1</code> / <code>!2</code> / <code>!3</code> qiyinlik.<pre>${esc(sample)}</pre></div>
      <div class="field"><label for="is">Fan</label><select class="select" id="is">${subs.map((s) => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>
      <div class="field"><label for="it">Savollar matni</label><textarea class="textarea" id="it" style="min-height:220px;font-family:var(--mono);font-size:.85rem" placeholder="${esc(sample)}"></textarea></div>
      <p class="small" id="iprev"></p><p class="form-error" id="ierr"></p></div>`,
    foot: '<button class="btn btn-ghost" data-close>Bekor qilish</button><button class="btn btn-ghost" id="icheck">Tekshirish</button><button class="btn" id="igo">Import qilish</button>',
  });
  const body = (dryRun) => ({ subject_id: Number(m.el.querySelector('#is').value), text: m.el.querySelector('#it').value, dryRun });
  const err = m.el.querySelector('#ierr');
  m.el.querySelector('#icheck').addEventListener('click', async () => {
    err.textContent = '';
    try { const r = await post('/api/admin/questions/import', body(true)); m.el.querySelector('#iprev').innerHTML = `${icon('check')} Xatosiz: <b>${r.count}</b> ta savol import qilishga tayyor.`; }
    catch (e) { m.el.querySelector('#iprev').textContent = ''; err.textContent = e.message; }
  });
  m.el.querySelector('#igo').addEventListener('click', async () => {
    err.textContent = '';
    try { const r = await post('/api/admin/questions/import', body(false)); m.close(); toast(`${r.count} ta savol qo'shildi`, 'good'); subjectsCache = null; onDone(); }
    catch (e) { err.textContent = e.message; }
  });
}

// ---------- Testlar ----------
async function tests(root, { state }) {
  const subs = await subjects();
  const { tests: list } = await get('/api/admin/tests');
  root.innerHTML = `${head('Testlar', 'Har bir test fan savollar bankidan qancha savol va qancha vaqt berilishini belgilaydi', `<button class="btn" id="add">${icon('plus')} Yangi test</button>`)}
    <section class="panel">${list.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Test</th><th>Savollar</th><th>Vaqt</th><th>Urinish</th><th>Himoya</th><th>Topshirilgan</th><th>Holat</th><th></th></tr></thead>
      <tbody>${list.map((t) => `<tr>
        <td><b>${esc(t.title)}</b><div class="tiny muted"><span class="tag" style="margin-top:4px"><i class="dot" style="--c:${esc(t.color)}"></i>${esc(t.subject)}</span></div></td>
        <td class="num">${t.question_count} <span class="tiny muted">/ bankda ${t.pool}</span>${t.pool < t.question_count ? `<div class="tiny" style="color:var(--warn)">Bankda savol yetmaydi</div>` : ''}</td>
        <td class="num">${t.time_limit} daq</td>
        <td>${t.max_attempts || '∞'}</td>
        <td class="small">${t.max_violations ? `${t.max_violations} ogohl.` : 'Faqat kuzatuv'}<div class="tiny muted">${t.show_review ? 'Tahlil ochiq' : 'Tahlil yopiq'}</div></td>
        <td class="num">${t.attempts}${t.avg != null ? ` <span class="pct ${pctClass(t.avg)} small">${t.avg}%</span>` : ''}</td>
        <td><label class="switch"><input type="checkbox" data-toggle="${t.id}" ${t.is_active ? 'checked' : ''} aria-label="Faol"></label></td>
        <td class="actions"><button class="btn btn-quiet btn-sm" data-edit="${t.id}" aria-label="Tahrirlash">${icon('edit')}</button>
          ${state.user.role === 'admin' ? `<button class="btn btn-quiet btn-sm" data-del="${t.id}" aria-label="O'chirish">${icon('trash')}</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : emptyState('Testlar yo\'q', 'Birinchi testni yarating.')}</section>`;

  const reload = () => tests(root, { state });
  root.querySelector('#add').addEventListener('click', () => testEditor(subs, null, reload));
  root.querySelector('section').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.edit) testEditor(subs, list.find((t) => t.id === Number(b.dataset.edit)), reload);
    if (b.dataset.del) {
      const t = list.find((x) => x.id === Number(b.dataset.del));
      if (await confirmDialog({ title: 'Testni o\'chirasizmi?', text: `"${t.title}" va unga tegishli ${t.attempts} ta natija o'chiriladi. Natijalarni saqlash uchun testni o'chirish o'rniga nofaol qiling.`, ok: 'O\'chirish', danger: true })) {
        await del(`/api/admin/tests/${t.id}`); toast('Test o\'chirildi', 'good'); reload();
      }
    }
  });
  root.querySelectorAll('[data-toggle]').forEach((c) => c.addEventListener('change', async () => {
    const t = list.find((x) => x.id === Number(c.dataset.toggle));
    await put(`/api/admin/tests/${t.id}`, { ...t, is_active: c.checked });
    t.is_active = c.checked ? 1 : 0;
    toast(c.checked ? 'Test talabalarga ochildi' : 'Test yopildi', 'good');
  }));
}

function testEditor(subs, t, onSaved) {
  const v = t || { subject_id: subs[0]?.id, title: '', description: '', question_count: 20, time_limit: 25, difficulty: 0, max_attempts: 0, max_violations: 3, show_review: 1, is_active: 1 };
  const m = modal({
    title: t ? 'Testni tahrirlash' : 'Yangi test', wide: true,
    body: `<form class="stack" novalidate>
      <div class="form-grid">
        <div class="field"><label for="ts">Fan</label><select class="select" id="ts">${subs.map((s) => `<option value="${s.id}" ${s.id === v.subject_id ? 'selected' : ''}>${esc(s.name)} (${s.question_count} savol)</option>`).join('')}</select></div>
        <div class="field"><label for="tt">Test nomi</label><input class="input" id="tt" value="${esc(v.title)}" maxlength="120"></div>
      </div>
      <div class="field"><label for="tds">Tavsif</label><textarea class="textarea" id="tds" style="min-height:70px" maxlength="400">${esc(v.description || '')}</textarea></div>
      <div class="form-grid">
        <div class="field"><label for="tq">Savollar soni</label><input class="input" id="tq" type="number" min="1" max="200" value="${v.question_count}"></div>
        <div class="field"><label for="tl">Vaqt (daqiqa)</label><input class="input" id="tl" type="number" min="1" max="240" value="${v.time_limit}"></div>
        <div class="field"><label for="td">Qiyinlik</label><select class="select" id="td">${[0, 1, 2, 3].map((d) => `<option value="${d}" ${d === v.difficulty ? 'selected' : ''}>${diffLabel[d]}</option>`).join('')}</select></div>
      </div>
      <div class="form-grid">
        <div class="field"><label for="ta">Urinishlar soni</label><input class="input" id="ta" type="number" min="0" max="100" value="${v.max_attempts}"><span class="hint">0 — cheklanmagan</span></div>
        <div class="field"><label for="tv">Qoidabuzarlik chegarasi</label><input class="input" id="tv" type="number" min="0" max="50" value="${v.max_violations}"><span class="hint">Shuncha ogohlantirishdan keyin test yakunlanadi. 0 — faqat qayd etish</span></div>
      </div>
      <label class="switch"><input type="checkbox" id="tr" ${v.show_review ? 'checked' : ''}> Talabaga to'g'ri javoblar va izohlarni ko'rsatish</label>
      <label class="switch"><input type="checkbox" id="tx" ${v.is_active ? 'checked' : ''}> Test talabalar uchun ochiq</label>
      <p class="form-error" id="terr"></p></form>`,
    foot: '<button class="btn btn-ghost" data-close>Bekor qilish</button><button class="btn" id="tsave">Saqlash</button>',
  });
  const g = (id) => m.el.querySelector('#' + id);
  m.el.querySelector('#tsave').addEventListener('click', async () => {
    const body = { subject_id: Number(g('ts').value), title: g('tt').value, description: g('tds').value, question_count: Number(g('tq').value),
      time_limit: Number(g('tl').value), difficulty: Number(g('td').value), max_attempts: Number(g('ta').value), max_violations: Number(g('tv').value),
      show_review: g('tr').checked, is_active: g('tx').checked };
    try { t ? await put(`/api/admin/tests/${t.id}`, body) : await post('/api/admin/tests', body); m.close(); toast('Test saqlandi', 'good'); onSaved(); }
    catch (err) { g('terr').textContent = err.message; }
  });
}

// ---------- Natijalar ----------
async function attempts(root) {
  const [subs, { tests: tl }] = await Promise.all([subjects(), get('/api/admin/tests')]);
  const qs = new URLSearchParams(location.search);
  const f = { q: qs.get('q') || '', subject: qs.get('subject') || '', test: qs.get('test') || '', flagged: qs.get('flagged') || '', page: 1 };
  root.innerHTML = `${head('Natijalar', 'Yakunlangan barcha urinishlar', `<a class="btn btn-ghost" id="csv" href="#" download>${icon('download')} Excel (CSV) yuklab olish</a>`)}
    <section class="panel">
      <div class="toolbar">
        <div class="input-icon">${icon('search')}<input class="input" id="fq" placeholder="Talaba ismi, email yoki guruh" value="${esc(f.q)}"></div>
        <select class="select" id="fs"><option value="">Barcha fanlar</option>${subs.map((s) => `<option value="${s.id}" ${String(s.id) === f.subject ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        <select class="select" id="ft"><option value="">Barcha testlar</option>${tl.map((t) => `<option value="${t.id}" ${String(t.id) === f.test ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}</select>
        <label class="check"><input type="checkbox" id="ff" ${f.flagged ? 'checked' : ''}> Faqat qoidabuzarlik bilan</label>
      </div>
      <div id="tbl">${skeleton(8)}</div></section>`;
  const tbl = root.querySelector('#tbl');
  async function load() {
    const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    root.querySelector('#csv').href = `/api/admin/attempts.csv?${params}`;
    history.replaceState({}, '', `/boshqaruv/natijalar${params.toString() ? '?' + params : ''}`);
    const d = await get(`/api/admin/attempts?${params}`);
    tbl.innerHTML = d.attempts.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Talaba</th><th>Test</th><th>Natija</th><th>Baho</th><th>Qoidabuzarlik</th><th>Sana</th><th></th></tr></thead>
      <tbody>${d.attempts.map((a) => `<tr>
        <td><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="avatar">${esc(initials(a.name))}</span><div><b>${esc(a.name)}</b><div class="tiny muted">${esc(a.group || a.email)}</div></div></div></td>
        <td>${esc(a.title)}</td>
        <td><span class="pct ${pctClass(a.percent)}">${a.percent}%</span> <span class="small muted">${a.score}/${a.total}</span></td>
        <td><b>${markOf(a.percent)}</b></td>
        <td>${a.violations ? `<span class="tag tag-bad">${a.violations}${a.finish_reason === 'violations' ? ', yakunlangan' : ''}</span>` : '<span class="muted">—</span>'}</td>
        <td>${fmtDate(a.finished_at)}</td>
        <td class="actions"><a class="btn btn-ghost btn-sm" href="/boshqaruv/natijalar/${a.id}" data-link>Batafsil</a></td></tr>`).join('')}</tbody></table></div>${pager(d.page, d.pages, d.total)}`
      : emptyState('Natija topilmadi', 'Filtrlarni o\'zgartirib ko\'ring.');
  }
  let t;
  root.querySelector('#fq').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); f.page = 1; load(); }, 250); });
  root.querySelector('#fs').addEventListener('change', (e) => { f.subject = e.target.value; f.page = 1; load(); });
  root.querySelector('#ft').addEventListener('change', (e) => { f.test = e.target.value; f.page = 1; load(); });
  root.querySelector('#ff').addEventListener('change', (e) => { f.flagged = e.target.checked ? '1' : ''; f.page = 1; load(); });
  tbl.addEventListener('click', (e) => { const b = e.target.closest('[data-page]'); if (b) { f.page = Number(b.dataset.page); load(); } });
  load();
}

async function attemptDetail(root, { id, navigate }) {
  const { result: r } = await get(`/api/admin/attempts/${Number(id)}`);
  const st = r.student;
  root.innerHTML = `<nav class="crumbs"><a href="/boshqaruv/natijalar" data-link>Natijalar</a><span>/</span><span>${esc(st.name)}</span></nav>
    ${head(st.name, `${esc(st.email)}${st.group ? `, ${esc(st.group)}` : ''}${r.ip ? `, IP ${esc(r.ip)}` : ''}`, `<button class="btn btn-danger" id="annul">${icon('trash')} Natijani bekor qilish</button>`)}
    <div class="stack" style="--gap:20px">
      ${resultView(r, { staffView: true })}
      <section class="panel"><div class="panel-head"><h2>Qoidabuzarliklar jurnali</h2><span class="tag ${r.violationLog.length ? 'tag-bad' : 'tag-good'}">${r.violationLog.length} ta</span></div>
        <div class="panel-body">${r.violationLog.length ? `<div class="list">${r.violationLog.map((v) => `<div class="list-item"><span class="num muted" style="min-width:110px">${fmtDate(v.created_at)}</span><span>${esc(v.label)}</span></div>`).join('')}</div>`
          : '<p class="muted">Test davomida hech qanday qoidabuzarlik qayd etilmagan.</p>'}</div></section>
      <section class="panel"><div class="panel-head"><h2>Javoblar</h2></div>${reviewList(r.review)}</section>
    </div>`;
  root.querySelector('#annul').addEventListener('click', async () => {
    if (await confirmDialog({ title: 'Natijani bekor qilasizmi?', text: 'Bu urinish butunlay o\'chiriladi va reytingdan chiqariladi. Talaba testni qayta topshirishi mumkin bo\'ladi.', ok: 'Bekor qilish', danger: true })) {
      await del(`/api/admin/attempts/${r.id}`); toast('Natija bekor qilindi', 'good'); navigate('/boshqaruv/natijalar');
    }
  });
}

// ---------- Fanlar ----------
async function subjectsView(root, { state }) {
  const subs = await subjects(true);
  root.innerHTML = `${head('Fanlar', 'Fan nomi, rangi va belgisi butun saytda ishlatiladi', `<button class="btn" id="add">${icon('plus')} Yangi fan</button>`)}
    <div class="subjects">${subs.map((s) => `<div class="subject" style="--c:${esc(s.color)}">
      <span class="subject-icon">${icon(s.icon)}</span><h3>${esc(s.name)}</h3><p>${esc(s.description || '')}</p>
      <span class="subject-meta"><span>${s.question_count} savol</span><span>${s.test_count} test</span></span>
      <div class="row"><button class="btn btn-ghost btn-sm" data-edit="${s.id}">${icon('edit')} Tahrirlash</button>
        <a class="btn btn-quiet btn-sm" href="/boshqaruv/savollar?subject=${s.id}" data-link>Savollar</a>
        ${state.user.role === 'admin' ? `<button class="btn btn-quiet btn-sm" data-del="${s.id}" aria-label="O'chirish">${icon('trash')}</button>` : ''}</div></div>`).join('')}</div>`;
  const reload = () => subjectsView(root, { state });
  root.querySelector('#add').addEventListener('click', () => subjectEditor(null, reload));
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => subjectEditor(subs.find((s) => s.id === Number(b.dataset.edit)), reload)));
  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const s = subs.find((x) => x.id === Number(b.dataset.del));
    if (await confirmDialog({ title: `"${s.name}" fanini o'chirasizmi?`, text: `Fan bilan birga ${s.question_count} ta savol, ${s.test_count} ta test va ularning barcha natijalari o'chiriladi.`, ok: 'O\'chirish', danger: true })) {
      await del(`/api/admin/subjects/${s.id}`); toast('Fan o\'chirildi', 'good'); reload();
    }
  }));
}

function subjectEditor(s, onSaved) {
  const v = s || { name: '', slug: '', description: '', color: COLORS[0], icon: 'book' };
  const m = modal({
    title: s ? 'Fanni tahrirlash' : 'Yangi fan',
    body: `<form class="stack" novalidate>
      <div class="form-grid"><div class="field"><label for="sn">Nomi</label><input class="input" id="sn" value="${esc(v.name)}" maxlength="60"></div>
        <div class="field"><label for="sl">Manzildagi qisqa nom</label><input class="input" id="sl" value="${esc(v.slug)}" maxlength="40" placeholder="masalan: fizika"><span class="hint">Lotin harflari, raqam va chiziqcha</span></div></div>
      <div class="field"><label for="sd">Tavsif</label><textarea class="textarea" id="sd" maxlength="300" style="min-height:70px">${esc(v.description || '')}</textarea></div>
      <div class="field"><span class="label">Rang</span><div class="color-swatches">${COLORS.map((c) => `<label style="--c:${c}" title="${c}"><input type="radio" name="sc" value="${c}" ${c === v.color ? 'checked' : ''}></label>`).join('')}</div></div>
      <div class="field"><span class="label">Belgi</span><div class="icon-pick">${ICON_NAMES.map((n) => `<label title="${n}"><input type="radio" name="si" value="${n}" ${n === v.icon ? 'checked' : ''}>${icon(n)}</label>`).join('')}</div></div>
      <p class="form-error" id="serr"></p></form>`,
    foot: '<button class="btn btn-ghost" data-close>Bekor qilish</button><button class="btn" id="ssave">Saqlash</button>',
  });
  m.el.querySelector('#ssave').addEventListener('click', async () => {
    const body = { name: m.el.querySelector('#sn').value, slug: m.el.querySelector('#sl').value, description: m.el.querySelector('#sd').value,
      color: m.el.querySelector('[name=sc]:checked')?.value, icon: m.el.querySelector('[name=si]:checked')?.value };
    try { s ? await put(`/api/admin/subjects/${s.id}`, body) : await post('/api/admin/subjects', body); m.close(); subjectsCache = null; toast('Fan saqlandi', 'good'); onSaved(); }
    catch (err) { m.el.querySelector('#serr').textContent = err.message; }
  });
}

// ---------- Foydalanuvchilar ----------
async function users(root, { state }) {
  const f = { q: '', role: '', page: 1 };
  root.innerHTML = `${head('Foydalanuvchilar', 'Rollar: talaba test topshiradi, o\'qituvchi savol va testlarni boshqaradi, administrator hammasini')}
    <section class="panel"><div class="toolbar">
      <div class="input-icon">${icon('search')}<input class="input" id="fq" placeholder="Ism, email yoki guruh"></div>
      <div class="seg" id="fr"><button data-r="" aria-pressed="true">Barchasi</button><button data-r="student" aria-pressed="false">Talabalar</button><button data-r="teacher" aria-pressed="false">O'qituvchilar</button><button data-r="admin" aria-pressed="false">Adminlar</button></div>
    </div><div id="tbl">${skeleton(8)}</div></section>`;
  const tbl = root.querySelector('#tbl');
  async function load() {
    const d = await get(`/api/admin/users?${new URLSearchParams(f)}`);
    tbl.innerHTML = d.users.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>Foydalanuvchi</th><th>Guruh</th><th>Rol</th><th>Testlar</th><th>Oxirgi kirish</th><th>Holat</th><th></th></tr></thead>
      <tbody>${d.users.map((u) => `<tr>
        <td><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="avatar">${esc(initials(u.name))}</span><div><b>${esc(u.name)}</b><div class="tiny muted">${esc(u.email)}</div></div></div></td>
        <td>${esc(u.group || '—')}</td>
        <td>${u.id === state.user.id ? `<span class="tag tag-lapis">${roleLabel[u.role]}</span>` : `<select class="select" data-role="${u.id}" style="width:auto;padding:6px 32px 6px 10px">${Object.entries(roleLabel).map(([k, l]) => `<option value="${k}" ${k === u.role ? 'selected' : ''}>${l}</option>`).join('')}</select>`}</td>
        <td class="num">${u.attempts}${u.avg != null ? ` <span class="pct ${pctClass(u.avg)} small">${u.avg}%</span>` : ''}</td>
        <td>${fmtDate(u.last_login)}</td>
        <td>${u.id === state.user.id ? '<span class="muted small">Siz</span>' : `<label class="switch"><input type="checkbox" data-block="${u.id}" ${u.is_blocked ? '' : 'checked'}> <span class="small">${u.is_blocked ? 'Bloklangan' : 'Faol'}</span></label>`}</td>
        <td class="actions">${u.id === state.user.id ? '' : `<button class="btn btn-quiet btn-sm" data-del="${u.id}" aria-label="O'chirish">${icon('trash')}</button>`}</td></tr>`).join('')}</tbody></table></div>${pager(d.page, d.pages, d.total)}`
      : emptyState('Foydalanuvchi topilmadi', 'Qidiruvni o\'zgartirib ko\'ring.');
    tbl.querySelectorAll('[data-role]').forEach((s) => s.addEventListener('change', async () => { await put(`/api/admin/users/${s.dataset.role}`, { role: s.value }); toast('Rol o\'zgartirildi', 'good'); }));
    tbl.querySelectorAll('[data-block]').forEach((c) => c.addEventListener('change', async () => {
      await put(`/api/admin/users/${c.dataset.block}`, { is_blocked: !c.checked }); toast(c.checked ? 'Hisob faollashtirildi' : 'Hisob bloklandi, sessiyalari yopildi', 'good'); load();
    }));
  }
  let t;
  root.querySelector('#fq').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { f.q = e.target.value.trim(); f.page = 1; load(); }, 250); });
  root.querySelector('#fr').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; f.role = b.dataset.r; f.page = 1;
    root.querySelectorAll('#fr button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); load();
  });
  tbl.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.page) { f.page = Number(b.dataset.page); return load(); }
    if (b.dataset.del && await confirmDialog({ title: 'Foydalanuvchini o\'chirasizmi?', text: 'Hisob va uning barcha natijalari o\'chiriladi.', ok: 'O\'chirish', danger: true })) {
      await del(`/api/admin/users/${b.dataset.del}`); toast('Foydalanuvchi o\'chirildi', 'good'); load();
    }
  });
  load();
}
