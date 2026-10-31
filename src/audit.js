// Registro de actividad: cada escritura de la API (y los accesos) deja una línea legible. Nunca guarda contraseñas ni importes.
import { q } from './db.js';

const SECRET = new Set(['password', 'current', 'next', 'cost', 'temp_password']);
const keysOf = (b) => Object.keys(b && typeof b === 'object' ? b : {}).filter((k) => !SECRET.has(k) && k !== 'clone_tasks');
const FIELD = { name: 'nombre', status: 'estado', priority: 'prioridad', owner_id: 'responsable', starts_on: 'fecha de inicio', ends_on: 'fecha de fin', location: 'ubicación', description: 'descripción', invoiced: 'facturación',
  objective: 'objetivo', audience: 'público objetivo', participants: 'participantes', kpi_result: 'resultado', sponsors: 'patrocinadores', incidents: 'incidencias', improvements: 'mejoras', rating: 'valoración', notes_next: 'notas', links: 'enlaces',
  type_id: 'tipo', year: 'año', collaborators: 'colaboradores', archived: 'archivado', title: 'título', due_on: 'fecha límite', section_id: 'sección', summary: 'resumen', parent_id: 'tarea madre' };
const fields = (b) => keysOf(b).map((k) => FIELD[k] || k).join(', ');
const evLabel = async (id) => { const r = id ? (await q('select ref, name from events where id = $1', [id])).rows[0] : null; return r ? `${r.ref} «${r.name}»` : 'una acción'; };

/** Devuelve { action, category, summary, event_id } para una petición, o null si no hay que registrarla. */
async function describe(req, status) {
  const m = req.method, p = req.path, b = req.body || {}, id = (p.match(/\/([0-9a-f-]{36})(?:\/|$)/) || [])[1];
  if (p === '/api/login') return { action: status < 400 ? 'Inicio de sesión' : 'Intento de acceso fallido', category: 'accesos', summary: status < 400 ? 'Entró en la aplicación' : `Intento fallido con ${String(b.email || '').slice(0, 80)}` };
  if (p === '/api/logout') return { action: 'Cierre de sesión', category: 'accesos', summary: 'Salió de la aplicación' };
  if (p === '/api/password') return { action: 'Cambio de contraseña', category: 'accesos', summary: 'Cambió su contraseña' };
  if (p === '/api/informes/acceso') return { action: status < 400 ? 'Desbloqueo de importes' : 'Desbloqueo de importes fallido', category: 'accesos', summary: status < 400 ? 'Desbloqueó los importes e informes (30 min)' : 'Contraseña incorrecta al desbloquear los importes' };
  if (p === '/api/informes/bloquear') return { action: 'Bloqueo de importes', category: 'accesos', summary: 'Volvió a bloquear los importes' };
  if (p === '/api/pendientes/visto') return null;
  if (status >= 400) return null;
  if (m === 'POST' && p === '/api/events') return { action: 'Creó una acción', category: 'acciones', summary: `Creó la acción «${String(b.name || '').slice(0, 120)}»` };
  if (m === 'POST' && /\/clone$/.test(p)) return { action: 'Clonó una acción', category: 'acciones', event_id: id, summary: `Clonó ${await evLabel(id)} al año ${b.year}` };
  if (m === 'PATCH' && /^\/api\/events\//.test(p)) return { action: b.archived === true ? 'Archivó una acción' : 'Modificó una acción', category: 'acciones', event_id: id, summary: `${b.archived === true ? 'Archivó' : 'Modificó'} ${await evLabel(id)}${b.archived === true ? '' : ` (${fields(b)})`}` };
  if (m === 'DELETE' && /^\/api\/events\//.test(p)) return { action: req.query.hard ? 'Borró una acción' : 'Archivó una acción', category: 'acciones', event_id: req.query.hard ? null : id, summary: `${req.query.hard ? 'Borró' : 'Archivó'} ${await evLabel(id)}` };
  if (m === 'POST' && /\/tasks$/.test(p)) return { action: 'Creó una tarea', category: 'tareas', event_id: id, summary: `Creó la tarea «${String(b.title || '').slice(0, 120)}» en ${await evLabel(id)}` };
  if (/^\/api\/tasks\/[0-9a-f-]{36}$/.test(p)) {
    const t = (await q('select t.title, t.event_id from tasks t where t.id = $1', [id])).rows[0];
    const where = t ? `«${t.title}» de ${await evLabel(t.event_id)}` : 'una tarea';
    if (m === 'DELETE') return { action: 'Borró una tarea', category: 'tareas', event_id: t?.event_id, summary: `Borró la tarea ${where}` };
    if (b.status === 'finalizada') return { action: 'Terminó una tarea', category: 'tareas', event_id: t?.event_id, summary: `Terminó la tarea ${where}` };
    return { action: 'Modificó una tarea', category: 'tareas', event_id: t?.event_id, summary: `Modificó la tarea ${where} (${fields(b)})${b.status && b.status !== 'finalizada' ? `: ahora «${b.status}»` : ''}` };
  }
  if (m === 'POST' && /^\/api\/tasks\/[^/]+\/files$/.test(p)) { const t = (await q('select title, event_id from tasks where id = $1', [id])).rows[0]; return { action: 'Subió un archivo', category: 'archivos', event_id: t?.event_id, summary: `Subió «${decodeURIComponent(String(req.query.name || 'archivo'))}» a la tarea «${t?.title || ''}»` }; }
  if (m === 'POST' && /\/produccion$/.test(p)) return { action: 'Envió a producción', category: 'acciones', event_id: id, summary: `Envió a producción piezas de ${await evLabel(id)} (${(Array.isArray(b.file_ids) ? b.file_ids.length : 0)} piezas)` };
  if (m === 'POST' && /\/photos$/.test(p)) return { action: 'Subió una fotografía', category: 'archivos', event_id: id, summary: `Subió «${decodeURIComponent(String(req.query.name || 'foto'))}» a las fotografías de ${await evLabel(id)}` };
  if (m === 'DELETE' && /^\/api\/task-files\//.test(p)) return { action: 'Quitó un archivo', category: 'archivos', summary: 'Quitó un archivo de una tarea o de las fotografías' };
  if (p.startsWith('/api/admin/')) {
    const what = p.includes('/users') ? 'persona del equipo' : p.includes('/clients') ? 'cliente' : p.includes('/types') ? 'tipo de acción' : p.includes('/sections') ? 'sección de tareas' : p.includes('/locations') ? 'ubicación' : p.includes('/providers') ? 'proveedor' : 'administración';
    const verb = m === 'POST' ? 'Creó' : m === 'DELETE' ? 'Borró' : 'Modificó';
    const extra = b.name ? ` «${String(b.name).slice(0, 80)}»` : b.email ? ` ${String(b.email).slice(0, 80)}` : '';
    const tag = b.reset_password ? ' (restableció la contraseña)' : b.resend_invite ? ' (reenvió la invitación)' : b.active === false ? ' (la desactivó)' : b.active === true ? ' (la activó)' : b.role ? ` (rol: ${b.role})` : '';
    return { action: `${verb} ${what}`, category: 'administración', summary: `${verb} ${what}${extra}${tag}` };
  }
  return null;
}

export function auditMiddleware(ipOf) {
  return (req, res, next) => {
    if (req.method === 'GET' || !req.path.startsWith('/api/')) return next();
    const email0 = String(req.body?.email || '').trim().toLowerCase();
    res.on('finish', () => {
      (async () => {
        const d = await describe(req, res.statusCode);
        if (!d) return;
        let user = req.user;
        if (!user && req.path === '/api/login' && res.statusCode < 400 && email0) user = (await q('select id, name, email from team_users where email = $1', [email0])).rows[0];
        const actor = user ? (user.name || user.email) : (email0 || 'Desconocido');
        await q('insert into audit_log (user_id, actor, action, category, event_id, summary, ip, ok) values ($1,$2,$3,$4,$5,$6,$7,$8)',
          [user?.id || null, actor, d.action, d.category, d.event_id || null, d.summary.slice(0, 500), ipOf(req), res.statusCode < 400]);
      })().catch((e) => console.error('[registro]', e.message));
    });
    next();
  };
}
