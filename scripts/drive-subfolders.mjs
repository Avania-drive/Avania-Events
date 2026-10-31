// Crea, dentro de la carpeta de cada acción en Drive, una subcarpeta por cada sección que tenga adjuntos en Notion. Se puede repetir sin duplicar.
import fs from 'node:fs';
import 'dotenv/config';
import { q, closeDb } from '../src/db.js';
import { ensureFolder, driveEnabled } from '../src/drive.js';

if (!driveEnabled()) throw new Error('Falta GOOGLE_SA_FILE');
const SECTION = { 'Archivos': 'Documentación', 'Premios y mercaderias': 'Premios y mercancías', 'Premios': 'Premios y mercancías' };
const id32 = (u) => String(u || '').split('/').pop().split('?')[0];
const events = Object.fromEntries((await q('select notion_id, ref, drive_folder_id from events where drive_folder_id is not null')).rows.map((e) => [e.notion_id, e]));
const need = new Map();
for (const t of JSON.parse(fs.readFileSync(new URL('../data/notion-tasks-raw.json', import.meta.url), 'utf8'))) {
  if (!t.Archivos || !JSON.parse(t.Archivos).length) continue;
  const ev = events[id32(JSON.parse(t.Proyecto)[0])]; if (!ev) continue;
  const sec = SECTION[t.SECCION] ?? t.SECCION ?? 'Sin sección';
  need.set(`${ev.ref}|${sec}`, { ev, sec });
}
let n = 0;
for (const { ev, sec } of need.values()) { await ensureFolder(ev.drive_folder_id, sec); n++; console.log(ev.ref, '→', sec); }
console.log(`${n} subcarpetas listas`);
await closeDb();
