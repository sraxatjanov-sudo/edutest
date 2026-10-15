// Savollarni Excel'dan import qilish uchun namuna fayl yaratadi: public/files/savollar-namuna.xlsx
// Ishga tushirish: node tools/make-template.js
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const rows = [
  ['Savol', "To'g'ri javob", "Noto'g'ri 1", "Noto'g'ri 2", "Noto'g'ri 3", "Noto'g'ri 4", 'Izoh', 'Qiyinlik (1-3)'],
  ['Suvning kimyoviy formulasi?', 'H₂O', 'CO₂', 'NaCl', 'O₂', '', 'Ikki vodorod va bitta kislorod atomi', 1],
  ['2 + 2 × 2 = ?', '6', '8', '4', '10', '', "Avval ko'paytirish bajariladi", 1],
  ["O'zbekiston poytaxti?", 'Toshkent', 'Samarqand', 'Buxoro', 'Xiva', 'Nukus', '', 1],
  ["Yorug'likning vakuumdagi tezligi taxminan?", '300 000 km/s', '30 000 km/s', '3 000 km/s', '340 m/s', '', '', 2],
];

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const col = (i) => String.fromCharCode(65 + i);
const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<cols><col min="1" max="1" width="48" customWidth="1"/><col min="2" max="6" width="18" customWidth="1"/><col min="7" max="7" width="36" customWidth="1"/><col min="8" max="8" width="14" customWidth="1"/></cols>
<sheetData>${rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => (v === '' ? '' : typeof v === 'number'
  ? `<c r="${col(ci)}${ri + 1}"${ri === 0 ? ' s="1"' : ''}><v>${v}</v></c>`
  : `<c r="${col(ci)}${ri + 1}" t="inlineStr"${ri === 0 ? ' s="1"' : ''}><is><t>${esc(v)}</t></is></c>`)).join('')}</row>`).join('')}</sheetData>
</worksheet>`;

const files = {
  '[Content_Types].xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
  '_rels/.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Savollar" sheetId="1" r:id="rId1"/></sheets>
</workbook>`,
  'xl/_rels/workbook.xml.rels': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  'xl/styles.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf/></cellStyleXfs>
<cellXfs count="2"><xf/><xf fontId="1" applyFont="1"/></cellXfs>
</styleSheet>`,
  'xl/worksheets/sheet1.xml': sheet,
};

// Oddiy ZIP yozuvchi (deflate bilan)
const parts = [], central = [];
let offset = 0;
for (const [name, content] of Object.entries(files)) {
  const data = Buffer.from(content, 'utf8');
  const comp = zlib.deflateRawSync(data);
  const crc = zlib.crc32(data);
  const nm = Buffer.from(name);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
  local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nm.length, 26);
  parts.push(local, nm, comp);
  const cd = Buffer.alloc(46);
  cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8); cd.writeUInt16LE(8, 10);
  cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(data.length, 24); cd.writeUInt16LE(nm.length, 28);
  cd.writeUInt32LE(offset, 42);
  central.push(cd, nm);
  offset += 30 + nm.length + comp.length;
}
const cdBuf = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
const out = path.join(__dirname, '..', 'public', 'files', 'savollar-namuna.xlsx');
fs.writeFileSync(out, Buffer.concat([...parts, cdBuf, end]));
console.log('Yaratildi:', out);
