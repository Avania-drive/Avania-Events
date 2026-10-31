// Analiza los Excel de resultados de Joventura que hay en Documentación y rellena el cierre de cada acción (lo ya escrito no se borra).
import 'dotenv/config';
import { q, closeDb } from '../src/db.js';
import { downloadFile } from '../src/drive.js';
import { analyzeResults, isResultsFile } from '../src/results.js';

const bullets = (l) => l.map((x) => `• ${x}`).join('\n');
const merge = (cur, add) => (!add ? cur : !cur ? add : cur.includes(add) ? cur : `${cur}\n\n${add}`);
const files = (await q(`select f.name, f.drive_file_id, f.event_id from task_files f order by f.created_at`)).rows.filter((f) => isResultsFile(f.name));
const done = new Set();
for (const f of files.sort((a, b) => Number(a.name.startsWith('1')) - Number(b.name.startsWith('1')))) {   // si hay copia («1JOVENTURA…»), vale la original
  if (done.has(f.event_id)) continue; done.add(f.event_id);
  const e = (await q('select id, ref, name, kpi_result, incidents, improvements, links from events where id = $1', [f.event_id])).rows[0];
  const a = await analyzeResults(await downloadFile(f.drive_file_id));
  const url = `https://drive.google.com/file/d/${f.drive_file_id}/view`;
  const links = [...(e.links || []).filter((l) => l.name !== 'Archivo de resultados'), { name: 'Archivo de resultados', url }];
  await q('update events set participants = coalesce($1, participants), kpi_result = $2, incidents = $3, improvements = $4, links = $5::jsonb, updated_at = now() where id = $6',
    [a.participants, merge(e.kpi_result || '', a.summary), merge(e.incidents || '', bullets(a.incidents)), merge(e.improvements || '', a.comments.length ? `Comentarios de los clientes:\n${bullets(a.comments)}` : ''), JSON.stringify(links), e.id]);
  console.log(`${e.ref} ${e.name}: participantes ${a.participants ?? '—'} · ${a.incidents.length} incidencias · ${a.comments.length} comentarios`);
}
await closeDb();
