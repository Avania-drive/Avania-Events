// Administración: equipo, clientes, tipos de acción y secciones de tareas. Los clientes no entran en Avania Events.
import { el, api, icon, field, select, toast, openModal, confirmBox, initials, debounce } from './ui.js';
import { state, loadMeta, loadEvents, bus } from './state.js';

const ROLES = { super_admin: 'Superadministrador', admin: 'Administrador', member: 'Equipo' };

async function refreshMeta() { await loadMeta(); await loadEvents(); bus.dispatchEvent(new Event('refresh')); }

function secretModal(title, intro, secret) {
  openModal({ title, body: el('div', {}, el('p', {}, intro), el('div', { class: 'secret', style: { fontFamily: 'ui-monospace, monospace', fontSize: '18px', padding: '12px', background: 'var(--surface-2, #f3f4f6)', borderRadius: '10px', userSelect: 'all' } }, secret),
    el('p', { class: 'muted' }, 'Se muestra solo ahora. Tendrá que cambiarla al entrar por primera vez.')),
    actions: [{ label: 'Copiar', keep: true, run: async () => { try { await navigator.clipboard.writeText(secret); toast('Copiada'); } catch { toast('Cópiala a mano', true); } return false; } }, { label: 'Hecho' }] });
}

function addPersonModal(rerender) {
  const email = el('input', { type: 'email', autofocus: true, placeholder: 'nombre@avania.es' });
  const name = el('input', { type: 'text', maxlength: 120 });
  const role = select(Object.entries(ROLES).filter(([k]) => k !== 'super_admin' || state.me.role === 'super_admin'), 'member');
  const err = el('div', { class: 'err', role: 'alert' });
  openModal({ title: 'Dar de alta a una persona', body: el('div', { class: 'fields' }, field('Correo', email), field('Nombre', name), field('Rol', role, 'Equipo ve y edita todo; los administradores además gestionan personas, clientes y tipos.'), el('div', { class: 'field wide' }, err)),
    actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Dar de alta', keep: true, run: async (_e, close) => {
      err.textContent = '';
      try {
        const r = await api('POST', '/api/admin/users', { email: email.value, name: name.value, role: role.value });
        close(); await refreshMeta(); rerender();
        if (r.emailed) toast(`Invitación enviada a ${r.user.email}`);
        else secretModal('Persona dada de alta', `No hay correo configurado, así que pásale tú esta contraseña temporal a ${r.user.email}:`, r.temp_password);
      } catch (e) { err.textContent = e.message; return false; }
    } }] });
}

async function teamTab(box, rerender) {
  const { users, mail } = await api('GET', '/api/admin/users');
  const patch = async (u, body, ok) => { try { const r = await api('PATCH', `/api/admin/users/${u.id}`, body); await refreshMeta(); rerender(); if (r.temp_password) secretModal('Contraseña restablecida', `Nueva contraseña temporal de ${u.email}:`, r.temp_password); else if (ok) toast(ok); } catch (e) { toast(e.message, true); rerender(); } };
  box.append(
    el('div', { class: 'adm-bar' }, el('p', { class: 'muted' }, mail ? 'Las altas envían una invitación por correo (48 h).' : 'El correo no está configurado: al dar de alta verás una contraseña temporal para pasársela tú.'),
      el('button', { class: 'btn', type: 'button', onclick: () => addPersonModal(rerender) }, icon('plus'), 'Dar de alta')),
    el('div', { class: 'card adm-list' }, users.map((u) => {
      const self = u.id === state.me.id, locked = u.role === 'super_admin' && state.me.role !== 'super_admin';
      return el('div', { class: `adm-row${u.active ? '' : ' off'}` },
        el('span', { class: 'av' }, initials(u)),
        el('div', { class: 'who' }, el('b', {}, u.name || u.email, self ? el('small', { class: 'muted' }, ' (tú)') : null), el('small', { class: 'muted' }, u.email, u.pending ? ' · aún no ha entrado' : '', u.active ? '' : ' · desactivada')),
        el('div', { class: 'actions' },
          select(Object.entries(ROLES), u.role, { 'aria-label': `Rol de ${u.email}`, disabled: self || locked, onchange: (ev) => patch(u, { role: ev.target.value }, 'Rol cambiado') }),
          u.pending && mail ? el('button', { class: 'btn ghost small', type: 'button', disabled: locked, onclick: () => patch(u, { resend_invite: true }, 'Invitación reenviada') }, 'Reenviar invitación') : null,
          el('button', { class: 'btn ghost small', type: 'button', disabled: locked, onclick: async () => { if (await confirmBox('Restablecer contraseña', `¿Crear una contraseña temporal nueva para ${u.email}?`, 'Restablecer')) patch(u, { reset_password: true }); } }, 'Restablecer contraseña'),
          el('button', { class: `btn small ${u.active ? 'ghost' : ''}`, type: 'button', disabled: self || locked, onclick: () => patch(u, { active: !u.active }, u.active ? 'Persona desactivada' : 'Persona activada') }, u.active ? 'Desactivar' : 'Activar')));
    })));
}

function clientModal(c, rerender) {
  const name = el('input', { type: 'text', maxlength: 80, value: c?.name || '', autofocus: true });
  const code = el('input', { type: 'text', maxlength: 5, value: c?.code || '', disabled: !!c, placeholder: 'ALB', style: { textTransform: 'uppercase' } });
  const color = el('input', { type: 'color', value: c?.color || '#0f766e' });
  const err = el('div', { class: 'err', role: 'alert' });
  openModal({ title: c ? 'Editar cliente' : 'Nuevo cliente', body: el('div', { class: 'fields' }, field('Nombre', name), field('Código', code, c ? 'El código no se puede cambiar: forma las referencias (ALB-001).' : '2 a 5 letras; forma las referencias de las acciones (ALB-001).'), field('Color', color), el('div', { class: 'field wide' }, err)),
    actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Guardar', keep: true, run: async (_e, close) => {
      err.textContent = '';
      try { await (c ? api('PATCH', `/api/admin/clients/${c.id}`, { name: name.value, color: color.value }) : api('POST', '/api/admin/clients', { name: name.value, code: code.value, color: color.value })); close(); await refreshMeta(); rerender(); toast('Cliente guardado'); }
      catch (e) { err.textContent = e.message; return false; }
    } }] });
}

async function clientsTab(box, rerender) {
  box.append(el('div', { class: 'adm-bar' }, el('p', { class: 'muted' }, 'Cada cliente tiene su propia numeración de acciones. Archivar un cliente lo quita del selector; sus acciones se conservan.'),
    el('button', { class: 'btn', type: 'button', onclick: () => clientModal(null, rerender) }, icon('plus'), 'Nuevo cliente')),
    el('div', { class: 'card adm-list' }, state.meta.clients.map((c) => el('div', { class: `adm-row${c.archived ? ' off' : ''}` },
      el('span', { class: 'dot', style: { background: c.color, width: '14px', height: '14px', borderRadius: '50%', flex: 'none' } }),
      el('div', { class: 'who' }, el('b', {}, c.name), el('small', { class: 'muted' }, c.code, c.archived ? ' · archivado' : '')),
      el('div', { class: 'actions' }, el('button', { class: 'btn ghost small', type: 'button', onclick: () => clientModal(c, rerender) }, 'Editar'),
        el('button', { class: 'btn ghost small', type: 'button', onclick: async () => { try { await api('PATCH', `/api/admin/clients/${c.id}`, { archived: !c.archived }); await refreshMeta(); rerender(); } catch (e) { toast(e.message, true); } } }, c.archived ? 'Recuperar' : 'Archivar'))))));
}

function listEditor(title, hint, route, items, hasColor, rerender) {
  const add = el('input', { type: 'text', maxlength: 60, placeholder: 'Nombre nuevo…', 'aria-label': `Nuevo en ${title}` });
  const addColor = hasColor ? el('input', { type: 'color', value: '#667085', 'aria-label': 'Color' }) : null;
  const doAdd = async () => { if (!add.value.trim()) return; try { await api('POST', `/api/admin/${route}`, { name: add.value, color: addColor?.value }); await refreshMeta(); rerender(); } catch (e) { toast(e.message, true); } };
  add.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); doAdd(); } });
  return el('section', { class: 'card sec' }, el('h3', {}, title), el('p', { class: 'muted' }, hint),
    items.map((it) => el('div', { class: 'editrow' },
      hasColor ? el('input', { type: 'color', value: it.color, 'aria-label': `Color de ${it.name}`, onchange: async (ev) => { try { await api('PATCH', `/api/admin/${route}/${it.id}`, { color: ev.target.value }); await refreshMeta(); } catch (e) { toast(e.message, true); } } }) : null,
      el('input', { type: 'text', value: it.name, maxlength: 60, 'aria-label': 'Nombre', style: { flex: 1 }, onchange: async (ev) => { try { await api('PATCH', `/api/admin/${route}/${it.id}`, { name: ev.target.value }); await refreshMeta(); toast('Guardado'); } catch (e) { toast(e.message, true); rerender(); } } }),
      el('button', { class: 'btn ghost small', type: 'button', 'aria-label': `Borrar ${it.name}`, onclick: async () => { if (!(await confirmBox('Borrar', `¿Borrar «${it.name}»? Lo que lo usaba se queda sin ${route === 'types' ? 'tipo' : 'sección'}.`, 'Borrar', true))) return; try { await api('DELETE', `/api/admin/${route}/${it.id}`); await refreshMeta(); rerender(); } catch (e) { toast(e.message, true); } } }, '✕'))),
    el('div', { class: 'editrow' }, addColor, add, el('button', { class: 'btn small', type: 'button', onclick: doAdd }, icon('plus'), 'Añadir')));
}

async function listsTab(box, rerender) {
  box.append(el('div', { class: 'two' },
    listEditor('Tipos de acción', 'Sirven para clasificar las acciones (fecha comercial, evento especial…).', 'types', state.meta.types, true, rerender),
    listEditor('Secciones de tareas', 'Agrupan las tareas dentro de cada acción (montaje, creatividades, personal…).', 'sections', state.meta.sections, true, rerender)));
}

function locationModal(l, rerender) {
  const name = el('input', { type: 'text', maxlength: 80, value: l?.name || '', autofocus: true });
  const address = el('input', { type: 'text', maxlength: 200, value: l?.address || '', placeholder: 'Calle, número, ciudad' });
  const capacity = el('input', { type: 'number', min: 0, value: l?.capacity ?? '', placeholder: 'Personas' });
  const notes = el('textarea', { rows: 4, maxlength: 2000, placeholder: 'Accesos, permisos, contacto, horarios de montaje…' }, l?.notes || '');
  const err = el('div', { class: 'err', role: 'alert' });
  openModal({ title: l ? 'Editar ubicación' : 'Nueva ubicación', wide: true, body: el('div', { class: 'fields' }, field('Nombre', name), field('Aforo máximo', capacity), field('Dirección', address), el('div', { class: 'field wide' }, el('label', {}, 'Notas'), notes), el('div', { class: 'field wide' }, err)),
    actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Guardar', keep: true, run: async (_e, close) => {
      err.textContent = '';
      try { const body = { name: name.value, address: address.value, capacity: capacity.value, notes: notes.value }; await (l ? api('PATCH', `/api/admin/locations/${l.id}`, body) : api('POST', '/api/admin/locations', body)); close(); await refreshMeta(); rerender(); toast('Ubicación guardada'); }
      catch (e) { err.textContent = e.message; return false; }
    } }] });
}

async function locationsTab(box, rerender) {
  const { locations } = await api('GET', '/api/admin/locations');
  box.append(el('div', { class: 'adm-bar' }, el('p', { class: 'muted' }, 'Los sitios donde se montan las acciones. Aparecen al elegir la ubicación de una acción.'),
    el('button', { class: 'btn', type: 'button', onclick: () => locationModal(null, rerender) }, icon('plus'), 'Nueva ubicación')),
    locations.length ? el('div', { class: 'loc-grid' }, locations.map((l) => el('div', { class: 'card loc' },
      el('h3', {}, l.name), el('div', { class: 'muted' }, l.address || 'Sin dirección'),
      el('div', { class: 'loc-meta' }, el('span', {}, l.capacity != null ? `Aforo ${l.capacity.toLocaleString('es-ES')}` : 'Sin aforo'), el('span', {}, `${l.events} ${l.events === 1 ? 'acción' : 'acciones'}`)),
      l.notes ? el('p', { class: 'loc-notes' }, l.notes) : null,
      el('div', { class: 'actions' }, el('button', { class: 'btn ghost small', type: 'button', onclick: () => locationModal(l, rerender) }, 'Editar'),
        el('button', { class: 'btn ghost small', type: 'button', onclick: async () => { if (!(await confirmBox('Borrar ubicación', `¿Borrar «${l.name}»? Las acciones que la usan conservan el nombre.`, 'Borrar', true))) return; try { await api('DELETE', `/api/admin/locations/${l.id}`); await refreshMeta(); rerender(); } catch (e) { toast(e.message, true); } } }, 'Borrar')))))
      : el('div', { class: 'card empty-big' }, 'Todavía no hay ubicaciones.'));
}

function providerModal(pv, rerender) {
  const name = el('input', { type: 'text', maxlength: 100, value: pv?.name || '', autofocus: true });
  const email = el('input', { type: 'email', maxlength: 160, value: pv?.email || '', placeholder: 'correo@proveedor.com' });
  const phone = el('input', { type: 'tel', maxlength: 40, value: pv?.phone || '', placeholder: 'Teléfono' });
  const notes = el('textarea', { rows: 3, maxlength: 1000, placeholder: 'Qué hace, persona de contacto…' }, pv?.notes || '');
  const err = el('div', { class: 'err', role: 'alert' });
  openModal({ title: pv ? 'Editar proveedor' : 'Nuevo proveedor', wide: true, body: el('div', { class: 'fields' }, field('Nombre', name), field('Correo electrónico', email), field('Teléfono', phone), el('div', { class: 'field wide' }, el('label', {}, 'Notas'), notes), el('div', { class: 'field wide' }, err)),
    actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Guardar', keep: true, run: async (_e, close) => {
      err.textContent = '';
      try { const body = { name: name.value, email: email.value, phone: phone.value, notes: notes.value }; await (pv ? api('PATCH', `/api/admin/providers/${pv.id}`, body) : api('POST', '/api/admin/providers', body)); close(); rerender(); toast('Proveedor guardado'); }
      catch (e) { err.textContent = e.message; return false; }
    } }] });
}
async function providersTab(box, rerender) {
  const { providers } = await api('GET', '/api/admin/providers');
  box.append(el('div', { class: 'adm-bar' }, el('p', { class: 'muted' }, 'Imprentas y otros proveedores a los que se envían las piezas desde «Enviar a producción».'),
    el('button', { class: 'btn', type: 'button', onclick: () => providerModal(null, rerender) }, icon('plus'), 'Nuevo proveedor')),
    providers.length ? el('div', { class: 'loc-grid' }, providers.map((p) => el('div', { class: 'card loc' },
      el('h3', {}, p.name), el('div', {}, p.email ? el('a', { href: `mailto:${p.email}` }, p.email) : el('span', { class: 'muted' }, 'Sin correo')), el('div', { class: 'muted' }, p.phone || 'Sin teléfono'),
      p.notes ? el('p', { class: 'loc-notes' }, p.notes) : null,
      el('div', { class: 'actions' }, el('button', { class: 'btn ghost small', type: 'button', onclick: () => providerModal(p, rerender) }, 'Editar'),
        el('button', { class: 'btn ghost small', type: 'button', onclick: async () => { if (!(await confirmBox('Borrar proveedor', `¿Borrar «${p.name}»? Los envíos ya hechos se conservan.`, 'Borrar', true))) return; try { await api('DELETE', `/api/admin/providers/${p.id}`); rerender(); } catch (e) { toast(e.message, true); } } }, 'Borrar')))))
      : el('div', { class: 'card empty-big' }, 'Todavía no hay proveedores.'));
}

const CAT = { accesos: 'Accesos', acciones: 'Acciones', tareas: 'Tareas', archivos: 'Archivos', administración: 'Administración' };
const CAT_COLOR = { accesos: '#667085', acciones: '#2563eb', tareas: '#16a34a', archivos: '#ea7a1a', administración: '#7c3aed' };
const when = (iso) => { const d = new Date(iso); return `${d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`; };
const ago = (iso) => { if (!iso) return 'nunca'; const m = Math.round((Date.now() - new Date(iso)) / 60000); return m < 2 ? 'ahora mismo' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} días`; };

async function activityTab(box) {
  const f = { user: '', category: '', q: '', from: '', to: '' };
  let entries = [], more = false, people = [];
  const list = el('div', { class: 'card act-list' }), peopleBox = el('div', { class: 'act-people' }), moreBtn = el('button', { class: 'btn ghost', type: 'button' }, 'Cargar más');
  const qs = (offset = 0) => `/api/admin/actividad?limit=100&offset=${offset}${Object.entries(f).filter(([, v]) => v).map(([k, v]) => `&${k}=${encodeURIComponent(v)}`).join('')}`;
  const draw = () => {
    list.replaceChildren(...(entries.length ? entries.map((a) => el('div', { class: `act-row${a.ok ? '' : ' bad'}` },
      el('span', { class: 'when' }, when(a.at)), el('b', { class: 'who' }, a.actor), el('i', { class: 'cat', style: { '--c': CAT_COLOR[a.category] || '#667085' } }, CAT[a.category] || a.category),
      a.event_id ? el('a', { href: `#/evento/${a.event_id}` }, a.summary) : el('span', {}, a.summary))) : [el('p', { class: 'muted', style: { padding: '14px' } }, 'No hay actividad con esos filtros.')]));
    moreBtn.hidden = !more;
  };
  const load = async (append = false) => {
    const r = await api('GET', qs(append ? entries.length : 0));
    entries = append ? [...entries, ...r.entries] : r.entries; more = r.more; people = r.people; draw();
    const today = new Date().toDateString();
    peopleBox.replaceChildren(...people.map((u) => { const inToday = u.last_login && new Date(u.last_login).toDateString() === today; return el('div', { class: `act-person${inToday ? '' : ' idle'}` }, el('b', {}, u.name || u.email), el('small', {}, `Último acceso: ${ago(u.last_login)}`), el('small', {}, `Última acción: ${ago(u.last_action)}`)); }));
  };
  const reload = () => load(false).catch((e) => toast(e.message, true));
  await load(false);
  moreBtn.onclick = () => load(true).catch((e) => toast(e.message, true));
  box.append(
    el('p', { class: 'muted' }, 'Todo lo que se hace en la aplicación: accesos, cambios en acciones y tareas, archivos y administración. Las personas que hoy no han entrado salen atenuadas.'),
    peopleBox,
    el('div', { class: 'toolbar act-filters' },
      select([['', 'Persona: todas'], ...people.map((u) => [u.id, u.name || u.email])], '', { 'aria-label': 'Persona', onchange: (e) => { f.user = e.target.value; reload(); } }),
      select([['', 'Tipo: todos'], ...Object.entries(CAT)], '', { 'aria-label': 'Tipo', onchange: (e) => { f.category = e.target.value; reload(); } }),
      el('input', { type: 'date', 'aria-label': 'Desde', onchange: (e) => { f.from = e.target.value; reload(); } }),
      el('input', { type: 'date', 'aria-label': 'Hasta', onchange: (e) => { f.to = e.target.value; reload(); } }),
      el('input', { type: 'search', placeholder: 'Buscar…', 'aria-label': 'Buscar', oninput: debounce((e) => { f.q = e.target.value.trim(); reload(); }, 300) })),
    list, el('div', { style: { textAlign: 'center', margin: '12px 0' } }, moreBtn));
}

export async function adminView(tab = 'equipo') {
  const TABS = { equipo: ['Equipo', teamTab], clientes: ['Clientes', clientsTab], tipos: ['Tipos y secciones', listsTab], ubicaciones: ['Ubicaciones', locationsTab], proveedores: ['Proveedores', providersTab], actividad: ['Actividad', activityTab] };
  if (!TABS[tab]) tab = 'equipo';
  const body = el('div');
  const page = el('div', { class: 'page', 'data-title': 'Administración' },
    el('h1', {}, 'Administración'),
    el('nav', { class: 'adm-tabs', 'aria-label': 'Secciones de administración' }, Object.entries(TABS).map(([k, [t]]) => el('a', { href: `#/admin/${k}`, class: k === tab ? 'on' : '', 'aria-current': k === tab ? 'page' : null }, t))),
    body);
  const rerender = async () => { const fresh = el('div'); await TABS[tab][1](fresh, rerender); body.replaceChildren(...fresh.childNodes); };
  await TABS[tab][1](body, rerender);
  return page;
}
