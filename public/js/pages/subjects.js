import { get } from '../api.js';
import { esc, icon, fmtNum } from '../ui.js';

export const subjectCard = (s) => `
  <a class="subject" href="/fan/${esc(s.slug)}" data-link style="--c:${esc(s.color)}">
    <span class="subject-icon">${icon(s.icon)}</span>
    <h3>${esc(s.name)}</h3>
    <p>${esc(s.description || '')}</p>
    <span class="subject-meta"><span>${fmtNum(s.question_count)} savol</span><span>${s.test_count} test</span>
      ${s.avg_percent != null ? `<span>o'rtacha ${s.avg_percent}%</span>` : ''}</span>
  </a>`;

export default async function subjects(main, _p, { setTitle }) {
  setTitle('Fanlar');
  const { subjects } = await get('/api/subjects');
  const total = subjects.reduce((s, x) => s + x.question_count, 0);
  main.innerHTML = `<div class="wrap page">
    <div class="page-head"><div><h1>Fanlar</h1>
      <p class="muted">${subjects.length} ta fan bo'yicha ${fmtNum(total)} ta savol. Fanni tanlab, imtihon topshiring yoki mashq qiling.</p></div>
      <div class="input-icon" style="min-width:260px">${icon('search')}<input class="input" id="q" placeholder="Fan nomini qidiring" aria-label="Fan qidirish"></div>
    </div>
    <div class="subjects" id="list">${subjects.map(subjectCard).join('')}</div>
  </div>`;
  const list = main.querySelector('#list');
  main.querySelector('#q').addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    const f = subjects.filter((s) => s.name.toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q));
    list.innerHTML = f.length ? f.map(subjectCard).join('') : '<div class="panel empty" style="grid-column:1/-1"><h3>Hech narsa topilmadi</h3><p>Boshqa so\'z bilan qidirib ko\'ring.</p></div>';
  });
}
