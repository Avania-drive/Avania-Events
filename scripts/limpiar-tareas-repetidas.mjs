// Une las tareas repetidas dentro de una misma acción histórica (mismo título y sección): deja una, la más avanzada. Solo años anteriores a 2026 y tareas importadas de Notion.
import 'dotenv/config';
import { q, closeDb } from '../src/db.js';
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
const rank = (t) => (t.status === 'finalizada' ? 0 : t.status === 'en_curso' ? 1 : 2);
const rows = (await q(`select t.id, t.event_id, t.title, t.section_id, t.status, t.position, t.parent_id, (select count(*) from tasks c where c.parent_id = t.id)::int kids, (select count(*) from task_files f where f.task_id = t.id)::int files, e.ref
  from tasks t join events e on e.id = t.event_id where e.year < 2026 and t.notion_id is not null and t.status <> 'archivada' order by t.event_id, t.position`)).rows;
const groups = new Map();
for (const t of rows) if (!t.parent_id) { const k = `${t.event_id}|${norm(t.title)}|${t.section_id}`; (groups.get(k) ?? groups.set(k, []).get(k)).push(t); }
let del = 0; const per = {};
for (const g of groups.values()) {
  if (g.length < 2) continue;
  const keep = [...g].sort((a, b) => rank(a) - rank(b) || b.files - a.files || a.position - b.position)[0];
  for (const t of g) if (t.id !== keep.id && !t.kids && !t.files) { await q('delete from tasks where id = $1', [t.id]); del++; per[t.ref] = (per[t.ref] || 0) + 1; }
}
console.log(`${del} tareas repetidas unidas`, per);
await closeDb();
