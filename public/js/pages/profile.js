import { put } from '../api.js';
import { esc, toast, roleLabel } from '../ui.js';
import { setUser } from '../app.js';

export default async function profile(main, _p, { state, setTitle }) {
  setTitle('Profil');
  const u = state.user;
  main.innerHTML = `<div class="wrap page" style="max-width:760px">
    <div class="page-head"><div><h1>Profil sozlamalari</h1><p class="muted">${esc(u.email)}, ${roleLabel[u.role]}</p></div></div>
    <div class="stack" style="--gap:20px">
      <form class="panel" id="pf" novalidate>
        <div class="panel-head"><h2>Shaxsiy ma'lumotlar</h2></div>
        <div class="panel-body form-grid">
          <div class="field"><label for="name">Ism va familiya</label><input class="input" id="name" value="${esc(u.name)}" maxlength="80"></div>
          <div class="field"><label for="group">Guruh yoki sinf</label><input class="input" id="group" value="${esc(u.group || '')}" maxlength="40"></div>
        </div>
        <div class="modal-foot"><p class="form-error grow" id="perr"></p><button class="btn">O'zgarishlarni saqlash</button></div>
      </form>
      <form class="panel" id="pw" novalidate>
        <div class="panel-head"><h2>Parolni o'zgartirish</h2></div>
        <div class="panel-body form-grid">
          <div class="field"><label for="cur">Joriy parol</label><input class="input" id="cur" type="password" autocomplete="current-password"></div>
          <div class="field"><label for="next">Yangi parol</label><input class="input" id="next" type="password" autocomplete="new-password"><span class="hint">Kamida 8 ta belgi, harf va raqam</span></div>
        </div>
        <div class="modal-foot"><p class="form-error grow" id="werr"></p><button class="btn">Parolni yangilash</button></div>
      </form>
    </div></div>`;

  main.querySelector('#pf').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const r = await put('/api/auth/profile', { name: main.querySelector('#name').value, group: main.querySelector('#group').value });
      setUser(r.user); main.querySelector('#perr').textContent = ''; toast('Profil saqlandi', 'good');
    } catch (err) { main.querySelector('#perr').textContent = err.message; }
  });
  main.querySelector('#pw').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await put('/api/auth/password', { current: main.querySelector('#cur').value, next: main.querySelector('#next').value });
      e.target.reset(); main.querySelector('#werr').textContent = '';
      toast('Parol yangilandi. Boshqa qurilmalardagi sessiyalar yopildi', 'good');
    } catch (err) { main.querySelector('#werr').textContent = err.message; }
  });
}
