// Interfeys tili: o'zbek (asosiy), rus, qoraqalpoq.
// t('O'zbekcha matn', { n: 5 }) — kalit o'zbekcha matnning o'zi; tarjima topilmasa o'zbekcha ko'rinadi.
import DICT from './i18n-dict.js';

export const LANGS = [
  { code: 'uz', short: 'UZ', name: "O'zbekcha", html: 'uz' },
  { code: 'ru', short: 'RU', name: 'Русский', html: 'ru' },
  { code: 'kaa', short: 'QQ', name: 'Qaraqalpaqsha', html: 'kaa' },
];
const CODES = LANGS.map((l) => l.code);
const IDX = { ru: 0, kaa: 1 };

function readCookie(name) {
  const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

function initial() {
  let saved = null;
  try { saved = localStorage.getItem('lang'); } catch { /* xotira yopiq bo'lishi mumkin */ }
  saved = saved || readCookie('lang');
  if (CODES.includes(saved)) return saved;
  const nav = (navigator.language || '').toLowerCase();
  if (nav.startsWith('ru')) return 'ru';
  if (nav.startsWith('kaa')) return 'kaa';
  return 'uz';
}

let current = initial();

function persist(code) {
  try { localStorage.setItem('lang', code); } catch { /* */ }
  // Server ham shu tilda javob berishi uchun (CSV eksport, sahifa yangilanganda)
  document.cookie = `lang=${code}; path=/; max-age=31536000; SameSite=Lax`;
  document.documentElement.lang = LANGS.find((l) => l.code === code).html;
}
persist(current);

export const getLang = () => current;

export function setLang(code) {
  if (!CODES.includes(code) || code === current) return false;
  current = code;
  persist(code);
  return true;
}

export function t(key, params) {
  const row = current === 'uz' ? null : DICT[key];
  let s = row ? (row[IDX[current]] ?? key) : key;
  if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] !== undefined ? params[k] : m));
  return s;
}

// Oy nomlari (sanalar uchun)
const MONTHS = {
  uz: ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'],
  ru: ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'],
  kaa: ['yan', 'fev', 'mar', 'apr', 'may', 'iyun', 'iyul', 'avg', 'sen', 'okt', 'noy', 'dek'],
};
export const months = () => MONTHS[current];
