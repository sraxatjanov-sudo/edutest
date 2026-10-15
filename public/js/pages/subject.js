import { get } from '../api.js';
import { esc, icon, fmtNum, diffLabel, pctClass } from '../ui.js';

export default async function subject(main, { slug }, { state, setTitle, navigate }) {
  const { subject: s, tests, difficulty } = await get(`/api/subjects/${encodeURIComponent(slug)}`);
  setTitle(s.name);
  const total = Object.values(difficulty).reduce((a, b) => a + b, 0);

  const testRow = (t) => {
    const left = t.max_attempts ? t.max_attempts - (t.my?.used || 0) : null;
    const blocked = left !== null && left <= 0 && !t.my?.active;
    const action = !state.user
      ? `<a class="btn" href="/kirish" data-link>Kirib, boshlash</a>`
      : t.my?.active
        ? `<a class="btn btn-saffron" href="/test/${t.id}" data-link>${icon('play')} Davom ettirish</a>`
        : blocked ? `<button class="btn" disabled>Urinishlar tugagan</button>`
          : `<a class="btn" href="/test/${t.id}" data-link>${icon('play')} Boshlash</a>`;
    return `<article class="test-row">
      <div>
        <h3>${esc(t.title)}</h3>
        <p class="muted small">${esc(t.description || '')}</p>
        <div class="facts">
          <span>${icon('list')} ${t.question_count} savol</span>
          <span>${icon('clock')} ${t.time_limit} daqiqa</span>
          <span>${icon('target')} ${diffLabel[t.difficulty]}</span>
          <span>${icon('shield')} ${t.max_violations ? `${t.max_violations} ta ogohlantirishgacha` : 'Kuzatuv yoqilgan'}</span>
          <span>${icon('users')} ${fmtNum(t.attempts)} marta topshirilgan${t.avg_percent != null ? `, o'rtacha ${t.avg_percent}%` : ''}</span>
        </div>
      </div>
      <div class="side">
        ${action}
        ${t.my?.best != null ? `<span class="small">Eng yaxshi natijangiz: <span class="pct ${pctClass(t.my.best)}">${t.my.best}%</span></span>` : ''}
        ${left !== null && state.user ? `<span class="tiny muted">Qolgan urinishlar: ${Math.max(0, left)} / ${t.max_attempts}</span>` : ''}
      </div>
    </article>`;
  };

  main.innerHTML = `<div class="wrap page">
    <nav class="crumbs" aria-label="Yo'l"><a href="/fanlar" data-link>Fanlar</a><span>/</span><span>${esc(s.name)}</span></nav>
    <div class="page-head">
      <div class="subject-hero" style="--c:${esc(s.color)}">
        <span class="subject-icon">${icon(s.icon)}</span>
        <div><h1>${esc(s.name)}</h1><p class="muted">${esc(s.description || '')}</p></div>
      </div>
    </div>
    <div class="layout-2">
      <section>
        <h2 class="sr-only">Testlar</h2>
        <div class="test-list">${tests.length ? tests.map(testRow).join('') : '<div class="panel empty"><h3>Bu fanda hali test yo\'q</h3><p>Hozircha mashq rejimidan foydalaning.</p></div>'}</div>
      </section>
      <aside class="stack">
        <div class="panel panel-pad stack">
          <h3>Mashq rejimi</h3>
          <p class="small muted">Har bir javobdan keyin to'g'ri variant va izoh ko'rsatiladi. Natija reytingga kirmaydi.</p>
          <div class="field"><label for="p-diff">Qiyinlik</label>
            <select class="select" id="p-diff"><option value="0">Aralash</option><option value="1">Oson</option><option value="2">O'rta</option><option value="3">Qiyin</option></select></div>
          <div class="field"><label for="p-count">Savollar soni</label>
            <select class="select" id="p-count"><option>10</option><option>15</option><option>20</option><option>30</option></select></div>
          <button class="btn btn-block" id="p-go">Mashqni boshlash</button>
        </div>
        <div class="panel panel-pad stack">
          <h3>Savollar banki</h3>
          <p class="small muted">Jami ${fmtNum(total)} ta savol</p>
          <div class="bank">${[1, 2, 3].map((d) => `<div class="bank-row"><span>${diffLabel[d]}</span>
            <span class="bar"><i style="width:${total ? ((difficulty[d] || 0) / total) * 100 : 0}%"></i></span><span class="num tiny">${difficulty[d] || 0}</span></div>`).join('')}</div>
        </div>
      </aside>
    </div>
  </div>`;

  main.querySelector('#p-go').addEventListener('click', () => {
    navigate(`/mashq/${s.slug}?difficulty=${main.querySelector('#p-diff').value}&count=${main.querySelector('#p-count').value}`);
  });
}
