'use strict';
// Bağımlılıksız, minimal XLSX üretici. sayfalar: [{ ad, basliklar:[..], satirlar:[[..]], genislik:[..] }]
const zlib = require('zlib');

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xFFFFFFFF; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

function zip(dosyalar) {
  const yerel = [], merkez = []; let ofset = 0;
  for (const { ad, veri } of dosyalar) {
    const adB = Buffer.from(ad, 'utf8');
    const sik = zlib.deflateRawSync(veri);
    const crc = crc32(veri);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(8, 8);
    h.writeUInt32LE(0, 10); h.writeUInt32LE(crc, 14); h.writeUInt32LE(sik.length, 18); h.writeUInt32LE(veri.length, 22);
    h.writeUInt16LE(adB.length, 26); h.writeUInt16LE(0, 28);
    yerel.push(h, adB, sik);
    const m = Buffer.alloc(46);
    m.writeUInt32LE(0x02014b50, 0); m.writeUInt16LE(20, 4); m.writeUInt16LE(20, 6); m.writeUInt16LE(0x0800, 8); m.writeUInt16LE(8, 10);
    m.writeUInt32LE(0, 12); m.writeUInt32LE(crc, 16); m.writeUInt32LE(sik.length, 20); m.writeUInt32LE(veri.length, 24);
    m.writeUInt16LE(adB.length, 28); m.writeUInt32LE(ofset, 42);
    merkez.push(m, adB);
    ofset += 30 + adB.length + sik.length;
  }
  const mb = Buffer.concat(merkez);
  const son = Buffer.alloc(22);
  son.writeUInt32LE(0x06054b50, 0); son.writeUInt16LE(dosyalar.length, 8); son.writeUInt16LE(dosyalar.length, 10);
  son.writeUInt32LE(mb.length, 12); son.writeUInt32LE(ofset, 16);
  return Buffer.concat([...yerel, mb, son]);
}

const kac = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
function sutunAdi(i) { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

function hucre(v, r, c, stil) {
  const ref = sutunAdi(c) + r;
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${stil ? ` s="${stil}"` : ''}><v>${v}</v></c>`;
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s; // formül enjeksiyonu önlemi
  return `<c r="${ref}" t="inlineStr"${stil ? ` s="${stil}"` : ''}><is><t xml:space="preserve">${kac(s)}</t></is></c>`;
}

function sayfaXml(s) {
  const satirlar = [];
  let r = 1;
  if (s.ust) for (const u of s.ust) { satirlar.push(`<row r="${r}">${hucre(u, r, 0, 3)}</row>`); r++; }
  if (s.ust && s.ust.length) r++;
  const basR = r;
  satirlar.push(`<row r="${r}">${s.basliklar.map((b, i) => hucre(b, r, i, 1)).join('')}</row>`); r++;
  for (const satir of s.satirlar) {
    satirlar.push(`<row r="${r}">${satir.map((v, i) => hucre(v, r, i, typeof v === 'number' && s.para && s.para.includes(i) ? 2 : 0)).join('')}</row>`); r++;
  }
  const gen = s.basliklar.map((b, i) => `<col min="${i + 1}" max="${i + 1}" width="${(s.genislik && s.genislik[i]) || Math.min(45, Math.max(10, String(b).length + 4))}" customWidth="1"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
    `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${basR}" topLeftCell="A${basR + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` +
    `<cols>${gen}</cols><sheetData>${satirlar.join('')}</sheetData>` +
    (s.satirlar.length ? `<autoFilter ref="A${basR}:${sutunAdi(s.basliklar.length - 1)}${basR + s.satirlar.length}"/>` : '') + `</worksheet>`;
}

function olustur(sayfalar) {
  const kullanilan = new Set();
  const adlar = sayfalar.map(s => {
    let a = String(s.ad || 'Sayfa').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sayfa';
    let i = 2; while (kullanilan.has(a)) a = a.slice(0, 28) + ' ' + i++;
    kullanilan.add(a); return a;
  });
  const B = (s) => Buffer.from(s, 'utf8');
  const dosyalar = [
    { ad: '[Content_Types].xml', veri: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sayfalar.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`) },
    { ad: '_rels/.rels', veri: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`) },
    { ad: 'xl/workbook.xml', veri: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${adlar.map((a, i) => `<sheet name="${kac(a)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`) },
    { ad: 'xl/_rels/workbook.xml.rels', veri: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sayfalar.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sayfalar.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`) },
    { ad: 'xl/styles.xml', veri: B(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="13"/><color rgb="FF14213D"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF14213D"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="4"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/><xf numFmtId="164" applyNumberFormat="1"/><xf fontId="2" applyFont="1"/></cellXfs></styleSheet>`) },
    ...sayfalar.map((s, i) => ({ ad: `xl/worksheets/sheet${i + 1}.xml`, veri: B(sayfaXml(s)) })),
  ];
  return zip(dosyalar);
}

const XLSX_TIP = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
module.exports = { olustur, XLSX_TIP, zip, crc32 };
