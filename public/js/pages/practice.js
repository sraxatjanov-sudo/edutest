import { get, post } from '../api.js';
import { esc, rich, icon, KEYS, diffDots, t } from '../ui.js';

export default async function practice(main, { slug }, { setTitle }) {
  const qs = new URLSearchParams(location.search);
  const { subject, items } = await get(`/api/practice/${encodeURIComponent(slug)}?count=${Number(qs.get('count')) || 10}&difficulty=${Number(qs.get('difficulty')) || 0}`);
  setTitle(t('Mashq: {name}', { name: subject.name }));
  const results = [];
  let i = 0;

  const shell = (inner) => `<div class="wrap page"><div class="practice-shell">
    <nav class="crumbs"><a href="/fanlar" data-link>${t('Fanlar')}</a><span>/</span><a href="/fan/${esc(subject.slug)}" data-link>${esc(subject.name)}</a><span>/</span><span>${t('Mashq')}</span></nav>
    ${inner}</div></div>`;

  if (!items.length) {
    main.innerHTML = shell(`<div class="panel empty"><h3>${t("Bu sozlamalar bo'yicha savol topilmadi")}</h3><p>${t('Boshqa qiyinlik darajasini tanlang.')}</p></div>`);
    return;
  }

  function dots() {
    return `<div class="dots" aria-hidden="true">${items.map((_, k) => `<i class="${results[k] === true ? 'ok' : results[k] === false ? 'no' : k === i ? 'cur' : ''}"></i>`).join('')}</div>`;
  }

  function show() {
    const q = items[i];
    main.innerHTML = shell(`
      <div class="practice-top"><h1 style="font-size:1.4rem">${esc(t('Mashq: {name}', { name: subject.name }))}</h1><span class="small muted num">${i + 1} / ${items.length}</span></div>
      ${dots()}
      <div class="qcard" style="margin-top:16px">
        <div class="qcard-top"><span class="qnum">${t('{n}-savol', { n: i + 1 })}</span>${diffDots(q.difficulty)}</div>
        <div class="qtext">${rich(q.text)}</div>
        <div class="options" role="radiogroup">${q.options.map((o, k) => `<button class="opt" data-k="${k}"><span class="key">${KEYS[k]}</span><span>${rich(o)}</span></button>`).join('')}</div>
        <div id="fb"></div>
        <div class="qnav"><span></span><button class="btn" id="next" hidden>${i + 1 < items.length ? t('Keyingi savol') : t("Natijani ko'rish")} ${icon('right')}</button></div>
      </div>`);
    const opts = main.querySelectorAll('.opt');
    const onKey = (e) => {
      const k = KEYS.indexOf(e.key.toUpperCase());
      if (k >= 0 && opts[k] && !opts[k].disabled) opts[k].click();
      if (e.key === 'Enter' && !main.querySelector('#next').hidden) main.querySelector('#next').click();
    };
    document.addEventListener('keydown', onKey);
    opts.forEach((b) => b.addEventListener('click', async () => {
      opts.forEach((x) => { x.disabled = true; });
      const answer = q.options[Number(b.dataset.k)];
      let r;
      try { r = await post('/api/practice/check', { id: q.id, answer }); } catch (e) { opts.forEach((x) => { x.disabled = false; }); main.querySelector('#fb').innerHTML = `<p class="form-error">${esc(e.message)}</p>`; return; }
      results[i] = r.ok;
      opts.forEach((x) => {
        const v = q.options[Number(x.dataset.k)];
        if (v === r.correct) x.classList.add('is-right'); else if (x === b) x.classList.add('is-wrong');
      });
      main.querySelector('#fb').innerHTML = `<div class="explain"><b>${r.ok ? t("To'g'ri.") : t("To'g'ri javob: {a}.", { a: rich(r.correct) })}</b> ${r.explanation ? rich(r.explanation) : ''}</div>`;
      const next = main.querySelector('#next');
      next.hidden = false; next.focus();
      next.addEventListener('click', () => { document.removeEventListener('keydown', onKey); i++; i < items.length ? show() : summary(); });
    }));
    cleanupKey = () => document.removeEventListener('keydown', onKey);
  }

  function summary() {
    const ok = results.filter(Boolean).length;
    const p = Math.round((ok / items.length) * 100);
    main.innerHTML = shell(`<div class="panel panel-pad" style="text-align:center">
      <div class="ring" style="--p:${p};--c:var(--${p >= 71 ? 'good' : p >= 56 ? 'warn' : 'bad'});margin:0 auto 18px"><div><b>${p}%</b><span>${ok} / ${items.length}</span></div></div>
      <h2>${t('Mashq yakunlandi')}</h2>
      <p class="muted" style="margin-top:8px">${p >= 71 ? t("Yaxshi natija. Endi haqiqiy imtihonda sinab ko'ring.") : t('Xatolar ustida ishlash uchun mashqni yana bir bor takrorlang.')}</p>
      <div class="row" style="justify-content:center;margin-top:22px">
        <a class="btn btn-ghost" href="${esc(location.pathname + location.search)}" data-link>${icon('shuffle')} ${t('Yangi savollar bilan takrorlash')}</a>
        <a class="btn" href="/fan/${esc(subject.slug)}" data-link>${t('Imtihon topshirish')}</a>
      </div></div>`);
  }

  let cleanupKey = null;
  show();
  return () => cleanupKey?.();
}
