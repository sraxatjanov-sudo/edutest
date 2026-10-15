// EduTest — mijoz ilovasi: marshrutlash, foydalanuvchi holati, navigatsiya
import { get, post } from './api.js';
import { esc, icon, initials, roleLabel, toast } from './ui.js';

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

function renderNav() {
  const u = state.user;
  const here = location.pathname;
  const links = [['/fanlar', 'Fanlar'], ['/reyting', 'Reyting']];
  if (u) links.splice(1, 0, ['/kabinet', 'Kabinet']);
  if (isStaff()) links.push(['/boshqaruv', 'Boshqaruv']);
  const nav = document.getElementById('nav');
  nav.innerHTML = links.map(([h, t]) => `<a href="${h}" data-link ${here === h || (h !== '/' && here.startsWith(h + '/')) || (h === '/fanlar' && here.startsWith('/fan/')) ? 'aria-current="page"' : ''}>${t}</a>`).join('')
    + (u ? '' : '<a href="/kirish" data-link class="mobile-only">Kirish</a>');
  nav.classList.remove('open');

  const right = document.getElementById('nav-right');
  right.innerHTML = (u
    ? `<div class="dropdown"><button class="user-chip" id="user-btn" aria-haspopup="true" aria-expanded="false">
         <span class="avatar">${esc(initials(u.name))}</span><span class="nm">${esc(u.name.split(' ')[0])}</span></button>
         <div class="dropdown-menu" id="user-menu" hidden>
           <div class="who"><b>${esc(u.name)}</b><div class="tiny muted">${esc(u.email)}</div><div class="tiny muted">${roleLabel[u.role]}${u.group ? `, ${esc(u.group)}` : ''}</div></div>
           <div class="sep"></div>
           <a href="/kabinet" data-link>${icon('chart')} Mening natijalarim</a>
           <a href="/profil" data-link>${icon('user')} Profil sozlamalari</a>
           ${isStaff() ? `<a href="/boshqaruv" data-link>${icon('grid')} Boshqaruv paneli</a>` : ''}
           <div class="sep"></div>
           <button id="logout">${icon('logout')} Chiqish</button>
         </div></div>`
    : `<a href="/kirish" class="btn btn-quiet btn-sm" data-link>Kirish</a><a href="/royxat" class="btn btn-sm" data-link>Ro'yxatdan o'tish</a>`)
    + `<button class="btn btn-quiet btn-icon menu-btn" id="menu-btn" aria-label="Menyu">${icon('menu')}</button>`;

  const btn = right.querySelector('#user-btn');
  const menu = right.querySelector('#user-menu');
  btn?.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.hidden = !menu.hidden;
    btn.setAttribute('aria-expanded', String(!menu.hidden));
  });
  right.querySelector('#logout')?.addEventListener('click', async () => {
    await post('/api/auth/logout').catch(() => {});
    state.user = null;
    toast('Tizimdan chiqdingiz');
    navigate('/');
  });
  right.querySelector('#menu-btn').addEventListener('click', () => nav.classList.toggle('open'));
}

document.addEventListener('click', (e) => {
  const menu = document.getElementById('user-menu');
  if (menu && !menu.hidden && !e.target.closest('.dropdown')) menu.hidden = true;
  const a = e.target.closest('a[data-link]');
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
  e.preventDefault();
  navigate(a.getAttribute('href'));
});
window.addEventListener('popstate', render);
window.addEventListener('auth:expired', () => { state.user = null; renderNav(); });

export function setTitle(t) { document.title = t ? `${t} — EduTest` : 'EduTest — fanlar bo\'yicha onlayn testlar'; }

async function render() {
  const token = ++navToken;
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
  window.scrollTo(0, 0);

  if (!found) {
    setTitle('Sahifa topilmadi');
    main.innerHTML = `<div class="wrap page"><div class="panel empty"><h3>Bunday sahifa yo'q</h3><p>Manzilni tekshiring yoki bosh sahifaga qayting.</p>
      <a class="btn" href="/" data-link>Bosh sahifa</a></div></div>`;
    return;
  }
  const { r, params } = found;
  if ((r.opts.auth || r.opts.staff) && !state.user) {
    sessionStorage.setItem('after-login', path + location.search);
    return navigate('/kirish', { replace: true });
  }
  if (r.opts.staff && !isStaff()) {
    main.innerHTML = `<div class="wrap page"><div class="panel empty"><h3>Bu bo'lim o'qituvchi va administratorlar uchun</h3>
      <p>Sizning hisobingizda bu bo'limga kirish huquqi yo'q.</p><a class="btn" href="/kabinet" data-link>Kabinetga qaytish</a></div></div>`;
    return;
  }

  try {
    const mod = await r.load();
    if (token !== navToken) return;
    const out = await mod.default(main, { ...r.opts, ...params }, { navigate, state, setTitle });
    if (token !== navToken) { if (typeof out === 'function') out(); return; }
    cleanup = out;
  } catch (e) {
    if (token !== navToken) return;
    console.error(e);
    if (e.status === 401) {
      sessionStorage.setItem('after-login', path);
      return navigate('/kirish', { replace: true });
    }
    main.innerHTML = `<div class="wrap page"><div class="panel empty"><h3>Sahifani ochib bo'lmadi</h3><p>${esc(e.message)}</p>
      <a class="btn" href="${esc(path)}" data-link>Qayta urinish</a></div></div>`;
  }
}

export function setUser(u) { state.user = u; renderNav(); }

(async function init() {
  document.getElementById('year').textContent = new Date().getFullYear();
  try { state.user = (await get('/api/auth/me')).user; } catch { state.user = null; }
  render();
})();
