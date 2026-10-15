// Talabaning shaxsiy statistikasi: natijalar dinamikasi, faollik, qiyinlik va fanlar bo'yicha aniqlik, zaif joylar
import { get } from '../api.js';
import { esc, icon, fmtDate, fmtNum, pctClass, emptyState, diffLabel, t } from '../ui.js';
import { months } from '../i18n.js';

const DAY = 864e5;
const dayKey = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

export default async function stats(main, _p, { setTitle }) {
  setTitle(t('Statistika'));
  const d = await get('/api/me/stats');
  const A = d.attempts;

  if (!A.length) {
    main.innerHTML = `<div class="wrap page"><div class="page-head"><div><h1>${t('Statistika')}</h1></div></div>
      <div class="panel">${emptyState(t('Hali test topshirilmagan'), t("Birinchi testni topshiring, natijalaringiz shu yerda paydo bo'ladi."), `<a class="btn" href="/fanlar" data-link>${t('Test topshirish')}</a>`)}</div></div>`;
    return;
  }

  const shown = d.bySubject.reduce((s, x) => s + x.shown, 0);
  const right = d.bySubject.reduce((s, x) => s + x.right, 0);
  const avg = Math.round(A.reduce((s, x) => s + x.percent, 0) / A.length);
  const secPerQ = Math.round(A.reduce((s, x) => s + x.duration, 0) / Math.max(1, A.reduce((s, x) => s + x.total, 0)));
  const days = new Set(A.map((x) => dayKey(x.finished_at)));
  const streak = (() => { // ketma-ket faol kunlar (bugun yoki kechadan boshlab)
    let n = 0, cur = dayKey(Date.now());
    if (!days.has(cur)) cur -= DAY;
    while (days.has(cur)) { n++; cur -= DAY; }
    return n;
  })();
  const recent = A.slice(-3), older = A.slice(0, -3);
  const trend = older.length ? Math.round(recent.reduce((s, x) => s + x.percent, 0) / recent.length - older.reduce((s, x) => s + x.percent, 0) / older.length) : null;
  const subjects = [...new Map(A.map((x) => [x.slug, x.subject])).entries()];

  main.innerHTML = `<div class="wrap page">
    <nav class="crumbs"><a href="/kabinet" data-link>${t('Kabinet')}</a><span>/</span><span>${t('Statistika')}</span></nav>
    <div class="page-head"><div><h1>${t('Statistika')}</h1><p class="muted">${t("Natijalaringiz qanday o'zgarayotgani va qaysi joylarga e'tibor berish kerakligi.")}</p></div>
      ${d.mistakes ? `<a class="btn btn-saffron" href="/xatolar" data-link>${icon('refresh')} ${t('Xatolar ustida ishlash ({n})', { n: d.mistakes })}</a>` : ''}</div>

    <div class="kpis" style="margin-bottom:24px">
      <div class="kpi"><div class="v">${avg}%</div><div class="l">${t("o'rtacha natija")}</div></div>
      <div class="kpi"><div class="v ${trend == null ? '' : trend >= 0 ? 'up' : 'down'}">${trend == null ? '—' : `${trend > 0 ? '+' : ''}${trend}%`}</div><div class="l">${t("so'nggi 3 test, avvalgilarga nisbatan")}</div></div>
      <div class="kpi"><div class="v">${shown ? Math.round((right / shown) * 100) : 0}%</div><div class="l">${t("{a} / {b} to'g'ri javob", { a: fmtNum(right), b: fmtNum(shown) })}</div></div>
      <div class="kpi"><div class="v">${t('{s} s', { s: secPerQ })}</div><div class="l">${t('bitta savolga o\'rtacha')}</div></div>
      <div class="kpi"><div class="v">${streak}</div><div class="l">${t('kun ketma-ket faollik')}</div></div>
    </div>

    <section class="panel" style="margin-bottom:24px">
      <div class="panel-head"><h2>${t('Natijalar dinamikasi')}</h2>
        <select class="select" id="fsub" style="width:auto" aria-label="${t('Fan')}"><option value="">${t('Barcha fanlar')}</option>${subjects.map(([slug, name]) => `<option value="${esc(slug)}">${esc(name)}</option>`).join('')}</select></div>
      <div class="panel-body"><div id="line"></div></div>
    </section>

    <div class="grid-2" style="margin-bottom:24px">
      <section class="panel"><div class="panel-head"><h2>${t("So'nggi 16 hafta faolligi")}</h2></div>
        <div class="panel-body"><div id="heat"></div></div></section>
      <section class="panel"><div class="panel-head"><h2>${t("Qiyinlik bo'yicha aniqlik")}</h2></div>
        <div class="panel-body">${diffBars(d.byDifficulty)}</div></section>
    </div>

    <section class="panel">
      <div class="panel-head"><h2>${t("Fanlar bo'yicha tahlil")}</h2></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>${t('Fan')}</th><th>${t('Savollar')}</th><th>${t("To'g'ri")}</th><th>${t('Javobsiz')}</th><th>${t('Holat')}</th><th></th></tr></thead>
        <tbody>${[...d.bySubject].sort((a, b) => a.right / a.shown - b.right / b.shown).map((s) => {
          const p = Math.round((s.right / s.shown) * 100);
          return `<tr><td><span class="tag"><i class="dot" style="--c:${esc(s.color)}"></i>${esc(s.name)}</span></td>
            <td class="num">${s.shown}</td>
            <td><div class="meter"><i style="width:${p}%"></i></div> <span class="pct ${pctClass(p)}">${p}%</span></td>
            <td class="num">${s.skipped ? Math.round((s.skipped / s.shown) * 100) + '%' : '—'}</td>
            <td class="small">${p >= 86 ? `<span class="row" style="gap:6px;flex-wrap:nowrap;color:var(--good)">${icon('check')} ${t("A'lo bilasiz")}</span>` : p >= 71 ? t('Yaxshi') : p >= 56 ? t("Takrorlash kerak") : `<b style="color:var(--bad)">${t("E'tibor bering")}</b>`}</td>
            <td class="actions"><a class="btn btn-ghost btn-sm" href="/mashq/${esc(s.slug)}" data-link>${t('Mashq qilish')}</a></td></tr>`;
        }).join('')}</tbody></table></div>
    </section>
  </div>`;

  const lineBox = main.querySelector('#line');
  const draw = () => {
    const slug = main.querySelector('#fsub').value;
    lineChart(lineBox, slug ? A.filter((x) => x.slug === slug) : A);
  };
  main.querySelector('#fsub').addEventListener('change', draw);
  draw();
  heatmap(main.querySelector('#heat'), A);
}

function diffBars(rows) {
  if (!rows.length) return `<p class="muted">${t("Ma'lumot yo'q")}</p>`;
  return `<div class="hbars">${rows.map((r) => {
    const p = Math.round((r.right / r.shown) * 100);
    return `<div class="hbar" title="${diffLabel[r.difficulty]}: ${p}%"><span class="name"><span>${diffLabel[r.difficulty]}</span><span class="tiny muted">${t('{n} savol', { n: r.shown })}</span></span>
      <span class="track"><i style="width:${p}%"></i></span><span class="val">${p}%</span></div>`;
  }).join('')}</div>`;
}

// Chiziqli diagramma: har bir test natijasi + 3 testlik o'rtacha chiziq, hover bilan batafsil
function lineChart(box, rows) {
  const W = Math.max(320, Math.round(box.clientWidth || 960)), H = W < 600 ? 220 : 260, pl = 40, pr = 12, pt = 16, pb = 28; // matn 1:1 o'lchamda chiziladi
  if (!rows.length) { box.innerHTML = `<p class="muted">${t("Ma'lumot yo'q")}</p>`; return; }
  const n = rows.length;
  const x = (i) => (n === 1 ? (pl + W - pr) / 2 : pl + (i * (W - pl - pr)) / (n - 1));
  const y = (v) => pt + (H - pt - pb) * (1 - v / 100);
  const avg3 = rows.map((_, i) => { const s = rows.slice(Math.max(0, i - 2), i + 1); return s.reduce((a, b) => a + b.percent, 0) / s.length; });
  const path = (vals) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  let grid = '';
  for (const v of [0, 25, 50, 75, 100]) grid += `<line x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 8}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`;
  const step = Math.max(1, Math.ceil(n / (W < 600 ? 4 : 8)));
  const labels = rows.map((r, i) => (i % step === 0 || i === n - 1) ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(fmtDate(r.finished_at, false))}</text>` : '').join('');
  const passY = y(71);
  box.classList.add('chart');
  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('Natijalar dinamikasi')}">
      <g class="axis grid">${grid}</g>
      <line class="ref" x1="${pl}" x2="${W - pr}" y1="${passY}" y2="${passY}"/><text class="ref-label" x="${pl + 6}" y="${passY + 14}" text-anchor="start">${t('sertifikat chegarasi')}</text>
      ${n > 2 ? `<path class="line-soft" d="${path(avg3)}"/>` : ''}
      <path class="line-main" d="${path(rows.map((r) => r.percent))}"/>
      <g class="dots">${rows.map((r, i) => `<circle cx="${x(i)}" cy="${y(r.percent)}" r="4" data-i="${i}"/>`).join('')}</g>
      <line class="cross" x1="0" x2="0" y1="${pt}" y2="${H - pb}" hidden/>
      <g class="axis">${labels}</g>
      <rect class="hit" x="${pl}" y="${pt}" width="${W - pl - pr}" height="${H - pt - pb}"/>
    </svg>
    <div class="legend-row"><span><i class="sw main"></i>${t('Test natijasi')}</span>${n > 2 ? `<span><i class="sw soft"></i>${t("3 testlik o'rtacha")}</span>` : ''}</div>
    <div class="tip" hidden></div>`;
  const svg = box.querySelector('svg'), tip = box.querySelector('.tip'), cross = box.querySelector('.cross');
  const hit = box.querySelector('.hit');
  const show = (e) => {
    const r = svg.getBoundingClientRect(), k = r.width / W;
    const vx = (e.clientX - r.left) / k;
    let i = n === 1 ? 0 : Math.round(((vx - pl) / (W - pl - pr)) * (n - 1));
    i = Math.max(0, Math.min(n - 1, i));
    const row = rows[i];
    cross.hidden = false; cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i));
    box.querySelectorAll('.dots circle').forEach((c) => c.classList.toggle('on', Number(c.dataset.i) === i));
    tip.hidden = false;
    tip.innerHTML = `<b>${row.percent}%</b> <span class="muted">${row.score}/${row.total}</span><br>${esc(row.title)}<br><span class="muted">${esc(fmtDate(row.finished_at))}</span>`;
    tip.style.left = `${x(i) * k}px`; tip.style.top = `${y(row.percent) * k}px`;
  };
  const hide = () => { tip.hidden = true; cross.hidden = true; box.querySelectorAll('.dots circle.on').forEach((c) => c.classList.remove('on')); };
  hit.addEventListener('mousemove', show);
  hit.addEventListener('mouseleave', hide);
  hit.addEventListener('touchstart', (e) => show(e.touches[0]), { passive: true });
}

// Faollik xaritasi: har bir katak — bir kun, rang to'qligi — o'sha kuni topshirilgan testlar soni
function heatmap(box, rows) {
  const weeks = 16;
  const counts = new Map();
  for (const r of rows) { const k = dayKey(r.finished_at); counts.set(k, (counts.get(k) || 0) + 1); }
  const today = dayKey(Date.now());
  const dow = (new Date(today).getDay() + 6) % 7; // dushanba = 0
  const start = today - (dow + (weeks - 1) * 7) * DAY;
  const max = Math.max(1, ...counts.values());
  const cell = 14, gap = 3, top = 18, left = 22;
  let cells = '', monthLabels = '', lastMonth = -1, lastLabelW = -9;
  for (let w = 0; w < weeks; w++) {
    const wk = start + w * 7 * DAY;
    const m = new Date(wk).getMonth();
    if (m !== lastMonth) {
      if (w - lastLabelW >= 3) { monthLabels += `<text x="${left + w * (cell + gap)}" y="11">${esc(months()[m])}</text>`; lastLabelW = w; }
      lastMonth = m;
    }
    for (let dd = 0; dd < 7; dd++) {
      const day = wk + dd * DAY;
      if (day > today) continue;
      const c = counts.get(day) || 0;
      const lvl = c ? Math.min(4, Math.ceil((c / max) * 4)) : 0;
      cells += `<rect x="${left + w * (cell + gap)}" y="${top + dd * (cell + gap)}" width="${cell}" height="${cell}" rx="3" class="lv${lvl}" data-d="${day}" data-c="${c}"/>`;
    }
  }
  const Wd = left + weeks * (cell + gap), Hd = top + 7 * (cell + gap);
  const dayNames = [t('Du'), '', t('Ch'), '', t('Ju'), '', ''];
  box.classList.add('chart', 'heat');
  box.innerHTML = `<svg viewBox="0 0 ${Wd} ${Hd}" role="img" aria-label="${t("So'nggi 16 hafta faolligi")}">
    <g class="axis">${monthLabels}${dayNames.map((n, i) => n ? `<text x="0" y="${top + i * (cell + gap) + 11}">${n}</text>` : '').join('')}</g>
    <g class="cells">${cells}</g></svg>
    <div class="legend-row"><span>${t('Kam')}</span>${[0, 1, 2, 3, 4].map((l) => `<i class="hsw lv${l}"></i>`).join('')}<span>${t("Ko'p")}</span>
      <span class="grow"></span><span class="muted">${t('{n} kun faol', { n: counts.size })}</span></div>
    <div class="tip" hidden></div>`;
  const svg = box.querySelector('svg'), tip = box.querySelector('.tip');
  box.querySelectorAll('.cells rect').forEach((r) => {
    r.addEventListener('mouseenter', () => {
      const k = svg.getBoundingClientRect().width / Wd;
      tip.hidden = false;
      tip.innerHTML = `<b>${t('{n} ta test', { n: r.dataset.c })}</b> <span class="muted">${esc(fmtDate(Number(r.dataset.d), false))}</span>`;
      tip.style.left = `${(Number(r.getAttribute('x')) + cell / 2) * k}px`;
      tip.style.top = `${Number(r.getAttribute('y')) * k}px`;
    });
    r.addEventListener('mouseleave', () => { tip.hidden = true; });
  });
}
