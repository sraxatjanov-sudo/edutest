// Sertifikat: ko'rish, chop etish / PDF saqlash va istalgan kishi uchun haqiqiylikni tekshirish
import { get } from '../api.js';
import { esc, icon, toast, t } from '../ui.js';
import { qrSvg } from '../qr.js';
import { getLang } from '../i18n.js';

const MARKS = { 5: "A'lo", 4: 'Yaxshi', 3: 'Qoniqarli', 2: 'Qoniqarsiz' };

// To'liq sana (brauzerlar o'zbek va qoraqalpoq oy nomlarini har doim ham bilmaydi, shuning uchun o'zimiz)
const MONTHS_FULL = {
  uz: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'],
  ru: ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'],
  kaa: ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'],
};
function longDate(ms) {
  const d = new Date(ms), L = getLang(), m = MONTHS_FULL[L][d.getMonth()];
  if (L === 'ru') return `${d.getDate()} ${m} ${d.getFullYear()} г.`;
  return `${d.getFullYear()}-${L === 'kaa' ? 'jıl' : 'yil'} ${d.getDate()}-${m}`;
}

export function certificateSheet(c) {
  const url = `${location.origin}/sertifikat/${c.code}`;
  return `<div class="cert-sheet" id="cert">
    <div class="cert-inner">
      <div class="cert-head">
        <div class="cert-brand"><img src="/img/logo.svg" alt="">EduTest</div>
        <div class="cert-kind">${t('SERTIFIKAT')}</div>
      </div>
      <div class="cert-body">
        <p class="cert-small">${t('Ushbu sertifikat')}</p>
        <h2 class="cert-name">${esc(c.name)}</h2>
        <p class="cert-text">${t('«{subject}» fanidan «{test}» imtihonini muvaffaqiyatli topshirgani uchun berildi.', { subject: esc(c.subject), test: esc(c.test) })}</p>
        <div class="cert-score">
          <div><b>${c.percent}%</b><span>${t('natija')}</span></div>
          <div><b>${c.mark}</b><span>${esc(t(MARKS[c.mark]))}</span></div>
        </div>
      </div>
      <div class="cert-foot">
        <div class="cert-meta">
          <div><span>${t('Berilgan sana')}</span><b>${esc(longDate(c.issuedAt))}</b></div>
          <div><span>${t('Sertifikat raqami')}</span><b class="num">${esc(c.code)}</b></div>
          <div class="cert-sign"><span class="line"></span>${t('EduTest onlayn test platformasi')}</div>
        </div>
        <div class="cert-qr">${qrSvg(url, { label: t('Tekshirish havolasi') })}<span>${t('Haqiqiyligini tekshirish uchun skanerlang')}</span></div>
      </div>
    </div>
  </div>`;
}

export default async function certificate(main, { code }, { setTitle, navigate }) {
  setTitle(t('Sertifikat'));
  const checkForm = (value = '', err = '') => `<form class="panel panel-pad stack cert-check" id="chk" novalidate>
      <h2 style="font-size:1.2rem">${t('Sertifikatni tekshirish')}</h2>
      <p class="muted small">${t('Sertifikatdagi raqamni kiriting, masalan EDU-K7M2-QX9A.')}</p>
      <div class="row"><input class="input grow upper" id="code" value="${esc(value)}" placeholder="EDU-XXXX-XXXX" maxlength="20" autocomplete="off">
        <button class="btn">${icon('search')} ${t('Tekshirish')}</button></div>
      ${err ? `<p class="form-error">${esc(err)}</p>` : ''}
    </form>`;
  const bindForm = () => main.querySelector('#chk')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = main.querySelector('#code').value.trim().toUpperCase();
    if (v) navigate(`/sertifikat/${encodeURIComponent(v)}`);
  });

  if (!code) {
    main.innerHTML = `<div class="wrap page" style="max-width:640px">${checkForm()}</div>`;
    bindForm();
    return;
  }

  let c;
  try { c = (await get(`/api/certificates/${encodeURIComponent(code)}`)).certificate; }
  catch (e) {
    if (e.status !== 404) throw e;
    main.innerHTML = `<div class="wrap page stack" style="max-width:640px;--gap:20px">
      <div class="notice notice-bad">${icon('alert')}<div><b>${t('Sertifikat topilmadi.')}</b> ${t("Bunday raqamli sertifikat EduTest'da berilmagan yoki bekor qilingan.")}</div></div>
      ${checkForm(code)}</div>`;
    bindForm();
    return;
  }
  setTitle(t('Sertifikat: {name}', { name: c.name }));
  main.innerHTML = `<div class="wrap page cert-page">
    <div class="cert-toolbar no-print">
      <div class="notice notice-good">${icon('shield')}<div><b>${t('Haqiqiy sertifikat.')}</b> ${t("EduTest bazasida ro'yxatdan o'tgan, natija o'zgartirilmagan.")}</div></div>
      <div class="row">
        <button class="btn" id="print">${icon('download')} ${t('PDF saqlash yoki chop etish')}</button>
        <button class="btn btn-ghost" id="copy">${icon('copy')} ${t('Havolani nusxalash')}</button>
      </div>
      <p class="tiny muted">${t('PDF uchun chop etish oynasida «PDF sifatida saqlash»ni tanlang.')}</p>
    </div>
    <div class="cert-scroll">${certificateSheet(c)}</div>
  </div>`;
  main.querySelector('#print').addEventListener('click', () => window.print());
  main.querySelector('#copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(`${location.origin}/sertifikat/${c.code}`); toast(t('Havola nusxalandi'), 'good'); }
    catch { toast(`${location.origin}/sertifikat/${c.code}`); }
  });
  // Kichik ekranda sertifikat butunligicha ko'rinishi uchun kichraytiriladi (chop etishda asl o'lchamda)
  const box = main.querySelector('.cert-scroll');
  const sheet = box.querySelector('.cert-sheet');
  const fit = () => {
    const k = Math.min(1, box.clientWidth / 1000);
    sheet.style.transform = k < 1 ? `scale(${k})` : '';
    sheet.style.transformOrigin = 'top left';
    sheet.style.margin = k < 1 ? '0' : '';
    box.style.height = k < 1 ? `${sheet.offsetHeight * k}px` : '';
  };
  fit();
  window.addEventListener('resize', fit);
  document.body.classList.add('cert-mode');
  return () => { document.body.classList.remove('cert-mode'); window.removeEventListener('resize', fit); };
}
