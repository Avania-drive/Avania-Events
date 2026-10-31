import 'dotenv/config';
import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q } from './db.js';
import { hashPassword, verifyPassword, randomToken, sha256 } from './crypto.js';
import { COOKIE, parseCookies, createSession, clearCookie, loadSession, requireUser, requireReady, requireRole, publicUser, isAdmin, tooMany } from './auth.js';
import { EVENT_STATUS, TASK_STATUS, PRIORITIES, cleanEvent, cleanTask, cleanLinks, isUuid, yearFor } from './domain.js';
import { sendInvite } from './invite.js';
import { mailEnabled } from './mailer.js';

export const app = express();
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ip = (req) => req.ip || 'x';
const fail = (status, error) => Object.assign(new Error(error), { status });

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(compression());
app.use(express.json({ limit: '300kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  // Las escrituras solo se aceptan como JSON (junto con SameSite=Strict, frena el CSRF).
  if (req.method !== 'GET' && req.path.startsWith('/api/') && !req.is('application/json') && Number(req.headers['content-length'] || 0) > 0) return res.status(415).json({ error: 'Solo JSON' });
  next();
});
app.use(loadSession);

// Los importes solo se ven con la sesión desbloqueada (usuario y contraseña en Informes, 30 min): fuera de ahí se vacían en las respuestas y no se aceptan cambios de importes.
const costsOpen = (req) => Boolean(req.session?.reports_until && new Date(req.session.reports_until) > new Date());
const MONEY_KEYS = new Set(['cost', 'tasks_cost', 'por_facturar_importe', 'coste_anio']);
const hideMoney = (x) => {
  if (Array.isArray(x)) return x.map(hideMoney);
  if (x && typeof x === 'object' && !(x instanceof Date)) { const o = {}; for (const [k, v] of Object.entries(x)) o[k] = MONEY_KEYS.has(k) ? null : hideMoney(v); if (o.detail && typeof o.detail === 'object') delete o.detail.cost; return o; }
  return x;
};
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/') || req.path.startsWith('/api/informes') || !req.user) return next();
  const open = costsOpen(req);
  if (!open && ['POST', 'PATCH', 'PUT'].includes(req.method) && req.body && typeof req.body === 'object' && 'cost' in req.body) return res.status(403).json({ error: 'Los importes están ocultos: desbloquéalos con tu usuario y contraseña', code: 'reports_locked' });
  const json = res.json.bind(res);
  res.json = (body) => json(body && typeof body === 'object' ? { ...(open ? body : hideMoney(body)), costs_unlocked: open } : body);
  next();
});

const staff = [requireUser, requireReady];
const admins = [...staff, requireRole('super_admin', 'admin')];

// ───────── Salud ─────────
app.get('/api/health', wrap(async (_req, res) => { await q('select 1'); res.json({ ok: true }); }));

// ───────── Sesión y cuenta ─────────
app.post('/api/login', wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  if (tooMany(`login:${ip(req)}:${email}`)) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  const u = (await q('select * from team_users where email = $1 and active', [email])).rows[0];
  // Se verifica siempre algo para no delatar si el correo existe por el tiempo de respuesta.
  const ok = u ? verifyPassword(String(req.body.password || ''), u.password_hash) : (verifyPassword('x', 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA'), false);
  if (!ok) return res.status(401).json({ error: 'Correo o contraseña incorrectos' });
  await createSession(req, res, u.id);
  res.json({ user: publicUser(u) });
}));
app.post('/api/logout', wrap(async (req, res) => {
  const t = parseCookies(req)[COOKIE];
  if (t) await q('delete from sessions where token_hash = $1', [sha256(t)]);
  clearCookie(res);
  res.json({ ok: true });
}));
app.get('/api/me', requireUser, (req, res) => res.json({ user: publicUser(req.user) }));
app.post('/api/password', requireUser, wrap(async (req, res) => {
  const { current, next } = req.body;
  if (!verifyPassword(String(current || ''), req.user.password_hash)) return res.status(400).json({ error: 'La contraseña actual no es correcta' });
  if (String(next || '').length < 12) return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 12 caracteres' });
  await q('update team_users set password_hash = $1, must_change_password = false where id = $2', [hashPassword(next), req.user.id]);
  await q('delete from sessions where user_id = $1 and id <> $2', [req.user.id, req.session.id]);
  res.json({ ok: true });
}));
app.patch('/api/me', ...staff, wrap(async (req, res) => {
  const name = String(req.body.name ?? req.user.name ?? '').trim().slice(0, 120);
  await q('update team_users set name = $1 where id = $2', [name, req.user.id]);
  res.json({ ok: true });
}));

// Enlace de invitación (público): comprueba el enlace y deja elegir la contraseña.
app.get('/api/invitacion/:token', wrap(async (req, res) => {
  if (tooMany(`inv:${ip(req)}`, 30)) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  const u = (await q('select email, name from team_users where invite_hash = $1 and invite_expires_at > now() and active', [sha256(String(req.params.token))])).rows[0];
  if (!u) return res.status(404).json({ error: 'Este enlace no es válido o ha caducado. Pide que te envíen otro.' });
  res.json({ email: u.email, name: u.name });
}));
app.post('/api/invitacion/:token', wrap(async (req, res) => {
  if (tooMany(`inv:${ip(req)}`, 30)) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  const pw = String(req.body.password || '');
  if (pw.length < 12) return res.status(400).json({ error: 'La contraseña debe tener al menos 12 caracteres' });
  const u = (await q('select id from team_users where invite_hash = $1 and invite_expires_at > now() and active', [sha256(String(req.params.token))])).rows[0];
  if (!u) return res.status(404).json({ error: 'Este enlace no es válido o ha caducado. Pide que te envíen otro.' });
  await q('update team_users set password_hash = $1, must_change_password = false, invite_hash = null, invite_expires_at = null where id = $2', [hashPassword(pw), u.id]);
  await q('delete from sessions where user_id = $1', [u.id]);
  res.json({ ok: true });
}));

// ───────── Datos de partida del panel ─────────
app.get('/api/meta', ...staff, wrap(async (req, res) => {
  const [clients, types, sections, users, locations] = await Promise.all([
    q('select id, name, code, color, position, archived from clients order by position, name'),
    q('select id, name, color, position from event_types order by position, name'),
    q('select id, name, color, position from task_sections order by position, name'),
    q('select id, name, email, role, active from team_users order by coalesce(nullif(name, \'\'), email)'),
    q('select id, name from locations order by position, name'),
  ]);
  res.json({
    me: publicUser(req.user), eventStatus: EVENT_STATUS, taskStatus: TASK_STATUS, priorities: PRIORITIES, locations: locations.rows.map((l) => l.name),
    clients: clients.rows, types: types.rows, sections: sections.rows,
    users: users.rows.filter((u) => u.active).map(({ active, ...u }) => u),
  });
}));

// ───────── Acciones (eventos) ─────────
const LIST_SQL = `
  select e.id, e.ref, e.client_id, c.name client_name, c.code client_code, c.color client_color, e.year, e.name, e.type_id, e.status, e.priority,
         e.owner_id, e.starts_on, e.ends_on, e.location, e.cost, e.invoiced, e.archived, e.updated_at,
         coalesce(t.total, 0)::int tasks_total, coalesce(t.done, 0)::int tasks_done, coalesce(t.overdue, 0)::int tasks_overdue, coalesce(t.cost, 0) tasks_cost
  from events e
  join clients c on c.id = e.client_id
  left join (
    select event_id, count(*) filter (where status <> 'archivada') total, count(*) filter (where status = 'finalizada') done,
           count(*) filter (where status not in ('finalizada', 'archivada') and due_on < current_date) overdue,
           sum(cost) filter (where status <> 'archivada') cost
    from tasks group by event_id
  ) t on t.event_id = e.id`;

// ───────── Informes: piden usuario y contraseña (se desbloquean 30 minutos en esa sesión) ─────────
const REPORTS_MINUTES = 30;
const reportsOpen = (req) => req.session.reports_until && new Date(req.session.reports_until) > new Date();
const requireReports = (req, res, next) => (reportsOpen(req) ? next() : res.status(403).json({ error: 'Introduce usuario y contraseña para ver los informes', code: 'reports_locked' }));
app.get('/api/informes/estado', ...staff, (req, res) => res.json({ unlocked: Boolean(reportsOpen(req)), until: reportsOpen(req) ? req.session.reports_until : null }));
app.post('/api/informes/acceso', ...staff, wrap(async (req, res) => {
  if (tooMany(`informes:${req.user.id}`, 6, 15 * 60e3)) throw fail(429, 'Demasiados intentos. Espera unos minutos.');
  const email = String(req.body.email || '').trim().toLowerCase();
  if (email !== req.user.email.toLowerCase() || !verifyPassword(String(req.body.password || ''), req.user.password_hash)) throw fail(401, 'Usuario o contraseña incorrectos');
  const r = await q(`update sessions set reports_until = now() + interval '${REPORTS_MINUTES} minutes' where id = $1 returning reports_until`, [req.session.id]);
  res.json({ unlocked: true, until: r.rows[0].reports_until });
}));
app.post('/api/informes/bloquear', ...staff, wrap(async (req, res) => { await q('update sessions set reports_until = null where id = $1', [req.session.id]); res.json({ unlocked: false }); }));
app.get('/api/informes', ...staff, requireReports, wrap(async (req, res) => {
  const args = [], where = ['not e.archived'];
  if (req.query.client) { if (!isUuid(req.query.client)) throw fail(400, 'Cliente no válido'); args.push(req.query.client); where.push(`e.client_id = $${args.length}`); }
  res.json({ events: (await q(`${LIST_SQL} where ${where.join(' and ')} order by e.starts_on nulls last, e.seq`, args)).rows });
}));

app.get('/api/events', ...staff, wrap(async (req, res) => {
  const where = [], args = [];
  const add = (sql, v) => { args.push(v); where.push(sql.replaceAll('?', `$${args.length}`)); };
  const { client, year, type, status, owner, search } = req.query;
  if (client) { if (!isUuid(client)) throw fail(400, 'Cliente no válido'); add('e.client_id = ?', client); }
  if (year) add('e.year = ?', Number(year));
  if (type === 'none') where.push('e.type_id is null'); else if (type) { if (!isUuid(type)) throw fail(400, 'Tipo no válido'); add('e.type_id = ?', type); }
  if (status) { if (!EVENT_STATUS[status]) throw fail(400, 'Estado no válido'); add('e.status = ?', status); }
  if (owner) { if (!isUuid(owner)) throw fail(400, 'Responsable no válido'); add('e.owner_id = ?', owner); }
  if (search) add('(e.name ilike ? or e.ref ilike ?)', `%${String(search).slice(0, 80)}%`);
  if (req.query.archived !== '1') where.push('not e.archived');
  const r = await q(`${LIST_SQL} ${where.length ? `where ${where.join(' and ')}` : ''} order by e.starts_on nulls last, e.created_at limit 1000`, args);
  res.json({ events: r.rows });
}));

async function loadEvent(id) {
  if (!isUuid(id)) throw fail(404, 'No existe esa acción');
  const e = (await q(`select e.*, c.name client_name, c.code client_code, c.color client_color from events e join clients c on c.id = e.client_id where e.id = $1`, [id])).rows[0];
  if (!e) throw fail(404, 'No existe esa acción');
  return e;
}
async function logEvent(eventId, user, action, detail = null) {
  await q('insert into event_log (event_id, user_id, actor, action, detail) values ($1,$2,$3,$4,$5)', [eventId, user.id, user.name || user.email, action, detail ? JSON.stringify(detail) : null]);
}
const setCollaborators = async (eventId, ids) => {
  const clean = [...new Set((Array.isArray(ids) ? ids : []).filter(isUuid))];
  await q('delete from event_collaborators where event_id = $1', [eventId]);
  for (const uid of clean) await q('insert into event_collaborators (event_id, user_id) values ($1,$2) on conflict do nothing', [eventId, uid]);
};
// UPDATE con columnas ya validadas (las claves vienen de cleanEvent / cleanTask, nunca del navegador).
function updateSql(table, obj, idIndex) {
  const keys = Object.keys(obj);
  const sets = keys.map((k, i) => `${k} = $${i + 1}${k === 'links' ? '::jsonb' : ''}`);
  return { sql: `update ${table} set ${sets.join(', ')}, updated_at = now() where id = $${keys.length + 1} returning *`, args: [...keys.map((k) => (k === 'links' ? JSON.stringify(obj[k]) : obj[k])), idIndex] };
}

app.get('/api/events/:id', ...staff, wrap(async (req, res) => {
  const e = await loadEvent(req.params.id);
  const [collabs, tasks] = await Promise.all([
    q('select user_id from event_collaborators where event_id = $1', [e.id]),
    q(`select t.* from tasks t left join task_sections s on s.id = t.section_id where t.event_id = $1 order by s.position nulls last, t.position, t.created_at`, [e.id]),
  ]);
  res.json({ event: { ...e, collaborators: collabs.rows.map((r) => r.user_id) }, tasks: tasks.rows });
}));

app.post('/api/events', ...staff, wrap(async (req, res) => {
  const clientId = req.body.client_id;
  if (!isUuid(clientId)) throw fail(400, 'Elige el cliente');
  const client = (await q('select id, code from clients where id = $1 and not archived', [clientId])).rows[0];
  if (!client) throw fail(400, 'Ese cliente no existe');
  const d = cleanEvent(req.body);
  d.year = yearFor(d.starts_on, d.year);
  d.owner_id ??= req.user.id;
  const cols = Object.keys(d);
  let row;
  for (let attempt = 0; attempt < 4 && !row; attempt++) {   // el número sale de contar los del cliente; si dos se crean a la vez, se reintenta
    try {
      const r = await q(
        `insert into events (client_id, seq, ref, created_by, ${cols.join(', ')})
         select $1, n, $2 || '-' || lpad(n::text, 3, '0'), $3, ${cols.map((k, i) => `$${i + 4}${k === 'links' ? '::jsonb' : ''}`).join(', ')}
         from (select coalesce(max(seq), 0) + 1 n from events where client_id = $1) s returning *`,
        [client.id, client.code, req.user.id, ...cols.map((k) => (k === 'links' ? JSON.stringify(d[k]) : d[k]))]);
      row = r.rows[0];
    } catch (e) { if (!/duplicate|unique/i.test(e.message) || attempt === 3) throw e; }
  }
  if (Array.isArray(req.body.collaborators)) await setCollaborators(row.id, req.body.collaborators);
  await logEvent(row.id, req.user, 'crear', { name: row.name });
  res.json({ event: row });
}));

app.patch('/api/events/:id', ...staff, wrap(async (req, res) => {
  const cur = await loadEvent(req.params.id);
  const d = cleanEvent(req.body, { partial: true });
  if (d.starts_on !== undefined && d.year === undefined && d.starts_on) d.year = Number(d.starts_on.slice(0, 4));
  if (typeof req.body.archived === 'boolean') d.archived = req.body.archived;
  if (Object.keys(d).length) {
    const u = updateSql('events', d, cur.id);
    await q(u.sql, u.args);
    const watched = ['status', 'owner_id', 'starts_on', 'ends_on', 'cost', 'invoiced', 'name', 'archived'];
    const diff = Object.fromEntries(watched.filter((k) => k in d && String(d[k] ?? '') !== String(cur[k] ?? '')).map((k) => [k, { de: cur[k] ?? null, a: d[k] ?? null }]));
    if (Object.keys(diff).length) await logEvent(cur.id, req.user, 'cambiar', diff);
  }
  if (Array.isArray(req.body.collaborators)) await setCollaborators(cur.id, req.body.collaborators);
  res.json({ event: await loadEvent(cur.id) });
}));

app.delete('/api/events/:id', ...staff, wrap(async (req, res) => {
  const e = await loadEvent(req.params.id);
  if (req.query.hard === '1') {   // borrar de verdad: solo administradores
    if (!isAdmin(req.user)) throw fail(403, 'Solo un administrador puede borrar una acción para siempre');
    await q('delete from events where id = $1', [e.id]);
    return res.json({ ok: true, deleted: true });
  }
  await q('update events set archived = true, updated_at = now() where id = $1', [e.id]);
  await logEvent(e.id, req.user, 'archivar');
  res.json({ ok: true });
}));

app.get('/api/events/:id/log', ...staff, wrap(async (req, res) => {
  const e = await loadEvent(req.params.id);
  res.json({ log: (await q('select id, actor, action, detail, at from event_log where event_id = $1 order by at desc limit 100', [e.id])).rows });
}));

// ───────── Tareas ─────────
app.post('/api/events/:id/tasks', ...staff, wrap(async (req, res) => {
  const e = await loadEvent(req.params.id);
  const d = cleanTask(req.body);
  if (d.parent_id) { const p = (await q('select id from tasks where id = $1 and event_id = $2', [d.parent_id, e.id])).rows[0]; if (!p) throw fail(400, 'La tarea principal no es de esta acción'); }
  const cols = Object.keys(d);
  const r = await q(
    `insert into tasks (event_id, position, ${cols.join(', ')})
     select $1, coalesce(max(position), 0) + 1, ${cols.map((k, i) => `$${i + 2}${k === 'links' ? '::jsonb' : ''}`).join(', ')} from tasks where event_id = $1 returning *`,
    [e.id, ...cols.map((k) => (k === 'links' ? JSON.stringify(d[k]) : d[k]))]);
  await q('update events set updated_at = now() where id = $1', [e.id]);
  res.json({ task: r.rows[0] });
}));
app.patch('/api/tasks/:id', ...staff, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) throw fail(404, 'No existe esa tarea');
  const cur = (await q('select * from tasks where id = $1', [req.params.id])).rows[0];
  if (!cur) throw fail(404, 'No existe esa tarea');
  const d = cleanTask(req.body, { partial: true });
  if (d.parent_id === cur.id) throw fail(400, 'Una tarea no puede ser su propia tarea principal');
  if (d.status) d.done_at = d.status === 'finalizada' ? (cur.done_at ?? new Date().toISOString()) : null;
  if (!Object.keys(d).length) return res.json({ task: cur });
  const u = updateSql('tasks', d, cur.id);
  const r = await q(u.sql, u.args);
  await q('update events set updated_at = now() where id = $1', [cur.event_id]);
  if (d.status && d.status !== cur.status && (d.status === 'finalizada' || cur.status === 'finalizada')) await logEvent(cur.event_id, req.user, d.status === 'finalizada' ? 'tarea hecha' : 'tarea reabierta', { title: cur.title });
  res.json({ task: r.rows[0] });
}));
app.delete('/api/tasks/:id', ...staff, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) throw fail(404, 'No existe esa tarea');
  const r = await q('delete from tasks where id = $1 returning event_id, title', [req.params.id]);
  if (!r.rows[0]) throw fail(404, 'No existe esa tarea');
  await q('update events set updated_at = now() where id = $1', [r.rows[0].event_id]);
  res.json({ ok: true });
}));

// ───────── Panel de inicio ─────────
app.get('/api/dashboard', ...staff, wrap(async (req, res) => {
  const scope = req.query.client && isUuid(req.query.client) ? { sql: 'and e.client_id = $1', args: [req.query.client] } : { sql: '', args: [] };
  const [counts, overdue, upcoming, inProgress, mine, toInvoice] = await Promise.all([
    q(`select count(*) filter (where e.status = 'en_proceso')::int en_proceso,
              count(*) filter (where e.status in ('sin_empezar', 'en_proceso') and e.starts_on between current_date and current_date + 30)::int proximas,
              count(*) filter (where e.status = 'terminado' and not e.invoiced and coalesce(e.cost, 0) > 0)::int por_facturar,
              coalesce(sum(e.cost) filter (where e.status = 'terminado' and not e.invoiced), 0) por_facturar_importe,
              coalesce(sum(e.cost) filter (where e.year = extract(year from current_date)::int), 0) coste_anio
       from events e where not e.archived ${scope.sql}`, scope.args),
    q(`select count(*)::int n from tasks t join events e on e.id = t.event_id
       where not e.archived and t.status not in ('finalizada', 'archivada') and t.due_on < current_date ${scope.sql}`, scope.args),
    q(`${LIST_SQL} where not e.archived and e.status in ('sin_empezar', 'en_proceso') and coalesce(e.ends_on, e.starts_on) >= current_date ${scope.sql.replace('$1', `$${scope.args.length || 1}`)}
       order by e.starts_on nulls last limit 8`, scope.args),
    q(`${LIST_SQL} where not e.archived and e.status = 'en_proceso' ${scope.sql} order by e.starts_on nulls last limit 8`, scope.args),
    q(`select t.id, t.title, t.status, t.due_on, t.event_id, e.name event_name, e.ref, (t.due_on < current_date) overdue
       from tasks t join events e on e.id = t.event_id
       where not e.archived and t.owner_id = $${scope.args.length + 1} and t.status not in ('finalizada', 'archivada') ${scope.sql}
       order by t.due_on nulls last, t.created_at limit 12`, [...scope.args, req.user.id]),
    q(`${LIST_SQL} where not e.archived and e.status = 'terminado' and not e.invoiced and coalesce(e.cost, 0) > 0 ${scope.sql} order by e.ends_on nulls last limit 10`, scope.args),
  ]);
  res.json({ counts: { ...counts.rows[0], tareas_vencidas: overdue.rows[0].n }, upcoming: upcoming.rows, inProgress: inProgress.rows, myTasks: mine.rows, toInvoice: toInvoice.rows });
}));

// ───────── Administración (solo administradores): personal del equipo, clientes, tipos y secciones ─────────
const tempPassword = () => randomToken(9);
const userOut = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role, active: u.active, pending: Boolean(u.invite_hash) || u.must_change_password, created_at: u.created_at });

app.get('/api/admin/users', ...admins, wrap(async (_req, res) => {
  res.json({ users: (await q('select * from team_users order by active desc, coalesce(nullif(name, \'\'), email)')).rows.map(userOut), mail: mailEnabled() });
}));
app.post('/api/admin/users', ...admins, wrap(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim().slice(0, 120);
  const role = String(req.body.role || 'member');
  if (!/^\S+@\S+\.\S+$/.test(email)) throw fail(400, 'Escribe un correo válido');
  if (!['super_admin', 'admin', 'member'].includes(role)) throw fail(400, 'Rol no válido');
  if (role === 'super_admin' && req.user.role !== 'super_admin') throw fail(403, 'Solo un superadministrador puede crear a otro');
  if ((await q('select 1 from team_users where email = $1', [email])).rows[0]) throw fail(409, 'Ya hay una persona con ese correo');
  const temp = tempPassword();
  const u = (await q('insert into team_users (email, name, role, password_hash) values ($1,$2,$3,$4) returning *', [email, name, role, hashPassword(temp)])).rows[0];
  let emailed = false, mailError = null;
  try { await sendInvite(u); emailed = true; } catch (e) { mailError = e.message; }
  console.log(`[equipo] ${req.user.email} da de alta a ${email} (${role}) ${emailed ? '· invitación enviada' : '· sin correo'}`);
  res.json({ user: userOut(u), emailed, mailError, ...(emailed ? {} : { temp_password: temp }) });
}));
app.patch('/api/admin/users/:id', ...admins, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) throw fail(404, 'No existe esa persona');
  const u = (await q('select * from team_users where id = $1', [req.params.id])).rows[0];
  if (!u) throw fail(404, 'No existe esa persona');
  const me = u.id === req.user.id;
  if (u.role === 'super_admin' && req.user.role !== 'super_admin') throw fail(403, 'Solo un superadministrador puede cambiar a otro');
  const b = req.body, out = {};
  if (b.name !== undefined) await q('update team_users set name = $1 where id = $2', [String(b.name).trim().slice(0, 120), u.id]);
  if (b.role !== undefined) {
    if (me) throw fail(400, 'No puedes cambiar tu propio rol');
    if (!['super_admin', 'admin', 'member'].includes(b.role)) throw fail(400, 'Rol no válido');
    if (b.role === 'super_admin' && req.user.role !== 'super_admin') throw fail(403, 'Solo un superadministrador puede nombrar a otro');
    await q('update team_users set role = $1 where id = $2', [b.role, u.id]);
  }
  if (b.active !== undefined) {
    if (me) throw fail(400, 'No puedes desactivarte a ti mismo');
    await q('update team_users set active = $1 where id = $2', [Boolean(b.active), u.id]);
    if (!b.active) await q('delete from sessions where user_id = $1', [u.id]);
  }
  if (b.resend_invite) {
    try { await sendInvite(u, { reminder: true }); out.emailed = true; } catch (e) { out.emailed = false; out.mailError = e.message; }
  }
  if (b.reset_password) {
    const temp = tempPassword();
    await q('update team_users set password_hash = $1, must_change_password = true where id = $2', [hashPassword(temp), u.id]);
    await q('delete from sessions where user_id = $1', [u.id]);
    out.temp_password = temp;
  }
  res.json({ ok: true, ...out, user: userOut((await q('select * from team_users where id = $1', [u.id])).rows[0]) });
}));

const color = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v ?? '')) ? String(v).toLowerCase() : d);
app.post('/api/admin/clients', ...admins, wrap(async (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80), code = String(req.body.code || '').trim().toUpperCase();
  if (!name) throw fail(400, 'Pon el nombre del cliente');
  if (!/^[A-Z]{2,5}$/.test(code)) throw fail(400, 'El código son de 2 a 5 letras (por ejemplo ALB)');
  try {
    const r = await q('insert into clients (name, code, color, position) values ($1,$2,$3,(select coalesce(max(position), 0) + 1 from clients)) returning *', [name, code, color(req.body.color, '#0f766e')]);
    res.json({ client: r.rows[0] });
  } catch (e) { throw /unique|duplicate/i.test(e.message) ? fail(409, 'Ya hay un cliente con ese nombre o ese código') : e; }
}));
app.patch('/api/admin/clients/:id', ...admins, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) throw fail(404, 'No existe ese cliente');
  const b = req.body, cur = (await q('select * from clients where id = $1', [req.params.id])).rows[0];
  if (!cur) throw fail(404, 'No existe ese cliente');
  const name = b.name !== undefined ? String(b.name).trim().slice(0, 80) : cur.name;
  if (!name) throw fail(400, 'Pon el nombre del cliente');
  try {
    const r = await q('update clients set name = $1, color = $2, archived = $3 where id = $4 returning *', [name, color(b.color, cur.color), b.archived !== undefined ? Boolean(b.archived) : cur.archived, cur.id]);
    res.json({ client: r.rows[0] });
  } catch (e) { throw /unique|duplicate/i.test(e.message) ? fail(409, 'Ya hay un cliente con ese nombre') : e; }
}));

// Ubicaciones: fichas con dirección, aforo y notas. Las acciones guardan el nombre; al renombrar se actualiza en ellas.
const cleanLocation = (b, cur = {}) => {
  const name = b.name !== undefined ? String(b.name).trim().slice(0, 80) : cur.name;
  if (!name) throw fail(400, 'Pon el nombre de la ubicación');
  const cap = b.capacity !== undefined ? (b.capacity === '' || b.capacity === null ? null : Math.round(Number(b.capacity))) : cur.capacity ?? null;
  if (cap !== null && (!Number.isFinite(cap) || cap < 0 || cap > 1000000)) throw fail(400, 'El aforo no es válido');
  return { name, capacity: cap, address: b.address !== undefined ? String(b.address).trim().slice(0, 200) : cur.address ?? '', notes: b.notes !== undefined ? String(b.notes).trim().slice(0, 2000) : cur.notes ?? '' };
};
app.get('/api/admin/locations', ...admins, wrap(async (_req, res) => {
  res.json({ locations: (await q(`select l.*, (select count(*) from events e where e.location = l.name and not e.archived)::int events from locations l order by l.position, l.name`)).rows });
}));
app.post('/api/admin/locations', ...admins, wrap(async (req, res) => {
  const d = cleanLocation(req.body);
  try {
    const r = await q('insert into locations (name, address, capacity, notes, position) values ($1,$2,$3,$4,(select coalesce(max(position), 0) + 1 from locations)) returning *', [d.name, d.address, d.capacity, d.notes]);
    res.json({ location: r.rows[0] });
  } catch (e) { throw /unique|duplicate/i.test(e.message) ? fail(409, 'Ya hay una ubicación con ese nombre') : e; }
}));
app.patch('/api/admin/locations/:id', ...admins, wrap(async (req, res) => {
  if (!isUuid(req.params.id)) throw fail(404, 'No existe esa ubicación');
  const cur = (await q('select * from locations where id = $1', [req.params.id])).rows[0];
  if (!cur) throw fail(404, 'No existe esa ubicación');
  const d = cleanLocation(req.body, cur);
  try {
    const r = await q('update locations set name = $1, address = $2, capacity = $3, notes = $4 where id = $5 returning *', [d.name, d.address, d.capacity, d.notes, cur.id]);
    if (d.name !== cur.name) await q('update events set location = $1 where location = $2', [d.name, cur.name]);
    res.json({ location: r.rows[0] });
  } catch (e) { throw /unique|duplicate/i.test(e.message) ? fail(409, 'Ya hay una ubicación con ese nombre') : e; }
}));
app.delete('/api/admin/locations/:id', ...admins, wrap(async (req, res) => {   // las acciones que la usaban conservan el nombre escrito
  if (!isUuid(req.params.id)) throw fail(404, 'No existe esa ubicación');
  await q('delete from locations where id = $1', [req.params.id]);
  res.json({ ok: true });
}));

for (const [route, table, hasColor] of [['types', 'event_types', true], ['sections', 'task_sections', true]]) {
  app.post(`/api/admin/${route}`, ...admins, wrap(async (req, res) => {
    const name = String(req.body.name || '').trim().slice(0, 60);
    if (!name) throw fail(400, 'Pon el nombre');
    try {
      const r = await q(`insert into ${table} (name, ${hasColor ? 'color, ' : ''}position) values ($1, ${hasColor ? '$2, ' : ''}(select coalesce(max(position), 0) + 1 from ${table})) returning *`, hasColor ? [name, color(req.body.color, '#667085')] : [name]);
      res.json({ item: r.rows[0] });
    } catch (e) { throw /unique|duplicate/i.test(e.message) ? fail(409, 'Ya existe uno con ese nombre') : e; }
  }));
  app.patch(`/api/admin/${route}/:id`, ...admins, wrap(async (req, res) => {
    if (!isUuid(req.params.id)) throw fail(404, 'No existe');
    const cur = (await q(`select * from ${table} where id = $1`, [req.params.id])).rows[0];
    if (!cur) throw fail(404, 'No existe');
    const name = req.body.name !== undefined ? String(req.body.name).trim().slice(0, 60) : cur.name;
    if (!name) throw fail(400, 'Pon el nombre');
    try {
      const r = hasColor
        ? await q(`update ${table} set name = $1, color = $2 where id = $3 returning *`, [name, color(req.body.color, cur.color), cur.id])
        : await q(`update ${table} set name = $1 where id = $2 returning *`, [name, cur.id]);
      res.json({ item: r.rows[0] });
    } catch (e) { throw /unique|duplicate/i.test(e.message) ? fail(409, 'Ya existe uno con ese nombre') : e; }
  }));
  app.delete(`/api/admin/${route}/:id`, ...admins, wrap(async (req, res) => {   // las acciones y tareas que lo usaban se quedan sin tipo o sin sección
    if (!isUuid(req.params.id)) throw fail(404, 'No existe');
    await q(`delete from ${table} where id = $1`, [req.params.id]);
    res.json({ ok: true });
  }));
}

// ───────── Páginas ─────────
app.get('/invitacion', (_req, res) => res.sendFile(path.join(PUBLIC, 'invitacion.html')));
app.use(express.static(PUBLIC, { index: 'index.html', extensions: ['html'], setHeaders: (res, p) => { if (/\.(js|css|html)$/.test(p)) res.setHeader('Cache-Control', 'no-cache'); } }));
app.use('/api', (_req, res) => res.status(404).json({ error: 'No existe' }));
app.use((err, _req, res, _next) => {
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Error del servidor' });
});

if (process.env.EVENTS_NO_LISTEN !== '1') {
  const port = Number(process.env.PORT || 3004);
  app.listen(port, '127.0.0.1', () => console.log(`Avania Events en 127.0.0.1:${port}`));
}
