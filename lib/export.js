'use client';
/**
 * lib/export.js – Tabellen als CSV, Excel (.xlsx) oder PDF herunterladen (alles im Browser)
 *
 *   exportieren('csv' | 'xlsx' | 'pdf', { titel, spalten: ['Monat', 'Störungen'], zeilen: [['Jan', 12], …], bild })
 *
 *  - CSV: Semikolon als Trenner und BOM am Anfang – so öffnet deutsches Excel Umlaute und Spalten richtig.
 *  - Excel: echte .xlsx-Datei. Eine .xlsx ist ein ZIP-Archiv mit ein paar XML-Dateien; das ZIP wird hier
 *    ohne Bibliothek gebaut (ohne Komprimierung, „stored“, mit CRC32-Prüfsumme). Zahlen bleiben Zahlen.
 *  - PDF: Druckansicht mit Titel, Diagramm-Bild (falls vorhanden) und Tabelle in einem unsichtbaren
 *    Rahmen; der Druckdialog des Browsers bietet „Als PDF speichern“.
 */

// Dateiname nur aus ASCII-Zeichen: Chrome verwirft Namen mit Umlauten teils und speichert dann „download“
const UMLAUTE = { ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss' };
const dateiName = (titel, endung) => `${(titel || 'export').replace(/[äöüÄÖÜß]/g, (z) => UMLAUTE[z])
  .normalize('NFKD').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'export'}.${endung}`;

function herunterladen(inhalt, typ, name) {
  const url = URL.createObjectURL(new Blob([inhalt], { type: typ }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  // Erst später aufräumen – sonst verliert Chrome teils den Dateinamen
  setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 4000);
}

/* ---------- CSV ---------- */
function csv({ titel, spalten, zeilen }) {
  const zelle = (w) => {
    const text = w === null || w === undefined ? '' : typeof w === 'number' ? String(w).replace('.', ',') : String(w);
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const text = [spalten, ...zeilen].map((z) => z.map(zelle).join(';')).join('\r\n');
  herunterladen(`﻿${text}`, 'text/csv;charset=utf-8', dateiName(titel, 'csv'));
}

/* ---------- Excel (.xlsx) ---------- */
const CRC_TABELLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABELLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** ZIP ohne Komprimierung aus { name: text } */
function zip(dateien) {
  const enc = new TextEncoder();
  const teile = [];
  const verzeichnis = [];
  let versatz = 0;
  for (const [name, text] of Object.entries(dateien)) {
    const n = enc.encode(name);
    const d = enc.encode(text);
    const crc = crc32(d);
    const kopf = new DataView(new ArrayBuffer(30));
    kopf.setUint32(0, 0x04034b50, true); kopf.setUint16(4, 20, true); kopf.setUint16(6, 0x0800, true);   // UTF-8-Namen
    kopf.setUint32(14, crc, true); kopf.setUint32(18, d.length, true); kopf.setUint32(22, d.length, true);
    kopf.setUint16(26, n.length, true);
    teile.push(new Uint8Array(kopf.buffer), n, d);
    const z = new DataView(new ArrayBuffer(46));
    z.setUint32(0, 0x02014b50, true); z.setUint16(4, 20, true); z.setUint16(6, 20, true); z.setUint16(8, 0x0800, true);
    z.setUint32(16, crc, true); z.setUint32(20, d.length, true); z.setUint32(24, d.length, true);
    z.setUint16(28, n.length, true); z.setUint32(42, versatz, true);
    verzeichnis.push(new Uint8Array(z.buffer), n);
    versatz += 30 + n.length + d.length;
  }
  const groesse = verzeichnis.reduce((s, x) => s + x.length, 0);
  const ende = new DataView(new ArrayBuffer(22));
  ende.setUint32(0, 0x06054b50, true);
  ende.setUint16(8, verzeichnis.length / 2, true); ende.setUint16(10, verzeichnis.length / 2, true);
  ende.setUint32(12, groesse, true); ende.setUint32(16, versatz, true);
  return new Blob([...teile, ...verzeichnis, new Uint8Array(ende.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const xml = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function spaltenName(i) { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; }

function xlsx({ titel, spalten, zeilen }) {
  const zeile = (werte, r) => `<row r="${r}">${werte.map((w, c) => {
    const ref = `${spaltenName(c)}${r}`;
    if (typeof w === 'number' && Number.isFinite(w)) return `<c r="${ref}"><v>${w}</v></c>`;
    return `<c r="${ref}" t="inlineStr"${r === 1 ? ' s="1"' : ''}><is><t>${xml(w ?? '')}</t></is></c>`;
  }).join('')}</row>`;
  const blatt = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${spalten.map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${i === 0 ? 34 : 16}" customWidth="1"/>`).join('')}</cols><sheetData>${[spalten, ...zeilen].map((z, i) => zeile(z, i + 1)).join('')}</sheetData></worksheet>`;
  const blattName = xml((titel || 'Export').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
  const datei = zip({
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${blattName}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    // Zwei Schriftarten: normal und fett (für die Kopfzeile, Stil s="1")
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>',
    'xl/worksheets/sheet1.xml': blatt,
  });
  herunterladen(datei, datei.type, dateiName(titel, 'xlsx'));
}

/* ---------- PDF über den Druckdialog ---------- */
function pdf({ titel, spalten, zeilen, bild, unterzeile }) {
  const rahmen = document.createElement('iframe');
  rahmen.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.appendChild(rahmen);
  const doc = rahmen.contentDocument;
  doc.open();
  doc.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${xml(titel)}</title><style>
    body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;color:#111;margin:24px}
    h1{font-size:20px;margin:0 0 4px} p{color:#555;font-size:12px;margin:0 0 16px}
    img{max-width:100%;max-height:340px;display:block;margin:0 0 16px}
    table{border-collapse:collapse;width:100%;font-size:12px} th,td{border-bottom:1px solid #ddd;padding:6px 8px;text-align:left}
    th{background:#f2f2f2} td.z{text-align:right;font-variant-numeric:tabular-nums}</style></head><body>
    <h1>${xml(titel)}</h1><p>${xml(unterzeile ?? '')}</p>${bild ? `<img src="${bild}" alt="">` : ''}
    <table><thead><tr>${spalten.map((s) => `<th>${xml(s)}</th>`).join('')}</tr></thead><tbody>
    ${zeilen.map((z) => `<tr>${z.map((w) => `<td${typeof w === 'number' ? ' class="z"' : ''}>${xml(w ?? '')}</td>`).join('')}</tr>`).join('')}
    </tbody></table></body></html>`);
  doc.close();
  const drucken = () => { rahmen.contentWindow.focus(); rahmen.contentWindow.print(); setTimeout(() => rahmen.remove(), 60000); };
  // Bild erst laden lassen, dann drucken
  const img = doc.querySelector('img');
  if (img && !img.complete) img.onload = drucken; else setTimeout(drucken, 50);
}

export function exportieren(format, daten) {
  if (format === 'csv') csv(daten);
  else if (format === 'xlsx') xlsx(daten);
  else pdf(daten);
}
