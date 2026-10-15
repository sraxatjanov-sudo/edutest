import { get, post } from '../api.js';
import { esc, rich, icon, fmtNum, KEYS, t } from '../ui.js';
import { subjectCard } from './subjects.js';

export default async function home(main, _p, { state, setTitle }) {
  setTitle('');
  const [stats, { subjects }] = await Promise.all([get('/api/stats'), get('/api/subjects')]);
  const u = state.user;

  main.innerHTML = `
  <section class="hero">
    <div class="wrap">
      <div>
        <h1>${t('Bilimingizni adolatli imtihonda sinang')}</h1>
        <p class="lead">${t("{s} ta fan, {q} ta savol. Har bir talaba o'z tartibidagi savollarni oladi, natija va xatolar tahlili topshirgan zahoti ko'rinadi.", { s: fmtNum(stats.subjects), q: fmtNum(stats.questions) })}</p>
        <div class="cta">
          <a class="btn btn-saffron btn-lg" href="${u ? '/fanlar' : '/royxat'}" data-link>${icon('play')} ${u ? t('Test tanlash') : t('Bepul boshlash')}</a>
          <a class="btn btn-ghost btn-lg" href="/fanlar" data-link>${t('Mashq qilish')}</a>
        </div>
        <div class="hero-facts">
          <span><b>${fmtNum(stats.tests)}</b>${t('faol test')}</span>
          <span><b>${fmtNum(stats.students)}</b>${t('talaba')}</span>
          <span><b>${fmtNum(stats.attempts)}</b>${t('topshirilgan imtihon')}</span>
        </div>
      </div>
      <div class="sample" id="sample" aria-live="polite"></div>
    </div>
  </section>

  <section class="section">
    <div class="wrap">
      <div class="section-head">
        <div><h2>${t('Fanlar')}</h2><p class="muted">${t("Har bir fan bo'yicha imtihon testlari va javobni darhol ko'rsatadigan mashq rejimi bor.")}</p></div>
        <a class="btn btn-ghost" href="/fanlar" data-link>${t('Barcha fanlar')}</a>
      </div>
      <div class="subjects">${subjects.slice(0, 6).map(subjectCard).join('')}</div>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="wrap">
      <div class="section-head"><h2>${t('Qanday ishlaydi')}</h2></div>
      <div class="steps">
        <div class="step"><h3>${t('Fan va testni tanlang')}</h3><p>${t('Umumiy test barcha mavzularni qamraydi, tezkor sinov esa asosiy tushunchalarni takrorlash uchun.')}</p></div>
        <div class="step"><h3>${t('Vaqt ichida javob bering')}</h3><p>${t("Savollar orasida erkin o'ting, shubhali savolni belgilab qo'ying. Javoblar har bosishda serverga saqlanadi.")}</p></div>
        <div class="step"><h3>${t('Xatolar ustida ishlang')}</h3><p>${t("Natija, baho va har bir savolning izohli tahlili. Kabinetda fanlar bo'yicha o'sishingizni kuzating.")}</p></div>
      </div>
    </div>
  </section>

  <section class="section" style="padding-top:0">
    <div class="wrap">
      <div class="integrity">
        <div>
          <h2>${t("Ko'chirib bo'lmaydigan imtihon")}</h2>
          <p class="lead">${t("Natija faqat talabaning o'z bilimini ko'rsatishi uchun himoya bir necha qatlamda qurilgan.")}</p>
        </div>
        <div class="guard-list">
          <div class="guard">${icon('shuffle')}<div><b>${t("Har kimga o'z varianti")}</b><span>${t('Savollar bankdan tasodifiy tanlanadi, savollar va javob variantlari tartibi har talabada boshqacha.')}</span></div></div>
          <div class="guard">${icon('lock')}<div><b>${t('Javoblar serverda')}</b><span>${t("To'g'ri javob brauzerga umuman yuborilmaydi, baholash faqat serverda bo'ladi.")}</span></div></div>
          <div class="guard">${icon('eye-off')}<div><b>${t('Oynadan chiqish qayd etiladi')}</b><span>${t("Boshqa oynaga o'tish, to'liq ekrandan chiqish va nusxa olish urinishlari sanaladi. Chegaradan oshsa, test yakunlanadi.")}</span></div></div>
          <div class="guard">${icon('copy')}<div><b>${t('Nusxa va chop etish bloklangan')}</b><span>${t("Matnni belgilash, nusxalash, o'ng tugma menyusi va chop etish o'chirilgan, ekranda talaba ismi bilan suv belgisi turadi.")}</span></div></div>
          <div class="guard">${icon('clock')}<div><b>${t("Vaqt server bo'yicha")}</b><span>${t('Kompyuter soatini o\'zgartirish yordam bermaydi: muddat tugashi bilan test serverda yopiladi.')}</span></div></div>
          <div class="guard">${icon('shield')}<div><b>${t("O'qituvchi nazorati")}</b><span>${t("Har bir qoidabuzarlik vaqti bilan jurnalga yoziladi, shubhali natijani o'qituvchi bekor qila oladi.")}</span></div></div>
        </div>
      </div>
    </div>
  </section>`;

  const box = main.querySelector('#sample');
  let alive = true;

  async function loadSample() {
    box.innerHTML = '<div class="skeleton"><i></i><i></i><i></i><i></i></div>';
    const q = await get('/api/sample').catch(() => null);
    if (!alive) return;
    if (!q || !q.id) { box.innerHTML = `<p class="muted">${t('Namunaviy savol yuklanmadi.')}</p>`; return; }
    box.innerHTML = `
      <div class="sample-top"><span class="tag">${esc(q.subject)}</span><span class="tiny muted">${t("Hoziroq yechib ko'ring")}</span></div>
      <h3>${rich(q.text)}</h3>
      <div class="options">${q.options.map((o, i) => `<button class="opt" data-i="${i}"><span class="key">${KEYS[i]}</span><span>${rich(o)}</span></button>`).join('')}</div>
      <div id="fb"></div>`;
    box.querySelectorAll('.opt').forEach((b) => b.addEventListener('click', async () => {
      box.querySelectorAll('.opt').forEach((x) => { x.disabled = true; });
      const answer = q.options[Number(b.dataset.i)];
      const r = await post('/api/practice/check', { id: q.id, answer }).catch(() => null);
      if (!r || !alive) return;
      box.querySelectorAll('.opt').forEach((x) => {
        const val = q.options[Number(x.dataset.i)];
        if (val === r.correct) x.classList.add('is-right');
        else if (x === b) x.classList.add('is-wrong');
      });
      box.querySelector('#fb').innerHTML = `
        <div class="fb ${r.ok ? 'ok' : 'no'}"><b>${r.ok ? t("To'g'ri!") : t("Noto'g'ri.")}</b>${r.explanation ? `<p>${rich(r.explanation)}</p>` : ''}</div>
        <div class="sample-foot"><button class="btn btn-ghost btn-sm" id="next">${icon('shuffle')} ${t('Boshqa savol')}</button>
          <a class="btn btn-sm" href="/fanlar" data-link>${t("Testga o'tish")}</a></div>`;
      box.querySelector('#next').addEventListener('click', loadSample);
    }));
  }
  loadSample();
  return () => { alive = false; };
}
