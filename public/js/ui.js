// Interfeys yordamchilari: ikonlar, xavfsiz HTML, bildirishnomalar, modal oynalar, formatlash, diagrammalar
import { t, months } from './i18n.js';
export { t };

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// `kod` → <code>kod</code> (avval ekranlanadi, keyin faqat kod bloklari formatlanadi)
export const rich = (s) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');

const P = {
  sigma: '<path d="M18 5H7l6 7-6 7h11"/>',
  atom: '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="10" ry="4.2"/><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="10" ry="4.2" transform="rotate(120 12 12)"/>',
  flask: '<path d="M9 3h6M10 3v6L4.5 18.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7.5 15h9"/>',
  leaf: '<path d="M5 19c0-9 6-14 15-14 0 9-5 15-14 15"/><path d="M5 19c3-5 6-8 10-10"/>',
  quill: '<path d="M20 4c-8 0-13 5-14 13l-2 3"/><path d="M20 4c0 6-3 10-9 11"/><path d="M8 13h5"/>',
  'globe-text': '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9S14.5 18.4 12 21c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  column: '<path d="M3 21h18M5 21V10M9.7 21V10M14.3 21V10M19 21V10M2 10h20L12 3 2 10z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5 5-2z"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  code: '<path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/>',
  book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H20v16H5.5A1.5 1.5 0 0 0 4 20.5v-16z"/><path d="M4 20.5A1.5 1.5 0 0 0 5.5 22H20"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  'eye-off': '<path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A9.6 9.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.6 6.6C3.9 8.4 2 12 2 12s3.6 7 10 7c1.6 0 3-.4 4.3-1"/>',
  shuffle: '<path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  maximize: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  alert: '<path d="M12 3l9.5 17h-19L12 3z"/><path d="M12 10v4M12 17.5h.01"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c1.8.7 3 2.6 3.5 5.5"/>',
  logout: '<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h10"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  edit: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9M10 13h4"/>',
  restore: '<path d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>',
  download: '<path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0V4z"/><path d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8M10 17h4"/>',
  play: '<path d="M7 4.5v15l12-7.5-12-7.5z"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M15 8l2 2"/>',
  home: '<path d="M3 11l9-7 9 7M5 9.5V20h14V9.5"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  award: '<circle cx="12" cy="9" r="6"/><path d="M8.5 13.8L7 22l5-3 5 3-1.5-8.2"/><path d="M9.8 9l1.6 1.6L14.5 7.5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2.5"/><path d="M11 18h2"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4"/>',
  link: '<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  cloud: '<path d="M7 18a5 5 0 0 1-.6-9.96A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1-.5 9.5H7z"/>',
  fire: '<path d="M12 22c4 0 7-2.8 7-6.8 0-3.6-2.4-5.6-4-8.2-.6 2-1.6 3-3 3.5.4-3-1-6.2-3.5-8.5C8.8 6 5 9 5 15.2 5 19.2 8 22 12 22z"/>',
};

export function icon(name, cls = '') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || P.book}</svg>`;
}
export const ICON_NAMES = ['sigma', 'atom', 'flask', 'leaf', 'quill', 'globe-text', 'column', 'compass', 'chip', 'code', 'book'];

// ---------- Formatlash ----------
export const pctClass = (p) => (p >= 71 ? 'hi' : p >= 56 ? 'mid' : 'lo');
export const fmtClock = (sec) => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? `${h}:${String(m).padStart(2, '0')}` : String(m).padStart(2, '0')) + ':' + String(s).padStart(2, '0');
};
export const fmtDuration = (sec) => {
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m ? t('{m} daq {s} s', { m, s }) : t('{s} s', { s });
};
export const fmtDate = (ms, withTime = true) => {
  if (!ms) return '—';
  const d = new Date(ms);
  const base = t('{d}-{mon}', { d: d.getDate(), mon: months()[d.getMonth()] });
  const year = d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : '';
  return withTime ? `${base}${year}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : base + year;
};
export const fmtNum = (n) => Number(n ?? 0).toLocaleString('ru-RU').replace(/,/g, ' ');
// Profil rasmi yoki bosh harflar
export const avatar = (u, cls = 'avatar') => (u && u.avatar
  ? `<span class="${cls} has-img"><img src="/api/images/${esc(u.avatar)}" alt="" loading="lazy"></span>`
  : `<span class="${cls}">${esc(initials(u?.name))}</span>`);
// Savolga biriktirilgan rasm (sudrab olish va saqlash o'chirilgan)
export const qimage = (key) => (key ? `<figure class="qimg"><img src="/api/images/${esc(key)}" alt="" draggable="false" loading="lazy"></figure>` : '');

// Faylni brauzerning o'zida kichraytirib, data URL ga aylantirish (server va internet trafigi tejaladi)
export function imageToDataUrl(file, { max = 1400, square = false, quality = 0.86 } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return reject(new Error(t('Faqat PNG, JPEG, WebP yoki GIF rasm yuklash mumkin')));
    if (file.size > 15e6) return reject(new Error(t('Rasm hajmi juda katta (1 MB gacha)')));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0;
      if (square) { const side = Math.min(sw, sh); sx = (sw - side) / 2; sy = (sh - side) / 2; sw = sh = side; }
      const k = Math.min(1, max / Math.max(sw, sh));
      const c = document.createElement('canvas');
      c.width = Math.round(sw * k); c.height = Math.round(sh * k);
      const g = c.getContext('2d');
      g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
      // Chizmalar (PNG) aniq qolishi uchun PNG, fotosuratlar uchun JPEG — qaysi biri kichik bo'lsa
      const png = file.type === 'image/png' ? c.toDataURL('image/png') : null;
      const jpg = c.toDataURL('image/jpeg', quality);
      resolve(png && png.length < jpg.length * 1.6 ? png : jpg);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(t("Rasmni o'qib bo'lmadi"))); };
    img.src = url;
  });
}

export const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
// Ko'rsatilgan paytda joriy tilga tarjima qilinadigan lug'atlar
const lazy = (map) => new Proxy({}, { get: (_, k) => (k in map ? t(map[k]) : undefined) });
export const diffLabel = lazy({ 0: 'Aralash', 1: 'Oson', 2: "O'rta", 3: 'Qiyin' });
export const diffDots = (d) => `<span class="diff" data-d="${d}" title="${diffLabel[d]}"><i></i><i></i><i></i></span>`;
export const roleLabel = lazy({ student: 'Talaba', teacher: "O'qituvchi", admin: 'Administrator' });
export const reasonLabel = lazy({ submitted: 'Topshirildi', timeout: 'Vaqt tugadi', violations: 'Qoidabuzarlik sababli yakunlandi' });
export const markOf = (p) => (p >= 86 ? 5 : p >= 71 ? 4 : p >= 56 ? 3 : 2);
export const KEYS = ['A', 'B', 'C', 'D', 'E', 'F'];

// ---------- Bildirishnoma ----------
export function toast(message, kind = '') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.innerHTML = `${icon(kind === 'bad' ? 'alert' : kind === 'good' ? 'check' : 'info')}<span>${esc(message)}</span>`;
  box.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

// ---------- Modal ----------
export function modal({ title, body, foot = '', wide = false, onOpen }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="m-title">
    <div class="modal-head"><h2 id="m-title">${esc(title)}</h2><button class="btn btn-quiet btn-icon" data-close aria-label="${t('Yopish')}">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  const prev = document.activeElement;
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); prev?.focus?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  back.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  document.addEventListener('keydown', onKey);
  document.body.appendChild(back);
  const el = back.querySelector('.modal');
  (el.querySelector('input, select, textarea, button:not([data-close])') || el).focus();
  onOpen?.(el, close);
  return { el, close };
}

export function confirmDialog({ title, text, ok = t('Tasdiqlash'), danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const m = modal({
      title,
      body: `<p class="muted">${esc(text)}</p>`,
      foot: `<button class="btn btn-ghost" data-close>${t('Bekor qilish')}</button><button class="btn ${danger ? 'btn-danger' : ''}" data-ok>${esc(ok)}</button>`,
    });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { done = true; m.close(); resolve(true); });
    const obs = new MutationObserver(() => { if (!m.el.isConnected) { obs.disconnect(); if (!done) resolve(false); } });
    obs.observe(document.body, { childList: true });
  });
}

export const skeleton = (n = 4) => `<div class="skeleton">${'<i></i>'.repeat(n)}</div>`;
export const emptyState = (title, text, action = '') => `<div class="empty"><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;

export function pager(page, pages, total) {
  if (pages <= 1) return `<div class="pager">${t('Jami: {n}', { n: fmtNum(total) })}</div>`;
  return `<div class="pager"><span>${t('Jami: {n}, {p}/{pp}-sahifa', { n: fmtNum(total), p: page, pp: pages })}</span>
    <button class="btn btn-ghost btn-sm" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''} aria-label="${t('Oldingi sahifa')}">${icon('left')}</button>
    <button class="btn btn-ghost btn-sm" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''} aria-label="${t('Keyingi sahifa')}">${icon('right')}</button></div>`;
}

// ---------- Diagrammalar ----------
// Vertikal ustunlar (bitta qator ma'lumot), hover qilinganda qiymat ko'rsatiladi
export function vbars(container, data, { label = (d) => d.label, value = (d) => d.value, unit = '' } = {}) {
  const W = 640, H = 200, pl = 28, pb = 26, pt = 10;
  const max = Math.max(1, ...data.map(value));
  const step = Math.max(1, niceStep(max)); // sanoqlar butun son
  const top = Math.ceil(max / step) * step;
  const bw = (W - pl) / data.length;
  const y = (v) => pt + (H - pt - pb) * (1 - v / top);
  let grid = '';
  for (let v = 0; v <= top; v += step) grid += `<line x1="${pl}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text x="${pl - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
  const bars = data.map((d, i) => {
    const x = pl + i * bw + bw * 0.2, w = bw * 0.6, v = value(d), h = Math.max(0, (H - pb) - y(v));
    return `<rect class="hit" x="${pl + i * bw}" y="${pt}" width="${bw}" height="${H - pt - pb}" data-i="${i}"/>
      <path class="bar-mark-p" d="${roundedTop(x, (H - pb) - h, w, h, Math.min(4, w / 2, h))}" data-i="${i}"/>`;
  }).join('');
  const labels = data.map((d, i) => (data.length <= 16 || i % 2 === 0)
    ? `<text x="${pl + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${esc(label(d))}</text>` : '').join('');
  container.classList.add('chart');
  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t('Ustunli diagramma')}">
    <g class="axis grid">${grid}</g><g class="marks">${bars}</g><g class="axis">${labels}</g></svg><div class="tip" hidden></div>`;
  const tip = container.querySelector('.tip');
  const svg = container.querySelector('svg');
  container.querySelectorAll('.hit').forEach((r) => {
    const i = Number(r.dataset.i);
    const mark = container.querySelector(`path[data-i="${i}"]`);
    const show = () => {
      const box = svg.getBoundingClientRect(), k = box.width / W;
      tip.hidden = false;
      tip.innerHTML = `<b>${fmtNum(value(data[i]))}</b>${unit ? ' ' + esc(unit) : ''} <span class="muted">${esc(label(data[i]))}</span>`;
      tip.style.left = `${(pl + i * bw + bw / 2) * k}px`;
      tip.style.top = `${y(value(data[i])) * k}px`;
      mark.classList.add('on');
    };
    const hide = () => { tip.hidden = true; mark.classList.remove('on'); };
    r.addEventListener('mouseenter', show); r.addEventListener('mouseleave', hide);
  });
}

function niceStep(max) {
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw) || p * 10;
}
function roundedTop(x, y, w, h, r) {
  if (h <= 0) return '';
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

// Gorizontal ustunlar: nom — chiziq — qiymat (rang faqat identifikatsiya nuqtasi uchun)
export function hbars(rows, { max = 100, unit = '%' } = {}) {
  if (!rows.length) return emptyState(t("Ma'lumot yo'q"), t("Testlar topshirilgach shu yerda ko'rinadi."));
  return `<div class="hbars">${rows.map((r) => `<div class="hbar" title="${esc(r.name)}: ${r.value ?? '—'}${unit}">
    <span class="name"><i class="dot" style="--c:${esc(r.color || '#1F4FA3')}"></i><span>${esc(r.name)}</span></span>
    <span class="track"><i style="width:${Math.min(100, ((r.value || 0) / max) * 100)}%"></i></span>
    <span class="val">${r.value ?? '—'}${r.value != null ? unit : ''}</span></div>`).join('')}</div>`;
}
