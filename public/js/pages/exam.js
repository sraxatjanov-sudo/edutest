// Imtihon sahifasi: qoidalar, savollar, taymer va nusxa olishga qarshi himoya
import { get, post, put } from '../api.js';
import { esc, rich, icon, KEYS, fmtClock, diffLabel, modal, toast } from '../ui.js';

const fsSupported = () => Boolean(document.documentElement.requestFullscreen);
const inFullscreen = () => Boolean(document.fullscreenElement);

export default async function exam(main, { id }, { state, setTitle, navigate }) {
  const info = await get(`/api/tests/${Number(id)}`);
  const t = info.test;
  setTitle(t.title);
  let teardown = () => {};

  // ---------- 1. Qoidalar ekrani ----------
  const left = t.maxAttempts ? t.maxAttempts - info.used : null;
  const resume = info.active;
  main.innerHTML = `<div class="wrap page"><div class="exam-intro">
    <nav class="crumbs"><a href="/fanlar" data-link>Fanlar</a><span>/</span><a href="/fan/${esc(t.slug)}" data-link>${esc(t.subject)}</a><span>/</span><span>Imtihon</span></nav>
    <div class="panel">
      <div class="panel-body stack" style="--gap:20px">
        <div><span class="tag"><i class="dot" style="--c:${esc(t.color)}"></i>${esc(t.subject)}</span>
          <h1 style="margin-top:14px">${esc(t.title)}</h1>
          ${t.description ? `<p class="muted" style="margin-top:8px">${esc(t.description)}</p>` : ''}</div>
        <div class="kpis">
          <div class="kpi"><div class="v">${t.questionCount}</div><div class="l">savol</div></div>
          <div class="kpi"><div class="v">${t.timeLimit}</div><div class="l">daqiqa</div></div>
          <div class="kpi"><div class="v">${diffLabel[t.difficulty]}</div><div class="l">qiyinlik</div></div>
          <div class="kpi"><div class="v">${left === null ? '∞' : Math.max(0, left)}</div><div class="l">qolgan urinish</div></div>
        </div>
        ${resume ? `<div class="notice notice-warn">${icon('clock')}<div><b>Sizda tugallanmagan urinish bor.</b> Qolgan vaqt: ${fmtClock(resume.remaining)}. Javoblaringiz saqlangan, davom ettirishingiz mumkin.</div></div>` : ''}
        <div>
          <h2 style="font-size:1.1rem">Imtihon qoidalari</h2>
          <div class="rules">
            <div class="rule">${icon('shuffle')}<p><b>Savollar sizga alohida tanlangan.</b> Savollar va variantlar tartibi boshqa talabalarnikidan farq qiladi.</p></div>
            <div class="rule">${icon('maximize')}<p><b>Test to'liq ekranda o'tadi.</b> Undan chiqish, boshqa oyna yoki ilovaga o'tish qoidabuzarlik deb hisoblanadi.</p></div>
            <div class="rule">${icon('copy')}<p><b>Nusxa olish, matn qo'yish, o'ng tugma va chop etish o'chirilgan.</b> Bunday urinishlar ham qayd etiladi.</p></div>
            <div class="rule">${icon('alert')}<p><b>${t.maxViolations ? `${t.maxViolations} ta qoidabuzarlikdan keyin test avtomatik yakunlanadi.` : 'Barcha qoidabuzarliklar o\'qituvchiga ko\'rsatiladi.'}</b> Har biri vaqti bilan jurnalga yoziladi.</p></div>
            <div class="rule">${icon('clock')}<p><b>Vaqt server bo'yicha hisoblanadi.</b> Sahifa yopilsa ham taymer to'xtamaydi. Vaqt tugashi bilan javoblaringiz avtomatik topshiriladi.</p></div>
          </div>
        </div>
        <label class="check"><input type="checkbox" id="agree"> <span>Qoidalar bilan tanishdim va testni mustaqil yechishga roziman</span></label>
        <p class="form-error" id="err"></p>
        <div class="row">
          <button class="btn btn-lg" id="go" disabled>${icon('play')} ${resume ? 'Davom ettirish' : 'Testni boshlash'}</button>
          <a class="btn btn-ghost btn-lg" href="/fan/${esc(t.slug)}" data-link>Orqaga</a>
        </div>
      </div>
    </div></div></div>`;

  const go = main.querySelector('#go');
  main.querySelector('#agree').addEventListener('change', (e) => { go.disabled = !e.target.checked || (left !== null && left <= 0 && !resume); });
  if (left !== null && left <= 0 && !resume) main.querySelector('#err').textContent = 'Bu test uchun urinishlar soni tugagan.';

  go.addEventListener('click', async () => {
    go.disabled = true;
    try {
      if (fsSupported()) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      const { attemptId } = await post(`/api/tests/${t.id}/start`);
      const { attempt, result } = await get(`/api/attempts/${attemptId}`);
      if (result) return navigate(`/natija/${attemptId}`, { replace: true });
      teardown = run(attempt);
    } catch (e) {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      main.querySelector('#err').textContent = e.message;
      go.disabled = false;
    }
  });

  // ---------- 2. Imtihon jarayoni ----------
  function run(a) {
    const N = a.items.length;
    const offset = a.serverNow - Date.now();
    const now = () => Date.now() + offset;
    let cur = Math.max(0, a.items.findIndex((x) => x.chosen === null));
    if (cur < 0 || cur >= N) cur = 0;
    let finished = false;
    let violations = a.violations;
    let lastViolation = 0;
    let blocker = null;
    const pending = new Map();
    const listeners = [];
    const on = (target, ev, fn, opts) => { target.addEventListener(ev, fn, opts); listeners.push([target, ev, fn, opts]); };

    document.body.classList.add('exam-mode');
    window.onbeforeunload = () => 'Test hali yakunlanmagan';

    main.innerHTML = `<div class="exam">
      <div class="exam-bar">
        <div class="wrap">
          <img src="/img/logo.svg" alt="" width="30" height="30">
          <div class="exam-title"><b>${esc(a.test.title)}</b><span>${esc(state.user.name)}</span></div>
          <div class="timer num" id="timer" role="timer" aria-live="off">${icon('clock')}<span>--:--</span></div>
          <div class="guard-badge" id="guard" title="Qoidabuzarliklar soni">${icon('shield')}<span class="num" id="vcount"></span><span class="txt">ogohlantirish</span></div>
          <button class="btn btn-ghost btn-sm" id="finish">Yakunlash</button>
        </div>
        <div class="exam-progress"><i id="prog"></i></div>
      </div>
      <div class="exam-body">
        <div class="watermark" id="wm" aria-hidden="true"></div>
        <div class="wrap">
          <section class="qcard" id="qcard" aria-live="polite"></section>
          <aside class="panel panel-pad palette-card">
            <div class="spread" style="margin-bottom:14px"><h3>Savollar</h3><span class="small muted num" id="answered"></span></div>
            <div class="palette" id="palette">${a.items.map((_, k) => `<button data-k="${k}" aria-label="${k + 1}-savol">${k + 1}</button>`).join('')}</div>
            <div class="legend"><span><i class="a"></i>Javob berilgan</span><span><i></i>Javob berilmagan</span><span><i class="f"></i>Belgilangan</span></div>
            <div class="save-state" id="save" style="margin-top:14px">${icon('check')} Javoblar saqlanmoqda</div>
          </aside>
        </div>
      </div>
    </div>`;

    // Suv belgisi: talaba ismi va urinish raqami butun ekran bo'ylab
    const mark = `${state.user.name}  ${state.user.email}  #${a.id}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="220"><text x="0" y="130" transform="rotate(-22 210 110)" font-family="Arial" font-size="15" fill="rgba(23,32,51,0.07)">${esc(mark)}</text></svg>`;
    main.querySelector('#wm').style.backgroundImage = `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;

    const $q = main.querySelector('#qcard');
    const $pal = main.querySelector('#palette');
    const $timer = main.querySelector('#timer');
    const $save = main.querySelector('#save');

    function updateMeta() {
      const answered = a.items.filter((x) => x.chosen !== null).length;
      main.querySelector('#answered').textContent = `${answered} / ${N}`;
      main.querySelector('#prog').style.width = `${(answered / N) * 100}%`;
      $pal.querySelectorAll('button').forEach((b, k) => {
        b.classList.toggle('answered', a.items[k].chosen !== null);
        b.classList.toggle('flagged', a.items[k].flagged);
        b.setAttribute('aria-current', String(k === cur));
      });
      main.querySelector('#vcount').textContent = a.maxViolations ? `${violations}/${a.maxViolations}` : String(violations);
      main.querySelector('#guard').classList.toggle('hot', violations > 0);
    }

    function show(k) {
      cur = Math.max(0, Math.min(N - 1, k));
      const q = a.items[cur];
      $q.innerHTML = `
        <div class="qcard-top"><span class="qnum">${cur + 1}-savol / ${N}</span>
          <button class="btn btn-ghost btn-sm flag-btn" id="flag" aria-pressed="${q.flagged}">${icon('flag')} ${q.flagged ? 'Belgilangan' : 'Keyinroq qaytaman'}</button></div>
        <div class="qtext">${rich(q.text)}</div>
        <div class="options" role="radiogroup" aria-label="Javob variantlari">
          ${q.options.map((o, i) => `<button class="opt" role="radio" aria-checked="${q.chosen === i}" data-i="${i}"><span class="key">${KEYS[i]}</span><span>${rich(o)}</span></button>`).join('')}
        </div>
        <div class="qnav">
          <button class="btn btn-ghost" id="prev" ${cur === 0 ? 'disabled' : ''}>${icon('left')} Oldingi</button>
          ${cur < N - 1 ? `<button class="btn" id="next">Keyingi ${icon('right')}</button>` : '<button class="btn btn-saffron" id="next">Testni yakunlash</button>'}
        </div>`;
      $q.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', () => choose(Number(b.dataset.i))));
      $q.querySelector('#prev').addEventListener('click', () => show(cur - 1));
      $q.querySelector('#next').addEventListener('click', () => (cur < N - 1 ? show(cur + 1) : askFinish()));
      $q.querySelector('#flag').addEventListener('click', () => {
        q.flagged = !q.flagged; save(cur, { flagged: q.flagged }); show(cur);
      });
      updateMeta();
    }

    function choose(i) {
      const q = a.items[cur];
      q.chosen = q.chosen === i ? null : i; // qayta bosish javobni bekor qiladi
      save(cur, { choice: q.chosen });
      show(cur);
    }

    async function save(position, patch) {
      pending.set(position, { ...(pending.get(position) || {}), ...patch });
      $save.className = 'save-state';
      $save.innerHTML = `${icon('upload')} Saqlanmoqda…`;
      await flush();
    }
    let flushing = false;
    async function flush() {
      if (flushing || finished) return;
      flushing = true;
      try {
        for (const [position, patch] of [...pending]) {
          await put(`/api/attempts/${a.id}/answer`, { position, ...patch });
          if (JSON.stringify(pending.get(position)) === JSON.stringify(patch)) pending.delete(position);
        }
        $save.className = 'save-state';
        $save.innerHTML = `${icon('check')} Barcha javoblar saqlandi`;
      } catch (e) {
        if (e.status === 409) { flushing = false; return done('Test yakunlandi'); }
        $save.className = 'save-state err';
        $save.innerHTML = `${icon('alert')} Saqlanmadi, qayta urinilmoqda`;
        setTimeout(() => { flushing = false; flush(); }, 3000);
        return;
      }
      flushing = false;
      if (pending.size) flush();
    }

    // Taymer
    function tick() {
      const sec = Math.round((a.deadline - now()) / 1000);
      $timer.querySelector('span').textContent = fmtClock(sec);
      $timer.classList.toggle('low', sec <= 60);
      if (sec <= 0 && !finished) finish('Vaqt tugadi. Javoblaringiz avtomatik topshirildi');
    }
    const timer = setInterval(tick, 500);
    tick();

    function askFinish() {
      const answered = a.items.filter((x) => x.chosen !== null).length;
      const flagged = a.items.filter((x) => x.flagged).length;
      const m = modal({
        title: 'Testni yakunlaysizmi?',
        body: `<div class="stack"><p>Javob berilgan: <b>${answered} / ${N}</b>${flagged ? `, belgilangan: <b>${flagged}</b>` : ''}.</p>
          ${answered < N ? `<div class="notice notice-warn">${icon('alert')}<div>${N - answered} ta savolga javob berilmagan. Ular noto'g'ri hisoblanadi.</div></div>` : ''}
          <p class="muted small">Yakunlangandan keyin javoblarni o'zgartirib bo'lmaydi.</p></div>`,
        foot: '<button class="btn btn-ghost" data-close>Davom etish</button><button class="btn btn-saffron" data-ok>Yakunlash</button>',
      });
      m.el.querySelector('[data-ok]').addEventListener('click', () => { m.close(); finish(); });
    }
    main.querySelector('#finish').addEventListener('click', askFinish);
    $pal.addEventListener('click', (e) => { const b = e.target.closest('button[data-k]'); if (b) show(Number(b.dataset.k)); });

    async function finish(msg) {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      try {
        // Saqlanmagan javoblarni oxirgi marta yuborish
        for (const [position, patch] of pending) await put(`/api/attempts/${a.id}/answer`, { position, ...patch }).catch(() => {});
        await post(`/api/attempts/${a.id}/finish`);
      } catch { /* server vaqt tugaganda o'zi yakunlaydi */ }
      done(msg);
    }

    function done(msg) {
      finished = true;
      stop();
      if (msg) toast(msg);
      navigate(`/natija/${a.id}`, { replace: true });
    }

    // ---------- Nusxa olishga qarshi himoya ----------
    async function violation(type) {
      if (finished) return;
      const t0 = Date.now();
      if (t0 - lastViolation < 1500) return;
      lastViolation = t0;
      try {
        const r = await post(`/api/attempts/${a.id}/violation`, { type });
        if (r.ignored) return;
        violations = r.violations;
        updateMeta();
        if (r.finished) { finished = true; stop(); toast('Qoidabuzarliklar chegarasidan oshildi. Test yakunlandi', 'bad'); return navigate(`/natija/${a.id}`, { replace: true }); }
        warn(r.label);
      } catch (e) {
        if (e.status === 409) done('Test yakunlandi');
      }
    }

    function warn(label, needFs = false) {
      showBlocker(`${icon('alert', 'big')}
        <h2>Ogohlantirish${a.maxViolations ? ` ${violations} / ${a.maxViolations}` : ''}</h2>
        <p>${esc(label)}. Bu holat o'qituvchiga ko'rsatiladi.${a.maxViolations ? ` Yana ${a.maxViolations - violations} ta qoidabuzarlikdan keyin test avtomatik yakunlanadi.` : ''}</p>
        <button class="btn btn-saffron btn-lg" id="back">${needFs || (fsSupported() && !inFullscreen()) ? 'To\'liq ekranga qaytish' : 'Testga qaytish'}</button>`);
    }

    function showBlocker(html) {
      blocker?.remove();
      blocker = document.createElement('div');
      blocker.className = 'blocker';
      blocker.innerHTML = `<div class="box">${html}</div>`;
      document.body.appendChild(blocker);
      const b = blocker.querySelector('#back');
      b?.focus();
      b?.addEventListener('click', async () => {
        if (fsSupported() && !inFullscreen()) await document.documentElement.requestFullscreen().catch(() => {});
        blocker?.remove(); blocker = null;
      });
    }

    const blockKeys = (e) => {
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      if (e.key === 'F12' || (mod && e.shiftKey && ['i', 'j', 'c', 'k'].includes(k)) || (mod && e.altKey && ['i', 'j', 'c'].includes(k)) || (mod && k === 'u')) {
        e.preventDefault(); return violation('devtools');
      }
      if (mod && ['p', 's'].includes(k)) { e.preventDefault(); return violation('print_attempt'); }
      if (mod && ['c', 'x', 'a', 'insert'].includes(k)) { e.preventDefault(); return violation('copy_attempt'); }
      if (mod && k === 'v') { e.preventDefault(); return violation('paste_attempt'); }
      if (e.key === 'PrintScreen') { e.preventDefault(); return violation('screenshot_key'); }
      if (blocker || document.querySelector('.modal-back')) return;
      // Klaviatura bilan boshqarish: A–F variant tanlash, ← → savollar orasida
      if (!mod && !e.altKey) {
        const idx = KEYS.indexOf(e.key.toUpperCase());
        if (idx >= 0 && idx < a.items[cur].options.length) { e.preventDefault(); choose(idx); }
        else if (e.key === 'ArrowRight') show(cur + 1);
        else if (e.key === 'ArrowLeft') show(cur - 1);
      }
    };
    on(document, 'keydown', blockKeys, true);
    on(document, 'keyup', (e) => {
      if (e.key === 'PrintScreen') {
        navigator.clipboard?.writeText('EduTest: ekran rasmini olish taqiqlangan').catch(() => {});
        violation('screenshot_key');
      }
    }, true);
    ['copy', 'cut'].forEach((ev) => on(document, ev, (e) => { e.preventDefault(); violation('copy_attempt'); }, true));
    on(document, 'paste', (e) => { e.preventDefault(); violation('paste_attempt'); }, true);
    on(document, 'contextmenu', (e) => { e.preventDefault(); violation('context_menu'); }, true);
    on(document, 'selectstart', (e) => e.preventDefault(), true);
    on(document, 'dragstart', (e) => e.preventDefault(), true);
    on(window, 'beforeprint', () => violation('print_attempt'));
    on(document, 'visibilitychange', () => { if (document.hidden) violation('tab_hidden'); });
    on(window, 'blur', () => { setTimeout(() => { if (!document.hidden && !document.hasFocus()) violation('window_blur'); }, 300); });
    on(document, 'fullscreenchange', () => {
      if (!inFullscreen() && !finished) {
        violation('fullscreen_exit');
        warn('To\'liq ekran rejimidan chiqildi', true);
      }
    });

    // Bir test ikki oynada ochilmasin
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel(`edutest-attempt-${a.id}`) : null;
    channel?.postMessage('opened');
    if (channel) channel.onmessage = (e) => {
      if (e.data === 'opened' && !finished) {
        finished = true; stop();
        showBlocker(`${icon('alert', 'big')}<h2>Test boshqa oynada ochildi</h2><p>Bir vaqtning o'zida faqat bitta oynada ishlash mumkin. Bu oynani yoping.</p>`);
      }
    };

    // Sahifa yangilansa ham davom etish uchun vaqti-vaqti bilan holatni tekshirish
    const poll = setInterval(async () => {
      if (finished) return;
      try { const r = await get(`/api/attempts/${a.id}`); if (r.result) done('Test yakunlandi'); } catch { /* */ }
    }, 30e3);

    function stop() {
      clearInterval(timer); clearInterval(poll);
      for (const [tg, ev, fn, o] of listeners) tg.removeEventListener(ev, fn, o);
      listeners.length = 0;
      channel?.close();
      window.onbeforeunload = null;
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      document.body.classList.remove('exam-mode');
      blocker?.remove(); blocker = null;
    }

    if (fsSupported() && !inFullscreen()) {
      showBlocker(`${icon('maximize', 'big')}<h2>To'liq ekran rejimi</h2>
        <p>Test to'liq ekranda o'tkaziladi. Davom etish uchun tugmani bosing.</p>
        <button class="btn btn-saffron btn-lg" id="back">To'liq ekranga o'tish</button>`);
    }
    show(cur);
    return stop;
  }

  return () => teardown();
}
