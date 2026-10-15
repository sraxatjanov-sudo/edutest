// Kiruvchi ma'lumotlarni tekshirish yordamchilari. Xato matnlari tarjima kalitlari (lib/i18n.js).
const { HttpError } = require('./http');

function str(v, name, { min = 0, max = 500, required = true } = {}) {
  const s = String(v ?? '').trim();
  if (!s && !required) return '';
  if (s.length < Math.max(min, required ? 1 : 0)) throw new HttpError(400, '{name}: kamida {min} ta belgi kiriting', { name, min: Math.max(min, 1) });
  if (s.length > max) throw new HttpError(400, '{name}: {max} belgidan oshmasin', { name, max });
  return s;
}

function int(v, name, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, '{name}: {min} dan {max} gacha butun son kiriting', { name, min, max });
  return n;
}

function email(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) || s.length > 120) throw new HttpError(400, "Email manzili noto'g'ri");
  return s;
}

function bool(v) { return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0; }

function options(list, label) {
  const opts = (Array.isArray(list) ? list : []).map((o) => String(o ?? '').trim());
  if (opts.length < 2 || opts.length > 6) throw new HttpError(400, "{label}: 2 tadan 6 tagacha variant bo'lsin", { label });
  if (opts.some((o) => !o)) throw new HttpError(400, "{label}: bo'sh variantlarni to'ldiring yoki o'chiring", { label });
  if (opts.some((o) => o.length > 300)) throw new HttpError(400, '{label}: variant 300 belgidan oshmasin', { label });
  if (new Set(opts.map((o) => o.toLowerCase())).size !== opts.length) throw new HttpError(400, '{label}: variantlar takrorlanmasin', { label });
  return opts;
}

// Ixtiyoriy tarjimalar: { ru: { text, options, explanation }, kaa: {...} }. Bo'sh tarjimalar tashlab yuboriladi.
function translations(tr, base, n) {
  const out = {};
  for (const lang of ['ru', 'kaa']) {
    const x = tr && tr[lang];
    if (!x) continue;
    const text = String(x.text ?? '').trim();
    const opts = (Array.isArray(x.options) ? x.options : []).map((o) => String(o ?? '').trim());
    const explanation = String(x.explanation ?? '').trim();
    if (!text && opts.every((o) => !o) && !explanation) continue;
    const label = { key: '{n}-savol ({lang} tarjima)', params: { n, lang: lang === 'ru' ? 'RU' : 'QQ' } };
    if (text.length < 3) throw new HttpError(400, '{name}: kamida {min} ta belgi kiriting', { name: label, min: 3 });
    if (text.length > 1000) throw new HttpError(400, '{name}: {max} belgidan oshmasin', { name: label, max: 1000 });
    if (opts.length !== base.options.length) throw new HttpError(400, "{label}: tarjimada variantlar soni asosiy variantlarga teng bo'lsin", { label });
    out[lang] = { text, options: options(opts, label), ...(explanation ? { explanation: explanation.slice(0, 1000) } : {}) };
  }
  return Object.keys(out).length ? out : null;
}

function question(q, i = 0) {
  const n = i + 1;
  const text = str(q.text, { key: '{n}-savol matni', params: { n } }, { min: 3, max: 1000 });
  const opts = options(q.options, { key: '{n}-savol', params: { n } });
  const correct = int(q.correct, { key: "{n}-savol to'g'ri javobi", params: { n } }, { min: 0, max: opts.length - 1 });
  const explanation = str(q.explanation, { key: '{n}-savol izohi', params: { n } }, { max: 1000, required: false });
  const difficulty = int(q.difficulty ?? 2, { key: '{n}-savol qiyinligi', params: { n } }, { min: 1, max: 3 });
  const base = { text, options: opts, correct, explanation: explanation || null, difficulty };
  base.i18n = translations(q.i18n, base, n);
  return base;
}

module.exports = { str, int, email, bool, question };
