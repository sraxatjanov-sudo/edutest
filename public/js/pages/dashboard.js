import { get } from '../api.js';
import { esc, icon, fmtDate, fmtDuration, fmtClock, pctClass, hbars, emptyState, reasonLabel, markOf } from '../ui.js';

export default async function dashboard(main, _p, { state, setTitle }) {
  setTitle('Kabinet');
  const d = await get('/api/me/dashboard');
  const s = d.summary;
  const first = state.user.name.split(' ')[0];

  main.innerHTML = `<div class="wrap page">
    <div class="page-head"><div><h1>Salom, ${esc(first)}</h1>
      <p class="muted">${s.attempts ? 'Natijalaringiz va fanlar bo\'yicha o\'sishingiz.' : 'Birinchi testni topshiring, natijalaringiz shu yerda paydo bo\'ladi.'}</p></div>
      <a class="btn" href="/fanlar" data-link>${icon('play')} Test topshirish</a></div>

    ${d.active.length ? `<div class="stack" style="margin-bottom:24px">${d.active.map((a) => `
      <div class="notice notice-warn">${icon('clock')}<div class="grow"><b>Tugallanmagan test: ${esc(a.title)}.</b> Qolgan vaqt ${fmtClock((a.deadline - Date.now()) / 1000)}.</div>
        <a class="btn btn-sm btn-saffron" href="/test/${a.test_id}" data-link>Davom ettirish</a></div>`).join('')}</div>` : ''}

    <div class="kpis" style="margin-bottom:24px">
      <div class="kpi"><div class="v">${s.attempts}</div><div class="l">topshirilgan test</div></div>
      <div class="kpi"><div class="v">${s.avg != null ? s.avg + '%' : '—'}</div><div class="l">o'rtacha natija</div></div>
      <div class="kpi"><div class="v">${s.best != null ? s.best + '%' : '—'}</div><div class="l">eng yaxshi natija</div></div>
      <div class="kpi"><div class="v">${s.answered ? Math.round((s.correct / s.answered) * 100) + '%' : '—'}</div><div class="l">${s.correct} / ${s.answered} to'g'ri javob</div></div>
      <div class="kpi"><div class="v">${s.rank ? `${s.rank}` : '—'}</div><div class="l">${s.rank ? `reytingda ${s.ranked} talaba ichida` : 'reytingdagi o\'rin'}</div></div>
    </div>

    <div class="grid-2" style="margin-bottom:24px">
      <section class="panel"><div class="panel-head"><h2>Fanlar bo'yicha o'rtacha natija</h2></div>
        <div class="panel-body">${hbars(d.bySubject.map((x) => ({ name: x.name, color: x.color, value: x.avg })))}</div></section>
      <section class="panel"><div class="panel-head"><h2>Tavsiya</h2></div><div class="panel-body stack">${advice(d.bySubject)}</div></section>
    </div>

    <section class="panel">
      <div class="panel-head"><h2>Topshirilgan testlar</h2></div>
      ${d.history.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>Test</th><th>Natija</th><th>Baho</th><th>Vaqt</th><th>Sana</th><th>Holat</th><th></th></tr></thead>
        <tbody>${d.history.map((h) => `<tr>
          <td><b>${esc(h.title)}</b><div class="tiny muted">${esc(h.subject)}</div></td>
          <td><span class="pct ${pctClass(h.percent)}">${h.percent}%</span> <span class="muted small">${h.score}/${h.total}</span></td>
          <td><b>${markOf(h.percent)}</b></td>
          <td class="num">${fmtDuration(h.duration)}</td>
          <td>${fmtDate(h.finished_at)}</td>
          <td>${h.finish_reason === 'violations' ? '<span class="tag tag-bad">Qoidabuzarlik</span>' : h.finish_reason === 'timeout' ? '<span class="tag tag-warn">Vaqt tugadi</span>' : `<span class="tag">${reasonLabel.submitted}</span>`}</td>
          <td class="actions"><a class="btn btn-ghost btn-sm" href="/natija/${h.id}" data-link>Tahlil</a></td></tr>`).join('')}</tbody></table></div>`
        : emptyState('Hali test topshirilmagan', 'Fanni tanlang va birinchi imtihonni boshlang.', '<a class="btn" href="/fanlar" data-link>Fanlarni ko\'rish</a>')}
    </section>
  </div>`;
}

function advice(rows) {
  if (!rows.length) return '<p class="muted">Kamida bitta test topshirgach, qaysi fanga ko\'proq e\'tibor berish kerakligini ko\'rsatamiz.</p>';
  const weak = [...rows].sort((a, b) => a.avg - b.avg)[0];
  const strong = rows[0];
  return `
    <div class="notice notice-info">${icon('target')}<div><b>${esc(weak.name)}</b> fanida o'rtacha natija ${weak.avg}%. Shu fan bo'yicha mashq rejimida xatolar ustida ishlang.
      <div style="margin-top:10px"><a class="btn btn-sm" href="/mashq/${esc(weak.slug)}" data-link>Mashq qilish</a></div></div></div>
    ${strong && strong !== weak ? `<p class="small muted">Eng kuchli faningiz: <b>${esc(strong.name)}</b> (${strong.avg}%). Qiyin darajadagi savollar bilan sinab ko'ring.</p>` : ''}`;
}
