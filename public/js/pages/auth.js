import { post } from '../api.js';
import { setUser } from '../app.js';

export default async function auth(main, { mode }, { state, setTitle, navigate }) {
  const reg = mode === 'register';
  setTitle(reg ? 'Ro\'yxatdan o\'tish' : 'Kirish');
  if (state.user) return navigate('/kabinet', { replace: true });

  main.innerHTML = `<div class="auth">
    <div class="auth-art">
      <blockquote>Har bir talaba o'z savollariga, o'z vaqtida, o'z bilimi bilan javob beradi.</blockquote>
      <cite>EduTest imtihon tamoyili</cite>
    </div>
    <div class="auth-form">
      <form id="f" novalidate class="stack" style="--gap:16px">
        <div><h1>${reg ? 'Hisob yaratish' : 'Xush kelibsiz'}</h1>
          <p class="muted" style="margin-top:8px">${reg ? 'Testlarni topshirish va natijalarni saqlash uchun ro\'yxatdan o\'ting.' : 'Davom etish uchun hisobingizga kiring.'}</p></div>
        ${reg ? `<div class="field"><label for="name">Ism va familiya</label><input class="input" id="name" autocomplete="name" required maxlength="80"></div>
          <div class="field"><label for="group">Guruh yoki sinf <span class="muted">(ixtiyoriy)</span></label><input class="input" id="group" maxlength="40" placeholder="Masalan: 211-guruh"></div>` : ''}
        <div class="field"><label for="email">Email</label><input class="input" id="email" type="email" autocomplete="email" required></div>
        <div class="field"><label for="password">Parol</label><input class="input" id="password" type="password" autocomplete="${reg ? 'new-password' : 'current-password'}" required>
          ${reg ? '<span class="hint">Kamida 8 ta belgi, harf va raqam bo\'lsin</span>' : ''}</div>
        <p class="form-error" id="err" role="alert"></p>
        <button class="btn btn-lg btn-block" id="submit">${reg ? 'Ro\'yxatdan o\'tish' : 'Kirish'}</button>
        <p class="small muted">${reg ? 'Hisobingiz bormi? <a href="/kirish" data-link>Kirish</a>' : 'Hisobingiz yo\'qmi? <a href="/royxat" data-link>Ro\'yxatdan o\'ting</a>'}</p>
        ${reg ? '' : `<div class="demo-accounts"><b>Sinov hisoblari</b> (bosing, maydonlar to'ladi):<br>
          <button type="button" data-e="admin@edutest.uz" data-p="admin123">Administrator</button>,
          <button type="button" data-e="teacher@edutest.uz" data-p="teacher123">O'qituvchi</button>,
          <button type="button" data-e="talaba@edutest.uz" data-p="talaba123">Talaba</button></div>`}
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
      navigate(after || (user.role === 'student' ? '/kabinet' : '/boshqaruv'), { replace: true });
    } catch (err) {
      f.querySelector('#err').textContent = err.message;
      btn.disabled = false;
    }
  });
}
