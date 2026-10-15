import { get } from '../api.js';
import { esc, icon, fmtNum, fmtDate, diffLabel, pctClass, t } from '../ui.js';

export default async function subject(main, { slug }, { state, setTitle, navigate }) {
  const { subject: s, tests, difficulty } = await get(`/api/subjects/${encodeURIComponent(slug)}`);
  setTitle(s.name);
  const total = Object.values(difficulty).reduce((a, b) => a + b, 0);

  const testRow = (x) => {
    const left = x.max_attempts ? x.max_attempts - (x.my?.used || 0) : null;
    const blocked = left !== null && left <= 0 && !x.my?.active;
    const action = !state.user
      ? `<a class="btn" href="/kirish" data-link>${t('Kirib, boshlash')}</a>`
      : x.state === 'soon' && state.user.role === 'student' ? `<button class="btn" disabled>${icon('calendar')} ${t('{date} da ochiladi', { date: fmtDate(x.opens_at) })}</button>`
      : x.state === 'closed' && state.user.role === 'student' && !x.my?.active ? `<button class="btn" disabled>${t('Muddati tugagan')}</button>`
      : x.my?.active
        ? `<a class="btn btn-saffron" href="/test/${x.id}" data-link>${icon('play')} ${t('Davom ettirish')}</a>`
        : blocked ? `<button class="btn" disabled>${t('Urinishlar tugagan')}</button>`
          : `<a class="btn" href="/test/${x.id}" data-link>${icon('play')} ${t('Boshlash')}</a>`;
    return `<article class="test-row">
      <div>
        <div class="row" style="gap:8px;margin-bottom:4px">${x.group_name ? `<span class="tag tag-lapis">${icon('users')} ${esc(x.group_name)}</span>` : ''}
          ${x.cert_percent ? `<span class="tag tag-saffron" title="${t('Kamida {p}% natija uchun sertifikat beriladi', { p: x.cert_percent })}">${icon('award')} ${t('Sertifikat')}</span>` : ''}
          ${x.closes_at && x.state !== 'closed' ? `<span class="tag tag-warn">${icon('clock')} ${t('{date} gacha', { date: fmtDate(x.closes_at) })}</span>` : ''}</div>
        <h3>${esc(x.title)}</h3>
        <p class="muted small">${esc(x.description || '')}</p>
        <div class="facts">
          <span>${icon('list')} ${t('{n} savol', { n: x.question_count })}</span>
          <span>${icon('clock')} ${t('{n} daqiqa', { n: x.time_limit })}</span>
          <span>${icon('target')} ${diffLabel[x.difficulty]}</span>
          <span>${icon('shield')} ${x.max_violations ? t('{n} ta ogohlantirishgacha', { n: x.max_violations }) : t('Kuzatuv yoqilgan')}</span>
          <span>${icon('users')} ${t('{n} marta topshirilgan', { n: fmtNum(x.attempts) })}${x.avg_percent != null ? t(", o'rtacha {p}%", { p: x.avg_percent }) : ''}</span>
        </div>
      </div>
      <div class="side">
        ${action}
        ${x.my?.best != null ? `<span class="small">${t('Eng yaxshi natijangiz:')} <span class="pct ${pctClass(x.my.best)}">${x.my.best}%</span></span>` : ''}
        ${left !== null && state.user ? `<span class="tiny muted">${t('Qolgan urinishlar: {a} / {b}', { a: Math.max(0, left), b: x.max_attempts })}</span>` : ''}
      </div>
    </article>`;
  };

  main.innerHTML = `<div class="wrap page">
    <nav class="crumbs" aria-label="${t("Yo'l")}"><a href="/fanlar" data-link>${t('Fanlar')}</a><span>/</span><span>${esc(s.name)}</span></nav>
    <div class="page-head">
      <div class="subject-hero" style="--c:${esc(s.color)}">
        <span class="subject-icon">${icon(s.icon)}</span>
        <div><h1>${esc(s.name)}</h1><p class="muted">${esc(s.description || '')}</p></div>
      </div>
    </div>
    <div class="layout-2">
      <section>
        <h2 class="sr-only">${t('Testlar')}</h2>
        <div class="test-list">${tests.length ? tests.map(testRow).join('') : `<div class="panel empty"><h3>${t("Bu fanda hali test yo'q")}</h3><p>${t('Hozircha mashq rejimidan foydalaning.')}</p></div>`}</div>
      </section>
      <aside class="stack">
        <div class="panel panel-pad stack">
          <h3>${t('Mashq rejimi')}</h3>
          <p class="small muted">${t("Har bir javobdan keyin to'g'ri variant va izoh ko'rsatiladi. Natija reytingga kirmaydi.")}</p>
          <div class="field"><label for="p-diff">${t('Qiyinlik')}</label>
            <select class="select" id="p-diff">${[0, 1, 2, 3].map((d) => `<option value="${d}">${diffLabel[d]}</option>`).join('')}</select></div>
          <div class="field"><label for="p-count">${t('Savollar soni')}</label>
            <select class="select" id="p-count"><option>10</option><option>15</option><option>20</option><option>30</option></select></div>
          <button class="btn btn-block" id="p-go">${t('Mashqni boshlash')}</button>
        </div>
        <div class="panel panel-pad stack">
          <h3>${t('Savollar banki')}</h3>
          <p class="small muted">${t('Jami {n} ta savol', { n: fmtNum(total) })}</p>
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
