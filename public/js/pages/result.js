import { get } from '../api.js';
import { esc, rich, icon, KEYS, fmtDuration, fmtDate, diffDots } from '../ui.js';

export function reviewList(review) {
  return review.map((q) => `
    <article class="review-item" data-state="${q.chosen === null ? 'skip' : q.ok ? 'ok' : 'bad'}">
      <div class="spread" style="margin-bottom:10px">
        <span class="qnum">${q.position + 1}-savol</span>
        <span class="row">${diffDots(q.difficulty)}
          <span class="tag ${q.chosen === null ? 'tag-warn' : q.ok ? 'tag-good' : 'tag-bad'}">${q.chosen === null ? 'Javob berilmagan' : q.ok ? 'To\'g\'ri' : 'Noto\'g\'ri'}</span></span>
      </div>
      <div class="qtext">${rich(q.text)}</div>
      <div class="options">${q.options.map((o, i) => `
        <div class="opt ${i === q.correct ? 'is-right' : i === q.chosen ? 'is-wrong' : ''}"><span class="key">${KEYS[i]}</span><span class="grow">${rich(o)}</span>
          ${i === q.chosen ? '<span class="tiny" style="font-weight:700">Sizning javobingiz</span>' : ''}</div>`).join('')}</div>
      ${q.explanation ? `<div class="explain"><b>Izoh.</b> ${rich(q.explanation)}</div>` : ''}
    </article>`).join('');
}

export function resultView(r, { staffView = false } = {}) {
  const right = r.score, total = r.total;
  const wrong = r.review ? r.review.filter((q) => q.chosen !== null && !q.ok).length : null;
  const skipped = r.review ? r.review.filter((q) => q.chosen === null).length : null;
  const color = r.percent >= 71 ? 'var(--good)' : r.percent >= 56 ? 'var(--warn)' : 'var(--bad)';
  return `
    <div class="panel panel-pad">
      <div class="result-top">
        <div class="ring" style="--p:${r.percent};--c:${color}"><div><b class="num">${r.percent}%</b><span>${right} / ${total}</span></div></div>
        <div class="stack" style="--gap:12px">
          <span class="tag"><i class="dot" style="--c:${esc(r.test.color)}"></i>${esc(r.test.subject)}</span>
          <h1 style="font-size:1.6rem">${esc(r.test.title)}</h1>
          <div class="mark"><b>${r.grade.mark}</b><span>${esc(r.grade.label)}</span></div>
          <p class="muted small">${fmtDate(r.finishedAt)} da yakunlandi, ${fmtDuration(r.duration)} sarflandi.
            ${r.betterThan != null ? `Bu test topshirganlarning ${r.betterThan}% idan yuqori natija.` : ''}</p>
        </div>
      </div>
      <div class="kpis" style="margin-top:24px">
        <div class="kpi"><div class="v" style="color:var(--good)">${right}</div><div class="l">to'g'ri</div></div>
        <div class="kpi"><div class="v" style="color:var(--bad)">${wrong ?? total - right}</div><div class="l">noto'g'ri${skipped == null ? ' yoki bo\'sh' : ''}</div></div>
        ${skipped != null ? `<div class="kpi"><div class="v" style="color:var(--warn)">${skipped}</div><div class="l">javobsiz</div></div>` : ''}
        <div class="kpi"><div class="v">${r.violations}</div><div class="l">qoidabuzarlik</div></div>
      </div>
      <div class="stack" style="margin-top:18px;--gap:10px">
        ${r.finishReason === 'violations' ? `<div class="notice notice-bad">${icon('alert')}<div><b>Test qoidabuzarliklar sababli avtomatik yakunlandi.</b> Natija o'qituvchi tomonidan ko'rib chiqiladi.</div></div>` : ''}
        ${r.finishReason === 'timeout' ? `<div class="notice notice-warn">${icon('clock')}<div>Vaqt tugagani uchun test avtomatik topshirildi. Saqlangan javoblar hisobga olindi.</div></div>` : ''}
        ${!staffView && r.violations > 0 && r.finishReason !== 'violations' ? `<div class="notice notice-warn">${icon('shield')}<div>Test davomida ${r.violations} ta qoidabuzarlik qayd etildi. Ular o'qituvchiga ko'rinadi.</div></div>` : ''}
      </div>
    </div>`;
}

export default async function result(main, { id }, { setTitle }) {
  const data = await get(`/api/attempts/${Number(id)}`);
  if (data.attempt) { location.replace(`/test/${data.attempt.test.id}`); return; }
  const r = data.result;
  setTitle(`Natija: ${r.test.title}`);

  main.innerHTML = `<div class="wrap page" style="max-width:900px">
    <nav class="crumbs"><a href="/kabinet" data-link>Kabinet</a><span>/</span><span>Natija</span></nav>
    ${resultView(r)}
    <div class="row" style="margin:20px 0 32px">
      <a class="btn" href="/fan/${esc(r.test.slug)}" data-link>${icon('shuffle')} Yana topshirish</a>
      <a class="btn btn-ghost" href="/mashq/${esc(r.test.slug)}" data-link>Mashq qilish</a>
      <a class="btn btn-quiet" href="/reyting" data-link>${icon('trophy')} Reyting</a>
    </div>
    ${r.reviewAvailable ? `<section class="panel">
      <div class="panel-head"><h2>Javoblar tahlili</h2>
        <div class="seg" id="filter"><button aria-pressed="true" data-f="all">Barchasi</button><button aria-pressed="false" data-f="bad">Xatolar</button><button aria-pressed="false" data-f="skip">Javobsiz</button><button aria-pressed="false" data-f="ok">To'g'ri</button></div></div>
      <div id="review">${reviewList(r.review)}</div></section>`
      : `<div class="panel panel-pad notice-info notice">${icon('lock')}<div>Bu test uchun javoblar tahlili yopiq. Savollar boshqa talabalarga ham tushishi mumkinligi sababli o'qituvchi tahlilni faqat o'zi ko'radi.</div></div>`}
  </div>`;

  const f = main.querySelector('#filter');
  f?.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    f.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    main.querySelectorAll('.review-item').forEach((el) => { el.hidden = b.dataset.f !== 'all' && el.dataset.state !== b.dataset.f; });
  });
}
