import { get, post } from '../api.js';
import { esc, icon, fmtDate, fmtDuration, fmtClock, pctClass, hbars, emptyState, reasonLabel, markOf, toast, confirmDialog, t } from '../ui.js';

export default async function dashboard(main, _p, { state, setTitle }) {
  setTitle(t('Kabinet'));
  const [d, { certificates }, { groups }] = await Promise.all([get('/api/me/dashboard'), get('/api/me/certificates'), get('/api/me/groups')]);
  const s = d.summary;
  const first = state.user.name.split(' ')[0];

  main.innerHTML = `<div class="wrap page">
    <div class="page-head"><div><h1>${t('Salom, {name}', { name: esc(first) })}</h1>
      <p class="muted">${s.attempts ? t("Natijalaringiz va fanlar bo'yicha o'sishingiz.") : t("Birinchi testni topshiring, natijalaringiz shu yerda paydo bo'ladi.")}</p></div>
      <div class="row"><a class="btn btn-ghost" href="/statistika" data-link>${icon('target')} ${t('Statistika')}</a>
        <a class="btn" href="/fanlar" data-link>${icon('play')} ${t('Test topshirish')}</a></div></div>

    ${d.active.length ? `<div class="stack" style="margin-bottom:24px">${d.active.map((a) => `
      <div class="notice notice-warn">${icon('clock')}<div class="grow"><b>${t('Tugallanmagan test: {title}.', { title: esc(a.title) })}</b> ${t('Qolgan vaqt {time}.', { time: fmtClock((a.deadline - Date.now()) / 1000) })}</div>
        <a class="btn btn-sm btn-saffron" href="/test/${a.test_id}" data-link>${t('Davom ettirish')}</a></div>`).join('')}</div>` : ''}

    <div class="kpis" style="margin-bottom:24px">
      <div class="kpi"><div class="v">${s.attempts}</div><div class="l">${t('topshirilgan test')}</div></div>
      <div class="kpi"><div class="v">${s.avg != null ? s.avg + '%' : '—'}</div><div class="l">${t("o'rtacha natija")}</div></div>
      <div class="kpi"><div class="v">${s.best != null ? s.best + '%' : '—'}</div><div class="l">${t('eng yaxshi natija')}</div></div>
      <div class="kpi"><div class="v">${s.answered ? Math.round((s.correct / s.answered) * 100) + '%' : '—'}</div><div class="l">${t("{a} / {b} to'g'ri javob", { a: s.correct, b: s.answered })}</div></div>
      <div class="kpi"><div class="v">${s.rank ? `${s.rank}` : '—'}</div><div class="l">${s.rank ? t('reytingda {n} talaba ichida', { n: s.ranked }) : t("reytingdagi o'rin")}</div></div>
    </div>

    <div class="grid-2" style="margin-bottom:24px">
      <section class="panel"><div class="panel-head"><h2>${t("Fanlar bo'yicha o'rtacha natija")}</h2></div>
        <div class="panel-body">${hbars(d.bySubject.map((x) => ({ name: x.name, color: x.color, value: x.avg })))}</div></section>
      <section class="panel"><div class="panel-head"><h2>${t('Tavsiya')}</h2></div><div class="panel-body stack">${advice(d.bySubject)}</div></section>
    </div>

    <div class="grid-2" style="margin-bottom:24px">
      <section class="panel" id="sertifikatlar"><div class="panel-head"><h2>${t('Sertifikatlarim')}</h2><span class="tag">${certificates.length}</span></div>
        <div class="panel-body">${certificates.length ? `<div class="stack" style="--gap:10px">${certificates.slice(0, 6).map((c) => `
          <a class="cert-mini" href="/sertifikat/${esc(c.code)}" data-link><span class="seal">${icon('award')}</span>
            <div class="grow"><b>${esc(c.test)}</b><div class="tiny muted">${esc(c.subject)}, ${fmtDate(c.issuedAt, false)} · <span class="num">${esc(c.code)}</span></div></div>
            <span class="pct ${pctClass(c.percent)}">${c.percent}%</span></a>`).join('')}</div>`
          : `<p class="muted small">${t("Umumiy testlarda yaxshi natija (odatda 71% va undan yuqori) olsangiz, QR-kodli sertifikat beriladi.")}</p>`}</div></section>
      <section class="panel"><div class="panel-head"><h2>${t('Guruhlarim')}</h2></div>
        <div class="panel-body stack" style="--gap:14px">
          ${groups.length ? `<div class="list">${groups.map((g) => `<div class="list-item"><span class="tag tag-lapis">${icon('users')}</span>
            <div class="grow"><b>${esc(g.name)}</b><div class="tiny muted">${g.teacher ? t("O'qituvchi: {name}", { name: esc(g.teacher) }) + ', ' : ''}${t("{n} a'zo", { n: g.members })}${g.tests ? ', ' + t('{n} ta maxsus test', { n: g.tests }) : ''}</div></div>
            <button class="btn btn-quiet btn-sm" data-leave="${g.id}" data-name="${esc(g.name)}">${t('Chiqish')}</button></div>`).join('')}</div>`
            : `<p class="muted small">${t("O'qituvchingiz bergan kod orqali guruhga qo'shiling. Guruh uchun maxsus testlar faqat a'zolarga ko'rinadi.")}</p>`}
          <form class="row" id="join" novalidate><input id="jcode" placeholder="${t('Guruh kodi, masalan K7M2QX')}" maxlength="8" autocomplete="off" class="input grow upper" style="min-width:170px">
            <button class="btn btn-ghost">${icon('plus')} ${t("Qo'shilish")}</button></form>
          <p class="form-error" id="jerr"></p>
        </div></section>
    </div>

    <section class="panel">
      <div class="panel-head"><h2>${t('Topshirilgan testlar')}</h2></div>
      ${d.history.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>${t('Test')}</th><th>${t('Natija')}</th><th>${t('Baho')}</th><th>${t('Vaqt')}</th><th>${t('Sana')}</th><th>${t('Holat')}</th><th></th></tr></thead>
        <tbody>${d.history.map((h) => `<tr>
          <td><b>${esc(h.title)}</b><div class="tiny muted">${esc(h.subject)}</div></td>
          <td><span class="pct ${pctClass(h.percent)}">${h.percent}%</span> <span class="muted small">${h.score}/${h.total}</span></td>
          <td><b>${markOf(h.percent)}</b></td>
          <td class="num">${fmtDuration(h.duration)}</td>
          <td>${fmtDate(h.finished_at)}</td>
          <td>${h.finish_reason === 'violations' ? `<span class="tag tag-bad">${t('Qoidabuzarlik')}</span>` : h.finish_reason === 'timeout' ? `<span class="tag tag-warn">${t('Vaqt tugadi')}</span>` : `<span class="tag">${reasonLabel.submitted}</span>`}</td>
          <td class="actions"><a class="btn btn-ghost btn-sm" href="/natija/${h.id}" data-link>${t('Tahlil')}</a></td></tr>`).join('')}</tbody></table></div>`
        : emptyState(t('Hali test topshirilmagan'), t('Fanni tanlang va birinchi imtihonni boshlang.'), `<a class="btn" href="/fanlar" data-link>${t("Fanlarni ko'rish")}</a>`)}
    </section>
  </div>`;

  const rerender = () => dashboard(main, _p, { state, setTitle });
  main.querySelector('#join').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = main.querySelector('#jerr');
    err.textContent = '';
    try {
      const r = await post('/api/groups/join', { code: main.querySelector('#jcode').value });
      toast(t("«{name}» guruhiga qo'shildingiz", { name: r.group.name }), 'good');
      rerender();
    } catch (x) { err.textContent = x.message; }
  });
  main.querySelectorAll('[data-leave]').forEach((b) => b.addEventListener('click', async () => {
    if (!await confirmDialog({ title: t('Guruhdan chiqasizmi?'), text: t("«{name}» guruhi uchun maxsus testlar sizga ko'rinmay qoladi. Qayta qo'shilish uchun kod kerak bo'ladi.", { name: b.dataset.name }), ok: t('Chiqish'), danger: true })) return;
    await post(`/api/groups/${b.dataset.leave}/leave`);
    toast(t('Guruhdan chiqdingiz'), 'good');
    rerender();
  }));
  if (location.hash === '#sertifikatlar') main.querySelector('#sertifikatlar')?.scrollIntoView({ block: 'start' });
}

function advice(rows) {
  if (!rows.length) return `<p class="muted">${t("Kamida bitta test topshirgach, qaysi fanga ko'proq e'tibor berish kerakligini ko'rsatamiz.")}</p>`;
  const weak = [...rows].sort((a, b) => a.avg - b.avg)[0];
  const strong = rows[0];
  return `
    <div class="notice notice-info">${icon('target')}<div>${t("<b>{name}</b> fanida o'rtacha natija {p}%. Shu fan bo'yicha mashq rejimida xatolar ustida ishlang.", { name: esc(weak.name), p: weak.avg })}
      <div style="margin-top:10px"><a class="btn btn-sm" href="/mashq/${esc(weak.slug)}" data-link>${t('Mashq qilish')}</a></div></div></div>
    ${strong && strong !== weak ? `<p class="small muted">${t("Eng kuchli faningiz: <b>{name}</b> ({p}%). Qiyin darajadagi savollar bilan sinab ko'ring.", { name: esc(strong.name), p: strong.avg })}</p>` : ''}`;
}
