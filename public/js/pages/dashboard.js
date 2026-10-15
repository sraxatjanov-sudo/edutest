import { get } from '../api.js';
import { esc, icon, fmtDate, fmtDuration, fmtClock, pctClass, hbars, emptyState, reasonLabel, markOf, t } from '../ui.js';

export default async function dashboard(main, _p, { state, setTitle }) {
  setTitle(t('Kabinet'));
  const d = await get('/api/me/dashboard');
  const s = d.summary;
  const first = state.user.name.split(' ')[0];

  main.innerHTML = `<div class="wrap page">
    <div class="page-head"><div><h1>${t('Salom, {name}', { name: esc(first) })}</h1>
      <p class="muted">${s.attempts ? t("Natijalaringiz va fanlar bo'yicha o'sishingiz.") : t("Birinchi testni topshiring, natijalaringiz shu yerda paydo bo'ladi.")}</p></div>
      <a class="btn" href="/fanlar" data-link>${icon('play')} ${t('Test topshirish')}</a></div>

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
