// EduTest boshqaruv paneli — asosiy saytdan alohida ilova (/panel manzilida).
// Saytda unga hech qanday havola yo'q; kirish faqat o'qituvchi va administratorlar uchun.
import { get, post } from './api.js';
import { esc, icon, avatar, roleLabel, toast } from './ui.js';
import { t, LANGS, getLang, setLang } from './i18n.js';

const BASE = '/panel';
const state = { user: null };
const main = document.getElementById('main');
const right = document.getElementById('nav-right');
let cleanup = null;
let navToken = 0;
const isStaff = (u) => u && (u.role === 'admin' || u.role === 'teacher');

function setTitle(title) { document.title = title ? `${title} — EduTest Panel` : 'EduTest Panel'; }

export function navigate(p, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', p); else history.pushState({}, '', p);
  render();
}

const theme = () => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
function setTheme(v) {
  document.documentElement.setAttribute('data-theme', v);
  try { localStorage.setItem('theme', v); } catch { /* */ }
}

function closeMenus() {
  document.querySelectorAll('.dropdown-menu').forEach((m) => { m.hidden = true; m.parentElement.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false'); });
}

function renderBar() {
  const u = state.user;
  const cur = LANGS.find((l) => l.code === getLang());
  right.innerHTML = `
    <a class="btn btn-quiet btn-sm site-link" href="/" target="_blank" rel="noopener">${icon('home')} <span>${t('Saytni ochish')}</span></a>
    <button class="btn btn-quiet btn-icon theme-btn" id="theme-btn" aria-label="${theme() === 'dark' ? t("Yorug' rejim") : t('Tungi rejim')}">${icon(theme() === 'dark' ? 'sun' : 'moon')}</button>
    <div class="dropdown lang"><button class="lang-btn" aria-haspopup="true" aria-expanded="false" aria-label="${t('Tilni tanlang')}">${icon('globe-text')}<span>${cur.short}</span></button>
      <div class="dropdown-menu lang-menu" hidden role="menu">${LANGS.map((l) => `<button role="menuitemradio" aria-checked="${l.code === cur.code}" data-lang="${l.code}">
        <span class="lang-code">${l.short}</span><span class="grow">${l.name}</span>${l.code === cur.code ? icon('check') : ''}</button>`).join('')}</div></div>
    ${u ? `<div class="dropdown"><button class="user-chip" aria-haspopup="true" aria-expanded="false">${avatar(u)}<span class="nm">${esc(u.name.split(' ')[0])}</span></button>
      <div class="dropdown-menu" hidden><div class="who"><b>${esc(u.name)}</b><div class="tiny muted">${esc(u.email)}</div><div class="tiny muted">${roleLabel[u.role]}</div></div>
        <div class="sep"></div><button id="logout">${icon('logout')} ${t('Chiqish')}</button></div></div>` : ''}`;
  right.querySelectorAll('.dropdown > button[aria-haspopup]').forEach((b) => b.addEventListener('click', (e) => {
    e.stopPropagation();
    const m = b.parentElement.querySelector('.dropdown-menu');
    const open = m.hidden;
    closeMenus();
    m.hidden = !open; b.setAttribute('aria-expanded', String(open));
  }));
  right.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => { if (setLang(b.dataset.lang)) { renderBar(); render({ keepScroll: true }); } else closeMenus(); }));
  right.querySelector('#theme-btn').addEventListener('click', () => { setTheme(theme() === 'dark' ? 'light' : 'dark'); renderBar(); });
  right.querySelector('#logout')?.addEventListener('click', async () => {
    await post('/api/auth/logout').catch(() => {});
    state.user = null; toast(t('Tizimdan chiqdingiz')); render();
  });
}

// ---------- Kirish oynasi ----------
function loginView(note = '') {
  setTitle(t('Kirish'));
  main.innerHTML = `<div class="panel-login">
    <form class="panel panel-pad stack" id="f" novalidate style="--gap:16px">
      <div class="panel-login-head"><img src="/img/logo.svg" alt="" width="44" height="44">
        <div><h1>${t('Boshqaruv paneli')}</h1><p class="muted small">${t("Faqat o'qituvchi va administratorlar uchun")}</p></div></div>
      ${note ? `<div class="notice notice-warn">${icon('lock')}<div>${note}</div></div>` : ''}
      <div class="field"><label for="email">Email</label><input class="input" id="email" type="email" autocomplete="username" required></div>
      <div class="field"><label for="password">${t('Parol')}</label><input class="input" id="password" type="password" autocomplete="current-password" required></div>
      <p class="form-error" id="err" role="alert"></p>
      <button class="btn btn-lg btn-block" id="submit">${icon('lock')} ${t('Kirish')}</button>
    </form></div>`;
  const f = main.querySelector('#f');
  f.querySelector('#email').focus();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('#submit'); btn.disabled = true;
    f.querySelector('#err').textContent = '';
    try {
      const { user } = await post('/api/auth/login', { email: f.querySelector('#email').value, password: f.querySelector('#password').value });
      if (!isStaff(user)) {
        await post('/api/auth/logout').catch(() => {});
        throw new Error(t("Bu panel faqat o'qituvchi va administratorlar uchun"));
      }
      state.user = user;
      render();
    } catch (err) { f.querySelector('#err').textContent = err.message; btn.disabled = false; }
  });
}

// ---------- Marshrutlash: /panel, /panel/:section, /panel/:section/:id ----------
async function render({ keepScroll = false } = {}) {
  const token = ++navToken;
  const y = window.scrollY;
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* */ } }
  cleanup = null;
  renderBar();
  if (!keepScroll) window.scrollTo(0, 0);
  if (!isStaff(state.user)) return loginView();
  const parts = location.pathname.slice(BASE.length).split('/').filter(Boolean).map(decodeURIComponent);
  try {
    const mod = await import('./pages/admin.js');
    if (token !== navToken) return;
    cleanup = await mod.default(main, { section: parts[0] || 'overview', id: parts[1] }, { navigate, state, setTitle });
    if (keepScroll) window.scrollTo(0, y);
  } catch (e) {
    if (token !== navToken) return;
    if (e.status === 401) { state.user = null; return loginView(t('Sessiya tugadi, qayta kiring.')); }
    console.error(e);
    main.innerHTML = `<div class="wrap page"><div class="panel empty"><h3>${t("Sahifani ochib bo'lmadi")}</h3><p>${esc(e.message)}</p>
      <a class="btn" href="${BASE}" data-link>${t('Qayta urinish')}</a></div></div>`;
  }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) closeMenus();
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
  const href = a.getAttribute('href');
  if (!href.startsWith(BASE)) return; // panel tashqarisidagi havolalar oddiy ochiladi
  e.preventDefault();
  navigate(href);
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });
window.addEventListener('popstate', () => render());
window.addEventListener('auth:expired', () => { state.user = null; renderBar(); });

(async function init() {
  try { state.user = (await get('/api/auth/me')).user; } catch { state.user = null; }
  if (state.user && !isStaff(state.user)) {
    state.user = null;
    renderBar();
    loginView(t("Siz talaba sifatida kirgansiz. Panel faqat o'qituvchi va administratorlar uchun — ularning hisobi bilan kiring."));
    return;
  }
  render();
}());
