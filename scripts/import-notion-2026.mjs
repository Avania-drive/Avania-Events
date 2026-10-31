// Importa las acciones y tareas de 2026 de Notion (Albacenter) desde data/notion-*.json. Se puede repetir: lo ya importado (notion_id) se actualiza, no se duplica.
import fs from 'node:fs';
import 'dotenv/config';
import { q, closeDb } from '../src/db.js';

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8'));
const actions = read('notion-actions-2026.json'), rawTasks = read('notion-tasks-raw.json');
const id32 = (u) => String(u || '').split('/').pop().split('?')[0];
const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const num = (s) => { if (s == null || s === '') return null; if (typeof s === 'number') return s; const t = String(s).replace(/[^\d.,-]/g, ''); if (!t) return null; const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : (/\.\d{3}$/.test(t) ? t.replace('.', '') : t)); return Number.isFinite(n) ? n : null; };
const files = (a) => { try { return JSON.parse(a || '[]').map((f) => decodeURIComponent(decodeURIComponent(f.replace('file://', '')).match(/attachment:[^:]+:([^"]+?)"/)?.[1] ?? '')).filter(Boolean); } catch { return []; } };

const EV_STATUS = { 'Acceso': 'sin_empezar', 'Planificación': 'sin_empezar', 'En curso': 'en_proceso', 'En pausa': 'en_pausa', 'Finalizada': 'terminado', 'Cancelado': 'cancelado' };
const TK_STATUS = { 'Sin decidir': 'sin_decidir', 'Sin empezar': 'sin_empezar', 'En curso': 'en_curso', 'Finalizada': 'finalizada', 'Archivadas': 'archivada' };
const PRIO = { Baja: 'baja', Media: 'media', Alta: 'alta' };
const SECTION = { 'Archivos': 'Documentación', 'Premios y mercaderias': 'Premios y mercancías', 'Premios': 'Premios y mercancías' };

const client = (await q("select id, code from clients where code = 'ALB'")).rows[0];
const types = Object.fromEntries((await q('select id, name from event_types')).rows.map((t) => [t.name, t.id]));
const sections = Object.fromEntries((await q('select id, name from task_sections')).rows.map((s) => [s.name, s.id]));
const users = Object.fromEntries((await q('select id, email from team_users')).rows.map((u) => [u.email, u.id]));
const NOTION_USERS = { '9270f052-3680-490c-b272-53863f79dca4': 'pascual.vila@avania.es' };
const owner = (j) => { try { const id = JSON.parse(j || '[]')[0]?.replace('user://', ''); return users[NOTION_USERS[id]] ?? null; } catch { return null; } };

let evNew = 0, evUpd = 0, tkNew = 0, tkUpd = 0, tkSkip = 0;
const byNotion = {};
for (const a of actions) {
  const nid = id32(a.url), start = a['date:Fechas:start'] ?? null, end = a['date:Fechas:end'] ?? null;
  const row = {
    name: strip(a['Nombre del proyecto']), type_id: types[a.tipo] ?? null, status: EV_STATUS[a.Estado] ?? 'sin_empezar', priority: PRIO[a.Prioridad] ?? 'media',
    owner_id: owner(a.Propietario), starts_on: start, ends_on: end, year: Number((start || '2026').slice(0, 4)), location: a['Ubicación'] ?? '',
    description: strip(a['Descripción']) || a.descripcion || '', cost: num(a.Coste), invoiced: a.FACTURADO === 'SI' || a['ESTADO FRA'] === 'FACTURADO',
  };
  const ex = (await q('select id from events where notion_id = $1', [nid])).rows[0];
  if (ex) {
    await q('update events set name=$1, type_id=$2, status=$3, priority=$4, owner_id=$5, starts_on=$6, ends_on=$7, year=$8, location=$9, description=$10, cost=$11, invoiced=$12, updated_at=now() where id=$13',
      [row.name, row.type_id, row.status, row.priority, row.owner_id, row.starts_on, row.ends_on, row.year, row.location, row.description, row.cost, row.invoiced, ex.id]);
    byNotion[nid] = ex.id; evUpd++;
  } else {
    const r = await q(`insert into events (client_id, seq, ref, name, type_id, status, priority, owner_id, starts_on, ends_on, year, location, description, cost, invoiced, notion_id, notion_url)
      select $1, n, $2 || '-' || lpad(n::text, 3, '0'), $3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16 from (select coalesce(max(seq), 0) + 1 n from events where client_id = $1) s returning id`,
      [client.id, client.code, row.name, row.type_id, row.status, row.priority, row.owner_id, row.starts_on, row.ends_on, row.year, row.location, row.description, row.cost, row.invoiced, nid, a.url]);
    byNotion[nid] = r.rows[0].id; evNew++;
  }
}
for (const t of rawTasks) {
  const eid = byNotion[id32(JSON.parse(t.Proyecto || '[]')[0])];
  const title = strip(t['']);
  if (!eid || !title || title === 'Tarea') { tkSkip++; continue; }
  const nid = id32(t.url), att = files(t.Archivos);
  const summary = [strip(t.Resumen), att.length ? `Adjuntos en Notion: ${att.join(', ')}` : ''].filter(Boolean).join('\n');
  const v = [title.slice(0, 300), TK_STATUS[t.Estado] ?? 'sin_empezar', PRIO[t.Prioridad] ?? null, sections[SECTION[t.SECCION] ?? t.SECCION] ?? null, t['date:Fecha límite:start'] ?? null, num(t.Coste), summary];
  const ex = (await q('select id from tasks where notion_id = $1', [nid])).rows[0];
  if (ex) { await q('update tasks set title=$1, status=$2, priority=$3, section_id=$4, due_on=$5, cost=$6, summary=$7 where id=$8', [...v, ex.id]); tkUpd++; }
  else {
    await q(`insert into tasks (event_id, position, title, status, priority, section_id, due_on, cost, summary, notion_id, done_at)
      select $1, coalesce(max(position), 0) + 1, $2,$3,$4,$5,$6,$7,$8,$9, case when $3 = 'finalizada' then now() end from tasks where event_id = $1`, [eid, ...v, nid]);
    tkNew++;
  }
}
console.log(`Acciones: ${evNew} nuevas, ${evUpd} actualizadas · Tareas: ${tkNew} nuevas, ${tkUpd} actualizadas, ${tkSkip} omitidas`);
await closeDb();
