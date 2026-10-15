import { put } from '../api.js';
import { esc, toast, roleLabel, t } from '../ui.js';
import { setUser } from '../app.js';

export default async function profile(main, _p, { state, setTitle }) {
  setTitle(t('Profil'));
  const u = state.user;
  main.innerHTML = `<div class="wrap page" style="max-width:760px">
    <div class="page-head"><div><h1>${t('Profil sozlamalari')}</h1><p class="muted">${esc(u.email)}, ${roleLabel[u.role]}</p></div></div>
    <div class="stack" style="--gap:20px">
      <form class="panel" id="pf" novalidate>
        <div class="panel-head"><h2>${t("Shaxsiy ma'lumotlar")}</h2></div>
        <div class="panel-body form-grid">
          <div class="field"><label for="name">${t('Ism va familiya')}</label><input class="input" id="name" value="${esc(u.name)}" maxlength="80"></div>
          <div class="field"><label for="group">${t('Guruh yoki sinf')}</label><input class="input" id="group" value="${esc(u.group || '')}" maxlength="40"></div>
        </div>
        <div class="modal-foot"><p class="form-error grow" id="perr"></p><button class="btn">${t("O'zgarishlarni saqlash")}</button></div>
      </form>
      <form class="panel" id="pw" novalidate>
        <div class="panel-head"><h2>${t("Parolni o'zgartirish")}</h2></div>
        <div class="panel-body form-grid">
          <div class="field"><label for="cur">${t('Joriy parol')}</label><input class="input" id="cur" type="password" autocomplete="current-password"></div>
          <div class="field"><label for="next">${t('Yangi parol')}</label><input class="input" id="next" type="password" autocomplete="new-password"><span class="hint">${t('Kamida 8 ta belgi, harf va raqam')}</span></div>
        </div>
        <div class="modal-foot"><p class="form-error grow" id="werr"></p><button class="btn">${t('Parolni yangilash')}</button></div>
      </form>
    </div></div>`;

  main.querySelector('#pf').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await put('/api/auth/profile', { name: main.querySelector('#name').value, group: main.querySelector('#group').value });
      setUser(r.user); main.querySelector('#perr').textContent = ''; toast(t('Profil saqlandi'), 'good');
    } catch (err) { main.querySelector('#perr').textContent = err.message; }
  });
  main.querySelector('#pw').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await put('/api/auth/password', { current: main.querySelector('#cur').value, next: main.querySelector('#next').value });
      e.target.reset(); main.querySelector('#werr').textContent = '';
      toast(t('Parol yangilandi. Boshqa qurilmalardagi sessiyalar yopildi'), 'good');
    } catch (err) { main.querySelector('#werr').textContent = err.message; }
  });
}
