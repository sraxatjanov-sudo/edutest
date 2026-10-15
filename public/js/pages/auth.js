import { post } from '../api.js';
import { t } from '../ui.js';
import { setUser } from '../app.js';

export default async function auth(main, { mode }, { state, setTitle, navigate }) {
  const reg = mode === 'register';
  setTitle(reg ? t("Ro'yxatdan o'tish") : t('Kirish'));
  if (state.user) return navigate('/kabinet', { replace: true });

  main.innerHTML = `<div class="auth">
    <div class="auth-art">
      <blockquote>${t("Har bir talaba o'z savollariga, o'z vaqtida, o'z bilimi bilan javob beradi.")}</blockquote>
      <cite>${t('EduTest imtihon tamoyili')}</cite>
    </div>
    <div class="auth-form">
      <form id="f" novalidate class="stack" style="--gap:16px">
        <div><h1>${reg ? t('Hisob yaratish') : t('Xush kelibsiz')}</h1>
          <p class="muted" style="margin-top:8px">${reg ? t("Testlarni topshirish va natijalarni saqlash uchun ro'yxatdan o'ting.") : t('Davom etish uchun hisobingizga kiring.')}</p></div>
        ${reg ? `<div class="field"><label for="name">${t('Ism va familiya')}</label><input class="input" id="name" autocomplete="name" required maxlength="80"></div>
          <div class="field"><label for="group">${t('Guruh yoki sinf')} <span class="muted">${t('(ixtiyoriy)')}</span></label><input class="input" id="group" maxlength="40" placeholder="${t('Masalan: 211-guruh')}"></div>` : ''}
        <div class="field"><label for="email">Email</label><input class="input" id="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="password">${t('Parol')}</label><input class="input" id="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required>
          ${reg ? `<span class="hint">${t("Kamida 8 ta belgi, harf va raqam bo'lsin")}</span>` : ''}</div>
        ${reg ? '' : `<details class="forgot"><summary>${t('Parolni unutdingizmi?')}</summary><p class="small muted">${t("O'qituvchingiz yoki administratorga murojaat qiling: u sizga vaqtinchalik parol beradi. Kirgandan keyin uni profil sahifasida o'zgartiring.")}</p></details>`}
        <p class="form-error" id="err" role="alert"></p>
        <button class="btn btn-lg btn-block" id="submit">${reg ? t("Ro'yxatdan o'tish") : t('Kirish')}</button>
        <p class="small muted">${reg ? `${t('Hisobingiz bormi?')} <a href="/kirish" data-link>${t('Kirish')}</a>` : `${t("Hisobingiz yo'qmi?")} <a href="/royxat" data-link>${t("Ro'yxatdan o'ting")}</a>`}</p>
        ${reg ? '' : `<div class="demo-accounts"><b>${t('Sinov hisobi')}</b> ${t("(bosing, maydonlar to'ladi):")}
          <button type="button" data-e="talaba@edutest.uz" data-p="talaba123">${t('Talaba')}</button></div>`}
      </form>
    </div></div>`;

  const f = main.querySelector('#f');
  const val = (id) => f.querySelector('#' + id)?.value ?? '';
  f.querySelectorAll('[data-e]').forEach((b) => b.addEventListener('click', () => {
    f.querySelector('#email').value = b.dataset.e; f.querySelector('#password').value = b.dataset.p; f.querySelector('#submit').focus();
  }));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = f.querySelector('#submit'); btn.disabled = true;
    f.querySelector('#err').textContent = '';
    try {
      const body = { email: val('email'), password: val('password') };
      if (reg) Object.assign(body, { name: val('name'), group: val('group') });
      const { user } = await post(reg ? '/api/auth/register' : '/api/auth/login', body);
      setUser(user);
      const after = sessionStorage.getItem('after-login');
      sessionStorage.removeItem('after-login');
      navigate(after || '/kabinet', { replace: true });
    } catch (err) {
      f.querySelector('#err').textContent = err.message;
      btn.disabled = false;
    }
  });
}
