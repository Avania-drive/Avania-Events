// Importa de Notion las acciones y tareas de 2023, 2024 y 2025 de Albacenter (datos en data/hist-*.json; bajar con scripts/explorar/bajar.mjs).
// Se puede repetir: lo ya importado (notion_id) se actualiza, no se duplica.  Uso: node scripts/importar-historico.mjs [--dry]
import fs from 'node:fs';
import 'dotenv/config';
import { q, closeDb } from '../src/db.js';

const DRY = process.argv.includes('--dry');
const load = (k) => JSON.parse(fs.readFileSync(new URL(`../data/hist-${k}.json`, import.meta.url), 'utf8'));
const nid = (id) => String(id).replace(/-/g, '');
const title = (p) => Object.values(p.properties).find((x) => x.type === 'title')?.title?.map((t) => t.plain_text).join('').replace(/\s+/g, ' ').trim() || '';
const rich = (p, k) => (p.properties[k]?.rich_text || []).map((t) => t.plain_text).join('').trim();
const sel = (p, k) => p.properties[k]?.select?.name || p.properties[k]?.status?.name || '';
const day = (d) => (d ? String(d).slice(0, 10) : null);
const money = (v) => { if (typeof v === 'number') return v; const t = String(v ?? '').replace(/[^\d.,-]/g, ''); if (!t) return null; const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : (/\.\d{3}$/.test(t) ? t.replace('.', '') : t)); return Number.isFinite(n) ? n : null; };
const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const evStatus = (s) => { s = s.toLowerCase(); return /cancel/.test(s) ? 'cancelado' : /pausa/.test(s) ? 'en_pausa' : /hecho|terminad|finalizad|complet/.test(s) ? 'terminado' : /progreso|en curso/.test(s) ? 'en_proceso' : 'sin_empezar'; };
const tkStatus = (s) => { s = s.toLowerCase(); return /archiv/.test(s) ? 'archivada' : /hecho|terminad|finalizad|complet/.test(s) ? 'finalizada' : /progreso|en curso/.test(s) ? 'en_curso' : /decidir/.test(s) ? 'sin_decidir' : 'sin_empezar'; };
const PRIO = { Baja: 'baja', Media: 'media', Alta: 'alta' };
const SECTION = { Archivos: 'Documentación', 'Premios y mercaderias': 'Premios y mercancías', Premios: 'Premios y mercancías' };
const typeOf = (n) => { n = n.toLowerCase(); return /fashion|casting|moda/.test(n) ? 'Moda y casting' : /gastro|degusta|tapas/.test(n) ? 'Gastronomía' : /ruleta|sorteo|tarjeta|juego|noria|dumbo|margarita|premios/.test(n) ? 'Sorteo' : /san valent|padre|madre|black|white friday|grey friday|rebajas|vuelta al cole|navidad|halloween|reyes|papa noel|san juan|antorchas/.test(n) ? 'Fecha comercial' : /fiesta|silvestre|encendido|rueda de prensa|exposic|feria|stand|pilates|afani[oó]n|12 horas|clases|curso|asociaci|gala|bluey|aisdiscan|cruz roja/.test(n) ? 'Evento especial' : /revista|programa|radio|cuña|campaña|rrss|adaptaci|onda cero|latido/.test(n) ? 'Colaboración' : null; };

const client = (await q("select id, code from clients where code = 'ALB'")).rows[0];
const types = Object.fromEntries((await q('select id, name from event_types')).rows.map((t) => [t.name, t.id]));
const sections = Object.fromEntries((await q('select id, name from task_sections')).rows.map((s) => [s.name, s.id]));
const users = Object.fromEntries((await q('select id, name, email from team_users')).rows.map((u) => [u.email, u.id]));
const ownerOf = (p, k = 'Propietario') => { const n = (p.properties[k]?.people || []).map((x) => x.name).find(Boolean); return n === 'Elvira Vila' ? users['elvira.vila@avania.es'] ?? null : n === 'Pascual Vila' ? users['pascual.vila@avania.es'] ?? null : null; };
const filesOf = (p, keys) => keys.flatMap((k) => (p.properties[k]?.files || []).map((f) => f.name));

// ── Qué se importa de cada año ──
const plan = [];   // { year, actions: [{ page, ...campos }], tasks: [{ page, actionKey, parentKey }] }
{ // 2025
  const A = load('acciones25'), T = load('tareas25'), ids = new Set(A.map((a) => a.id));
  plan.push({ label: '2025', actions: A.map((p) => ({ page: p, name: title(p), status: sel(p, 'Estado'), prio: sel(p, 'Prioridad'), loc: sel(p, 'Ubicación'), desc: rich(p, 'Descripción'), cost: money(rich(p, 'Coste')), invoiced: sel(p, 'FACTURADO') === 'SI', date: p.properties.Fechas?.date, year: 2025 })),
    tasks: T.map((p) => ({ page: p, actionId: (p.properties.Proyecto?.relation || []).map((r) => r.id).find((i) => ids.has(i)), parentId: p.properties['Tarea principal']?.relation?.[0]?.id })).filter((t) => t.actionId) });
}
{ // 2024
  const A = load('proyectos24').filter((p) => !/^pruebas?$/i.test(title(p))), T = load('tareas24'), ids = new Set(A.map((a) => a.id));
  plan.push({ label: '2024', actions: A.map((p) => ({ page: p, name: title(p), status: sel(p, 'Estado'), prio: sel(p, 'Prioridad'), loc: sel(p, 'Ubicación'), desc: '', cost: money(rich(p, 'Coste total')), invoiced: false, date: p.properties.Fechas?.date, year: 2024 })),
    tasks: T.map((p) => ({ page: p, actionId: (p.properties.Proyecto?.relation || []).map((r) => r.id).find((i) => ids.has(i)), parentId: p.properties['Tarea principal']?.relation?.[0]?.id })).filter((t) => t.actionId) });
}
{ // 2023: una sola base; los elementos sin «Tarea padre» son acciones y los hijos, sus tareas
  const P = load('acciones23'), top = P.filter((p) => !p.properties['Tarea padre'].relation.length && !/^(acciones albacenter|task|\[cambia el nombre\])?$/i.test(title(p))), ids = new Set(top.map((a) => a.id));
  plan.push({ label: '2023', actions: top.map((p) => ({ page: p, name: title(p), status: sel(p, 'Estado'), prio: 'Media', loc: sel(p, 'Ubicación'), desc: rich(p, 'Descripción'), cost: p.properties.Coste?.number ?? null, invoiced: Boolean(p.properties.Facturado?.checkbox), date: p.properties.Fecha?.date, year: 2023, tag: p.properties.Tipo?.select?.name, files: filesOf(p, ['Archivos', 'Creatividades', 'Fotos Acción']) })),
    tasks: P.map((p) => ({ page: p, actionId: (p.properties['Tarea padre']?.relation || []).map((r) => r.id).find((i) => ids.has(i)) })).filter((t) => t.actionId) });
}

let evNew = 0, evUpd = 0, tkNew = 0, tkUpd = 0, tkSkip = 0, tkDup = 0;
for (const y of plan) {
  const nEv = y.actions.length;
  console.log(`\n${y.label}: ${nEv} acciones, ${y.tasks.length} tareas enlazadas`);
  if (DRY) { for (const a of y.actions) console.log(`  ${(a.date?.start || '—').slice(0, 10)} · ${a.name.slice(0, 50)} · ${evStatus(a.status)} · ${y.tasks.filter((t) => t.actionId === a.page.id).length} tareas`); continue; }
  const evIdOf = {};
  for (const a of [...y.actions].sort((p, r) => (p.date?.start || `${y.label}-12-31`).localeCompare(r.date?.start || `${y.label}-12-31`) || p.name.localeCompare(r.name))) {
    const start = day(a.date?.start), end = day(a.date?.end), year = start ? Number(start.slice(0, 4)) : a.year;
    const row = [a.name.slice(0, 200), types[typeOf(a.name)] ?? null, evStatus(a.status), PRIO[a.prio] ?? 'media', ownerOf(a.page), start, end, year, a.loc || '', strip(a.desc) + (a.files?.length ? `${a.desc ? '\n\n' : ''}Adjuntos en Notion: ${a.files.join(', ')}` : ''), a.cost, a.invoiced, `${a.tag ? '' : ''}`];
    const key = nid(a.page.id), url = a.page.url;
    const ex = (await q('select id from events where notion_id = $1', [key])).rows[0];
    if (ex) { await q('update events set name=$1, type_id=$2, status=$3, priority=$4, owner_id=$5, starts_on=$6, ends_on=$7, year=$8, location=$9, description=$10, cost=$11, invoiced=$12, updated_at=now() where id=$13', [...row.slice(0, 12), ex.id]); evIdOf[a.page.id] = ex.id; evUpd++; }
    else {
      const r = await q(`insert into events (client_id, seq, ref, name, type_id, status, priority, owner_id, starts_on, ends_on, year, location, description, cost, invoiced, notion_id, notion_url)
        select $1, n, $2 || '-' || lpad(n::text, 3, '0'), $3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16 from (select coalesce(max(seq), 0) + 1 n from events where client_id = $1) s returning id`, [client.id, client.code, ...row.slice(0, 12), key, url]);
      evIdOf[a.page.id] = r.rows[0].id; evNew++;
    }
  }
  const taskIdOf = {};
  const rank = (p) => { const st = tkStatus(sel(p, 'Estado')); return st === 'finalizada' ? 0 : st === 'en_curso' ? 1 : 2; };
  const seen = new Map();   // acción|título|sección → tarea que se conserva: las repetidas (Notion duplicó tareas en bloque) se unen en una
  y.tasks.sort((a, b) => rank(a.page) - rank(b.page));
  for (const pass of [0, 1]) for (const t of y.tasks) {   // primero las tareas sin madre, luego las subtareas
    if (Boolean(t.parentId) !== Boolean(pass)) continue;
    const p = t.page, name = title(p);
    if (!name || /^(tarea|task)$/i.test(name)) { if (!pass) tkSkip++; continue; }
    const eid = evIdOf[t.actionId]; if (!eid) continue;
    const secName = sel(p, 'SECCION'), att = filesOf(p, ['Archivos']);
    const dupKey = `${t.actionId}|${name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ')}|${secName}`;
    if (!t.parentId && seen.has(dupKey)) { taskIdOf[p.id] = seen.get(dupKey); tkDup++; continue; }
    const summary = [rich(p, 'Resumen'), att.length ? `Adjuntos en Notion: ${att.join(', ')}` : ''].filter(Boolean).join('\n');
    const status = tkStatus(sel(p, 'Estado')), parent = t.parentId ? taskIdOf[t.parentId] ?? null : null;
    const v = [name.slice(0, 300), status, PRIO[sel(p, 'Prioridad')] ?? null, sections[SECTION[secName] ?? secName] ?? null, day(p.properties['Fecha límite']?.date?.start ?? p.properties.Fecha?.date?.start), p.properties.Coste?.number ?? null, summary];
    const key = nid(p.id);
    const ex = (await q('select id from tasks where notion_id = $1', [key])).rows[0];
    if (ex) { await q('update tasks set title=$1, status=$2, priority=$3, section_id=$4, due_on=$5, cost=$6, summary=$7 where id=$8', [...v, ex.id]); taskIdOf[p.id] = ex.id; tkUpd++; if (!t.parentId) seen.set(dupKey, ex.id); }
    else {
      const r = await q(`insert into tasks (event_id, parent_id, position, title, status, priority, section_id, due_on, cost, summary, notion_id, done_at)
        select $1, $2, coalesce(max(position), 0) + 1, $3,$4,$5,$6,$7,$8,$9,$10, case when $4 = 'finalizada' then now() end from tasks where event_id = $1 returning id`, [eid, parent, ...v, key]);
      taskIdOf[p.id] = r.rows[0].id; tkNew++; if (!t.parentId) seen.set(dupKey, r.rows[0].id);
    }
  }
}
if (!DRY) console.log(`\nAcciones: ${evNew} nuevas, ${evUpd} actualizadas · Tareas: ${tkNew} nuevas, ${tkUpd} actualizadas, ${tkSkip} omitidas (vacías), ${tkDup} repetidas unidas`);
await closeDb();
