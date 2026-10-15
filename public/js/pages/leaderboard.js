import { get } from '../api.js';
import { esc, icon, pctClass, initials, emptyState, skeleton, t } from '../ui.js';

export default async function leaderboard(main, _p, { setTitle }) {
  setTitle(t('Reyting'));
  const { subjects } = await get('/api/subjects');
  const qs = new URLSearchParams(location.search);
  let subject = qs.get('subject') || '';
  let period = qs.get('period') || 'all';

  main.innerHTML = `<div class="wrap page" style="max-width:960px">
    <div class="page-head"><div><h1>${t('Reyting')}</h1><p class="muted">${t("Talabalar yakunlangan imtihonlardagi o'rtacha natija bo'yicha saralangan.")}</p></div></div>
    <section class="panel">
      <div class="toolbar">
        <select class="select" id="subject" aria-label="${t('Fan')}"><option value="">${t('Barcha fanlar')}</option>
          ${subjects.map((s) => `<option value="${esc(s.slug)}" ${s.slug === subject ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        <div class="seg" id="period">
          <button data-p="week" aria-pressed="${period === 'week'}">${t('7 kun')}</button>
          <button data-p="month" aria-pressed="${period === 'month'}">${t('30 kun')}</button>
          <button data-p="all" aria-pressed="${period === 'all'}">${t('Barcha vaqt')}</button>
        </div>
      </div>
      <div id="board">${skeleton(6)}</div>
    </section></div>`;

  const board = main.querySelector('#board');
  async function load() {
    history.replaceState({}, '', `/reyting?${new URLSearchParams({ ...(subject ? { subject } : {}), period })}`);
    board.innerHTML = `<div class="panel-body">${skeleton(6)}</div>`;
    const { leaders } = await get(`/api/leaderboard?subject=${encodeURIComponent(subject)}&period=${period}`);
    if (!leaders.length) { board.innerHTML = emptyState(t("Bu davrda natijalar yo'q"), t('Boshqa fan yoki davrni tanlang.')); return; }
    board.innerHTML = `<div class="table-wrap"><table class="table">
      <thead><tr><th style="width:56px">${t("O'rin")}</th><th>${t('Talaba')}</th><th>${t("O'rtacha")}</th><th>${t('Eng yaxshi')}</th><th>${t('Testlar')}</th><th>${t("To'g'ri javoblar")}</th></tr></thead>
      <tbody>${leaders.map((l, i) => `<tr class="${l.me ? 'is-me' : ''}">
        <td>${i < 3 ? `<span title="${t("{n}-o'rin", { n: i + 1 })}" style="color:${['#C99A1A', '#8C96A8', '#B0703A'][i]}">${icon('trophy')}</span>` : `<b class="num muted">${i + 1}</b>`}</td>
        <td><div class="row" style="gap:10px;flex-wrap:nowrap"><span class="avatar" style="background:${i < 3 ? 'var(--lapis)' : 'var(--ink-2)'}">${esc(initials(l.name))}</span>
          <div><b>${esc(l.name)}</b>${l.me ? ` <span class="tag tag-lapis">${t('Siz')}</span>` : ''}<div class="tiny muted">${esc(l.group || '')}</div></div></div></td>
        <td><span class="pct ${pctClass(l.avg)}">${l.avg}%</span></td>
        <td class="num">${l.best}%</td><td class="num">${l.attempts}</td><td class="num">${l.points}</td></tr>`).join('')}</tbody></table></div>`;
  }
  main.querySelector('#subject').addEventListener('change', (e) => { subject = e.target.value; load(); });
  main.querySelector('#period').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    period = b.dataset.p;
    main.querySelectorAll('#period button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    load();
  });
  load();
}
