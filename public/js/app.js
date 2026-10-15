// EduTest — mijoz ilovasi: marshrutlash, foydalanuvchi holati, navigatsiya, til tanlash
import { get, post } from './api.js';
import { esc, icon, initials, roleLabel, toast } from './ui.js';
import { t, LANGS, getLang, setLang } from './i18n.js';

export const state = { user: null };
const main = document.getElementById('main');
let cleanup = null;
let navToken = 0;

const routes = [
  ['/', () => import('./pages/home.js')],
  ['/fanlar', () => import('./pages/subjects.js')],
  ['/fan/:slug', () => import('./pages/subject.js')],
  ['/mashq/:slug', () => import('./pages/practice.js')],
  ['/test/:id', () => import('./pages/exam.js'), { auth: true }],
  ['/natija/:id', () => import('./pages/result.js'), { auth: true }],
  ['/reyting', () => import('./pages/leaderboard.js')],
  ['/kabinet', () => import('./pages/dashboard.js'), { auth: true }],
  ['/profil', () => import('./pages/profile.js'), { auth: true }],
  ['/kirish', () => import('./pages/auth.js'), { mode: 'login' }],
  ['/royxat', () => import('./pages/auth.js'), { mode: 'register' }],
  ['/boshqaruv', () => import('./pages/admin.js'), { staff: true, section: 'overview' }],
  ['/boshqaruv/:section', () => import('./pages/admin.js'), { staff: true }],
  ['/boshqaruv/:section/:id', () => import('./pages/admin.js'), { staff: true }],
].map(([pattern, load, opts = {}]) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '/?$');
  return { re, keys, load, opts };
});

export const isStaff = () => state.user && (state.user.role === 'admin' || state.user.role === 'teacher');

export function navigate(path, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', path); else history.pushState({}, '', path);
  render();
}

// index.html dagi doimiy matnlar
function applyStatic() {
  document.getElementById('skip').textContent = t("Asosiy mazmunga o'tish");
  document.getElementById('foot-about').textContent = t("EduTest — fanlar bo'yicha onlayn test platformasi");
  document.getElementById('foot-author').textContent = t('Muallif: Raxatjanov Shoxrux, {y}', { y: new Date().getFullYear() });
  document.getElementById('nav').setAttribute('aria-label', t('Asosiy menyu'));
}

function langSwitcher() {
  const cur = LANGS.find((l) => l.code === getLang());
  return `<div class="dropdown lang">
    <button class="lang-btn" id="lang-btn" aria-haspopup="true" aria-expanded="false" aria-label="${t('Tilni tanlang')}" title="${t('Tilni tanlang')}">
      ${icon('globe-text')}<span>${cur.short}</span></button>
    <div class="dropdown-menu lang-menu" id="lang-menu" hidden role="menu">
      ${LANGS.map((l) => `<button role="menuitemradio" aria-checked="${l.code === cur.code}" data-lang="${l.code}">
        <span class="lang-code">${l.short}</span><span class="grow">${l.name}</span>${l.code === cur.code ? icon('check') : ''}</button>`).join('')}
    </div></div>`;
}

function closeMenus(except) {
  document.querySelectorAll('.dropdown-menu').forEach((m) => {
    if (m !== except) { m.hidden = true; m.parentElement.querySelector('[aria-expanded]')?.setAttribute('aria-expanded', 'false'); }
  });
}

function renderNav() {
  const u = state.user;
  const here = location.pathname;
  const links = [['/fanlar', t('Fanlar')], ['/reyting', t('Reyting')]];
  if (u) links.splice(1, 0, ['/kabinet', t('Kabinet')]);
  if (isStaff()) links.push(['/boshqaruv', t('Boshqaruv')]);
  const nav = document.getElementById('nav');
  nav.innerHTML = links.map(([h, label]) => `<a href="${h}" data-link ${here === h || (h !== '/' && here.startsWith(h + '/')) || (h === '/fanlar' && here.startsWith('/fan/')) ? 'aria-current="page"' : ''}>${label}</a>`).join('')
    + (u ? '' : `<a href="/kirish" data-link class="mobile-only">${t('Kirish')}</a>`);
  nav.classList.remove('open');

  const right = document.getElementById('nav-right');
  right.innerHTML = langSwitcher() + (u
    ? `<div class="dropdown"><button class="user-chip" id="user-btn" aria-haspopup="true" aria-expanded="false">
         <span class="avatar">${esc(initials(u.name))}</span><span class="nm">${esc(u.name.split(' ')[0])}</span></button>
         <div class="dropdown-menu" id="user-menu" hidden>
           <div class="who"><b>${esc(u.name)}</b><div class="tiny muted">${esc(u.email)}</div><div class="tiny muted">${roleLabel[u.role]}${u.group ? `, ${esc(u.group)}` : ''}</div></div>
           <div class="sep"></div>
           <a href="/kabinet" data-link>${icon('chart')} ${t('Mening natijalarim')}</a>
           <a href="/profil" data-link>${icon('user')} ${t('Profil sozlamalari')}</a>
           ${isStaff() ? `<a href="/boshqaruv" data-link>${icon('grid')} ${t('Boshqaruv paneli')}</a>` : ''}
           <div class="sep"></div>
           <button id="logout">${icon('logout')} ${t('Chiqish')}</button>
         </div></div>`
    : `<a href="/kirish" class="btn btn-quiet btn-sm" data-link>${t('Kirish')}</a><a href="/royxat" class="btn btn-sm" data-link>${t("Ro'yxatdan o'tish")}</a>`)
    + `<button class="btn btn-quiet btn-icon menu-btn" id="menu-btn" aria-label="${t('Menyu')}">${icon('menu')}</button>`;

  right.querySelectorAll('.dropdown > button[aria-haspopup]').forEach((btn) => {
    const menu = btn.parentElement.querySelector('.dropdown-menu');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeMenus(menu);
      menu.hidden = !menu.hidden;
      btn.setAttribute('aria-expanded', String(!menu.hidden));
      if (!menu.hidden) menu.querySelector('button, a')?.focus();
    });
  });
  right.querySelectorAll('[data-lang]').forEach((b) => b.addEventListener('click', () => {
    if (setLang(b.dataset.lang)) {
      applyStatic();
      render({ keepScroll: true });
      toast(t("Til o'zgartirildi"), 'good');
    } else closeMenus();
  }));
  right.querySelector('#logout')?.addEventListener('click', async () => {
    await post('/api/auth/logout').catch(() => {});
    state.user = null;
    toast(t('Tizimdan chiqdingiz'));
    navigate('/');
  });
  right.querySelector('#menu-btn').addEventListener('click', () => nav.classList.toggle('open'));
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) closeMenus();
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
  e.preventDefault();
  navigate(a.getAttribute('href'));
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenus(); });
window.addEventListener('popstate', () => render());
window.addEventListener('auth:expired', () => { state.user = null; renderNav(); });

export function setTitle(title) { document.title = title ? `${title} — EduTest` : t("EduTest — fanlar bo'yicha onlayn testlar"); }

async function render({ keepScroll = false } = {}) {
  const token = ++navToken;
  const scrollY = window.scrollY;
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* */ } }
  cleanup = null;
  document.body.classList.remove('exam-mode');
  window.onbeforeunload = null;

  const path = location.pathname;
  let found = null;
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) { found = { r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) }; break; }
  }
  renderNav();
  if (!keepScroll) window.scrollTo(0, 0);

  if (!found) {
    setTitle(t('Sahifa topilmadi'));
    main.innerHTML = `<div class="wrap page"><div class="panel empty"><h3>${t("Bunday sahifa yo'q")}</h3><p>${t('Manzilni tekshiring yoki bosh sahifaga qayting.')}</p>
      <a class="btn" href="/" data-link>${t('Bosh sahifa')}</a></div></div>`;
    return;
  }
  const { r, params } = found;
  if ((r.opts.auth || r.opts.staff) && !state.user) {
    sessionStorage.setItem('after-login', path + location.search);
    return navigate('/kirish', { replace: true });
  }
  if (r.opts.staff && !isStaff()) {
    main.innerHTML = `<div class="wrap page"><div class="panel empty"><h3>${t("Bu bo'lim o'qituvchi va administratorlar uchun")}</h3>
      <p>${t("Sizning hisobingizda bu bo'limga kirish huquqi yo'q.")}</p><a class="btn" href="/kabinet" data-link>${t('Kabinetga qaytish')}</a></div></div>`;
    return;
  }

  try {
    const mod = await r.load();
    if (token !== navToken) return;
    const out = await mod.default(main, { ...r.opts, ...params }, { navigate, state, setTitle });
    if (token !== navToken) { if (typeof out === 'function') out(); return; }
    cleanup = out;
    if (keepScroll) window.scrollTo(0, scrollY);
  } catch (e) {
    if (token !== navToken) return;
    console.error(e);
    if (e.status === 401) {
      sessionStorage.setItem('after-login', path);
      return navigate('/kirish', { replace: true });
    }
    main.innerHTML = `<div class="wrap page"><div class="panel empty"><h3>${t("Sahifani ochib bo'lmadi")}</h3><p>${esc(e.message)}</p>
      <a class="btn" href="${esc(path)}" data-link>${t('Qayta urinish')}</a></div></div>`;
  }
}

export function setUser(u) { state.user = u; renderNav(); }

(async function init() {
  applyStatic();
  try { state.user = (await get('/api/auth/me')).user; } catch { state.user = null; }
  render();
})();
