// Pasa los adjuntos de las tareas de Notion a la carpeta de Drive de cada acción (Creatividades / Documentación / Producción).
// Uso: node scripts/notion-files-to-drive.mjs [--dry]     (--dry solo cuenta, no descarga ni sube). Se puede repetir: lo ya subido se omite.
import fs from 'node:fs';
import 'dotenv/config';
import { q, closeDb } from '../src/db.js';
import { ensureFolder, listChildren, uploadFile, driveEnabled } from '../src/drive.js';

const DRY = process.argv.includes('--dry');
const YEARS = (process.argv.find((a) => a.startsWith('--anios=')) || '--anios=2026').slice(8).split(',').map(Number);   // p. ej. --anios=2023,2024,2025
if (!process.env.NOTION_TOKEN) throw new Error('Falta NOTION_TOKEN en .env');
if (!DRY && !driveEnabled()) throw new Error('Falta GOOGLE_SA_FILE');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const notion = async (path) => {
  for (let i = 0; i < 6; i++) {
    const r = await fetch(`https://api.notion.com/v1${path}`, { headers: { Authorization: `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' }, signal: AbortSignal.timeout(30_000) });
    if (r.status === 429) { await sleep((Number(r.headers.get('retry-after')) || 2) * 1000 + 500); continue; }   // Notion limita las llamadas: se espera y se reintenta
    if (!r.ok) throw Object.assign(new Error(`Notion ${r.status}`), { status: r.status });
    await sleep(350); return r.json();
  }
  throw new Error('Notion sigue limitando las llamadas');
};
// Solo se consultan las tareas que tenían adjuntos

// Dónde va cada archivo: los diseños y piezas de comunicación a Creatividades; presupuestos, bases, permisos, facturas y resultados a Documentación.
const folderFor = (section, name) => {
  if (/producci[oó]n|imprenta/i.test(name)) return 'Producción';
  if (/\.(mp3|mp4|mov|png|jpe?g|gif)$/i.test(name) && !/captura|screenshot/i.test(name)) return 'Creatividades';
  if (/presu|PR-AN|BBLL|bases|factura|alban|certif|plan|permiso|resolu|circular|resumen|datos|incidencias|\.(xlsx?|docx?|csv)$/i.test(name)) return 'Documentación';
  if (section === 'Creatividades' || section === 'Medios') return 'Creatividades';
  return 'Documentación';
};
const safe = (n) => String(n).replace(/[\\/:*?"<>|]/g, '-').slice(0, 180);

const rows = (await q(`select t.id, t.event_id, t.title, t.notion_id, s.name section, e.ref, e.drive_folder_id from tasks t join events e on e.id = t.event_id left join task_sections s on s.id = t.section_id where t.notion_id is not null and t.summary like '%Adjuntos en Notion:%' and e.drive_folder_id is not null and (e.year = any($1::int[])) order by e.seq, t.position`, [YEARS])).rows;
const subs = new Map();
const sub = async (ev, name) => { const k = `${ev.drive_folder_id}|${name}`; if (!subs.has(k)) subs.set(k, await ensureFolder(ev.drive_folder_id, name)); return subs.get(k); };
const existing = new Map();   // carpeta → { nombre → id }
const has = async (folderId) => { if (!existing.has(folderId)) existing.set(folderId, new Map((await listChildren(folderId)).map((f) => [f.name, f.id]))); return existing.get(folderId); };
const record = (t, name, folder, id, size, mime) => q('insert into task_files (task_id, event_id, name, folder, drive_file_id, size, mime) values ($1,$2,$3,$4,$5,$6,$7) on conflict do nothing', [t.id, t.event_id, name, folder, id, size ?? null, mime || '']);

let found = 0, up = 0, skipped = 0, failed = [];
console.error('tareas con archivos:', rows.length);
for (const t of rows) {
  if (process.env.DEBUG) console.error('→', t.ref, t.title);
  let page; try { page = await notion(`/pages/${t.notion_id}`); } catch (e) { if (e.status === 404) { failed.push(`${t.ref} · ${t.title}: la integración no ve la página`); continue; } throw e; }
  const files = page.properties?.Archivos?.files || [];
  for (const f of files) {
    found++;
    const url = f.file?.url || f.external?.url; if (!url) continue;
    const folderName = folderFor(t.section, f.name);
    if (DRY) { console.log(`${t.ref} · ${t.section ?? '—'} · ${f.name}  →  ${folderName}`); continue; }
    try {
      const folder = await sub(t, folderName), names = await has(folder), nm = safe(f.name);
      if (names.has(nm)) { await record(t, nm, folderName, names.get(nm)); skipped++; continue; }   // ya estaba en Drive: solo se enlaza a la tarea
      const r = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      if (!r.ok) throw new Error(`descarga ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer()), mime = r.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
      const up1 = await uploadFile(folder, nm, buf, mime);
      names.set(nm, up1.id); await record(t, nm, folderName, up1.id, buf.length, mime); up++; console.log(`✓ ${t.ref} ${folderName}/${f.name}`);
    } catch (e) { failed.push(`${t.ref} · ${f.name}: ${e.message}`); console.error('✗', t.ref, f.name, e.message); }
  }
}
// Adjuntos que estaban en la propia acción (2023: Archivos, Creatividades y Fotos Acción), sin tarea concreta
const evRows = (await q(`select e.id, e.ref, e.name, e.notion_id, e.drive_folder_id from events e where e.notion_id is not null and e.description like '%Adjuntos en Notion:%' and e.drive_folder_id is not null and e.year = any($1::int[]) order by e.seq`, [YEARS])).rows;
const EV_PROPS = { Archivos: 'Documentación', Creatividades: 'Creatividades', 'Fotos Acción': 'Fotografías' };
for (const e of evRows) {
  let page; try { page = await notion(`/pages/${e.notion_id}`); } catch (er) { failed.push(`${e.ref}: ${er.message}`); continue; }
  for (const [prop, folderName] of Object.entries(EV_PROPS)) for (const f of page.properties?.[prop]?.files || []) {
    found++;
    const url = f.file?.url || f.external?.url; if (!url) continue;
    if (DRY) { console.log(`${e.ref} · ${prop} · ${f.name}  →  ${folderName}`); continue; }
    try {
      const folder = await sub(e, folderName), names = await has(folder), nm = safe(f.name);
      if (names.has(nm)) { await record({ id: null, event_id: e.id }, nm, folderName, names.get(nm)); skipped++; continue; }
      const r = await fetch(url, { signal: AbortSignal.timeout(300_000) });
      if (!r.ok) throw new Error(`descarga ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer()), mime = r.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
      const up1 = await uploadFile(folder, nm, buf, mime);
      names.set(nm, up1.id); await record({ id: null, event_id: e.id }, nm, folderName, up1.id, buf.length, mime); up++; console.log(`✓ ${e.ref} ${folderName}/${f.name}`);
    } catch (er) { failed.push(`${e.ref} · ${f.name}: ${er.message}`); console.error('✗', e.ref, f.name, er.message); }
  }
}

console.log(`\nArchivos en Notion: ${found} · subidos: ${up} · ya estaban: ${skipped} · con fallo: ${failed.length}`);
if (failed.length) console.log(failed.join('\n'));
await closeDb();
