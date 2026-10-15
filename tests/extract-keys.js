// Interfeysdagi barcha t('...') kalitlarini yig'ish (lug'at to'liqligini tekshirish uchun)
const fs = require('node:fs');
const path = require('node:path');

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? files(path.join(dir, d.name)) : d.name.endsWith('.js') && d.name !== 'i18n-dict.js' ? [path.join(dir, d.name)] : []);
}

function extract(root) {
  const keys = new Set();
  const re = /\bt\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\$]|\\.)*`)/g;
  for (const f of files(root)) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(re)) keys.add(new Function('return ' + m[1])());
  }
  return keys;
}

module.exports = { extract };
if (require.main === module) {
  const keys = [...extract(path.join(__dirname, '..', 'public', 'js'))].sort();
  console.log(JSON.stringify(keys, null, 1));
}
