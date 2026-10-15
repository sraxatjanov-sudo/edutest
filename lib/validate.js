// Kiruvchi ma'lumotlarni tekshirish yordamchilari
const { HttpError } = require('./http');

function str(v, name, { min = 0, max = 500, required = true } = {}) {
  const s = String(v ?? '').trim();
  if (!s && !required) return '';
  if (s.length < Math.max(min, required ? 1 : 0)) throw new HttpError(400, `${name}: kamida ${Math.max(min, 1)} ta belgi kiriting`);
  if (s.length > max) throw new HttpError(400, `${name}: ${max} belgidan oshmasin`);
  return s;
}

function int(v, name, { min = -Infinity, max = Infinity } = {}) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new HttpError(400, `${name}: ${min} dan ${max} gacha butun son kiriting`);
  return n;
}

function email(v) {
  const s = String(v ?? '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) || s.length > 120) throw new HttpError(400, 'Email manzili noto\'g\'ri');
  return s;
}

function bool(v) { return v === true || v === 1 || v === '1' || v === 'true' ? 1 : 0; }

function question(q, i = 0) {
  const label = `${i + 1}-savol`;
  const text = str(q.text, `${label} matni`, { min: 3, max: 1000 });
  const options = (Array.isArray(q.options) ? q.options : []).map((o) => String(o ?? '').trim());
  if (options.length < 2 || options.length > 6) throw new HttpError(400, `${label}: 2 tadan 6 tagacha variant bo'lsin`);
  if (options.some((o) => !o)) throw new HttpError(400, `${label}: bo'sh variantlarni to'ldiring yoki o'chiring`);
  if (options.some((o) => o.length > 300)) throw new HttpError(400, `${label}: variant 300 belgidan oshmasin`);
  if (new Set(options.map((o) => o.toLowerCase())).size !== options.length) throw new HttpError(400, `${label}: variantlar takrorlanmasin`);
  const correct = int(q.correct, `${label} to'g'ri javobi`, { min: 0, max: options.length - 1 });
  const explanation = str(q.explanation, `${label} izohi`, { max: 1000, required: false });
  const difficulty = int(q.difficulty ?? 2, `${label} qiyinligi`, { min: 1, max: 3 });
  return { text, options, correct, explanation: explanation || null, difficulty };
}

module.exports = { str, int, email, bool, question };
