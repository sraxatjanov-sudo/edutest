// Tarjimalar asosiy savollar bilan mosligini tekshirish: npm test
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const QDIR = path.join(__dirname, '..', 'db', 'questions');
const TDIR = path.join(QDIR, 'i18n');
const subjects = fs.readdirSync(QDIR).filter((f) => f.endsWith('.js'));

// Harf yo'q bo'lsa (raqam, formula) — tarjimada ham aynan shunday bo'lishi kerak
const isLanguageFree = (s) => !/[A-Za-zА-Яа-яЁёʻʼ'ÁáǴǵÍıŃńÓóÚú]/.test(s.replace(/\b(sin|cos|tg|log|lim|C|x|y|a|b|d|n|q|r|S|V|D|f|k|e|π)\b/g, ''));

for (const file of subjects) {
  const base = require(path.join(QDIR, file));
  test(`tarjima: ${base.slug}`, () => {
    if (base.keepOriginal) return; // Rus tili savollari o'z tilida qoladi
    const tf = path.join(TDIR, file);
    assert.ok(fs.existsSync(tf), `${file} uchun tarjima fayli yo'q`);
    const tr = require(tf);
    for (const lang of ['ru', 'kaa']) {
      assert.ok(tr[lang]?.name, `${file} ${lang}: fan nomi yo'q`);
      if (base.slug === 'ingliz-tili') continue; // Ingliz tili savollari tarjima qilinmaydi
      const qs = tr[lang].questions;
      assert.equal(qs.length, base.questions.length, `${file} ${lang}: savollar soni mos emas`);
      qs.forEach((q, i) => {
        const b = base.questions[i];
        const where = `${file} ${lang} #${i + 1}`;
        assert.ok(typeof q[0] === 'string' && q[0].length >= 3, `${where}: savol matni`);
        if (lang === 'kaa') {
          const flat = [q[0], q[1], ...q[2], q[3] || ''].join(' ');
          assert.ok(!/[А-Яа-яЁё]/.test(flat), `${where}: qoraqalpoqcha matnda kirill harfi bor`);
        }
        assert.equal(q[2].length, b[2].length, `${where}: variantlar soni`);
        const all = [q[1], ...q[2]];
        assert.equal(new Set(all.map((x) => x.toLowerCase())).size, all.length, `${where}: variantlar takrorlanadi`);
        [b[1], ...b[2]].forEach((bo, k) => {
          if (isLanguageFree(bo)) assert.equal(all[k], bo, `${where}: raqamli variant o'zgargan (${bo} → ${all[k]})`);
        });
      });
    }
  });
}
