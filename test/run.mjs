// Pruebas de Avania Events contra una base de datos en memoria (PGlite): acceso, permisos, acciones, tareas, panel y administración.
process.env.EVENTS_PGLITE = '1';
process.env.EVENTS_NO_LISTEN = '1';
for (const k of ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'GOOGLE_SA_FILE', 'DRIVE_ROOT_FOLDER', 'NOTION_TOKEN']) process.env[k] = '';   // las pruebas nunca envían correos de verdad
process.env.DATABASE_URL = '';   // vacío (no borrado): dotenv no lo rellena desde .env y las pruebas nunca tocan la base real
const { migrate } = await import('../src/migrate.js');
const { q, closeDb } = await import('../src/db.js');
const { hashPassword } = await import('../src/crypto.js');
const { app } = await import('../src/index.js');
await migrate(() => {});

const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
let pass = 0, failed = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; } else { failed++; console.log(`  ✗ ${name} ${extra}`); } };

class Client {
  constructor() { this.cookie = ''; }
  async call(method, url, body) {
    const r = await fetch(base + url, { method, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(this.cookie ? { cookie: this.cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) this.cookie = sc.split(';')[0];
    let json = {}; try { json = await r.json(); } catch { /* sin cuerpo */ }
    return { s: r.status, j: json };
  }
}
const mkUser = async (email, role, pw = 'una-clave-larga-123', must = false) => q('insert into team_users (email, name, role, password_hash, must_change_password) values ($1,$2,$3,$4,$5) returning id', [email, email.split('@')[0], role, hashPassword(pw), must]);
await mkUser('super@avania.es', 'super_admin'); await mkUser('admin@avania.es', 'admin'); await mkUser('ana@avania.es', 'member'); await mkUser('nueva@avania.es', 'member', 'temporal-123456', true);
const login = async (email, pw = 'una-clave-larga-123', locked = false) => {
  const c = new Client(); const r = await c.call('POST', '/api/login', { email, password: pw });
  if (!locked && r.s === 200 && !r.j.user?.must_change_password) await c.call('POST', '/api/informes/acceso', { email, password: pw });   // la mayoría de pruebas trabajan con los importes a la vista
  return { c, r };
};

console.log('Acceso');
ok('sin sesión no entra', (await new Client().call('GET', '/api/meta')).s === 401);
ok('contraseña mala → 401', (await login('ana@avania.es', 'mala')).r.s === 401);
const ana = (await login('ana@avania.es')).c, admin = (await login('admin@avania.es')).c, sup = (await login('super@avania.es')).c;
const nueva = (await login('nueva@avania.es', 'temporal-123456')).c;
ok('con contraseña temporal no se usa nada hasta cambiarla', (await nueva.call('GET', '/api/meta')).s === 403);
ok('cambia la temporal', (await nueva.call('POST', '/api/password', { current: 'temporal-123456', next: 'otra-clave-larga-456' })).s === 200);
ok('ya puede entrar', (await nueva.call('GET', '/api/meta')).s === 200);

console.log('Datos de partida');
const meta = (await ana.call('GET', '/api/meta')).j;
ok('2 clientes, 7 tipos, 8 secciones', meta.clients.length === 2 && meta.types.length === 7 && meta.sections.length === 8);
const alb = meta.clients.find((c) => c.code === 'ALB'), ucl = meta.clients.find((c) => c.code === 'UCL');
const tipoSorteo = meta.types.find((t) => t.name === 'Sorteo'), tipoGastro = meta.types.find((t) => t.name === 'Gastronomía');
const secMontaje = meta.sections.find((s) => s.name === 'Montaje'), secPersonal = meta.sections.find((s) => s.name === 'Personal');
const anaId = meta.users.find((u) => u.email === 'ana@avania.es').id;

console.log('Acciones');
let r = await ana.call('POST', '/api/events', { client_id: alb.id, name: 'Ruleta de verano', type_id: tipoSorteo.id, starts_on: '2026-07-02', ends_on: '2026-07-18', location: 'Plaza Central', cost: '1.250,5'.replace('.', '') });
ok('crea una acción', r.s === 200 && r.j.event.ref === 'ALB-001' && r.j.event.year === 2026, JSON.stringify(r.j));
const ev1 = r.j.event;
ok('el responsable por defecto es quien la crea', ev1.owner_id === anaId);
r = await ana.call('POST', '/api/events', { client_id: alb.id, name: 'Gastro Albacenter', type_id: tipoGastro.id, starts_on: '2026-05-14', status: 'en_proceso', cost: 4631 });
ok('numeración correlativa por cliente', r.j.event.ref === 'ALB-002');
const ev2 = r.j.event;
r = await ana.call('POST', '/api/events', { client_id: ucl.id, name: 'Jornada de bienvenida', starts_on: '2025-09-20' });
ok('otro cliente empieza en 001 y el año sale de la fecha', r.j.event.ref === 'UCL-001' && r.j.event.year === 2025);
r = await ana.call('POST', '/api/events', { client_id: alb.id, name: 'Tarjeta regalo febrero', year: 2026 });
ok('sin fecha usa el año indicado', r.j.event.year === 2026 && r.j.event.starts_on === null);
ok('nombre vacío → 400', (await ana.call('POST', '/api/events', { client_id: alb.id, name: '  ' })).s === 400);
ok('fin anterior al inicio → 400', (await ana.call('POST', '/api/events', { client_id: alb.id, name: 'x', starts_on: '2026-05-10', ends_on: '2026-05-01' })).s === 400);
ok('estado inválido → 400', (await ana.call('PATCH', `/api/events/${ev1.id}`, { status: 'raro' })).s === 400);
ok('cliente inexistente → 400', (await ana.call('POST', '/api/events', { client_id: '11111111-1111-4111-8111-111111111111', name: 'x' })).s === 400);

r = await ana.call('PATCH', `/api/events/${ev1.id}`, { status: 'en_proceso', invoiced: true, description: 'Ruleta en Plaza Central', links: [{ name: 'Bases', url: 'https://drive.google.com/x' }, { name: 'mala', url: 'javascript:alert(1)' }], collaborators: [meta.users.find((u) => u.email === 'admin@avania.es').id] });
ok('edita estado, facturado y enlaces', r.s === 200 && r.j.event.status === 'en_proceso' && r.j.event.invoiced === true && r.j.event.links.length === 1, JSON.stringify(r.j));
r = await ana.call('GET', `/api/events/${ev1.id}`);
ok('el detalle trae colaboradores', r.j.event.collaborators.length === 1);
ok('el cambio de estado queda en el registro', (await ana.call('GET', `/api/events/${ev1.id}/log`)).j.log.some((l) => l.action === 'cambiar'));

console.log('Tareas');
r = await ana.call('POST', `/api/events/${ev1.id}/tasks`, { title: 'Contratar azafatas', section_id: secPersonal.id, cost: 450, due_on: '2026-06-20', owner_id: anaId });
ok('crea tarea', r.s === 200 && r.j.task.position === 1);
const t1 = r.j.task;
r = await ana.call('POST', `/api/events/${ev1.id}/tasks`, { title: 'Montar ruleta', section_id: secMontaje.id });
const t2 = r.j.task;
ok('posición correlativa', t2.position === 2);
r = await ana.call('POST', `/api/events/${ev1.id}/tasks`, { title: 'Subtarea', parent_id: t1.id });
ok('subtarea', r.s === 200 && r.j.task.parent_id === t1.id);
ok('tarea sin título → 400', (await ana.call('POST', `/api/events/${ev1.id}/tasks`, { title: '' })).s === 400);
r = await ana.call('PATCH', `/api/tasks/${t1.id}`, { status: 'finalizada' });
ok('finalizar guarda cuándo', r.j.task.status === 'finalizada' && r.j.task.done_at);
r = await ana.call('PATCH', `/api/tasks/${t1.id}`, { status: 'en_curso' });
ok('reabrir quita la fecha', r.j.task.done_at === null);
await ana.call('PATCH', `/api/tasks/${t1.id}`, { status: 'finalizada' });
r = await ana.call('GET', '/api/events?year=2026&client=' + alb.id);
const row1 = r.j.events.find((e) => e.id === ev1.id);
ok('la lista cuenta tareas hechas y el coste', row1.tasks_total === 3 && row1.tasks_done === 1 && row1.tasks_cost === 450, JSON.stringify(row1));
r = await ana.call('GET', '/api/events?year=2026&client=' + alb.id);
ok('filtra por año y cliente', r.j.events.length === 3 && r.j.events.every((e) => e.year === 2026));
ok('filtra por tipo', (await ana.call('GET', '/api/events?type=' + tipoSorteo.id)).j.events.length === 1);
ok('filtra por estado', (await ana.call('GET', '/api/events?status=en_proceso')).j.events.length === 2);
ok('busca por nombre', (await ana.call('GET', '/api/events?search=gastro')).j.events.length === 1);
ok('busca por referencia', (await ana.call('GET', '/api/events?search=ALB-001')).j.events.length === 1);
ok('filtro con id raro → 400', (await ana.call('GET', '/api/events?type=zzz')).s === 400);

console.log('Panel de inicio');
const sinCierre = await ana.call('PATCH', `/api/events/${ev2.id}`, { status: 'terminado', rating: 4 });
ok('no se cierra sin la ficha de cierre y los costes', sinCierre.s === 400 && sinCierre.j.code === 'cierre_incompleto' && sinCierre.j.missing.length >= 5 && !sinCierre.j.missing.some((m) => /patrocin/i.test(m)), JSON.stringify(sinCierre.j));
await ana.call('POST', `/api/events/${ev2.id}/tasks`, { title: 'Catering', cost: 100 });
const cierre = await ana.call('PATCH', `/api/events/${ev2.id}`, { status: 'terminado', rating: 4, participants: 300, kpi_result: 'Bien', incidents: 'Ninguna', improvements: 'Más personal', notes_next: 'Repetir', budget: 4631 });
ok('cierra con todo rellenado (patrocinadores opcional)', cierre.s === 200 && cierre.j.event.status === 'terminado', JSON.stringify(cierre.j));
await ana.call('PATCH', `/api/events/${ev2.id}`, { invoiced: false });
await ana.call('PATCH', `/api/tasks/${t2.id}`, { due_on: '2020-01-01', owner_id: anaId });
r = (await ana.call('GET', '/api/dashboard')).j;
ok('cuenta lo pendiente de facturar', r.counts.por_facturar === 1 && r.counts.por_facturar_importe === 4631, JSON.stringify(r.counts));
ok('cuenta tareas vencidas y las tuyas', r.counts.tareas_vencidas === 1 && r.myTasks.some((t) => t.id === t2.id && t.overdue === true));
ok('lista lo pendiente de facturar', r.toInvoice.length === 1 && r.toInvoice[0].id === ev2.id);
ok('guarda el presupuesto a cliente', (await ana.call('GET', `/api/events/${ev2.id}`)).j.event.budget === 4631);

console.log('Archivar y borrar');
ok('archivar', (await ana.call('DELETE', `/api/events/${ev2.id}`)).j.ok === true);
ok('lo archivado no sale en la lista', !(await ana.call('GET', '/api/events')).j.events.some((e) => e.id === ev2.id));
ok('un miembro no borra de verdad', (await ana.call('DELETE', `/api/events/${ev2.id}?hard=1`)).s === 403);
{ const dr = await admin.call('DELETE', `/api/events/${ev2.id}?hard=1`); if (dr.j.deleted !== true) console.log('borrar →', dr.s, JSON.stringify(dr.j)); ok('un administrador sí', dr.j.deleted === true); }

console.log('Administración');
ok('un miembro no entra en Administración', (await ana.call('GET', '/api/admin/users')).s === 403);
ok('un administrador sí', (await admin.call('GET', '/api/admin/users')).s === 200);
r = await admin.call('POST', '/api/admin/users', { email: 'Luis@Avania.es', name: 'Luis Pérez', role: 'member' });
ok('da de alta a una persona (sin SMTP devuelve la contraseña temporal)', r.s === 200 && r.j.user.email === 'luis@avania.es' && r.j.emailed === false && r.j.temp_password, JSON.stringify(r.j));
const luis = r.j.user;
ok('correo repetido → 409', (await admin.call('POST', '/api/admin/users', { email: 'luis@avania.es', role: 'member' })).s === 409);
ok('correo inválido → 400', (await admin.call('POST', '/api/admin/users', { email: 'luis', role: 'member' })).s === 400);
ok('un administrador no crea superadministradores', (await admin.call('POST', '/api/admin/users', { email: 'otro@avania.es', role: 'super_admin' })).s === 403);
ok('un superadministrador sí', (await sup.call('POST', '/api/admin/users', { email: 'otro@avania.es', role: 'super_admin' })).s === 200);
ok('cambia el rol de otra persona', (await admin.call('PATCH', `/api/admin/users/${luis.id}`, { role: 'admin' })).j.user.role === 'admin');
ok('no se cambia su propio rol', (await admin.call('PATCH', `/api/admin/users/${meta.users.find((u) => u.email === 'admin@avania.es').id}`, { role: 'member' })).s === 400);
ok('un administrador no toca a un superadministrador', (await admin.call('PATCH', `/api/admin/users/${meta.users.find((u) => u.email === 'super@avania.es').id}`, { active: false })).s === 403);
r = await admin.call('PATCH', `/api/admin/users/${luis.id}`, { reset_password: true });
ok('restablece la contraseña', r.j.temp_password && r.j.user.pending === true);
const luisC = (await login('luis@avania.es', r.j.temp_password)).c;
ok('con la nueva temporal entra pero debe cambiarla', (await luisC.call('GET', '/api/meta')).s === 403);
await admin.call('PATCH', `/api/admin/users/${luis.id}`, { active: false });
ok('desactivada: sus sesiones se cierran', (await luisC.call('GET', '/api/me')).s === 401);
ok('desactivada: no puede entrar', (await login('luis@avania.es', r.j.temp_password)).r.s === 401);
ok('crea cliente', (await admin.call('POST', '/api/admin/clients', { name: 'Nuevo Cliente', code: 'nuc', color: '#123456' })).j.client.code === 'NUC');
ok('código repetido → 409', (await admin.call('POST', '/api/admin/clients', { name: 'Otro', code: 'ALB' })).s === 409);
ok('código raro → 400', (await admin.call('POST', '/api/admin/clients', { name: 'Otro', code: 'a1' })).s === 400);
r = await admin.call('POST', '/api/admin/types', { name: 'Taller', color: '#ff0000' });
ok('crea tipo', r.s === 200);
ok('borra tipo', (await admin.call('DELETE', `/api/admin/types/${r.j.item.id}`)).j.ok === true);
ok('un miembro no crea tipos', (await ana.call('POST', '/api/admin/types', { name: 'Zzz' })).s === 403);

console.log('Invitación por enlace');
const { sha256 } = await import('../src/crypto.js');
await q('update team_users set invite_hash = $1, invite_expires_at = now() + interval \'1 hour\', active = true where id = $2', [sha256('tok123'), luis.id]);
ok('el enlace es válido', (await new Client().call('GET', '/api/invitacion/tok123')).j.email === 'luis@avania.es');
ok('contraseña corta → 400', (await new Client().call('POST', '/api/invitacion/tok123', { password: 'corta' })).s === 400);
ok('elige contraseña', (await new Client().call('POST', '/api/invitacion/tok123', { password: 'mi-clave-nueva-123' })).j.ok === true);
ok('el enlace sirve una sola vez', (await new Client().call('GET', '/api/invitacion/tok123')).s === 404);
ok('ya entra con su clave', (await login('luis@avania.es', 'mi-clave-nueva-123')).r.s === 200);

console.log('Informes con usuario y contraseña');
{
  const c = (await login('ana@avania.es', undefined, true)).c;
  ok('informes cerrados al entrar', (await c.call('GET', '/api/informes')).s === 403 && (await c.call('GET', '/api/informes/estado')).j.unlocked === false);
  ok('contraseña mala → 401', (await c.call('POST', '/api/informes/acceso', { email: 'ana@avania.es', password: 'mala' })).s === 401);
  ok('usuario de otra persona → 401', (await c.call('POST', '/api/informes/acceso', { email: 'admin@avania.es', password: 'una-clave-larga-123' })).s === 401);
  ok('con usuario y contraseña se abren', (await c.call('POST', '/api/informes/acceso', { email: 'ANA@avania.es', password: 'una-clave-larga-123' })).j.unlocked === true);
  ok('ya devuelve las acciones con importes', Array.isArray((await c.call('GET', '/api/informes')).j.events));
  ok('otra sesión sigue cerrada', (await (await login('ana@avania.es', undefined, true)).c.call('GET', '/api/informes')).s === 403);
  await c.call('POST', '/api/informes/bloquear');
  ok('se pueden volver a bloquear', (await c.call('GET', '/api/informes')).s === 403);
}


console.log('Importes ocultos hasta desbloquear');
{
  const open = (await login('ana@avania.es')).c;
  const ev = (await open.call('GET', '/api/events')).j.events.find((e) => e.cost != null) || (await open.call('GET', '/api/events')).j.events[0];
  await open.call('PATCH', `/api/events/${ev.id}`, { cost: 123.45, budget: 777 });
  const locked = (await login('ana@avania.es', undefined, true)).c;
  const lst = (await locked.call('GET', '/api/events')).j;
  ok('la lista sale sin importes', lst.costs_unlocked === false && lst.events.every((e) => e.cost === null && e.tasks_cost === null));
  const det = (await locked.call('GET', `/api/events/${ev.id}`)).j;
  ok('la ficha sale sin importes', det.event.cost === null && det.event.budget === null && det.tasks.every((t) => t.cost === null));
  const dash = (await locked.call('GET', '/api/dashboard')).j;
  ok('el inicio no trae importes', dash.counts.por_facturar_importe === null && dash.counts.coste_anio === null);
  ok('no deja cambiar importes bloqueado', (await locked.call('PATCH', `/api/events/${ev.id}`, { cost: 1 })).s === 403 && (await locked.call('PATCH', `/api/events/${ev.id}`, { budget: 1 })).s === 403);
  ok('sí deja cambiar otras cosas', (await locked.call('PATCH', `/api/events/${ev.id}`, { description: 'x' })).s === 200);
  const again = (await open.call('GET', `/api/events/${ev.id}`)).j;
  ok('con la sesión desbloqueada se ven', again.costs_unlocked === true && again.event.cost === 123.45);
}

console.log('Pendientes y tareas tipo');
{
  const c = (await login('ana@avania.es')).c;
  const meta2 = (await c.call('GET', '/api/meta')).j, cli = meta2.clients[0].id, sec = meta2.sections[0].id;
  const mk = async (name, tasks) => (await c.call('POST', '/api/events', { name, client_id: cli, starts_on: '2026-05-01', clone_tasks: tasks })).j.event;
  const a = await mk('Origen 1', [{ title: 'Veleros y A3', section_id: sec }, { title: 'Bases legales', section_id: sec }]);
  const b = await mk('Origen 2', [{ title: 'veleros y a3', section_id: sec }]);
  const det = (await c.call('GET', `/api/events/${a.id}`)).j;
  ok('al crear se clonan las tareas elegidas', det.tasks.length === 2 && det.tasks.every((t) => t.status === 'sin_empezar'));
  const tpl = (await c.call('GET', '/api/task-templates')).j.templates;
  ok('el recopilatorio ofrece las que se repiten', tpl.some((x) => /veleros/i.test(x.title) && x.count >= 2) && !tpl.some((x) => /bases legales/i.test(x.title)));
  const p1 = (await c.call('GET', '/api/pendientes')).j;
  ok('pendientes trae las tareas sin terminar', p1.tasks.some((t) => t.event_id === a.id) && p1.seen_today === false);
  await c.call('POST', '/api/pendientes/visto');
  ok('tras verlo no vuelve a salir hoy', (await c.call('GET', '/api/pendientes')).j.seen_today === true);
  ok('el aviso no lleva importes', !JSON.stringify(p1).includes('"cost"'));
  await c.call('DELETE', `/api/events/${a.id}?hard=1`); await c.call('DELETE', `/api/events/${b.id}?hard=1`);
}

console.log('Clonar acción');
{
  const c = (await login('ana@avania.es')).c;
  const meta3 = (await c.call('GET', '/api/meta')).j, sec = meta3.sections[0].id;
  const or_ = await c.call('POST', '/api/events', { name: 'Original', client_id: meta3.clients[0].id, starts_on: '2026-02-28', ends_on: '2026-03-02', cost: 500, clone_tasks: [{ title: 'Una', section_id: sec }, { title: 'Dos', section_id: sec }] }); if (!or_.j.event) console.log('crear →', or_.s, JSON.stringify(or_.j)); const o = or_.j.event;
  const full = (await c.call('GET', `/api/events/${o.id}`)).j;
  await c.call('PATCH', `/api/tasks/${full.tasks[0].id}`, { status: 'finalizada', due_on: '2026-02-20', cost: 40 });
  const clr = await c.call('POST', `/api/events/${o.id}/clone`, { year: 2027 }); const cl = clr.j; if (!cl.event) console.log('clone →', clr.s, JSON.stringify(cl));
  ok('se clona con nueva referencia y año', cl.event.year === 2027 && cl.event.ref !== o.ref && cl.event.status === 'sin_empezar');
  ok('las fechas pasan al año elegido', cl.event.starts_on === '2027-02-28' && cl.event.ends_on === '2027-03-02');
  const cd = (await c.call('GET', `/api/events/${cl.event.id}`)).j;
  ok('copia las tareas sin hacer y sin importes', cd.tasks.length === 2 && cd.tasks.every((t) => t.status === 'sin_empezar' && t.cost === null) && cd.event.cost === null);
  ok('mueve la fecha límite de las tareas', cd.tasks.some((t) => t.due_on === '2027-02-20'));
  ok('año no válido → 400', (await c.call('POST', `/api/events/${o.id}/clone`, { year: 1800 })).s === 400);
  await c.call('DELETE', `/api/events/${o.id}?hard=1`); await c.call('DELETE', `/api/events/${cl.event.id}?hard=1`);
}

console.log('Registro de actividad');
{
  const a = admin, m = ana;   // sesiones ya abiertas (el limitador de accesos frena demasiados inicios seguidos)
  const cid = (await m.call('GET', '/api/meta')).j.clients?.[0]?.id; const evr = await m.call('POST', '/api/events', { name: 'Con registro', client_id: cid }); if (!evr.j.event) console.log('crear →', evr.s, JSON.stringify(evr.j)); const ev = evr.j.event;
  await m.call('PATCH', `/api/events/${ev.id}`, { description: 'x', cost: 999 });
  await new Promise((r) => setTimeout(r, 300));
  const log = (await a.call('GET', '/api/admin/actividad?limit=300')).j;
  ok('un administrador ve el registro', log.entries.length > 0 && Array.isArray(log.people));
  ok('queda el inicio de sesión', log.entries.some((x) => x.action === 'Inicio de sesión' && x.actor));
  ok('queda la creación y la modificación', log.entries.some((x) => /Creó la acción «Con registro»/.test(x.summary)) && log.entries.some((x) => /Modificó/.test(x.summary) && x.event_id === ev.id));
  { const txt = log.entries.map((x) => `${x.action} ${x.summary}`).join(' '); ok('no guarda importes ni contraseñas', !txt.includes('999') && !txt.includes('una-clave-larga')); }
  ok('un usuario normal no lo ve', (await m.call('GET', '/api/admin/actividad')).s === 403);
  ok('filtra por tipo', (await a.call('GET', '/api/admin/actividad?category=accesos')).j.entries.every((x) => x.category === 'accesos'));
  await m.call('DELETE', `/api/events/${ev.id}?hard=1`);
}

console.log('Proveedores y producción');
{
  const prs = (await admin.call('GET', '/api/admin/providers')).j.providers;
  ok('viene Top Impresión de serie', prs.some((x) => x.name === 'Top Impresión' && x.email === 'topimpresion@gmail.com'));
  ok('un miembro no gestiona proveedores', (await ana.call('GET', '/api/admin/providers')).s === 403 && (await ana.call('GET', '/api/providers')).s === 200);
  const nw = (await admin.call('POST', '/api/admin/providers', { name: 'Prueba SL', email: 'no-es-correo' })).s;
  ok('correo no válido → 400', nw === 400);
  const ok1 = (await admin.call('POST', '/api/admin/providers', { name: 'Prueba SL', email: 'a@b.es', phone: '600' })).j.provider;
  ok('crear y borrar proveedor', ok1?.id && (await admin.call('DELETE', `/api/admin/providers/${ok1.id}`)).j.ok === true);
  const evp = (await ana.call('POST', '/api/events', { name: 'Para producción', client_id: (await ana.call('GET', '/api/meta')).j.clients[0].id })).j.event;
  const pr = (await ana.call('GET', `/api/events/${evp.id}/produccion`)).j;
  ok('sin Drive no hay piezas pero responde', pr.drive === false && Array.isArray(pr.items));
  { const r5 = await ana.call('POST', `/api/events/${evp.id}/produccion`, { provider_id: prs[0].id, file_ids: ['x'] }); ok('enviar sin Drive/correo → 503', r5.s === 503, JSON.stringify([r5.s, r5.j])); }
  await ana.call('DELETE', `/api/events/${evp.id}?hard=1`); await admin.call('DELETE', `/api/events/${evp.id}?hard=1`);
}

console.log('Marca de enviado a producción');
{
  const m2 = (await ana.call('GET', '/api/meta')).j;
  const evp = (await ana.call('POST', '/api/events', { name: 'Con envío', client_id: m2.clients[0].id, clone_tasks: [{ title: 'Veleros', section_id: m2.sections[1].id }, { title: 'Otra', section_id: m2.sections[1].id }] })).j.event;
  const det = (await ana.call('GET', `/api/events/${evp.id}`)).j;
  await q("insert into task_files (task_id, event_id, name, folder, drive_file_id) values ($1,$2,'velero.pdf','Creatividades','FILE1')", [det.tasks[0].id, evp.id]);
  await q("insert into production_sends (event_id, provider_name, sent_to, sender_name, files, file_ids) values ($1,'Top Impresión','x@y.es','Ana','[\"velero.pdf\"]'::jsonb,'[\"FILE1\"]'::jsonb)", [evp.id]);
  const after = (await ana.call('GET', `/api/events/${evp.id}`)).j.tasks;
  ok('la tarea con la pieza enviada lleva la marca y la fecha', after.find((t) => t.title === 'Veleros').sent_to_production?.date === new Date().toISOString().slice(0, 10) || /^\d{4}-\d{2}-\d{2}$/.test(after.find((t) => t.title === 'Veleros').sent_to_production?.date));
  ok('la tarea enviada dice quién la envió', after.find((t) => t.title === 'Veleros').sent_to_production?.by === 'Ana' && after.find((t) => t.title === 'Veleros').sent_to_production?.provider === 'Top Impresión');
  ok('la otra tarea no', after.find((t) => t.title === 'Otra').sent_to_production === null);
  await admin.call('DELETE', `/api/events/${evp.id}?hard=1`);
}

console.log('Análisis de resultados (Excel)');
{
  const { default: ExcelJS } = await import('exceljs');
  const { analyzeResults, isResultsFile } = await import('../src/results.js');
  const wb = new ExcelJS.Workbook();
  const d = wb.addWorksheet('Datos');
  d.addRow([]); d.addRow(['DATOS DISFRUTONES - PRUEBA 2026']); d.addRow(['Del 1 al 3 de Mayo de 2026']); d.addRow([]);
  d.addRow(['DÍA', 'Nuevos socios', 'Ya eran Socios', 'Participaciones', 'Cash']); d.addRow([1, 10, 20, 30, 500]); d.addRow([2, 5, 5, 10, 300]);
  d.addRow(['TOTAL Azafatas', 15, 25, 40, 800]); d.addRow(['APP', 12, 20, 55, 0]); d.addRow(['TOTAL', 12, 20, 55, 800]);
  wb.addWorksheet('Comentarios generales').addRows([['COMENTARIOS GENERALES'], ['Que haya más regalos para los socios.']]);
  wb.addWorksheet('Incidencias').addRows([['INCIDENCIAS'], ['La app falló el segundo día y no llegaba el correo de verificación.']]);
  const r = await analyzeResults(Buffer.from(await wb.xlsx.writeBuffer()));
  ok('lee la cifra de participantes del TOTAL final', r.participants === 55);
  ok('recoge incidencias y comentarios', r.incidents.length === 1 && r.comments.length === 1);
  ok('el resumen no trae importes', !/500|800|cash/i.test(r.summary) && /participaciones 40/.test(r.summary));
  ok('reconoce el nombre del archivo', isResultsFile('JOVENTURA - Datos, Comentarios G. e Incidencias DÍA DE LA MADRE 2026.xlsx') && !isResultsFile('presupuesto.pdf'));
}

console.log('Bloqueo por falta de valoración y permisos');
{
  const meta4 = (await ana.call('GET', '/api/meta')).j;
  const evb = (await ana.call('POST', '/api/events', { name: 'Para bloquear', client_id: meta4.clients[0].id, clone_tasks: [{ title: 'Una tarea', section_id: meta4.sections[0].id }] })).j.event;
  ok('en proceso se edita con normalidad', (await ana.call('PATCH', `/api/events/${evb.id}`, { name: 'Para bloquear 2' })).s === 200);
  await q("update events set status = 'terminado' where id = $1", [evb.id]);   // como las del histórico: terminadas sin valoración
  const d1 = (await ana.call('GET', `/api/events/${evb.id}`)).j;
  ok('terminada y sin valoración queda bloqueada', d1.lock.locked === true && d1.lock.needs_rating === true);
  ok('bloqueada: no deja cambiar el nombre', (await ana.call('PATCH', `/api/events/${evb.id}`, { name: 'Otro' })).s === 423);
  ok('bloqueada: no deja tocar tareas ni crear otras', (await ana.call('PATCH', `/api/tasks/${d1.tasks[0].id}`, { title: 'x' })).s === 423 && (await ana.call('POST', `/api/events/${evb.id}/tasks`, { title: 'nueva' })).s === 423);
  ok('bloqueada: no se puede archivar', (await ana.call('DELETE', `/api/events/${evb.id}`)).s === 423);
  ok('bloqueada: el cierre sí se puede rellenar', (await ana.call('PATCH', `/api/events/${evb.id}`, { participants: 120, kpi_result: 'ok' })).s === 200);
  ok('el superusuario edita siempre', (await sup.call('PATCH', `/api/events/${evb.id}`, { description: 'desde super' })).s === 200);
  ok('pedir permiso', (await ana.call('POST', `/api/events/${evb.id}/permiso`, { reason: 'corregir una fecha' })).j.ok === true);
  ok('pedirlo dos veces no duplica', (await ana.call('POST', `/api/events/${evb.id}/permiso`, {})).j.already === true);
  ok('un miembro no ve ni decide permisos', (await ana.call('GET', '/api/permisos')).s === 403);
  const pend = (await sup.call('GET', '/api/permisos')).j.pending.find((x) => x.event_id === evb.id);
  ok('el superusuario ve la petición', Boolean(pend) && (await sup.call('GET', '/api/meta')).j.pending_permissions >= 1);
  ok('rechazar la deja bloqueada', (await sup.call('POST', `/api/permisos/${pend.id}/decidir`, { accept: false })).j.ok === true && (await ana.call('PATCH', `/api/events/${evb.id}`, { name: 'Otro' })).s === 423);
  await ana.call('POST', `/api/events/${evb.id}/permiso`, {});
  const pend2 = (await sup.call('GET', '/api/permisos')).j.pending.find((x) => x.event_id === evb.id);
  await sup.call('POST', `/api/permisos/${pend2.id}/decidir`, { accept: true, hours: 2 });
  ok('con permiso autorizado se puede editar', (await ana.call('PATCH', `/api/events/${evb.id}`, { name: 'Editada con permiso' })).s === 200 && (await ana.call('GET', `/api/events/${evb.id}`)).j.lock.authorized_until);
  await ana.call('PATCH', `/api/events/${evb.id}`, { rating: 5 });
  const d2 = (await ana.call('GET', `/api/events/${evb.id}`)).j;
  ok('con valoración deja de estar bloqueada', d2.lock.needs_rating === false);
  await admin.call('DELETE', `/api/events/${evb.id}?hard=1`);
}

console.log('Salud');
ok('/api/health', (await new Client().call('GET', '/api/health')).j.ok === true);
ok('una ruta rara de la API → 404', (await ana.call('GET', '/api/nada')).s === 404);

server.close(); await closeDb();
console.log(`\n${failed ? 'FALLAN' : 'TODO BIEN'}: ${pass} pruebas correctas, ${failed} con fallo`);
process.exit(failed ? 1 : 0);
