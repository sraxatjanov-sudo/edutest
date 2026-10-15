// Boshqaruv paneli (o'qituvchi va administrator)
import { get, post, put, patch, del } from '../api.js';
import {
  esc, rich, icon, ICON_NAMES, toast, modal, confirmDialog, skeleton, emptyState, pager, vbars, hbars,
  fmtDate, fmtNum, pctClass, diffDots, diffLabel, roleLabel, avatar, markOf, KEYS, qimage, imageToDataUrl, t,
} from '../ui.js';
import { resultView, reviewList } from './result.js';

const SECTIONS = [
  ['overview', "Umumiy ko'rinish", 'chart'],
  ['savollar', 'Savollar banki', 'layers'],
  ['testlar', 'Testlar', 'list'],
  ['guruhlar', 'Guruhlar', 'users'],
  ['natijalar', 'Natijalar', 'target'],
  ['fanlar', 'Fanlar', 'book'],
  ['foydalanuvchilar', 'Foydalanuvchilar', 'user', 'admin'],
];
const TR_LANGS = [['ru', 'Русский'], ['kaa', 'Qaraqalpaqsha']];
const COLORS = ['#1F4FA3', '#138A84', '#7A3FB8', '#2E8B57', '#C2552B', '#B23A48', '#8A6D1F', '#0E7490', '#334155', '#4338CA', '#A21CAF'];
let subjectsCache = null;
const subjects = async (fresh) => (subjectsCache && !fresh ? subjectsCache : (subjectsCache = (await get('/api/admin/subjects')).subjects));
const groupsList = async () => (await get('/api/admin/groups')).groups;
// datetime-local maydoni uchun (mahalliy vaqt) va qaytarib ms ga
const toLocalInput = (ms) => { if (!ms) return ''; const d = new Date(ms); return new Date(ms - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); };
const fromLocalInput = (v) => (v ? new Date(v).getTime() : null);

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
  const views = { overview, savollar: questions, testlar: tests, guruhlar: id ? groupDetail : groupsView, natijalar: id ? attemptDetail : attempts, fanlar: subjectsView, foydalanuvchilar: users };
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
async function overview(root, { state }) {
  const [d, bk] = await Promise.all([get('/api/admin/overview'), state.user.role === 'admin' ? get('/api/admin/backup').catch(() => null) : null]);
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
    </div>
    ${bk ? backupPanel(bk.backup) : ''}`;
  root.querySelector('#bk-now')?.addEventListener('click', async (e) => {
    e.target.disabled = true;
    try { await post('/api/admin/backup', {}); toast(t('Zaxira nusxa saqlandi'), 'good'); overview(root, { state }); }
    catch (err) { toast(err.message, 'bad'); e.target.disabled = false; }
  });
  const days = d.days.map((x) => ({ label: fmtDate(x.date, false), value: x.count }));
  vbars(root.querySelector('#days'), days, { unit: t('ta test') });
}

function backupPanel(b) {
  const ago = (ms) => (ms ? fmtDate(ms) : '—');
  return `<section class="panel" style="margin-top:20px"><div class="panel-head"><h2 class="row" style="gap:10px">${icon('cloud')} ${t("Ma'lumotlarni saqlash")}</h2>
      ${b.enabled ? `<span class="tag ${b.lastError ? 'tag-bad' : 'tag-good'}">${b.lastError ? t('Xato') : t('Yoqilgan')}</span>` : `<span class="tag tag-warn">${t("O'chirilgan")}</span>`}</div>
    <div class="panel-body">${b.enabled ? `<div class="row" style="gap:28px;align-items:flex-start">
        <div><div class="tiny muted">${t('Ombor')}</div><b>${esc(b.repo)}</b></div>
        <div><div class="tiny muted">${t('Oxirgi nusxa')}</div><b>${ago(b.lastBackupAt)}</b></div>
        <div><div class="tiny muted">${t('Zaxiradan tiklangan')}</div><b>${ago(b.restoredAt)}</b></div>
        <div><div class="tiny muted">${t('Avtomatik')}</div><b>${t('har {n} daqiqada', { n: b.every })}</b></div>
        <span class="grow"></span><button class="btn btn-ghost btn-sm" id="bk-now" ${b.blocked ? 'disabled' : ''}>${icon('upload')} ${t('Hozir saqlash')}</button></div>
        ${b.blocked ? `<div class="notice notice-bad" style="margin-top:14px">${icon('alert')}<div>${t("Ishga tushishda zaxiradan tiklab bo'lmadi, eski nusxani buzmaslik uchun saqlash to'xtatilgan. Tokenni tekshirib, xizmatni qayta ishga tushiring.")}</div></div>` : ''}
        ${b.lastError && !b.blocked ? `<p class="tiny" style="color:var(--bad);margin-top:10px">${esc(b.lastError)}</p>` : ''}`
      : `<div class="notice notice-warn">${icon('alert')}<div>${t("Bepul hostingda server qayta ishga tushganda yangi ro'yxatdan o'tganlar va natijalar o'chib ketadi. Saqlashni yoqish uchun hostingda BACKUP_REPO va BACKUP_TOKEN sozlamalarini kiriting (README faylida qadamma-qadam yozilgan).")}</div></div>`}</div></section>`;
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
        <td class="clip" title="${esc(q.label)}">${q.image ? `<span class="tag tag-lapis" title="${t('Rasmli savol')}" style="margin-right:6px">${icon('image')}</span>` : ''}${rich(q.label)}</td>
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
      <div class="field"><span class="label">${t('Rasm')} <span class="muted small">${t('(ixtiyoriy: chizma, grafik, xarita, formula)')}</span></span>
        <div class="img-field" id="qimgbox"></div>
        <input type="file" id="qimgfile" accept="image/png,image/jpeg,image/webp,image/gif" hidden></div>
      <div class="field"><span class="label">${t('Javob variantlari')} <span class="muted small">${t("(to'g'ri javobni yashil doiracha bilan belgilang)")}</span></span><div id="opts"></div>
        <button type="button" class="btn btn-ghost btn-sm" id="addo" style="align-self:flex-start">${icon('plus')} ${t("Variant qo'shish")}</button></div>
      <div class="field"><label for="qx">${t('Izoh')} <span class="muted">${t("(ixtiyoriy, natija tahlilida ko'rsatiladi)")}</span></label><textarea class="textarea" id="qx" maxlength="1000" style="min-height:70px">${esc(draft.explanation || '')}</textarea></div>
      ${trBlock('<div id="trq"></div>', hasTr(q.i18n))}
      <p class="form-error" id="qerr"></p></form>`,
    foot: `<button class="btn btn-ghost" data-close>${t('Bekor qilish')}</button><button class="btn" id="qsave">${t('Saqlash')}</button>`,
  });
  const box = m.el.querySelector('#opts');
  const trBox = m.el.querySelector('#trq');
  // Rasm: tanlash → brauzerda kichraytirish → serverga yuklash → kalit savolga biriktiriladi
  const imgBox = m.el.querySelector('#qimgbox');
  const imgFile = m.el.querySelector('#qimgfile');
  const drawImg = (busy = false) => {
    imgBox.innerHTML = draft.image
      ? `${qimage(draft.image)}<div class="row"><button type="button" class="btn btn-ghost btn-sm" data-img="pick">${icon('refresh')} ${t('Almashtirish')}</button>
          <button type="button" class="btn btn-quiet btn-sm" data-img="rm">${icon('trash')} ${t("Rasmni olib tashlash")}</button></div>`
      : `<button type="button" class="img-drop" data-img="pick" ${busy ? 'disabled' : ''}>${icon(busy ? 'upload' : 'image')}<span>${busy ? t('Yuklanmoqda…') : t('Rasm tanlang yoki shu yerga tashlang')}</span><span class="tiny muted">PNG, JPEG, WebP</span></button>`;
  };
  const uploadImg = async (file) => {
    if (!file) return;
    drawImg(true);
    try {
      const data = await imageToDataUrl(file, { max: 1400 });
      draft.image = (await post('/api/images', { data })).key;
    } catch (err) { toast(err.message, 'bad'); }
    drawImg();
  };
  imgBox.addEventListener('click', (e) => {
    const b = e.target.closest('[data-img]'); if (!b) return;
    if (b.dataset.img === 'pick') imgFile.click();
    if (b.dataset.img === 'rm') { draft.image = null; drawImg(); }
  });
  imgBox.addEventListener('dragover', (e) => { e.preventDefault(); imgBox.classList.add('over'); });
  imgBox.addEventListener('dragleave', () => imgBox.classList.remove('over'));
  imgBox.addEventListener('drop', (e) => { e.preventDefault(); imgBox.classList.remove('over'); uploadImg(e.dataTransfer.files[0]); });
  imgFile.addEventListener('change', () => { uploadImg(imgFile.files[0]); imgFile.value = ''; });
  drawImg();
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
      text: m.el.querySelector('#qt').value, explanation: m.el.querySelector('#qx').value, options: draft.options, correct: draft.correct, i18n: tr, image: draft.image || null };
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
  let mode = 'excel', items = null;
  const m = modal({
    title: t('Savollarni import qilish'), wide: true,
    body: `<div class="stack">
      <div class="field"><label for="is">${t('Fan')}</label><select class="select" id="is">${subs.map((s) => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select></div>
      <div class="seg" id="imode"><button type="button" data-m="excel" aria-pressed="true">${icon('table')} ${t('Excel fayl')}</button><button type="button" data-m="text" aria-pressed="false">${icon('edit')} ${t('Matn')}</button></div>
      <div id="m-excel" class="stack">
        <div class="import-help">${t("<b>Excel jadvali:</b> har bir qator — bitta savol. Ustunlar: <b>Savol</b>, <b>To'g'ri javob</b>, <b>Noto'g'ri 1–4</b>, <b>Izoh</b>, <b>Qiyinlik</b> (1, 2 yoki 3). Birinchi qatorda sarlavha bo'lishi mumkin. CSV fayl ham qabul qilinadi.")}
          <div style="margin-top:10px"><a class="btn btn-ghost btn-sm" href="/files/savollar-namuna.xlsx" download>${icon('download')} ${t('Namuna faylni yuklab olish')}</a></div></div>
        <label class="file-drop" id="xdrop">${icon('upload')}<span id="xname">${t('Excel (.xlsx) yoki CSV faylni tanlang yoki shu yerga tashlang')}</span>
          <input type="file" id="xfile" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"></label>
        <div id="xprev"></div>
      </div>
      <div id="m-text" class="stack" hidden>
        <div class="import-help">${t("<b>Format:</b> har bir savol bo'sh qator bilan ajratiladi. Birinchi qator — savol matni, <code>+</code> to'g'ri javob, <code>-</code> noto'g'ri javob, <code>?</code> izoh, <code>!1</code> / <code>!2</code> / <code>!3</code> qiyinlik.")}<pre>${esc(sample)}</pre></div>
        <div class="field"><label for="it">${t('Savollar matni')}</label><textarea class="textarea" id="it" style="min-height:220px;font-family:var(--mono);font-size:.85rem" placeholder="${esc(sample)}"></textarea></div>
      </div>
      <p class="small" id="iprev"></p><p class="form-error" id="ierr"></p></div>`,
    foot: `<button class="btn btn-ghost" data-close>${t('Bekor qilish')}</button><button class="btn btn-ghost" id="icheck">${t('Tekshirish')}</button><button class="btn" id="igo">${t('Import qilish')}</button>`,
  });
  const $ = (q) => m.el.querySelector(q);
  const err = $('#ierr');
  const body = (dryRun) => (mode === 'excel'
    ? { subject_id: Number($('#is').value), items: items || [], dryRun }
    : { subject_id: Number($('#is').value), text: $('#it').value, dryRun });
  $('#imode').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    mode = b.dataset.m;
    m.el.querySelectorAll('#imode button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('#m-excel').hidden = mode !== 'excel'; $('#m-text').hidden = mode !== 'text';
    err.textContent = ''; $('#iprev').textContent = '';
  });
  async function readFile(file) {
    if (!file) return;
    err.textContent = ''; $('#xprev').innerHTML = '';
    $('#xname').textContent = file.name;
    try {
      const { readXlsx, readCsv, rowsToQuestions } = await import('../xlsx.js');
      const rows = /\.csv$/i.test(file.name) ? readCsv(await file.text()) : await readXlsx(await file.arrayBuffer());
      const r = rowsToQuestions(rows);
      items = r.questions;
      $('#xprev').innerHTML = `<div class="notice ${items.length ? 'notice-good' : 'notice-warn'}">${icon(items.length ? 'check' : 'alert')}<div>
          ${t('Faylda <b>{n}</b> ta savol topildi.', { n: items.length })}${r.errors.length ? ' ' + t("{rows}-qatorlar o'tkazib yuborildi: savol, to'g'ri javob yoki noto'g'ri variant yo'q.", { rows: r.errors.slice(0, 8).join(', ') }) : ''}</div></div>
        ${items.length ? `<div class="table-wrap" style="margin-top:10px"><table class="table"><thead><tr><th>${t('Savol')}</th><th>${t("To'g'ri javob")}</th><th>${t('Variantlar')}</th><th>${t('Qiyinlik')}</th></tr></thead>
          <tbody>${items.slice(0, 5).map((q) => `<tr><td class="clip">${esc(q.text)}</td><td class="clip" style="max-width:160px">${esc(q.options[0])}</td><td class="num">${q.options.length}</td><td>${diffDots(q.difficulty)}</td></tr>`).join('')}</tbody></table></div>
          ${items.length > 5 ? `<p class="tiny muted">${t('…va yana {n} ta', { n: items.length - 5 })}</p>` : ''}` : ''}`;
    } catch (e) {
      items = null;
      err.textContent = t("Faylni o'qib bo'lmadi. U .xlsx yoki .csv formatida ekanini tekshiring.");
    }
  }
  $('#xfile').addEventListener('change', (e) => readFile(e.target.files[0]));
  const drop = $('#xdrop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); readFile(e.dataTransfer.files[0]); });

  $('#icheck').addEventListener('click', async () => {
    err.textContent = '';
    try { const r = await post('/api/admin/questions/import', body(true)); $('#iprev').innerHTML = `${icon('check')} ${t('Xatosiz: <b>{n}</b> ta savol import qilishga tayyor.', { n: r.count })}`; }
    catch (e) { $('#iprev').textContent = ''; err.textContent = e.message; }
  });
  $('#igo').addEventListener('click', async () => {
    err.textContent = '';
    try { const r = await post('/api/admin/questions/import', body(false)); m.close(); toast(t("{n} ta savol qo'shildi", { n: r.count }), 'good'); subjectsCache = null; onDone(); }
    catch (e) { err.textContent = e.message; }
  });
}

// ---------- Testlar ----------
async function tests(root, { state }) {
  const [subs, { tests: list }, groups] = await Promise.all([subjects(), get('/api/admin/tests'), groupsList()]);
  root.innerHTML = `${head(t('Testlar'), t('Har bir test fan savollar bankidan qancha savol va qancha vaqt berilishini belgilaydi'), `<button class="btn" id="add">${icon('plus')} ${t('Yangi test')}</button>`)}
    <section class="panel">${list.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>${t('Test')}</th><th>${t('Savollar')}</th><th>${t('Vaqt')}</th><th>${t('Urinish')}</th><th>${t('Himoya')}</th><th>${t('Topshirilgan')}</th><th>${t('Holat')}</th><th></th></tr></thead>
      <tbody>${list.map((x) => `<tr>
        <td><b>${esc(x.label)}</b><div class="row" style="gap:6px;margin-top:4px"><span class="tag"><i class="dot" style="--c:${esc(x.color)}"></i>${esc(x.subject)}</span>
          ${x.group_name ? `<span class="tag tag-lapis">${icon('users')} ${esc(x.group_name)}</span>` : ''}
          ${x.cert_percent ? `<span class="tag tag-saffron" title="${t('Sertifikat chegarasi')}">${icon('award')} ${x.cert_percent}%</span>` : ''}
          ${x.opens_at || x.closes_at ? `<span class="tag tag-warn" title="${t('Jadval')}">${icon('calendar')} ${x.opens_at ? fmtDate(x.opens_at) : '…'} — ${x.closes_at ? fmtDate(x.closes_at) : '…'}</span>` : ''}</div></td>
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
  root.querySelector('#add').addEventListener('click', () => testEditor(subs, null, reload, groups));
  root.querySelector('section').addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.edit) testEditor(subs, list.find((x) => x.id === Number(b.dataset.edit)), reload, groups);
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

function testEditor(subs, x, onSaved, groups = []) {
  const v = x || { subject_id: subs[0]?.id, title: '', description: '', question_count: 20, time_limit: 25, difficulty: 0, max_attempts: 0, max_violations: 3, show_review: 1, is_active: 1, cert_percent: 0, group_id: null };
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
      <div class="form-grid">
        <div class="field"><label for="tg">${t('Kim uchun')}</label><select class="select" id="tg"><option value="">${t('Barcha talabalar')}</option>
          ${groups.map((g) => `<option value="${g.id}" ${g.id === v.group_id ? 'selected' : ''}>${t('Faqat «{name}» guruhi', { name: esc(g.name) })}</option>`).join('')}</select>
          <span class="hint">${groups.length ? t("Guruh testini faqat shu guruh a'zolari ko'radi") : t("Guruhlar bo'limida guruh yarating")}</span></div>
        <div class="field"><label for="tc">${t('Sertifikat chegarasi (%)')}</label><input class="input" id="tc" type="number" min="0" max="100" value="${v.cert_percent || 0}"><span class="hint">${t('0 — sertifikat berilmaydi. Masalan, 71 — "yaxshi" va undan yuqori')}</span></div>
      </div>
      <div class="form-grid">
        <div class="field"><label for="to">${t('Ochilish vaqti')}</label><input class="input" id="to" type="datetime-local" value="${toLocalInput(v.opens_at)}"><span class="hint">${t("Bo'sh — darhol ochiq")}</span></div>
        <div class="field"><label for="tz">${t('Yopilish vaqti')}</label><input class="input" id="tz" type="datetime-local" value="${toLocalInput(v.closes_at)}"><span class="hint">${t("Bo'sh — muddatsiz")}</span></div>
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
      show_review: g('tr').checked, is_active: g('tx').checked, i18n,
      group_id: Number(g('tg').value) || null, cert_percent: Number(g('tc').value) || 0, opens_at: fromLocalInput(g('to').value), closes_at: fromLocalInput(g('tz').value) };
    try { x ? await put(`/api/admin/tests/${x.id}`, body) : await post('/api/admin/tests', body); m.close(); toast(t('Test saqlandi'), 'good'); onSaved(); }
    catch (err) { g('terr').textContent = err.message; }
  });
}

// ---------- Natijalar ----------
async function attempts(root) {
  const [subs, { tests: tl }, groups] = await Promise.all([subjects(), get('/api/admin/tests'), groupsList()]);
  const qs = new URLSearchParams(location.search);
  const f = { q: qs.get('q') || '', subject: qs.get('subject') || '', test: qs.get('test') || '', group: qs.get('group') || '', flagged: qs.get('flagged') || '', page: 1 };
  root.innerHTML = `${head(t('Natijalar'), t('Yakunlangan barcha urinishlar'), `<a class="btn btn-ghost" id="csv" href="#" download>${icon('download')} ${t('Excel (CSV) yuklab olish')}</a>`)}
    <section class="panel">
      <div class="toolbar">
        <div class="input-icon">${icon('search')}<input class="input" id="fq" placeholder="${t('Talaba ismi, email yoki guruh')}" value="${esc(f.q)}"></div>
        <select class="select" id="fs"><option value="">${t('Barcha fanlar')}</option>${subs.map((s) => `<option value="${s.id}" ${String(s.id) === f.subject ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
        <select class="select" id="ft"><option value="">${t('Barcha testlar')}</option>${tl.map((x) => `<option value="${x.id}" ${String(x.id) === f.test ? 'selected' : ''}>${esc(x.label)}</option>`).join('')}</select>
        ${groups.length ? `<select class="select" id="fg"><option value="">${t('Barcha guruhlar')}</option>${groups.map((g) => `<option value="${g.id}" ${String(g.id) === f.group ? 'selected' : ''}>${esc(g.name)}</option>`).join('')}</select>` : ''}
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
        <td><div class="row" style="gap:10px;flex-wrap:nowrap">${avatar(a)}<div><b>${esc(a.name)}</b><div class="tiny muted">${esc(a.group || a.email)}</div></div></div></td>
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
  root.querySelector('#fg')?.addEventListener('change', (e) => { f.group = e.target.value; f.page = 1; load(); });
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
        <td><div class="row" style="gap:10px;flex-wrap:nowrap">${avatar(u)}<div><b>${esc(u.name)}</b><div class="tiny muted">${esc(u.email)}</div></div></div></td>
        <td>${esc(u.group || '—')}</td>
        <td>${u.id === state.user.id ? `<span class="tag tag-lapis">${roleLabel[u.role]}</span>` : `<select class="select" data-role="${u.id}" style="width:auto;padding:6px 32px 6px 10px">${['student', 'teacher', 'admin'].map((k) => `<option value="${k}" ${k === u.role ? 'selected' : ''}>${roleLabel[k]}</option>`).join('')}</select>`}</td>
        <td class="num">${u.attempts}${u.avg != null ? ` <span class="pct ${pctClass(u.avg)} small">${u.avg}%</span>` : ''}</td>
        <td>${fmtDate(u.last_login)}</td>
        <td>${u.id === state.user.id ? `<span class="muted small">${t('Siz')}</span>` : `<label class="switch"><input type="checkbox" data-block="${u.id}" ${u.is_blocked ? '' : 'checked'}> <span class="small">${u.is_blocked ? t('Bloklangan') : t('Faol')}</span></label>`}</td>
        <td class="actions">${u.id === state.user.id ? '' : `<button class="btn btn-quiet btn-sm" data-reset="${u.id}" data-name="${esc(u.name)}" title="${t('Vaqtinchalik parol berish')}" aria-label="${t('Vaqtinchalik parol berish')}">${icon('key')}</button>
          <button class="btn btn-quiet btn-sm" data-del="${u.id}" aria-label="${t("O'chirish")}">${icon('trash')}</button>`}</td></tr>`).join('')}</tbody></table></div>${pager(d.page, d.pages, d.total)}`
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
    if (b.dataset.reset) return resetPassword(b.dataset.reset, b.dataset.name);
    if (b.dataset.del && await confirmDialog({ title: t("Foydalanuvchini o'chirasizmi?"), text: t("Hisob va uning barcha natijalari o'chiriladi."), ok: t("O'chirish"), danger: true })) {
      await del(`/api/admin/users/${b.dataset.del}`); toast(t("Foydalanuvchi o'chirildi"), 'good'); load();
    }
  });
  load();
}

// Vaqtinchalik parol: talaba parolini unutsa, o'qituvchi/admin yangisini beradi
async function resetPassword(id, name) {
  if (!await confirmDialog({ title: t('Vaqtinchalik parol berilsinmi?'), text: t("{name} uchun yangi parol yaratiladi, eski parol va barcha sessiyalar bekor qilinadi. Parolni talabaga o'zingiz yetkazasiz.", { name }), ok: t('Parol yaratish') })) return;
  try {
    const { password } = await post(`/api/admin/users/${id}/password`, {});
    const m = modal({
      title: t('Yangi parol'),
      body: `<div class="stack"><p>${t("{name} uchun vaqtinchalik parol. Uni hozir yozib oling — keyin qayta ko'rsatilmaydi.", { name: esc(name) })}</p>
        <div class="code-big num" id="pw">${esc(password)}</div>
        <p class="small muted">${t("Talaba kirgandan keyin profil sahifasida parolni o'zgartirishi kerak.")}</p></div>`,
      foot: `<button class="btn btn-ghost" id="pcopy">${icon('copy')} ${t('Nusxalash')}</button><button class="btn" data-close>${t('Tayyor')}</button>`,
    });
    m.el.querySelector('#pcopy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(password); toast(t('Nusxalandi'), 'good'); } catch { /* */ } });
  } catch (e) { toast(e.message, 'bad'); }
}

// ---------- Guruhlar ----------
async function groupsView(root, { state, navigate }) {
  const list = await groupsList();
  root.innerHTML = `${head(t('Guruhlar'), t("Guruh yarating va kodini talabalarga bering. Ular kabinetda kodni kiritib qo'shiladi."), `<button class="btn" id="add">${icon('plus')} ${t('Yangi guruh')}</button>`)}
    ${list.length ? `<div class="groups">${list.map((g) => `<a class="group-card" href="/boshqaruv/guruhlar/${g.id}" data-link>
        <div class="spread"><h3>${esc(g.name)}</h3><span class="code-chip num">${esc(g.code)}</span></div>
        <div class="facts"><span>${icon('users')} ${t("{n} a'zo", { n: g.members })}</span><span>${icon('list')} ${t('{n} test', { n: g.tests })}</span>
          ${g.avg != null ? `<span>${icon('target')} ${t("o'rtacha {p}%", { p: g.avg })}</span>` : ''}</div>
        ${state.user.role === 'admin' && g.teacher ? `<div class="tiny muted">${t("O'qituvchi: {name}", { name: esc(g.teacher) })}</div>` : ''}
      </a>`).join('')}</div>`
      : `<section class="panel">${emptyState(t("Guruhlar yo'q"), t('Birinchi guruhni yarating, masalan «9-A sinf» yoki «211-guruh».'))}</section>`}`;
  root.querySelector('#add').addEventListener('click', () => {
    const m = modal({
      title: t('Yangi guruh'),
      body: `<form class="stack" id="gf" novalidate><div class="field"><label for="gn">${t('Guruh nomi')}</label><input class="input" id="gn" maxlength="60" placeholder="${t('Masalan: 9-A sinf')}"></div><p class="form-error" id="gerr"></p></form>`,
      foot: `<button class="btn btn-ghost" data-close>${t('Bekor qilish')}</button><button class="btn" id="gsave">${t('Yaratish')}</button>`,
    });
    const save = async (e) => {
      e?.preventDefault();
      try { const r = await post('/api/admin/groups', { name: m.el.querySelector('#gn').value }); m.close(); toast(t('Guruh yaratildi'), 'good'); navigate(`/boshqaruv/guruhlar/${r.id}`); }
      catch (err) { m.el.querySelector('#gerr').textContent = err.message; }
    };
    m.el.querySelector('#gsave').addEventListener('click', save);
    m.el.querySelector('#gf').addEventListener('submit', save);
  });
}

async function groupDetail(root, { id, state, navigate }) {
  const d = await get(`/api/admin/groups/${Number(id)}`);
  const g = d.group;
  const joinUrl = `${location.origin}/kabinet`;
  root.innerHTML = `<nav class="crumbs"><a href="/boshqaruv/guruhlar" data-link>${t('Guruhlar')}</a><span>/</span><span>${esc(g.name)}</span></nav>
    ${head(g.name, t('{n} a\'zo, {date} da yaratilgan', { n: d.members.length, date: fmtDate(g.created_at, false) }),
      `<a class="btn btn-ghost" href="/boshqaruv/natijalar?group=${g.id}" data-link>${icon('target')} ${t('Natijalar')}</a>
       <button class="btn btn-ghost" id="ren">${icon('edit')} ${t('Nomini o\'zgartirish')}</button>
       <button class="btn btn-quiet" id="gdel" aria-label="${t("O'chirish")}">${icon('trash')}</button>`)}
    <div class="grid-2" style="margin-bottom:20px">
      <section class="panel panel-pad stack" style="--gap:12px">
        <h2 style="font-size:1.1rem">${t('Qo\'shilish kodi')}</h2>
        <div class="code-big num" id="code">${esc(g.code)}</div>
        <p class="small muted">${t("Talaba EduTest'ga kiradi, Kabinet sahifasidagi «Guruhlarim» bo'limida shu kodni yozadi.")}</p>
        <div class="row"><button class="btn btn-ghost btn-sm" id="ccopy">${icon('copy')} ${t('Nusxalash')}</button>
          <button class="btn btn-quiet btn-sm" id="cnew">${icon('refresh')} ${t('Yangi kod')}</button></div>
      </section>
      <section class="panel panel-pad stack" style="--gap:12px">
        <h2 style="font-size:1.1rem">${t("Talabani qo'shish")}</h2>
        <p class="small muted">${t("Ro'yxatdan o'tgan talabani email orqali to'g'ridan-to'g'ri qo'shish mumkin.")}</p>
        <form class="row" id="addm" novalidate><input class="input grow" id="memail" type="email" placeholder="talaba@example.com" style="min-width:200px"><button class="btn">${icon('plus')} ${t("Qo'shish")}</button></form>
        <p class="form-error" id="merr"></p>
      </section>
    </div>
    <section class="panel" style="margin-bottom:20px"><div class="panel-head"><h2>${t("A'zolar")}</h2><span class="tag">${d.members.length}</span></div>
      ${d.members.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>${t('Talaba')}</th><th>${t('Testlar')}</th><th>${t("O'rtacha")}</th><th>${t('Oxirgi test')}</th><th>${t('Qoidabuzarlik')}</th><th></th></tr></thead>
        <tbody>${d.members.map((u) => `<tr>
          <td><div class="row" style="gap:10px;flex-wrap:nowrap">${avatar(u)}<div><b>${esc(u.name)}</b><div class="tiny muted">${esc(u.email)}</div></div></div></td>
          <td class="num">${u.attempts}</td>
          <td>${u.avg != null ? `<span class="pct ${pctClass(u.avg)}">${u.avg}%</span>` : '<span class="muted">—</span>'}</td>
          <td>${fmtDate(u.last_attempt)}</td>
          <td>${u.flagged ? `<span class="tag tag-bad">${u.flagged}</span>` : '<span class="muted">—</span>'}</td>
          <td class="actions"><button class="btn btn-quiet btn-sm" data-reset="${u.id}" data-name="${esc(u.name)}" title="${t('Vaqtinchalik parol berish')}" aria-label="${t('Vaqtinchalik parol berish')}">${icon('key')}</button>
            <button class="btn btn-quiet btn-sm" data-rm="${u.id}" data-name="${esc(u.name)}" title="${t('Guruhdan chiqarish')}" aria-label="${t('Guruhdan chiqarish')}">${icon('x')}</button></td></tr>`).join('')}</tbody></table></div>`
        : emptyState(t("Hali a'zolar yo'q"), t('Kodni talabalarga yuboring.'))}
    </section>
    <section class="panel"><div class="panel-head"><h2>${t('Guruh testlari')}</h2><a class="btn btn-ghost btn-sm" href="/boshqaruv/testlar" data-link>${icon('plus')} ${t('Test biriktirish')}</a></div>
      ${d.tests.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>${t('Test')}</th><th>${t('Jadval')}</th><th>${t('Topshirgan')}</th><th>${t("O'rtacha")}</th></tr></thead>
        <tbody>${d.tests.map((x) => `<tr><td><b>${esc(x.title)}</b>${x.is_active ? '' : ` <span class="tag">${t('Yopiq')}</span>`}</td>
          <td class="small">${x.opens_at || x.closes_at ? `${x.opens_at ? fmtDate(x.opens_at) : '…'} — ${x.closes_at ? fmtDate(x.closes_at) : '…'}` : t('Cheklovsiz')}</td>
          <td class="num">${x.done} / ${d.members.length}</td><td>${x.avg != null ? `<span class="pct ${pctClass(x.avg)}">${x.avg}%</span>` : '—'}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="panel-body"><p class="muted small">${t("Test tahrirlash oynasida «Kim uchun» maydonidan shu guruhni tanlang — test faqat guruh a'zolariga ko'rinadi.")}</p></div>`}
    </section>`;

  const reload = () => groupDetail(root, { id, state, navigate });
  root.querySelector('#ccopy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(t("EduTest «{name}» guruhiga qo'shilish kodi: {code}\n{url}", { name: g.name, code: root.querySelector('#code').textContent, url: joinUrl })); toast(t('Nusxalandi'), 'good'); } catch { /* */ }
  });
  root.querySelector('#cnew').addEventListener('click', async () => {
    if (!await confirmDialog({ title: t('Yangi kod yaratilsinmi?'), text: t("Eski kod ishlamay qoladi. Guruhdagi a'zolar guruhda qoladi.") })) return;
    const r = await post(`/api/admin/groups/${g.id}/code`, {});
    root.querySelector('#code').textContent = r.code; toast(t('Yangi kod yaratildi'), 'good');
  });
  root.querySelector('#ren').addEventListener('click', () => {
    const m = modal({
      title: t("Nomini o'zgartirish"),
      body: `<div class="field"><label for="gn">${t('Guruh nomi')}</label><input class="input" id="gn" maxlength="60" value="${esc(g.name)}"></div><p class="form-error" id="gerr"></p>`,
      foot: `<button class="btn btn-ghost" data-close>${t('Bekor qilish')}</button><button class="btn" id="gsave">${t('Saqlash')}</button>`,
    });
    m.el.querySelector('#gsave').addEventListener('click', async () => {
      try { await put(`/api/admin/groups/${g.id}`, { name: m.el.querySelector('#gn').value }); m.close(); reload(); }
      catch (err) { m.el.querySelector('#gerr').textContent = err.message; }
    });
  });
  root.querySelector('#gdel').addEventListener('click', async () => {
    if (!await confirmDialog({ title: t("«{name}» guruhini o'chirasizmi?", { name: g.name }), text: t("Talabalar hisoblari va natijalari saqlanadi. Guruhga biriktirilgan testlar barcha talabalarga ochiq bo'lib qoladi."), ok: t("O'chirish"), danger: true })) return;
    await del(`/api/admin/groups/${g.id}`); toast(t("Guruh o'chirildi"), 'good'); navigate('/boshqaruv/guruhlar');
  });
  root.querySelector('#addm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await post(`/api/admin/groups/${g.id}/members`, { email: root.querySelector('#memail').value }); toast(t("Talaba qo'shildi"), 'good'); reload(); }
    catch (err) { root.querySelector('#merr').textContent = err.message; }
  });
  root.onclick = async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.reset) resetPassword(b.dataset.reset, b.dataset.name);
    if (b.dataset.rm && await confirmDialog({ title: t('Guruhdan chiqarilsinmi?'), text: t("{name} guruhdan chiqariladi. Uning natijalari saqlanadi.", { name: b.dataset.name }), ok: t('Chiqarish'), danger: true })) {
      await del(`/api/admin/groups/${g.id}/members/${b.dataset.rm}`); toast(t('Guruhdan chiqarildi'), 'good'); reload();
    }
  };
}
