// Lee los Excel de resultados de Joventura («Datos, Comentarios G. e Incidencias…») y los resume para el cierre del evento.
import ExcelJS from 'exceljs';

const val = (c) => { let v = c; if (v && typeof v === 'object' && !(v instanceof Date)) v = v.result ?? v.text ?? (v.richText ? v.richText.map((t) => t.text).join('') : ''); return v ?? null; };
const text = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const num = (v) => (typeof v === 'number' ? v : typeof v === 'string' && /^-?\d+([.,]\d+)?$/.test(v.trim()) ? Number(v.replace(',', '.')) : null);
const MONEY = /€|euro|importe|dat[aá]fono|cash|efectivo|tarjeta|cobr|factur|ingres/i;   // los importes no se copian al cierre: se ven solo con la sesión desbloqueada
const isTitle = (s) => /^(datos disfrutones|disfrutones|comentarios generales|incidencias|inicidencias|operadores)\b/i.test(s) || /^del \d+ al \d+ de /i.test(s);

export function isResultsFile(name) { return /\.xlsx$/i.test(name || '') && /(datos.*comentarios|incidencias|resultados)/i.test(name || ''); }

export async function analyzeResults(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const out = { period: null, title: null, table: [], participants: null, participants_label: '', summary: '', incidents: [], comments: [] };
  for (const ws of wb.worksheets) {
    const rows = [];
    ws.eachRow({ includeEmpty: false }, (row) => rows.push(Array.from(row.values.slice(1), val)));   // posición = columna (las celdas combinadas repiten el valor en la primera)
    const name = ws.name;
    if (/inicidencia|inciden/i.test(name)) { for (const r of rows) for (const c of [...new Set(r.map(text))]) if (c.length > 20 && !isTitle(c)) out.incidents.push(c); continue; }
    if (/coment/i.test(name)) { for (const r of rows) for (const c of [...new Set(r.map(text))]) if (c.length > 8 && !isTitle(c)) out.comments.push(c); continue; }
    if (/operadores/i.test(name)) continue;
    // hoja de datos: cabecera = fila cuya primera celda con contenido es «DÍA»
    const hi = rows.findIndex((r) => /^d[ií]a$/i.test(text(r.find((c) => text(c)))));
    for (const r of rows.slice(0, hi < 0 ? rows.length : hi)) { const t = text(r.find((c) => text(c))); if (/^datos disfrutones/i.test(t)) out.title ??= t.replace(/^datos disfrutones\s*-?\s*/i, ''); if (/^del \d+ al \d+ de/i.test(t)) out.period ??= t; }
    if (hi < 0) continue;
    const head = rows[hi].map(text);
    const col = (re) => head.findIndex((h) => re.test(h));
    const dayCol = head.findIndex((h) => /^d[ií]a$/i.test(h));
    for (const r of rows.slice(hi + 1)) {
      const label = text(r[dayCol]);
      if (!label || /^\d+$/.test(label)) continue;
      const values = {};
      head.forEach((h, i) => { if (i !== dayCol && h && !MONEY.test(h)) { const n = num(r[i]); if (n !== null) values[h] = n; } });
      if (Object.keys(values).length) out.table.push({ label, values });
    }
    const pCol = col(/participaciones/i) >= 0 ? col(/participaciones/i) : col(/entradas vendidas/i);
    if (pCol >= 0) {
      const key = head[pCol];
      const totals = out.table.filter((t) => /total|app/i.test(t.label) && t.values[key] != null);
      const last = totals[totals.length - 1];
      if (last) { out.participants = last.values[key]; out.participants_label = `${key} (${last.label.trim()})`; }
    }
  }
  const lines = [];
  if (out.period) lines.push(out.period.replace(/\s+/g, ' ').replace(/\.$/, '') + '.');
  for (const t of out.table) lines.push(`${t.label.trim()}: ${Object.entries(t.values).map(([k, v]) => `${k.toLowerCase()} ${v.toLocaleString('es-ES')}`).join(', ')}.`);
  out.summary = lines.join('\n');
  return out;
}
