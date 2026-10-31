// Ficha de una acción: datos, tareas por sección, briefing, cierre post-evento, enlaces y actividad. Todo se guarda solo.
import { el, api, icon, field, select, toast, openModal, confirmBox, initials, fmtDate, fmtMoney, fmtDateLong, debounce, STATUS_COLOR, TASK_COLOR, statusBadge, today, firstName } from './ui.js';
import { state, bus, clientOf, typeOf, userOf, loadEvents } from './state.js';

// ───────── Nueva acción ─────────
export function newEventModal(d = {}) {
  const clients = state.meta.clients.filter((c) => !c.archived);
  const name = el('input', { type: 'text', maxlength: 200, autofocus: true, placeholder: 'Por ejemplo: Día del Padre' });
  const client = select(clients.map((c) => [c.id, c.name]), d.client_id || state.client || clients[0]?.id);
  const type = select([['', 'Sin tipo'], ...state.meta.types.map((t) => [t.id, t.name])], d.type_id || '');
  const owner = select([['', 'Sin responsable'], ...state.meta.users.map((u) => [u.id, u.name || u.email])], state.me.id);
  const from = el('input', { type: 'date' }), to = el('input', { type: 'date' });
  const year = el('input', { type: 'number', min: 2000, max: 2100, value: d.year || new Date().getFullYear() });
  const err = el('div', { class: 'err', role: 'alert' });
  from.addEventListener('change', () => { if (from.value) year.value = from.value.slice(0, 4); if (to.value && to.value < from.value) to.value = from.value; });
  openModal({ title: 'Nueva acción', wide: true,
    body: el('div', { class: 'fields' }, field('Nombre', name), field('Cliente', client), field('Tipo de acción', type), field('Responsable', owner),
      field('Fecha de inicio', from), field('Fecha de fin', to), field('Año', year, 'Sale de la fecha de inicio; si no hay fecha todavía, el que pongas.'), el('div', { class: 'field wide' }, err)),
    actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Crear acción', keep: true, run: async (_e, close) => {
      err.textContent = '';
      try {
        const r = await api('POST', '/api/events', { name: name.value, client_id: client.value, type_id: type.value || null, owner_id: owner.value || null, starts_on: from.value || null, ends_on: to.value || null, year: Number(year.value) });
        await loadEvents(); close(); toast(`Creada ${r.event.ref}`); location.hash = `#/evento/${r.event.id}`;
      } catch (e) { err.textContent = e.message; return false; }
    } }] });
}

const LOG_LABEL = { status: 'el estado', owner_id: 'el responsable', starts_on: 'la fecha de inicio', ends_on: 'la fecha de fin', cost: 'el coste', invoiced: 'la facturación', name: 'el nombre', archived: 'el archivado' };
function logText(l) {
  const d = l.detail || {};
  if (l.action === 'crear') return 'creó la acción';
  if (l.action === 'archivar') return 'archivó la acción';
  if (l.action === 'tarea hecha') return `terminó la tarea «${d.title}»`;
  if (l.action === 'tarea reabierta') return `reabrió la tarea «${d.title}»`;
  const show = (k, v) => (v == null || v === '' ? 'nada' : k === 'status' ? state.meta.eventStatus[v] : k === 'owner_id' ? (userOf(v)?.name || userOf(v)?.email || '—') : k === 'invoiced' || k === 'archived' ? (v ? 'sí' : 'no') : k === 'cost' ? fmtMoney(v) : k.endsWith('_on') ? fmtDateLong(v) : v);
  return `cambió ${Object.entries(d).map(([k, v]) => `${LOG_LABEL[k] || k}: ${show(k, v.de)} → ${show(k, v.a)}`).join(' · ')}`;
}

export async function eventView(id) {
  const data = await api('GET', `/api/events/${id}`);
  let e = data.event, tasks = data.tasks;
  let log = (await api('GET', `/api/events/${id}/log`)).log;
  const client = clientOf(e.client_id);
  const saved = el('span', { class: 'saved', role: 'status' });

  // ── Guardado automático ──
  let pending = {};
  const flush = debounce(async () => {
    const body = pending; pending = {};
    if (!Object.keys(body).length) return;
    saved.className = 'saved'; saved.textContent = 'Guardando…';
    try {
      e = { ...e, ...(await api('PATCH', `/api/events/${id}`, body)).event, collaborators: body.collaborators ?? e.collaborators };
      saved.className = 'saved ok'; saved.textContent = 'Guardado ✓';
      if ('name' in body || 'status' in body || 'starts_on' in body || 'type_id' in body || 'year' in body) loadEvents();
      renderSide(); refreshLog();
    } catch (er) { saved.className = 'saved bad'; saved.textContent = `No se pudo guardar: ${er.message}`; Object.assign(pending, body); toast(er.message, true); }
  }, 600);
  const set = (k, v) => { e[k] = v; pending[k] = v; saved.className = 'saved'; saved.textContent = 'Sin guardar…'; flush(); };
  window.addEventListener('beforeunload', () => flush.flush(), { once: true });

  // ── Controles ──
  const text = (k, label, attrs = {}) => field(label, el('input', { type: 'text', value: e[k] ?? '', ...attrs, oninput: (ev) => set(k, ev.target.value) }));
  const area = (k, label, cls = '', rows = 4) => { const f = field(label, el('textarea', { rows, oninput: (ev) => set(k, ev.target.value) }, e[k] ?? '')); f.className += ` ${cls}`; return f; };
  const dateIn = (k, label) => field(label, el('input', { type: 'date', value: e[k] ?? '', onchange: (ev) => { set(k, ev.target.value || null); if (k === 'starts_on' && ev.target.value) { set('year', Number(ev.target.value.slice(0, 4))); yearIn.value = ev.target.value.slice(0, 4); } } }));
  const yearIn = el('input', { type: 'number', min: 2000, max: 2100, value: e.year, onchange: (ev) => set('year', Number(ev.target.value)) });

  const statusSel = select(Object.entries(state.meta.eventStatus), e.status, { class: 'stsel', 'aria-label': 'Estado', style: { '--c': STATUS_COLOR[e.status] }, onchange: (ev) => { ev.target.style.setProperty('--c', STATUS_COLOR[ev.target.value]); set('status', ev.target.value); } });
  const prioSel = select(Object.entries(state.meta.priorities), e.priority, { 'aria-label': 'Prioridad', onchange: (ev) => set('priority', ev.target.value) });
  const title = el('input', { class: 'title', type: 'text', value: e.name, maxlength: 200, 'aria-label': 'Nombre de la acción', oninput: (ev) => set('name', ev.target.value) });

  // Colaboradores
  const collabBox = el('div', { class: 'chips' });
  const drawCollabs = () => {
    const ids = e.collaborators || [];
    collabBox.replaceChildren(...ids.map((uid) => el('span', { class: 'chip' }, userOf(uid)?.name || userOf(uid)?.email || '—', el('button', { class: 'x', type: 'button', 'aria-label': 'Quitar', onclick: () => { e.collaborators = ids.filter((x) => x !== uid); pending.collaborators = e.collaborators; flush(); drawCollabs(); } }, '✕'))),
      select([['', '+ Añadir'], ...state.meta.users.filter((u) => !ids.includes(u.id)).map((u) => [u.id, u.name || u.email])], '', { 'aria-label': 'Añadir colaborador', onchange: (ev) => { if (!ev.target.value) return; e.collaborators = [...ids, ev.target.value]; pending.collaborators = e.collaborators; flush(); drawCollabs(); } }));
  };
  drawCollabs();

  // ── Tareas ──
  const tasksBox = el('div'), progress = el('div', { class: 'prog' });
  const sectionName = (sid) => state.meta.sections.find((s) => s.id === sid)?.name || 'Sin sección';
  const closed = new Set();
  const live = () => tasks.filter((t) => t.status !== 'archivada');
  const upTask = async (t, patch) => {
    try { const { task } = await api('PATCH', `/api/tasks/${t.id}`, patch); Object.assign(t, task); drawTasks(); refreshSummary(); refreshLog(); loadEvents(); } catch (er) { toast(er.message, true); drawTasks(); }
  };
  const taskRow = (t, sub = false) => {
    const late = t.due_on && t.due_on < today() && !['finalizada', 'archivada'].includes(t.status);
    return el('div', { class: `task${sub ? ' sub' : ''}${t.status === 'finalizada' ? ' done' : ''}${late ? ' late' : ''}` },
      el('input', { type: 'checkbox', checked: t.status === 'finalizada', 'aria-label': `Hecha: ${t.title}`, onchange: (ev) => upTask(t, { status: ev.target.checked ? 'finalizada' : 'sin_empezar' }) }),
      el('input', { class: 'tt', type: 'text', value: t.title, maxlength: 300, 'aria-label': 'Tarea', onchange: (ev) => { if (!ev.target.value.trim()) { ev.target.value = t.title; return; } upTask(t, { title: ev.target.value }); } }),
      el('div', { class: 'tmeta' },
        select(Object.entries(state.meta.taskStatus), t.status, { class: 'stsel', 'aria-label': 'Estado de la tarea', style: { '--c': TASK_COLOR[t.status] }, onchange: (ev) => upTask(t, { status: ev.target.value }) }),
        select([['', 'Sin responsable'], ...state.meta.users.map((u) => [u.id, firstName(u)])], t.owner_id || '', { 'aria-label': 'Responsable de la tarea', onchange: (ev) => upTask(t, { owner_id: ev.target.value || null }) }),
        el('input', { type: 'date', value: t.due_on || '', 'aria-label': 'Fecha límite', onchange: (ev) => upTask(t, { due_on: ev.target.value || null }) }),
        el('input', { type: 'number', min: 0, step: '0.01', placeholder: '€', value: t.cost ?? '', 'aria-label': 'Coste de la tarea', onchange: (ev) => upTask(t, { cost: ev.target.value === '' ? null : ev.target.value }) }),
        el('button', { class: 'more', type: 'button', 'aria-label': 'Más opciones de la tarea', onclick: () => taskModal(t) }, '⋯')));
  };
  function drawTasks() {
    const roots = live().filter((t) => !t.parent_id);
    const order = [...state.meta.sections.map((s) => s.id), null];
    const groups = order.map((sid) => ({ sid, list: roots.filter((t) => (t.section_id || null) === sid) })).filter((g) => g.list.length);
    tasksBox.replaceChildren(...[...groups.map((g) => {
      const key = g.sid || 'none'; const open = !closed.has(key);
      const done = g.list.filter((t) => t.status === 'finalizada').length;
      return el('div', { class: `tsec${open ? ' open' : ''}` },
        el('button', { class: 'th', type: 'button', 'aria-expanded': String(open), onclick: () => { if (open) closed.add(key); else closed.delete(key); drawTasks(); } }, icon('chev', 'chev'), sectionName(g.sid), el('small', { class: 'muted', style: { textTransform: 'none', fontWeight: 400 } }, `${done}/${g.list.length}`)),
        open ? g.list.flatMap((t) => [taskRow(t), ...live().filter((c) => c.parent_id === t.id).map((c) => taskRow(c, true))]) : null);
    }), groups.length ? null : el('p', { class: 'muted' }, 'Todavía no hay tareas. Añade la primera abajo.')].filter(Boolean));
    const total = live().length, done = live().filter((t) => t.status === 'finalizada').length;
    progress.replaceChildren(el('div', { class: 'bar' }, el('i', { style: { width: total ? `${Math.round((done / total) * 100)}%` : '0%' } })), `${done} de ${total} tareas hechas`);
  }
  const newTitle = el('input', { type: 'text', placeholder: 'Nueva tarea… (Intro para añadirla)', maxlength: 300, 'aria-label': 'Nueva tarea' });
  const newSection = select([['', 'Sin sección'], ...state.meta.sections.map((s) => [s.id, s.name])], '', { 'aria-label': 'Sección de la nueva tarea' });
  const addTask = async (extra = {}) => {
    const t = (extra.title ?? newTitle.value).trim(); if (!t) return;
    try { const { task } = await api('POST', `/api/events/${id}/tasks`, { title: t, section_id: newSection.value || null, ...extra }); tasks.push(task); if (extra.title === undefined) { newTitle.value = ''; closed.delete(task.section_id || 'none'); } drawTasks(); refreshSummary(); loadEvents(); newTitle.focus(); }
    catch (er) { toast(er.message, true); }
  };
  newTitle.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addTask(); } });

  function taskModal(t) {
    const summary = el('textarea', { rows: 4 }, t.summary || '');
    const prio = select([['', 'Sin prioridad'], ...Object.entries(state.meta.priorities)], t.priority || '');
    const sec = select([['', 'Sin sección'], ...state.meta.sections.map((s) => [s.id, s.name])], t.section_id || '');
    const link = el('input', { type: 'url', placeholder: 'https://… (carpeta de Drive, presupuesto…)', value: t.links?.[0]?.url || '' });
    const sub = el('input', { type: 'text', placeholder: 'Nueva subtarea…' });
    openModal({ title: t.title, wide: true,
      body: el('div', { class: 'fields' }, field('Sección', sec), field('Prioridad', prio), field('Enlace', link), el('div', { class: 'field wide' }, el('label', {}, 'Resumen'), summary), field('Añadir una subtarea', sub)),
      actions: [
        { label: 'Borrar tarea', cls: 'danger', run: async () => { if (!(await confirmBox('Borrar tarea', `¿Borrar «${t.title}»${tasks.some((x) => x.parent_id === t.id) ? ' y sus subtareas' : ''}?`, 'Borrar', true))) return false; try { await api('DELETE', `/api/tasks/${t.id}`); tasks = tasks.filter((x) => x.id !== t.id && x.parent_id !== t.id); drawTasks(); refreshSummary(); } catch (er) { toast(er.message, true); } } },
        { label: 'Guardar', run: async () => {
          if (sub.value.trim()) await addTask({ title: sub.value, parent_id: t.id, section_id: t.section_id });
          await upTask(t, { summary: summary.value, priority: prio.value || null, section_id: sec.value || null, links: link.value.trim() ? [{ name: 'Enlace', url: link.value.trim() }] : [] });
        } }] });
  }

  // ── Enlaces de la acción ──
  const linksBox = el('div');
  const drawLinks = () => {
    const ls = e.links || [];
    linksBox.replaceChildren(...ls.map((l, i) => el('div', { class: 'editrow' },
      el('input', { type: 'text', value: l.name, placeholder: 'Nombre', 'aria-label': 'Nombre del enlace', style: { maxWidth: '220px' }, oninput: (ev) => { ls[i].name = ev.target.value; set('links', ls); } }),
      el('input', { type: 'url', value: l.url, placeholder: 'https://…', 'aria-label': 'Dirección', style: { flex: 1 }, oninput: (ev) => { ls[i].url = ev.target.value; set('links', ls); } }),
      l.url ? el('a', { class: 'btn ghost small', href: l.url, target: '_blank', rel: 'noopener' }, 'Abrir') : null,
      el('button', { class: 'btn ghost small', type: 'button', 'aria-label': 'Quitar el enlace', onclick: () => { ls.splice(i, 1); set('links', ls); drawLinks(); } }, '✕'))),
      el('button', { class: 'btn ghost small', type: 'button', onclick: () => { e.links = [...ls, { name: '', url: 'https://' }]; drawLinks(); } }, icon('plus'), 'Añadir enlace'));
  };
  drawLinks();

  // ── Valoración ──
  const stars = el('div', { class: 'stars', role: 'group', 'aria-label': 'Valoración de 1 a 5' });
  const drawStars = () => stars.replaceChildren(...[1, 2, 3, 4, 5].map((n) => el('button', { type: 'button', class: n <= (e.rating || 0) ? 'on' : '', 'aria-label': `${n} de 5`, 'aria-pressed': String(n === e.rating), onclick: () => { set('rating', e.rating === n ? null : n); drawStars(); } }, icon('star'))));
  drawStars();

  // ── Lateral ──
  const summaryBox = el('dl', { class: 'kv' }), logBox = el('ul', { class: 'log' });
  function refreshSummary() {
    const l = live(), done = l.filter((t) => t.status === 'finalizada').length;
    const late = l.filter((t) => t.due_on && t.due_on < today() && t.status !== 'finalizada').length;
    const tcost = l.reduce((n, t) => n + (t.cost || 0), 0);
    const row = (k, v) => [el('dt', {}, k), el('dd', {}, v)];
    summaryBox.replaceChildren(...row('Estado', statusBadge(state.meta.eventStatus[e.status], STATUS_COLOR[e.status])), ...row('Tareas hechas', `${done} de ${l.length}`), ...row('Tareas vencidas', String(late)),
      ...row('Coste de la acción', e.cost != null ? fmtMoney(e.cost) : '—'), ...row('Coste de las tareas', tcost ? fmtMoney(tcost) : '—'), ...row('Facturado', e.invoiced ? 'Sí' : 'No'));
  }
  async function refreshLog() {
    try { log = (await api('GET', `/api/events/${id}/log`)).log; } catch { /* se queda lo que había */ }
    logBox.replaceChildren(...(log.length ? log.slice(0, 25).map((l) => el('li', {}, el('b', {}, l.actor), ` ${logText(l)}`, el('br'), el('small', {}, new Date(l.at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })))) : [el('li', {}, 'Sin actividad todavía.')]));
    refreshSummary();
  }
  function renderSide() { refreshSummary(); }

  // ── Página ──
  const page = el('div', { class: 'page', 'data-title': e.name },
    el('p', {}, el('a', { href: `#/anio/${e.year}`, class: 'muted' }, `← Acciones ${e.year}`)),
    el('div', { class: 'evt-h' }, el('div', { class: 'line' }, el('span', { class: 'ref' }, e.ref), el('span', { class: 'cli', style: { '--c': client?.color } }, client?.name || ''), statusSel, prioSel, saved,
      el('span', { style: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
        el('button', { class: 'btn ghost small', type: 'button', onclick: async () => { if (!(await confirmBox('Archivar acción', `¿Archivar «${e.name}»? Dejará de salir en las listas (un administrador puede borrarla del todo).`, 'Archivar'))) return; await api('DELETE', `/api/events/${id}`); await loadEvents(); toast('Acción archivada'); location.hash = `#/anio/${e.year}`; } }, 'Archivar'),
        state.me.is_admin ? el('button', { class: 'btn danger small', type: 'button', onclick: async () => { if (!(await confirmBox('Borrar para siempre', `¿Borrar «${e.name}» con todas sus tareas? No se puede deshacer.`, 'Borrar para siempre', true))) return; await api('DELETE', `/api/events/${id}?hard=1`); await loadEvents(); toast('Acción borrada'); location.hash = `#/anio/${e.year}`; } }, 'Borrar') : null)),
      title),
    el('div', { class: 'evt' },
      el('div', {},
        el('section', { class: 'card sec' }, el('h3', {}, 'Datos'), el('div', { class: 'fields' },
          field('Tipo de acción', select([['', 'Sin tipo'], ...state.meta.types.map((t) => [t.id, t.name])], e.type_id || '', { onchange: (ev) => set('type_id', ev.target.value || null) })),
          field('Responsable', select([['', 'Sin responsable'], ...state.meta.users.map((u) => [u.id, u.name || u.email])], e.owner_id || '', { onchange: (ev) => set('owner_id', ev.target.value || null) })),
          dateIn('starts_on', 'Inicio'), dateIn('ends_on', 'Fin'), field('Año', yearIn),
          field('Ubicación', el('input', { type: 'text', list: 'locs', value: e.location || '', maxlength: 120, oninput: (ev) => set('location', ev.target.value) })),
          field('Coste de la acción (€)', el('input', { type: 'text', inputmode: 'decimal', value: e.cost ?? '', placeholder: '0', onchange: (ev) => set('cost', ev.target.value === '' ? null : ev.target.value) })),
          field('Facturación', el('label', { class: 'av-switch' }, el('input', { type: 'checkbox', checked: e.invoiced, onchange: (ev) => set('invoiced', ev.target.checked) }), el('i'), 'Facturada')),
          el('div', { class: 'field wide' }, el('label', {}, 'Colaboradores'), collabBox)),
          el('datalist', { id: 'locs' }, state.meta.locations.map((l) => el('option', { value: l })))),
        el('section', { class: 'card sec' }, el('h3', {}, 'Descripción'), area('description', 'Qué es esta acción', 'wide', 5)),
        el('section', { class: 'card sec' }, el('h3', {}, 'Tareas', el('small', { class: 'muted' }, 'lo que hay que hacer para que salga adelante')), progress, tasksBox,
          el('div', { class: 'addtask' }, newTitle, newSection, el('button', { class: 'btn', type: 'button', onclick: () => addTask() }, icon('plus'), 'Añadir'))),
        el('section', { class: 'card sec' }, el('h3', {}, 'Briefing'), el('div', { class: 'fields' }, area('objective', 'Objetivo', 'wide', 3), area('audience', 'Público objetivo', 'wide', 3))),
        el('section', { class: 'card sec' }, el('h3', {}, 'Cierre del evento', el('small', { class: 'muted' }, 'para rellenar cuando termine')), el('div', { class: 'fields' },
          field('Participantes / asistencia', el('input', { type: 'number', min: 0, value: e.participants ?? '', onchange: (ev) => set('participants', ev.target.value === '' ? null : Number(ev.target.value)) })),
          field('Valoración (1 a 5)', stars),
          area('kpi_result', 'Resultado / KPI', 'wide', 3), area('sponsors', 'Patrocinadores', 'wide', 2), area('incidents', 'Incidencias', 'wide', 3), area('improvements', 'Qué mejorar la próxima vez', 'wide', 3),
          el('div', { class: 'field wide note-next' }, el('label', {}, 'Notas para el año que viene'), el('textarea', { rows: 4, oninput: (ev) => set('notes_next', ev.target.value) }, e.notes_next ?? '')))),
        el('section', { class: 'card sec' }, el('h3', {}, 'Enlaces y archivos', el('small', { class: 'muted' }, 'carpetas de Drive, bases legales, informes…')), linksBox)),
      el('aside', { class: 'side' },
        el('section', { class: 'card sec' }, el('h3', {}, 'Resumen'), summaryBox, e.notion_url ? el('p', {}, el('a', { href: e.notion_url, target: '_blank', rel: 'noopener', class: 'muted' }, 'Ver la ficha original en Notion')) : null),
        el('section', { class: 'card sec' }, el('h3', {}, 'Actividad'), logBox))));
  drawTasks(); refreshLog();
  return page;
}
