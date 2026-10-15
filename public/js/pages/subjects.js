import { get } from '../api.js';
import { esc, icon, fmtNum, t } from '../ui.js';

export const subjectCard = (s) => `
  <a class="subject" href="/fan/${esc(s.slug)}" data-link style="--c:${esc(s.color)}">
    <span class="subject-icon">${icon(s.icon)}</span>
    <h3>${esc(s.name)}</h3>
    <p>${esc(s.description || '')}</p>
    <span class="subject-meta"><span>${t('{n} savol', { n: fmtNum(s.question_count) })}</span><span>${t('{n} test', { n: s.test_count })}</span>
      ${s.avg_percent != null ? `<span>${t("o'rtacha {p}%", { p: s.avg_percent })}</span>` : ''}</span>
  </a>`;

export default async function subjects(main, _p, { setTitle }) {
  setTitle(t('Fanlar'));
  const { subjects } = await get('/api/subjects');
  const total = subjects.reduce((s, x) => s + x.question_count, 0);
  main.innerHTML = `<div class="wrap page">
    <div class="page-head"><div><h1>${t('Fanlar')}</h1>
      <p class="muted">${t("{s} ta fan bo'yicha {q} ta savol. Fanni tanlab, imtihon topshiring yoki mashq qiling.", { s: subjects.length, q: fmtNum(total) })}</p></div>
      <div class="input-icon" style="min-width:260px">${icon('search')}<input class="input" id="q" placeholder="${t('Fan nomini qidiring')}" aria-label="${t('Fan qidirish')}"></div>
    </div>
    <div class="subjects" id="list">${subjects.map(subjectCard).join('')}</div>
  </div>`;
  const list = main.querySelector('#list');
  main.querySelector('#q').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const f = subjects.filter((s) => s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q));
    list.innerHTML = f.length ? f.map(subjectCard).join('') : `<div class="panel empty" style="grid-column:1/-1"><h3>${t('Hech narsa topilmadi')}</h3><p>${t("Boshqa so'z bilan qidirib ko'ring.")}</p></div>`;
  });
}
