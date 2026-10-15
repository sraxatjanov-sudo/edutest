// Interfeys lug'ati to'liqligi: har bir t('...') kaliti uchun ruscha va qoraqalpoqcha tarjima bor
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { extract } = require('./extract-keys');

const dictSrc = fs.readFileSync(path.join(__dirname, '..', 'public', 'js', 'i18n-dict.js'), 'utf8').replace('export default', 'return');
const DICT = new Function(dictSrc)();
// Kodda bevosita emas, lug'at obyektlari orqali chaqiriladigan kalitlar (ui.js dagi lazy)
const INDIRECT = ['Aralash', 'Oson', "O'rta", 'Qiyin', 'Talaba', "O'qituvchi", 'Administrator', 'Topshirildi', 'Vaqt tugadi',
  'Qoidabuzarlik sababli yakunlandi', "Umumiy ko'rinish", 'Savollar banki', 'Testlar', 'Natijalar', 'Fanlar', 'Foydalanuvchilar', 'Guruhlar',
  "A'lo", 'Yaxshi', 'Qoniqarli', 'Qoniqarsiz'];
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('har bir interfeys matni tarjima qilingan', () => {
  const keys = [...extract(path.join(__dirname, '..', 'public', 'js')), ...INDIRECT].filter((k) => /[A-Za-z]{2}/.test(k));
  const missing = keys.filter((k) => !DICT[k]);
  assert.deepEqual(missing, [], `Tarjimasi yo'q: ${missing.join(' | ')}`);
});

test("tarjimalar to'g'ri tuzilgan", () => {
  for (const [k, v] of Object.entries(DICT)) {
    assert.ok(Array.isArray(v) && v.length === 2 && v[0] && v[1], `Noto'g'ri yozuv: ${k}`);
    assert.equal(placeholders(v[0]), placeholders(k), `RU o'rinbosarlar mos emas: ${k}`);
    assert.equal(placeholders(v[1]), placeholders(k), `QQ o'rinbosarlar mos emas: ${k}`);
    assert.ok(!/[А-Яа-яЁё]/.test(v[1]), `Qoraqalpoqcha matnda kirill harfi: ${k}`);
  }
});
