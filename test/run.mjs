// Pruebas de Avania Events contra una base de datos en memoria (PGlite): acceso, permisos, acciones, tareas, panel y administración.
process.env.EVENTS_PGLITE = '1';
process.env.EVENTS_NO_LISTEN = '1';
delete process.env.DATABASE_URL;
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
const login = async (email, pw = 'una-clave-larga-123') => { const c = new Client(); const r = await c.call('POST', '/api/login', { email, password: pw }); return { c, r }; };

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
await ana.call('PATCH', `/api/events/${ev2.id}`, { status: 'terminado' });
await ana.call('PATCH', `/api/events/${ev2.id}`, { invoiced: false });
await ana.call('PATCH', `/api/tasks/${t2.id}`, { due_on: '2020-01-01', owner_id: anaId });
r = (await ana.call('GET', '/api/dashboard')).j;
ok('cuenta lo pendiente de facturar', r.counts.por_facturar === 1 && r.counts.por_facturar_importe === 4631, JSON.stringify(r.counts));
ok('cuenta tareas vencidas y las tuyas', r.counts.tareas_vencidas === 1 && r.myTasks.some((t) => t.id === t2.id && t.overdue === true));
ok('lista lo pendiente de facturar', r.toInvoice.length === 1 && r.toInvoice[0].id === ev2.id);

console.log('Archivar y borrar');
ok('archivar', (await ana.call('DELETE', `/api/events/${ev2.id}`)).j.ok === true);
ok('lo archivado no sale en la lista', !(await ana.call('GET', '/api/events')).j.events.some((e) => e.id === ev2.id));
ok('un miembro no borra de verdad', (await ana.call('DELETE', `/api/events/${ev2.id}?hard=1`)).s === 403);
ok('un administrador sí', (await admin.call('DELETE', `/api/events/${ev2.id}?hard=1`)).j.deleted === true);

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

console.log('Salud');
ok('/api/health', (await new Client().call('GET', '/api/health')).j.ok === true);
ok('una ruta rara de la API → 404', (await ana.call('GET', '/api/nada')).s === 404);

server.close(); await closeDb();
console.log(`\n${failed ? 'FALLAN' : 'TODO BIEN'}: ${pass} pruebas correctas, ${failed} con fallo`);
process.exit(failed ? 1 : 0);
