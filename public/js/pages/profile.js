import { put } from '../api.js';
import { esc, icon, toast, roleLabel, avatar, imageToDataUrl, t } from '../ui.js';
import { setUser } from '../app.js';

export default async function profile(main, _p, { state, setTitle }) {
  setTitle(t('Profil'));
  const u = state.user;
  main.innerHTML = `<div class="wrap page" style="max-width:760px">
    <div class="page-head"><div><h1>${t('Profil sozlamalari')}</h1><p class="muted">${esc(u.email)}, ${roleLabel[u.role]}</p></div></div>
    <div class="stack" style="--gap:20px">
      <section class="panel panel-pad"><div class="avatar-edit">
        <div id="av">${avatar(u, 'avatar avatar-xl')}</div>
        <div class="stack" style="--gap:10px"><h2 style="font-size:1.1rem">${t('Profil rasmi')}</h2>
          <p class="small muted">${t("Reytingda, guruhda va menyuda ko'rinadi. Rasm kvadrat shaklga qirqiladi.")}</p>
          <div class="row"><button class="btn btn-ghost btn-sm" id="avpick">${icon('image')} ${t('Rasm tanlash')}</button>
            <button class="btn btn-quiet btn-sm" id="avrm" ${u.avatar ? '' : 'hidden'}>${icon('trash')} ${t("O'chirish")}</button></div>
          <input type="file" id="avfile" accept="image/png,image/jpeg,image/webp" hidden></div>
      </div></section>
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

  const setAvatar = async (data) => {
    try {
      const r = await put('/api/me/avatar', { data });
      setUser(r.user);
      main.querySelector('#av').innerHTML = avatar(r.user, 'avatar avatar-xl');
      main.querySelector('#avrm').hidden = !r.user.avatar;
      toast(data ? t('Profil rasmi yangilandi') : t("Profil rasmi o'chirildi"), 'good');
    } catch (err) { toast(err.message, 'bad'); }
  };
  main.querySelector('#avpick').addEventListener('click', () => main.querySelector('#avfile').click());
  main.querySelector('#avfile').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try { await setAvatar(await imageToDataUrl(f, { max: 320, square: true, quality: 0.85 })); } catch (err) { toast(err.message, 'bad'); }
  });
  main.querySelector('#avrm').addEventListener('click', () => setAvatar(null));

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
