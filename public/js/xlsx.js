// Excel (.xlsx) va CSV fayllarni brauzerning o'zida o'qish — kutubxonasiz.
// .xlsx — bu ZIP arxiv ichidagi XML fayllar; ZIP "deflate" bo'laklari DecompressionStream bilan ochiladi.

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function unzip(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  // Markaziy katalog oxiri (EOCD) yozuvini oxiridan qidiramiz
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('zip');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const files = {};
  const dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    files[name] = { method, csize, local };
    p += 46 + nlen + xlen + clen;
  }
  return {
    has: (n) => n in files,
    async text(n) {
      const f = files[n];
      if (!f) return null;
      const start = f.local + 30 + dv.getUint16(f.local + 26, true) + dv.getUint16(f.local + 28, true);
      const raw = u8.subarray(start, start + f.csize);
      const out = f.method === 0 ? raw : f.method === 8 ? await inflate(raw) : null;
      if (!out) throw new Error('zip-method');
      return dec.decode(out);
    },
  };
}

const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
const colIndex = (ref) => {
  const letters = /^[A-Z]+/.exec(ref)?.[0] || 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};
// Matn ichidagi barcha <t> bo'laklarini birlashtirish (formatlangan matnlar bir nechta bo'lakda bo'ladi)
const textOf = (el) => [...el.getElementsByTagName('t')].map((x) => x.textContent).join('');

export async function readXlsx(buf) {
  const zip = await unzip(buf);
  const shared = [];
  const ss = await zip.text('xl/sharedStrings.xml');
  if (ss) for (const si of xml(ss).getElementsByTagName('si')) shared.push(textOf(si));

  // Birinchi varaq faylini topish
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const wb = await zip.text('xl/workbook.xml');
  const rels = await zip.text('xl/_rels/workbook.xml.rels');
  if (wb && rels) {
    const first = xml(wb).getElementsByTagName('sheet')[0];
    const rid = first?.getAttribute('r:id') || first?.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    for (const r of xml(rels).getElementsByTagName('Relationship')) {
      if (r.getAttribute('Id') === rid) {
        const target = r.getAttribute('Target').replace(/^\//, '');
        sheetPath = target.startsWith('xl/') ? target : `xl/${target}`;
      }
    }
  }
  const sheet = await zip.text(sheetPath);
  if (!sheet) throw new Error('sheet');
  const rows = [];
  for (const row of xml(sheet).getElementsByTagName('row')) {
    const out = [];
    for (const c of row.getElementsByTagName('c')) {
      const type = c.getAttribute('t');
      const v = c.getElementsByTagName('v')[0]?.textContent ?? '';
      let val;
      if (type === 's') val = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') val = textOf(c);
      else val = v;
      out[colIndex(c.getAttribute('r') || '')] = String(val).trim();
    }
    rows.push(Array.from(out, (x) => x ?? ''));
  }
  return rows;
}

// CSV: ; yoki , ajratgich, qo'shtirnoqli maydonlar
export function readCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/)[0] || '';
  const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) { row.push(cell.trim()); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell.trim()); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell.trim()); rows.push(row); }
  return rows;
}

// Jadval qatorlarini savollarga aylantirish.
// Ustunlar: Savol | To'g'ri javob | Noto'g'ri 1 | Noto'g'ri 2 | Noto'g'ri 3 | Noto'g'ri 4 | Izoh | Qiyinlik (1–3)
export function rowsToQuestions(rows) {
  const out = [];
  const errors = [];
  rows.forEach((r, i) => {
    const cells = r.map((x) => String(x ?? '').trim());
    if (!cells.some(Boolean)) return;
    // Sarlavha qatorini tashlab ketamiz
    if (i === 0 && /savol|вопрос|question|soraw/i.test(cells[0]) && /to.?g.?ri|правил|correct|duris/i.test(cells[1] || '')) return;
    const [text, right, w1, w2, w3, w4, explanation, diff] = cells;
    const wrong = [w1, w2, w3, w4].filter(Boolean);
    if (!text || !right || !wrong.length) { errors.push(i + 1); return; }
    const d = Number(String(diff || '').replace(/[^\d]/g, ''));
    out.push({ text, options: [right, ...wrong], explanation: explanation || '', difficulty: [1, 2, 3].includes(d) ? d : 2 });
  });
  return { questions: out, errors };
}
