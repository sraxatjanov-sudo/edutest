// Boshqaruv paneli (o'qituvchi va administrator)
import { get, post, put, patch, del } from '../api.js';
import {
  esc, rich, icon, ICON_NAMES, toast, modal, confirmDialog, skeleton, emptyState, pager, vbars, hbars,
  fmtDate, fmtNum, pctClass, diffDots, diffLabel, roleLabel, initials, markOf, KEYS, t,
} from '../ui.js';
import { resultView, reviewList } from './result.js';

const SECTIONS = [
  ['overview', "Umumiy ko'rinish", 'chart'],
  ['savollar', 'Savollar banki', 'layers'],
  ['testlar', 'Testlar', 'list'],
  ['natijalar', 'Natijalar', 'target'],
  ['fanlar', 'Fanlar', 'book'],
  ['foydalanuvchilar', 'Foydalanuvchilar', 'users', 'admin'],
];
const TR_LANGS = [['ru', 'Русский'], ['kaa', 'Qaraqalpaqsha']];
const COLORS = ['#1F4FA3', '#138A84', '#7A3FB8', '#2E8B57', '#C2552B', '#B23A48', '#8A6D1F', '#0E7490', '#334155', '#4338CA', '#A21CAF'];
let subjectsCache = null;
const subjects = async (fresh) => (subjectsCache && !fresh ? subjectsCache : (subjectsCache = (await get('/api/admin/subjects')).subjects));

export default async function admin(main, { section = 'overview', id }, ctx) {
  const { state, setTitle } = ctx;
  const allowed = SECTIONS.filter((s) => !s[3] || s[3] === state.user.role);
  if (!allowed.some((s) => s[0] === section)) section = 'overview';
  setTitle(t(SECTIONS.find((s) => s[0] === section)[1]));

  main.innerHTML = `<div class="admin">
    <aside class="side"><h4>${t('Boshqaruv')}</h4><nav aria-label="${t("Boshqaruv bo'limlari")}">
      ${allowed.map(([k, label, ic]) => `<a href="/boshqaruv${k === 'overview' ? '' : '/' + k}" data-link ${k === section ? 'aria-current="page"' : ''}>${icon(ic)} ${t(label)}</a>`).join('')}
    </nav></aside>
    <div class="admin-main" id="am">${skeleton(8)}</div></div>`;
  const root = main.querySelector('#am');
  const views = { overview, savollar: questions, testlar: tests, natijalar: id ? attemptDetail : attempts, fanlar: subjectsView, foydalanuvchilar: users };
  await views[section](root, { id, ...ctx });
}

const head = (title, sub, actions = '') => `<div class="page-head"><div><h1 style="font-size:1.6rem">${esc(title)}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="row">${actions}</div></div>`;

// Tarjima maydonlari bloki (ochiladigan)
function trBlock(inner, open = false) {
  return `<details class="tr-box" ${open ? 'open' : ''}><summary>${icon('globe-text')} ${t('Tarjimalar (ixtiyoriy)')}<span class="muted small">${t("Bo'sh qoldirilsa, asosiy matn ko'rsatiladi")}</span></summary>
    <div class="tr-body">${inner}</div></details>`;
}
const hasTr = (i18n) => Boolean(i18n && Object.keys(i18n).length);

// ---------- Umumiy ko'rinish ----------
async function overview(root) {
  const d = await get('/api/admin/overview');
  const c = d.counts;
  root.innerHTML = `${head(t("Umumiy ko'rinish"), t('Platformadagi faollik va natijalar'))}
    <div class="kpis" style="margin-bottom:20px">
      <div class="kpi"><div class="v">${fmtNum(c.students)}</div><div class="l">${t('talaba')}</div></div>
      <div class="kpi"><div class="v">${fmtNum(c.questions)}</div><div class="l">${t('savol bankda')}</div></div>
      <div class="kpi"><div class="v">${fmtNum(c.tests)}</div><div class="l">${t('test')}</div></div>
      <div class="kpi"><div class="v">${fmtNum(c.attempts)}</div><div class="l">${t('yakunlangan urinish')}</div></div>
      <div class="kpi"><div class="v">${c.avg}%</div><div class="l">${t("o'rtacha natija")}</div></div>
      <div class="kpi"><div class="v">${fmtNum(c.active)}</div><div class="l">${t('hozir test yechmoqda')}</div></div>
    </div>
    <div class="grid-2" style="margin-bottom:20px">
      <section class="panel"><div class="panel-head"><h2>${t("So'nggi 14 kunda yakunlangan testlar")}</h2></div><div class="panel-body"><div id="days"></div></div></section>
      <section class="panel"><div class="panel-head"><h2>${t("Fanlar bo'yicha o'rtacha natija")}</h2></div><div class="panel-body">
        ${hbars(d.bySubject.filter((x) => x.attempts).map((x) => ({ name: x.name, color: x.color, value: x.avg })))}</div></section>
    </div>
    <div class="grid-2">
      <section class="panel"><div class="panel-head"><h2>${t("So'nggi qoidabuzarliklar")}</h2><a class="btn btn-ghost btn-sm" href="/boshqaruv/natijalar?flagged=1" data-link>${t('Shubhali natijalar ({n})', { n: c.flagged })}</a></div>
        <div class="panel-body">${d.recentViolations.length ? `<div class="list">${d.recentViolations.map((v) => `
          <div class="list-item"><span class="tag tag-bad">${icon('alert')}</span><div class="grow"><b>${esc(v.name)}</b>, ${esc(v.label.toLowerCase())}
            <div class="tiny muted">${esc(v.title)}, ${fmtDate(v.created_at)}</div></div>
            <a class="btn btn-quiet btn-sm" href="/boshqaruv/natijalar/${v.attempt_id}" data-link>${t("Ko'rish")}</a></div>`).join('')}</div>`
          : `<p class="muted">${t('Qoidabuzarliklar qayd etilmagan.')}</p>`}</div></section>
      <section class="panel"><div class="panel-head"><h2>${t('Eng qiyin savollar')}</h2></div>
        <div class="panel-body">${d.hardest.length ? `<div class="list">${d.hardest.map((q) => `
          <div class="list-item"><span class="pct ${pctClass(q.rate)} num" style="min-width:44px">${q.rate}%</span><div class="grow"><div class="clip">${rich(q.text)}</div>
            <div class="tiny muted">${t('{subject}, {n} marta berilgan', { subject: esc(q.subject), n: q.shown })}</div></div></div>`).join('')}</div>`
          : `<p class="muted">${t("Statistika yig'ilishi uchun savollar kamida 3 marta berilishi kerak.")}</p>`}</div></section>
    </div>`;
  const days = d.days.map((x) => ({ label: fmtDate(x.date, false), value: x.count }));
  vbars(root.querySelector('#days'), days, { unit: t('ta test') });
}

// ---------- Savollar banki ----------
async function questions(root) {
  const subs = await subjects();
  const qs = new URLSearchParams(location.search);
  const f = { subject: qs.get('subject') || '', difficulty: qs.get('difficulty') || '', q: qs.get('q') || '', archived: qs.get('archived') || '0', page: Number(qs.get('page')) || 1 };

  root.innerHTML = `${head(t('Savollar banki'), t('Testlar shu bankdan har bir talaba uchun tasodifiy tanlanadi'),
    `<button class="btn btn-ghost" id="imp">${icon('upload')} ${t('Import')}</button><button class="btn" id="add">${icon('plus')} ${t('Yangi savol')}</button>`)}
    <section class="panel">
      <div class="toolbar">
        <div class="input-icon">${icon('search')}<input class="input" id="fq" placeholder="${t("Savol yoki variant matni bo'yicha qidirish")}" value="${esc(f.q)}"></div>
        <select class="select" id="fs"><option value="">${t('Barcha fanlar')}</option>${subs.map((s) => `<option value="${s.id}" ${String(s.id) === f.subject ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
        <select class="select" id="fd"><option value="">${t('Har qanday qiyinlik')}</option>${[1, 2, 3].map((d) => `<option value="${d}" ${String(d) === f.difficulty ? 'selected' : ''}>${diffLabel[d]}</option>`).join('')}</select>
        <div class="seg" id="fa"><button data-a="0" aria-pressed="${f.archived === '0'}">${t('Faol')}</button><button data-a="1" aria-pressed="${f.archived === '1'}">${t('Arxiv')}</button></div>
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
      <thead><tr><th>${t('Savol')}</th><th>${t('Fan')}</th><th>${t('Qiyinlik')}</th><th>${t("To'g'ri javob")}</th><th>${t('Tarjima')}</th><th>${t('Ishlatilgan')}</th><th></th></tr></thead>
      <tbody>${data.questions.map((q) => `<tr>
        <td class="clip" title="${esc(q.label)}">${rich(q.label)}</td>
        <td><span class="tag"><i class="dot" style="--c:${esc(q.color)}"></i>${esc(q.subject)}</span></td>
        <td>${diffDots(q.difficulty)}</td>
        <td class="clip" style="max-width:200px">${rich(q.label_options[q.correct])}</td>
        <td class="tiny">${['ru', 'kaa'].map((L) => `<span class="tag ${q.i18n?.[L] ? 'tag-good' : ''}" title="${q.i18n?.[L] ? t('Tarjima bor') : t("Tarjima yo'q")}">${L === 'ru' ? 'RU' : 'QQ'}</span>`).join(' ')}</td>
        <td class="num">${q.used}</td>
        <td class="actions">
          <button class="btn btn-quiet btn-sm" data-edit="${q.id}" aria-label="${t('Tahrirlash')}">${icon('edit')}</button>
          <button class="btn btn-quiet btn-sm" data-arch="${q.id}" aria-label="${q.archived ? t('Arxivdan qaytarish') : t('Arxivlash')}" title="${q.archived ? t('Arxivdan qaytarish') : t('Arxivlash')}">${icon(q.archived ? 'restore' : 'archive')}</button>
          ${q.used ? '' : `<button class="btn btn-quiet btn-sm" data-del="${q.id}" aria-label="${t("O'chirish")}">${icon('trash')}</button>`}
        </td></tr>`).join('')}</tbody></table></div>${pager(data.page, data.pages, data.total)}`
      : emptyState(t('Savol topilmadi'), t("Filtrlarni o'zgartiring yoki yangi savol qo'shing."));
  }

  let timer;
  root.querySelector('#fq').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { f.q = e.target.value.trim(); f.page = 1; load(); }, 250); });
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
      toast(q.archived ? t('Savol faol bankka qaytarildi') : t('Savol arxivlandi. U yangi testlarga tushmaydi'), 'good'); return load();
    }
    if (b.dataset.del && await confirmDialog({ title: t("Savolni o'chirasizmi?"), text: t("Bu amalni bekor qilib bo'lmaydi."), ok: t("O'chirish"), danger: true })) {
      try { await del(`/api/admin/questions/${b.dataset.del}`); toast(t("Savol o'chirildi"), 'good'); load(); } catch (err) { toast(err.message, 'bad'); }
    }
  });
  root.querySelector('#add').addEventListener('click', () => questionEditor(subs, { subject_id: Number(f.subject) || subs[0]?.id, options: ['', '', '', ''], correct: 0, difficulty: 2 }, load));
  root.querySelector('#imp').addEventListener('click', () => importDialog(subs, Number(f.subject) || subs[0]?.id, load));
  load();
}

function questionEditor(subs, q, onSaved) {
  const draft = { ...q, options: [...q.options] };
  // Tarjimalar: variantlar soni asosiy variantlar bilan bir xil saqlanadi
  const tr = {};
  for (const [L] of TR_LANGS) {
    const src = q.i18n?.[L] || {};
    tr[L] = { text: src.text || '', explanation: src.explanation || '', options: draft.options.map((_, i) => src.options?.[i] || '') };
  }
  const m = modal({
    title: q.id ? t('Savolni tahrirlash') : t('Yangi savol'), wide: true,
    body: `<form class="stack" id="qe" novalidate>
      <div class="form-grid">
        <div class="field"><label for="qs">${t('Fan')}</label><select class="select" id="qs">${subs.map((s) => `<option value="${s.id}" ${s.id === draft.subject_id ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></div>
        <div class="field"><label for="qd">${t('Qiyinlik')}</label><select class="select" id="qd">${[1, 2, 3].map((d) => `<option value="${d}" ${d === draft.difficulty ? 'selected' : ''}>${diffLabel[d]}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="qt">${t('Savol matni (asosiy, o\'zbekcha)')}</label><textarea class="textarea" id="qt" maxlength="1000">${esc(draft.text || '')}</textarea>
        <span class="hint">${t("Kodni `teskari qo'shtirnoq` ichiga oling, u maxsus shriftda ko'rinadi.")}</span></div>
      <div class="field"><span class="label">${t('Javob variantlari')} <span class="muted small">${t("(to'g'ri javobni yashil doiracha bilan belgilang)")}</span></span><div id="opts"></div>
        <button type="button" class="btn btn-ghost btn-sm" id="addo" style="align-self:flex-start">${icon('plus')} ${t("Variant qo'shish")}</button></div>
      <div class="field"><label for="qx">${t('Izoh')} <span class="muted">${t("(ixtiyoriy, natija tahlilida ko'rsatiladi)")}</span></label><textarea class="textarea" id="qx" maxlength="1000" style="min-height:70px">${esc(draft.explanation || '')}</textarea></div>
      ${trBlock('<div id="trq"></div>', hasTr(q.i18n))}
      <p class="form-error" id="qerr"></p></form>`,
    foot: `<button class="btn btn-ghost" data-close>${t('Bekor qilish')}</button><button class="btn" id="qsave">${t('Saqlash')}</button>`,
  });
  const box = m.el.querySelector('#opts');
  const trBox = m.el.querySelector('#trq');
  const drawTr = () => {
    trBox.innerHTML = TR_LANGS.map(([L, name]) => `<fieldset class="tr-lang"><legend>${name}</legend>
      <div class="field"><label>${t('Savol matni')}</label><textarea class="textarea" data-trt="${L}" maxlength="1000" style="min-height:60px">${esc(tr[L].text)}</textarea></div>
      <div class="field"><span class="label">${t('Variantlar (asosiy tartibda)')}</span>
        ${draft.options.map((o, i) => `<div class="opt-edit tr-opt"><span class="key">${KEYS[i]}</span><input class="input" data-tro="${L}:${i}" value="${esc(tr[L].options[i])}" placeholder="${esc(o)}" maxlength="300"><span></span></div>`).join('')}</div>
      <div class="field"><label>${t('Izoh')}</label><textarea class="textarea" data-tre="${L}" maxlength="1000" style="min-height:50px">${esc(tr[L].explanation)}</textarea></div>
      </fieldset>`).join('');
  };
  const draw = () => {
    box.innerHTML = draft.options.map((o, i) => `<div class="opt-edit">
      <input type="radio" name="corr" value="${i}" ${draft.correct === i ? 'checked' : ''} aria-label="${t("{k} variant to'g'ri", { k: KEYS[i] })}">
      <input class="input" data-o="${i}" value="${esc(o)}" placeholder="${t('{k} variant', { k: KEYS[i] })}" maxlength="300">
      <button type="button" class="btn btn-quiet btn-sm" data-rm="${i}" ${draft.options.length <= 2 ? 'disabled' : ''} aria-label="${t("Variantni o'chirish")}">${icon('x')}</button></div>`).join('');
    m.el.querySelector('#addo').disabled = draft.options.length >= 6;
    drawTr();
  };
  draw();
  box.addEventListener('input', (e) => {
    if (e.target.dataset.o) {
      const i = Number(e.target.dataset.o);
      draft.options[i] = e.target.value;
      trBox.querySelectorAll(`[data-tro$=":${i}"]`).forEach((inp) => { inp.placeholder = e.target.value; });
    }
  });
  box.addEventListener('change', (e) => { if (e.target.name === 'corr') draft.correct = Number(e.target.value); });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    const i = Number(b.dataset.rm);
    draft.options.splice(i, 1);
    for (const [L] of TR_LANGS) tr[L].options.splice(i, 1);
    if (draft.correct === i) draft.correct = 0; else if (draft.correct > i) draft.correct--;
    draw();
  });
  trBox.addEventListener('input', (e) => {
    const d = e.target.dataset;
    if (d.trt) tr[d.trt].text = e.target.value;
    if (d.tre) tr[d.tre].explanation = e.target.value;
    if (d.tro) { const [L, i] = d.tro.split(':'); tr[L].options[Number(i)] = e.target.value; }
  });
  m.el.querySelector('#addo').addEventListener('click', () => {
    draft.options.push('');
    for (const [L] of TR_LANGS) tr[L].options.push('');
    draw();
    box.querySelector(`[data-o="${draft.options.length - 1}"]`).focus();
  });
  m.el.querySelector('#qsave').addEventListener('click', async () => {
    const body = { subject_id: Number(m.el.querySelector('#qs').value), difficulty: Number(m.el.querySelector('#qd').value),
      text: m.el.querySelector('#qt').value, explanation: m.el.querySelector('#qx').value, options: draft.options, correct: draft.correct, i18n: tr };
    try {
      const r = q.id ? await put(`/api/admin/questions/${q.id}`, body) : await post('/api/admin/questions', body);
      m.close();
      toast(r.replaced ? t("Variantlar soni o'zgargani uchun yangi savol yaratildi, eskisi arxivlandi") : t('Savol saqlandi'), 'good');
      subjectsCache = null; onSaved();
    } catch (err) { m.el.querySelector('#qerr').textContent = err.message; }
  });
}

function importDialog(subs, sid, onDone) {
  const sample = t("Suvning kimyoviy formulasi?\n+H₂O\n-CO₂\n-NaCl\n-O₂\n?Ikki vodorod va bitta kislorod atomi\n!1\n\n2 + 2 × 2 = ?\n+6\n-8\n-4");
  const m = modal({
    title: t('Savollarni import qilish'), wide: true,
    body: `<div class="stack">
      <div class="import-help">${t("<b>Format:</b> har bir savol bo'sh qator bilan ajratiladi. Birinchi qator — savol matni, <code>+</code> to'g'ri javob, <code>-</code> noto'g'ri javob, <code>?</code> izoh, <code>!1</code> / <code>!2</code> / <code>!3</code> qiyinlik.")}<pre>${esc(sample)}</pre></div>
      <div class="field"><label for="is">${t('Fan')}</label><select class="select" id="is">${subs.map((s) => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></div>
      <div class="field"><label for="it">${t('Savollar matni')}</label><textarea class="textarea" id="it" style="min-height:220px;font-family:var(--mono);font-size:.85rem" placeholder="${esc(sample)}"></textarea></div>
      <p class="small" id="iprev"></p><p class="form-error" id="ierr"></p></div>`,
    foot: `<button class="btn btn-ghost" data-close>${t('Bekor qilish')}</button><button class="btn btn-ghost" id="icheck">${t('Tekshirish')}</button><button class="btn" id="igo">${t('Import qilish')}</button>`,
  });
  const body = (dryRun) => ({ subject_id: Number(m.el.querySelector('#is').value), text: m.el.querySelector('#it').value, dryRun });
  const err = m.el.querySelector('#ierr');
  m.el.querySelector('#icheck').addEventListener('click', async () => {
    err.textContent = '';
    try { const r = await post('/api/admin/questions/import', body(true)); m.el.querySelector('#iprev').innerHTML = `${icon('check')} ${t('Xatosiz: <b>{n}</b> ta savol import qilishga tayyor.', { n: r.count })}`; }
    catch (e) { m.el.querySelector('#iprev').textContent = ''; err.textContent = e.message; }
  });
  m.el.querySelector('#igo').addEventListener('click', async () => {
    err.textContent = '';
    try { const r = await post('/api/admin/questions/import', body(false)); m.close(); toast(t("{n} ta savol qo'shildi", { n: r.count }), 'good'); subjectsCache = null; onDone(); }
    catch (e) { err.textContent = e.message; }
  });
}

// ---------- Testlar ----------
async function tests(root, { state }) {
  const subs = await subjects();
  const { tests: list } = await get('/api/admin/tests');
  root.innerHTML = `${head(t('Testlar'), t('Har bir test fan savollar bankidan qancha savol va qancha vaqt berilishini belgilaydi'), `<button class="btn" id="add">${icon('plus')} ${t('Yangi test')}</button>`)}
    <section class="panel">${list.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>${t('Test')}</th><th>${t('Savollar')}</th><th>${t('Vaqt')}</th><th>${t('Urinish')}</th><th>${t('Himoya')}</th><th>${t('Topshirilgan')}</th><th>${t('Holat')}</th><th></th></tr></thead>
      <tbody>${list.map((x) => `<tr>
        <td><b>${esc(x.label)}</b><div class="tiny muted"><span class="tag" style="margin-top:4px"><i class="dot" style="--c:${esc(x.color)}"></i>${esc(x.subject)}</span></div></td>
        <td class="num">${x.question_count} <span class="tiny muted">${t('/ bankda {n}', { n: x.pool })}</span>${x.pool < x.question_count ? `<div class="tiny" style="color:var(--warn)">${t('Bankda savol yetmaydi')}</div>` : ''}</td>
        <td class="num">${t('{n} daq', { n: x.time_limit })}</td>
        <td>${x.max_attempts || '∞'}</td>
        <td class="small">${x.max_violations ? t('{n} ogohl.', { n: x.max_violations }) : t('Faqat kuzatuv')}<div class="tiny muted">${x.show_review ? t('Tahlil ochiq') : t('Tahlil yopiq')}</div></td>
        <td class="num">${x.attempts}${x.avg != null ? ` <span class="pct ${pctClass(x.avg)} small">${x.avg}%</span>` : ''}</td>
        <td><label class="switch"><input type="checkbox" data-toggle="${x.id}" ${x.is_active ? 'checked' : ''} aria-label="${t('Faol')}"></label></td>
        <td class="actions"><button class="btn btn-quiet btn-sm" data-edit="${x.id}" aria-label="${t('Tahrirlash')}">${icon('edit')}</button>
          ${state.user.role === 'admin' ? `<button class="btn btn-quiet btn-sm" data-del="${x.id}" aria-label="${t("O'chirish")}">${icon('trash')}</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : emptyState(t("Testlar yo'q"), t('Birinchi testni yarating.'))}</section>`;

  const reload = () => tests(root, { state });
  root.querySelector('#add').addEventListener('click', () => testEditor(subs, null, reload));
  root.querySelector('section').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.edit) testEditor(subs, list.find((x) => x.id === Number(b.dataset.edit)), reload);
    if (b.dataset.del) {
      const x = list.find((y) => y.id === Number(b.dataset.del));
      if (await confirmDialog({ title: t("Testni o'chirasizmi?"), text: t("\"{title}\" va unga tegishli {n} ta natija o'chiriladi. Natijalarni saqlash uchun testni o'chirish o'rniga nofaol qiling.", { title: x.label, n: x.attempts }), ok: t("O'chirish"), danger: true })) {
        await del(`/api/admin/tests/${x.id}`); toast(t("Test o'chirildi"), 'good'); reload();
      }
    }
  });
  root.querySelectorAll('[data-toggle]').forEach((c) => c.addEventListener('change', async () => {
    const x = list.find((y) => y.id === Number(c.dataset.toggle));
    await put(`/api/admin/tests/${x.id}`, { ...x, is_active: c.checked });
    x.is_active = c.checked ? 1 : 0;
    toast(c.checked ? t('Test talabalarga ochildi') : t('Test yopildi'), 'good');
  }));
}

function testEditor(subs, x, onSaved) {
  const v = x || { subject_id: subs[0]?.id, title: '', description: '', question_count: 20, time_limit: 25, difficulty: 0, max_attempts: 0, max_violations: 3, show_review: 1, is_active: 1 };
  const m = modal({
    title: x ? t('Testni tahrirlash') : t('Yangi test'), wide: true,
    body: `<form class="stack" novalidate>
      <div class="form-grid">
        <div class="field"><label for="ts">${t('Fan')}</label><select class="select" id="ts">${subs.map((s) => `<option value="${s.id}" ${s.id === v.subject_id ? 'selected' : ''}>${esc(s.label)} (${t('{n} savol', { n: s.question_count })})</option>`).join('')}</select></div>
        <div class="field"><label for="tt">${t('Test nomi')}</label><input class="input" id="tt" value="${esc(v.title)}" maxlength="120"></div>
      </div>
      <div class="field"><label for="tds">${t('Tavsif')}</label><textarea class="textarea" id="tds" style="min-height:70px" maxlength="400">${esc(v.description || '')}</textarea></div>
      <div class="form-grid">
        <div class="field"><label for="tq">${t('Savollar soni')}</label><input class="input" id="tq" type="number" min="1" max="200" value="${v.question_count}"></div>
        <div class="field"><label for="tl">${t('Vaqt (daqiqa)')}</label><input class="input" id="tl" type="number" min="1" max="240" value="${v.time_limit}"></div>
        <div class="field"><label for="td">${t('Qiyinlik')}</label><select class="select" id="td">${[0, 1, 2, 3].map((d) => `<option value="${d}" ${d === v.difficulty ? 'selected' : ''}>${diffLabel[d]}</option>`).join('')}</select></div>
      </div>
      <div class="form-grid">
        <div class="field"><label for="ta">${t('Urinishlar soni')}</label><input class="input" id="ta" type="number" min="0" max="100" value="${v.max_attempts}"><span class="hint">${t('0 — cheklanmagan')}</span></div>
        <div class="field"><label for="tv">${t('Qoidabuzarlik chegarasi')}</label><input class="input" id="tv" type="number" min="0" max="50" value="${v.max_violations}"><span class="hint">${t('Shuncha ogohlantirishdan keyin test yakunlanadi. 0 — faqat qayd etish')}</span></div>
      </div>
      <label class="switch"><input type="checkbox" id="tr" ${v.show_review ? 'checked' : ''}> ${t("Talabaga to'g'ri javoblar va izohlarni ko'rsatish")}</label>
      <label class="switch"><input type="checkbox" id="tx" ${v.is_active ? 'checked' : ''}> ${t('Test talabalar uchun ochiq')}</label>
      ${trBlock(TR_LANGS.map(([L, name]) => `<fieldset class="tr-lang"><legend>${name}</legend>
        <div class="field"><label>${t('Test nomi')}</label><input class="input" data-tr="${L}:title" value="${esc(v.i18n?.[L]?.title || '')}" maxlength="120"></div>
        <div class="field"><label>${t('Tavsif')}</label><textarea class="textarea" data-tr="${L}:description" style="min-height:50px" maxlength="400">${esc(v.i18n?.[L]?.description || '')}</textarea></div></fieldset>`).join(''), hasTr(v.i18n))}
      <p class="form-error" id="terr"></p></form>`,
    foot: `<button class="btn btn-ghost" data-close>${t('Bekor qilish')}</button><button class="btn" id="tsave">${t('Saqlash')}</button>`,
  });
  const g = (id) => m.el.querySelector('#' + id);
  m.el.querySelector('#tsave').addEventListener('click', async () => {
    const i18n = {};
    m.el.querySelectorAll('[data-tr]').forEach((el) => { const [L, f] = el.dataset.tr.split(':'); (i18n[L] ||= {})[f] = el.value; });
    const body = { subject_id: Number(g('ts').value), title: g('tt').value, description: g('tds').value, question_count: Number(g('tq').value),
      time_limit: Number(g('tl').value), difficulty: Number(g('td').value), max_attempts: Number(g('ta').value), max_violations: Number(g('tv').value),
      show_review: g('tr').checked, is_active: g('tx').checked, i18n };
    try { x ? await put(`/api/admin/tests/${x.id}`, body) : await post('/api/admin/tests', body); m.close(); toast(t('Test saqlandi'), 'good'); onSaved(); }
    catch (err) { g('terr').textContent = err.message; }
  });
}

// ---------- Natijalar ----------
async function attempts(root) {
  const [subs, { tests: tl }] = await Promise.all([subjects(), get('/api/admin/tests')]);
  const qs = new URLSearchParams(location.search);
  const f = { q: qs.get('q') || '', subject: qs.get('subject') || '', test: qs.get('test') || '', flagged: qs.get('flagged') || '', page: 1 };
  root.innerHTML = `${head(t('Natijalar'), t('Yakunlangan barcha urinishlar'), `<a class="btn btn-ghost" id="csv" href="#" download>${icon('download')} ${t('Excel (CSV) yuklab olish')}</a>`)}
    <section class="panel">
      <div class="toolbar">
        <div class="input-icon">${icon('search')}<input class="input" id="fq" placeholder="${t('Talaba ismi, email yoki guruh')}" value="${esc(f.q)}"></div>
        <select class="select" id="fs"><option value="">${t('Barcha fanlar')}</option>${subs.map((s) => `<option value="${s.id}" ${String(s.id) === f.subject ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
        <select class="select" id="ft"><option value="">${t('Barcha testlar')}</option>${tl.map((x) => `<option value="${x.id}" ${String(x.id) === f.test ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>
        <label class="check"><input type="checkbox" id="ff" ${f.flagged ? 'checked' : ''}> ${t('Faqat qoidabuzarlik bilan')}</label>
      </div>
      <div id="tbl">${skeleton(8)}</div></section>`;
  const tbl = root.querySelector('#tbl');
  async function load() {
    const params = new URLSearchParams(Object.entries(f).filter(([, v]) => v));
    root.querySelector('#csv').href = `/api/admin/attempts.csv?${params}`;
    history.replaceState({}, '', `/boshqaruv/natijalar${params.toString() ? '?' + params : ''}`);
    const d = await get(`/api/admin/attempts?${params}`);
    tbl.innerHTML = d.attempts.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>${t('Talaba')}</th><th>${t('Test')}</th><th>${t('Natija')}</th><th>${t('Baho')}</th><th>${t('Qoidabuzarlik')}</th><th>${t('Sana')}</th><th></th></tr></thead>
      <tbody>${d.attempts.map((a) => `<tr>
        <td><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="avatar">${esc(initials(a.name))}</span><div><b>${esc(a.name)}</b><div class="tiny muted">${esc(a.group || a.email)}</div></div></div></td>
        <td>${esc(a.title)}</td>
        <td><span class="pct ${pctClass(a.percent)}">${a.percent}%</span> <span class="small muted">${a.score}/${a.total}</span></td>
        <td><b>${markOf(a.percent)}</b></td>
        <td>${a.violations ? `<span class="tag tag-bad">${a.violations}${a.finish_reason === 'violations' ? t(', yakunlangan') : ''}</span>` : '<span class="muted">—</span>'}</td>
        <td>${fmtDate(a.finished_at)}</td>
        <td class="actions"><a class="btn btn-ghost btn-sm" href="/boshqaruv/natijalar/${a.id}" data-link>${t('Batafsil')}</a></td></tr>`).join('')}</tbody></table></div>${pager(d.page, d.pages, d.total)}`
      : emptyState(t('Natija topilmadi'), t("Filtrlarni o'zgartirib ko'ring."));
  }
  let timer;
  root.querySelector('#fq').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { f.q = e.target.value.trim(); f.page = 1; load(); }, 250); });
  root.querySelector('#fs').addEventListener('change', (e) => { f.subject = e.target.value; f.page = 1; load(); });
  root.querySelector('#ft').addEventListener('change', (e) => { f.test = e.target.value; f.page = 1; load(); });
  root.querySelector('#ff').addEventListener('change', (e) => { f.flagged = e.target.checked ? '1' : ''; f.page = 1; load(); });
  tbl.addEventListener('click', (e) => { const b = e.target.closest('[data-page]'); if (b) { f.page = Number(b.dataset.page); load(); } });
  load();
}

async function attemptDetail(root, { id, navigate }) {
  const { result: r } = await get(`/api/admin/attempts/${Number(id)}`);
  const st = r.student;
  root.innerHTML = `<nav class="crumbs"><a href="/boshqaruv/natijalar" data-link>${t('Natijalar')}</a><span>/</span><span>${esc(st.name)}</span></nav>
    ${head(st.name, `${esc(st.email)}${st.group ? `, ${esc(st.group)}` : ''}${r.ip ? `, IP ${esc(r.ip)}` : ''}`, `<button class="btn btn-danger" id="annul">${icon('trash')} ${t('Natijani bekor qilish')}</button>`)}
    <div class="stack" style="--gap:20px">
      ${resultView(r, { staffView: true })}
      <section class="panel"><div class="panel-head"><h2>${t('Qoidabuzarliklar jurnali')}</h2><span class="tag ${r.violationLog.length ? 'tag-bad' : 'tag-good'}">${t('{n} ta', { n: r.violationLog.length })}</span></div>
        <div class="panel-body">${r.violationLog.length ? `<div class="list">${r.violationLog.map((v) => `<div class="list-item"><span class="num muted" style="min-width:110px">${fmtDate(v.created_at)}</span><span>${esc(v.label)}</span></div>`).join('')}</div>`
          : `<p class="muted">${t('Test davomida hech qanday qoidabuzarlik qayd etilmagan.')}</p>`}</div></section>
      <section class="panel"><div class="panel-head"><h2>${t('Javoblar')}</h2></div>${reviewList(r.review)}</section>
    </div>`;
  root.querySelector('#annul').addEventListener('click', async () => {
    if (await confirmDialog({ title: t('Natijani bekor qilasizmi?'), text: t("Bu urinish butunlay o'chiriladi va reytingdan chiqariladi. Talaba testni qayta topshirishi mumkin bo'ladi."), ok: t('Natijani bekor qilish'), danger: true })) {
      await del(`/api/admin/attempts/${r.id}`); toast(t('Natija bekor qilindi'), 'good'); navigate('/boshqaruv/natijalar');
    }
  });
}

// ---------- Fanlar ----------
async function subjectsView(root, { state }) {
  const subs = await subjects(true);
  root.innerHTML = `${head(t('Fanlar'), t('Fan nomi, rangi va belgisi butun saytda ishlatiladi'), `<button class="btn" id="add">${icon('plus')} ${t('Yangi fan')}</button>`)}
    <div class="subjects">${subs.map((s) => `<div class="subject" style="--c:${esc(s.color)}">
      <span class="subject-icon">${icon(s.icon)}</span><h3>${esc(s.label)}</h3><p>${esc(s.label_description || '')}</p>
      <span class="subject-meta"><span>${t('{n} savol', { n: s.question_count })}</span><span>${t('{n} test', { n: s.test_count })}</span></span>
      <div class="row"><button class="btn btn-ghost btn-sm" data-edit="${s.id}">${icon('edit')} ${t('Tahrirlash')}</button>
        <a class="btn btn-quiet btn-sm" href="/boshqaruv/savollar?subject=${s.id}" data-link>${t('Savollar')}</a>
        ${state.user.role === 'admin' ? `<button class="btn btn-quiet btn-sm" data-del="${s.id}" aria-label="${t("O'chirish")}">${icon('trash')}</button>` : ''}</div></div>`).join('')}</div>`;
  const reload = () => subjectsView(root, { state });
  root.querySelector('#add').addEventListener('click', () => subjectEditor(null, reload));
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => subjectEditor(subs.find((s) => s.id === Number(b.dataset.edit)), reload)));
  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const s = subs.find((x) => x.id === Number(b.dataset.del));
    if (await confirmDialog({ title: t("\"{name}\" fanini o'chirasizmi?", { name: s.label }), text: t("Fan bilan birga {q} ta savol, {n} ta test va ularning barcha natijalari o'chiriladi.", { q: s.question_count, n: s.test_count }), ok: t("O'chirish"), danger: true })) {
      await del(`/api/admin/subjects/${s.id}`); toast(t("Fan o'chirildi"), 'good'); reload();
    }
  }));
}

function subjectEditor(s, onSaved) {
  const v = s || { name: '', slug: '', description: '', color: COLORS[0], icon: 'book' };
  const m = modal({
    title: s ? t('Fanni tahrirlash') : t('Yangi fan'),
    body: `<form class="stack" novalidate>
      <div class="form-grid"><div class="field"><label for="sn">${t("Nomi (asosiy, o'zbekcha)")}</label><input class="input" id="sn" value="${esc(v.name)}" maxlength="60"></div>
        <div class="field"><label for="sl">${t('Manzildagi qisqa nom')}</label><input class="input" id="sl" value="${esc(v.slug)}" maxlength="40" placeholder="${t('masalan: fizika')}"><span class="hint">${t('Lotin harflari, raqam va chiziqcha')}</span></div></div>
      <div class="field"><label for="sd">${t('Tavsif')}</label><textarea class="textarea" id="sd" maxlength="300" style="min-height:70px">${esc(v.description || '')}</textarea></div>
      <div class="field"><span class="label">${t('Rang')}</span><div class="color-swatches">${COLORS.map((c) => `<label style="--c:${c}" title="${c}"><input type="radio" name="sc" value="${c}" ${c === v.color ? 'checked' : ''}></label>`).join('')}</div></div>
      <div class="field"><span class="label">${t('Belgi')}</span><div class="icon-pick">${ICON_NAMES.map((n) => `<label title="${n}"><input type="radio" name="si" value="${n}" ${n === v.icon ? 'checked' : ''}>${icon(n)}</label>`).join('')}</div></div>
      ${trBlock(TR_LANGS.map(([L, name]) => `<fieldset class="tr-lang"><legend>${name}</legend>
        <div class="field"><label>${t('Nomi')}</label><input class="input" data-tr="${L}:name" value="${esc(v.i18n?.[L]?.name || '')}" maxlength="60"></div>
        <div class="field"><label>${t('Tavsif')}</label><textarea class="textarea" data-tr="${L}:description" style="min-height:50px" maxlength="300">${esc(v.i18n?.[L]?.description || '')}</textarea></div></fieldset>`).join(''), hasTr(v.i18n))}
      <p class="form-error" id="serr"></p></form>`,
    foot: `<button class="btn btn-ghost" data-close>${t('Bekor qilish')}</button><button class="btn" id="ssave">${t('Saqlash')}</button>`,
  });
  m.el.querySelector('#ssave').addEventListener('click', async () => {
    const i18n = {};
    m.el.querySelectorAll('[data-tr]').forEach((el) => { const [L, f] = el.dataset.tr.split(':'); (i18n[L] ||= {})[f] = el.value; });
    const body = { name: m.el.querySelector('#sn').value, slug: m.el.querySelector('#sl').value, description: m.el.querySelector('#sd').value,
      color: m.el.querySelector('[name=sc]:checked')?.value, icon: m.el.querySelector('[name=si]:checked')?.value, i18n };
    try { s ? await put(`/api/admin/subjects/${s.id}`, body) : await post('/api/admin/subjects', body); m.close(); subjectsCache = null; toast(t('Fan saqlandi'), 'good'); onSaved(); }
    catch (err) { m.el.querySelector('#serr').textContent = err.message; }
  });
}

// ---------- Foydalanuvchilar ----------
async function users(root, { state }) {
  const f = { q: '', role: '', page: 1 };
  root.innerHTML = `${head(t('Foydalanuvchilar'), t("Rollar: talaba test topshiradi, o'qituvchi savol va testlarni boshqaradi, administrator hammasini"))}
    <section class="panel"><div class="toolbar">
      <div class="input-icon">${icon('search')}<input class="input" id="fq" placeholder="${t('Ism, email yoki guruh')}"></div>
      <div class="seg" id="fr"><button data-r="" aria-pressed="true">${t('Barchasi')}</button><button data-r="student" aria-pressed="false">${t('Talabalar')}</button><button data-r="teacher" aria-pressed="false">${t("O'qituvchilar")}</button><button data-r="admin" aria-pressed="false">${t('Adminlar')}</button></div>
    </div><div id="tbl">${skeleton(8)}</div></section>`;
  const tbl = root.querySelector('#tbl');
  async function load() {
    const d = await get(`/api/admin/users?${new URLSearchParams(f)}`);
    tbl.innerHTML = d.users.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>${t('Foydalanuvchi')}</th><th>${t('Guruh')}</th><th>${t('Rol')}</th><th>${t('Testlar')}</th><th>${t('Oxirgi kirish')}</th><th>${t('Holat')}</th><th></th></tr></thead>
      <tbody>${d.users.map((u) => `<tr>
        <td><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="avatar">${esc(initials(u.name))}</span><div><b>${esc(u.name)}</b><div class="tiny muted">${esc(u.email)}</div></div></div></td>
        <td>${esc(u.group || '—')}</td>
        <td>${u.id === state.user.id ? `<span class="tag tag-lapis">${roleLabel[u.role]}</span>` : `<select class="select" data-role="${u.id}" style="width:auto;padding:6px 32px 6px 10px">${['student', 'teacher', 'admin'].map((k) => `<option value="${k}" ${k === u.role ? 'selected' : ''}>${roleLabel[k]}</option>`).join('')}</select>`}</td>
        <td class="num">${u.attempts}${u.avg != null ? ` <span class="pct ${pctClass(u.avg)} small">${u.avg}%</span>` : ''}</td>
        <td>${fmtDate(u.last_login)}</td>
        <td>${u.id === state.user.id ? `<span class="muted small">${t('Siz')}</span>` : `<label class="switch"><input type="checkbox" data-block="${u.id}" ${u.is_blocked ? '' : 'checked'}> <span class="small">${u.is_blocked ? t('Bloklangan') : t('Faol')}</span></label>`}</td>
        <td class="actions">${u.id === state.user.id ? '' : `<button class="btn btn-quiet btn-sm" data-del="${u.id}" aria-label="${t("O'chirish")}">${icon('trash')}</button>`}</td></tr>`).join('')}</tbody></table></div>${pager(d.page, d.pages, d.total)}`
      : emptyState(t('Foydalanuvchi topilmadi'), t("Qidiruvni o'zgartirib ko'ring."));
    tbl.querySelectorAll('[data-role]').forEach((s) => s.addEventListener('change', async () => { await put(`/api/admin/users/${s.dataset.role}`, { role: s.value }); toast(t("Rol o'zgartirildi"), 'good'); }));
    tbl.querySelectorAll('[data-block]').forEach((c) => c.addEventListener('change', async () => {
      await put(`/api/admin/users/${c.dataset.block}`, { is_blocked: !c.checked }); toast(c.checked ? t('Hisob faollashtirildi') : t('Hisob bloklandi, sessiyalari yopildi'), 'good'); load();
    }));
  }
  let timer;
  root.querySelector('#fq').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { f.q = e.target.value.trim(); f.page = 1; load(); }, 250); });
  root.querySelector('#fr').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return; f.role = b.dataset.r; f.page = 1;
    root.querySelectorAll('#fr button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); load();
  });
  tbl.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.page) { f.page = Number(b.dataset.page); return load(); }
    if (b.dataset.del && await confirmDialog({ title: t("Foydalanuvchini o'chirasizmi?"), text: t("Hisob va uning barcha natijalari o'chiriladi."), ok: t("O'chirish"), danger: true })) {
      await del(`/api/admin/users/${b.dataset.del}`); toast(t("Foydalanuvchi o'chirildi"), 'good'); load();
    }
  });
  load();
}
