// Ficha de una acción: datos, tareas por sección, briefing, cierre post-evento, enlaces y actividad. Todo se guarda solo.
import { el, api, icon, field, select, toast, openModal, confirmBox, initials, fmtDate, fmtMoney, fmtDateLong, debounce, STATUS_COLOR, TASK_COLOR, statusBadge, today, firstName } from './ui.js';
import { lockedChip } from './unlock.js';
import { state, bus, clientOf, typeOf, userOf, sectionOf, loadEvents } from './state.js';

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
  const cloneBox = el('div', { class: 'clonebox' }, el('p', { class: 'muted' }, 'Cargando las tareas más habituales…'));
  let templates = [];
  api('GET', '/api/task-templates').then((r) => { templates = r.templates; drawClone(); }).catch(() => cloneBox.replaceChildren(el('p', { class: 'muted' }, 'No se pudieron cargar las tareas tipo.')));
  function drawClone() {
    if (!templates.length) return cloneBox.replaceChildren(el('p', { class: 'muted' }, 'Todavía no hay tareas que se repitan entre acciones.'));
    const all = (on) => cloneBox.querySelectorAll('input[type=checkbox]').forEach((c) => { c.checked = on; });
    cloneBox.replaceChildren(el('div', { class: 'clone-h' }, el('button', { class: 'btn ghost small', type: 'button', onclick: () => all(true) }, 'Marcar todas'), el('button', { class: 'btn ghost small', type: 'button', onclick: () => all(false) }, 'Quitar todas')),
      el('div', { class: 'clone-list' }, templates.map((t, i) => el('label', { class: 'clone-item' }, el('input', { type: 'checkbox', 'data-i': i }), el('span', {}, t.title), el('small', { class: 'muted' }, `${sectionOf(t.section_id)?.name || 'Sin sección'} · en ${t.count} acciones`)))));
  }
  from.addEventListener('change', () => { if (from.value) year.value = from.value.slice(0, 4); if (to.value && to.value < from.value) to.value = from.value; });
  openModal({ title: 'Nueva acción', wide: true,
    body: el('div', { class: 'fields' }, field('Nombre', name), field('Cliente', client), field('Tipo de acción', type), field('Responsable', owner),
      field('Fecha de inicio', from), field('Fecha de fin', to), field('Año', year, 'Sale de la fecha de inicio; si no hay fecha todavía, el que pongas.'), el('div', { class: 'field wide' }, el('label', {}, 'Tareas que quieres que vengan ya creadas'), cloneBox), el('div', { class: 'field wide' }, err)),
    actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Crear acción', keep: true, run: async (_e, close) => {
      err.textContent = '';
      try {
        const r = await api('POST', '/api/events', { name: name.value, client_id: client.value, type_id: type.value || null, owner_id: owner.value || null, starts_on: from.value || null, ends_on: to.value || null, year: Number(year.value), clone_tasks: [...cloneBox.querySelectorAll('input[type=checkbox]:checked')].map((c) => ({ title: templates[Number(c.dataset.i)].title, section_id: templates[Number(c.dataset.i)].section_id })) });
        await loadEvents(); close(); toast(`Creada ${r.event.ref}`); location.hash = `#/evento/${r.event.id}`;
      } catch (e) { err.textContent = e.message; return false; }
    } }] });
}

// Público objetivo: se elige entre opciones (se pueden marcar varias) y hay un campo «Otro» para lo que no esté en la lista. Se guarda como texto separado por comas.
const AUDIENCES = ['Familias', 'Niños y niñas', 'Jóvenes', 'Adultos', 'Mujeres', 'Hombres', 'Mayores', 'Público general', 'Clientes del centro', 'Comercios y locales', 'Prensa y medios'];

// Pantalla de espera mientras se copian las piezas y se manda el correo (difumina todo y avisa de que se está enviando)
function sendingOverlay() {
  const o = el('div', { class: 'sending', role: 'alertdialog', 'aria-live': 'assertive', 'aria-label': 'Enviando a producción' },
    el('div', { class: 'sending-box' }, el('strong', {}, 'Enviando a producción'), el('p', {}, 'Estamos copiando las piezas y avisando al proveedor. No cierres esta ventana.'),
      el('div', { class: 'dots', 'aria-hidden': 'true' }, el('i'), el('i'), el('i'))));
  document.body.append(o);
  return o;
}

// Excel de resultados (Datos, Comentarios e Incidencias): se analiza y se vuelca al cierre del evento
const isResultsName = (n) => /\.xlsx$/i.test(n || '') && /(datos.*comentarios|incidencias|resultados)/i.test(n || '');
async function resultsModal(e, file, done) {
  let r;
  try { r = await api('GET', `/api/task-files/${file.id}/analisis`); } catch (er) { return toast(er.message, true); }
  const a = r.analysis, bullets = (l) => l.map((x) => `• ${x}`).join('\n');
  const summary = [a.summary, a.participants != null ? `Participantes: ${a.participants.toLocaleString('es-ES')} (${a.participants_label}).` : ''].filter(Boolean).join('\n');
  const merge = (cur, add) => (!add ? cur : !cur ? add : cur.includes(add) ? cur : `${cur}\n\n${add}`);
  const preview = (title, txt) => (txt ? el('div', { class: 'rs-block' }, el('h4', {}, title), el('pre', {}, txt)) : null);
  openModal({ title: 'Análisis de resultados', wide: true,
    body: el('div', { class: 'rs' },
      el('p', { class: 'muted' }, el('a', { href: file.url, target: '_blank', rel: 'noopener' }, file.name), a.title ? ` · ${a.title}` : ''),
      a.participants != null ? el('div', { class: 'rs-num' }, el('strong', {}, a.participants.toLocaleString('es-ES')), el('span', {}, `participantes / asistencia · ${a.participants_label}`)) : el('p', { class: 'muted' }, 'No he encontrado la cifra de participantes en el Excel.'),
      preview('Resumen de datos (irá a «Resultado / KPI»)', a.summary), preview(`Incidencias (${a.incidents.length})`, bullets(a.incidents)), preview(`Comentarios de los clientes (${a.comments.length})`, bullets(a.comments)),
      el('p', { class: 'muted' }, 'Al aplicarlo se rellenan el cierre del evento y el enlace «Archivo de resultados». Si ya había texto escrito, esto se añade debajo sin borrarlo.')),
    actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Aplicar al cierre del evento', keep: true, run: async (_e, close) => {
      try {
        const links = [...(e.links || []).filter((l) => l.name !== 'Archivo de resultados'), { name: 'Archivo de resultados', url: file.url }];
        await api('PATCH', `/api/events/${e.id}`, { ...(a.participants != null ? { participants: a.participants } : {}), kpi_result: merge(e.kpi_result || '', a.summary), incidents: merge(e.incidents || '', bullets(a.incidents)), improvements: merge(e.improvements || '', a.comments.length ? `Comentarios de los clientes:\n${bullets(a.comments)}` : ''), links });
        close(); toast('Cierre del evento rellenado'); done?.();
      } catch (er) { toast(er.message, true); return false; }
    } }] });
}

// Enviar a producción: se marcan las piezas aprobadas de Creatividades, se elige proveedor y se le manda por correo el enlace a la carpeta Producción
async function productionModal(e) {
  let d, provs;
  try { [d, provs] = await Promise.all([api('GET', `/api/events/${e.id}/produccion`), api('GET', '/api/providers')]); } catch (er) { return toast(er.message, true); }
  if (!d.drive) return toast('Esta acción no tiene carpeta de Drive todavía', true);
  const sizeOf = (n) => (n == null ? '' : n > 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
  const prov = select([['', 'Elige proveedor…'], ...provs.providers.map((p) => [p.id, `${p.name}${p.email ? '' : ' (sin correo)'}`])], provs.providers.length === 1 ? provs.providers[0].id : '', { 'aria-label': 'Proveedor' });
  const message = el('textarea', { rows: 4, maxlength: 2000 }, `Hola. Te enviamos las piezas aprobadas de «${e.name}» para producción. Cualquier duda, respóndeme a este correo.\n\nGracias.`);
  const err = el('div', { class: 'err', role: 'alert' });
  const groups = new Map();
  for (const it of d.items) { const k = it.task || 'Otros archivos'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(it); }
  const checks = [];
  const list = d.items.length ? el('div', { class: 'prodlist' }, [...groups.entries()].map(([task, items]) => el('div', { class: 'prodgrp' }, el('h4', {}, task),
    items.map((it) => { const c = el('input', { type: 'checkbox', value: it.id }); checks.push(c); return el('label', { class: 'proditem' }, c, el('a', { href: it.url, target: '_blank', rel: 'noopener', onclick: (ev) => ev.stopPropagation() }, it.name), el('small', { class: 'muted' }, [sizeOf(it.size), it.in_production ? 'ya está en Producción' : ''].filter(Boolean).join(' · '))); }))))
    : el('p', { class: 'muted' }, 'La carpeta de Creatividades está vacía. Sube primero las piezas aprobadas a esa carpeta.');
  const hist = d.sends.length ? el('details', { class: 'prodhist' }, el('summary', {}, `Envíos anteriores (${d.sends.length})`), el('ul', {}, d.sends.map((s) => el('li', {}, `${new Date(s.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })} · ${s.provider_name} · ${s.files.length} pieza${s.files.length === 1 ? '' : 's'} · por ${s.sender_name}`)))) : null;
  const pm = openModal({ title: 'Enviar a producción', wide: true,
    body: el('div', { class: 'fields' },
      el('div', { class: 'field wide' }, el('p', { class: 'muted', style: { margin: 0 } }, 'Marca las piezas aprobadas. Se copian a la carpeta «Producción» de esta acción y el proveedor recibe un correo con el enlace. El correo sale a nombre de Elvira Vila, con copia a ella.')),
      el('div', { class: 'field wide' }, el('div', { class: 'clone-h prod-h' }, el('label', {}, 'Piezas de Creatividades'), el('button', { class: 'btn ghost small', type: 'button', onclick: () => checks.forEach((c) => { c.checked = true; }) }, 'Marcar todas'), el('button', { class: 'btn ghost small', type: 'button', onclick: () => checks.forEach((c) => { c.checked = false; }) }, 'Quitar todas')), list),
      field('Proveedor', prov), el('div', { class: 'field wide' }, el('label', {}, 'Mensaje'), message), hist ? el('div', { class: 'field wide' }, hist) : null, el('div', { class: 'field wide' }, err)),
    actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Enviar a producción', keep: true, run: async (ev, close) => {
      err.textContent = '';
      const btn = ev.currentTarget || ev.target;
      const file_ids = checks.filter((c) => c.checked).map((c) => c.value);
      if (!file_ids.length) { err.textContent = 'Marca al menos una pieza'; return false; }
      if (!prov.value) { err.textContent = 'Elige el proveedor'; return false; }
      btn.disabled = true; btn.textContent = 'Enviando…';
      const overlay = sendingOverlay();
      try { const r = await api('POST', `/api/events/${e.id}/produccion`, { provider_id: prov.value, file_ids, message: message.value }); overlay.remove(); close(); window.dispatchEvent(new HashChangeEvent('hashchange')); toast(`Enviado a ${r.provider}: ${r.files} pieza${r.files === 1 ? '' : 's'}${r.shared ? '' : ' (no se pudo dar acceso a la carpeta: avísale)'}`); }
      catch (er) { overlay.remove(); err.textContent = er.message; btn.disabled = false; btn.textContent = 'Enviar a producción'; return false; }
    } }] });
  pm.box.classList.add('prod-modal');
}

// Aviso de bloqueo: terminada y sin valoración → solo se rellena el cierre; para lo demás hay que pedir permiso al superusuario
function permissionModal(e) {
  const reason = el('textarea', { rows: 3, maxlength: 500, placeholder: 'Qué necesitas cambiar y por qué (opcional)' });
  const err = el('div', { class: 'err', role: 'alert' });
  openModal({ title: 'Pedir permiso para editar', body: el('div', { class: 'fields' }, el('p', { class: 'muted wide' }, `«${e.name}» está terminada y sin valoración. El superusuario recibirá tu petición por correo y en Administración.`), el('div', { class: 'field wide' }, el('label', {}, 'Motivo'), reason), el('div', { class: 'field wide' }, err)),
    actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Pedir permiso', keep: true, run: async (_e, close) => {
      try { await api('POST', `/api/events/${e.id}/permiso`, { reason: reason.value }); close(); toast('Permiso pedido'); window.dispatchEvent(new HashChangeEvent('hashchange')); }
      catch (er) { err.textContent = er.message; return false; }
    } }] });
}
function lockBanner(e, lock, isSuper) {
  const when = (iso) => new Date(iso).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  if (lock.authorized_until && lock.needs_rating) return el('div', { class: 'lockbar ok', role: 'status' }, el('b', {}, 'Permiso concedido'), ` hasta el ${when(lock.authorized_until)}. Pon la valoración en «Cierre del evento» para dejar la acción desbloqueada.`);
  if (!lock.needs_rating) return null;
  if (isSuper) return el('div', { class: 'lockbar info', role: 'status' }, el('b', {}, 'Terminada sin valoración.'), ' Para el resto del equipo está bloqueada; tú puedes editarla. Pon la valoración en «Cierre del evento» para desbloquearla.');
  const r = lock.request;
  return el('div', { class: 'lockbar', role: 'alert' }, el('div', {}, el('b', {}, 'Acción bloqueada.'), ' Está terminada y sin valoración: solo puedes rellenar el cierre del evento (valoración, resultados…). Para cambiar lo demás hace falta el permiso del superusuario.',
      r?.status === 'pendiente' ? el('div', { class: 'muted' }, `Permiso pedido por ${r.who} el ${when(r.requested_at)}: esperando respuesta.`) : r?.status === 'rechazada' ? el('div', { class: 'muted' }, 'La última petición de permiso se rechazó.') : null),
    r?.status === 'pendiente' ? null : el('button', { class: 'btn small', type: 'button', onclick: () => permissionModal(e) }, 'Pedir permiso'));
}

// Clonar una acción a otro año (copia la ficha y las tareas, todas sin hacer y sin importes)
// Desglose de costes de la acción: línea por línea y por sección, para facturar. Se puede imprimir/guardar en PDF o bajar para Excel.
function costModal(e, tasks, sections) {
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const eur = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
  const live = tasks.filter((t) => t.status !== 'archivada');
  const names = new Map(sections.map((s) => [s.id, s.name]));
  const order = [...sections.map((s) => s.id), null];
  const groups = order.map((sid) => ({ name: sid ? names.get(sid) : 'Sin sección', list: live.filter((t) => (t.section_id || null) === sid && Number(t.cost) > 0) })).filter((g) => g.list.length);
  const sub = (g) => g.list.reduce((n, t) => n + Number(t.cost), 0);
  const total = groups.reduce((n, g) => n + sub(g), 0);
  const sinCoste = live.length - groups.reduce((n, g) => n + g.list.length, 0);
  const client = clientOf(e.client_id)?.name || '';
  const head = `${e.ref} · ${e.name}${client ? ` (${client})` : ''}`;
  const dates = e.starts_on ? `${fmtDate(e.starts_on)}${e.ends_on && e.ends_on !== e.starts_on ? ` – ${fmtDate(e.ends_on)}` : ''}` : 'Sin fecha';
  const bill = e.invoiced ? 'Facturada' : 'Pendiente de facturar';

  const table = el('div', { class: 'costtab' }, groups.length ? groups.map((g) => el('div', { class: 'costsec' },
    el('div', { class: 'costh' }, el('b', {}, g.name), el('b', {}, fmtMoney(sub(g)))),
    g.list.map((t) => el('div', { class: 'costline' }, el('span', {}, t.title), el('span', {}, fmtMoney(t.cost)))))) : el('p', { class: 'muted' }, 'Ninguna tarea tiene coste anotado.'),
    el('div', { class: 'costtotal' }, el('span', {}, 'Total de las tareas'), el('b', {}, fmtMoney(total))),
    e.cost != null ? el('div', { class: 'costline' }, el('span', {}, 'Coste anotado en la acción'), el('span', {}, fmtMoney(e.cost))) : null,
    el('p', { class: 'muted', style: { margin: '10px 0 0' } }, `${bill}${sinCoste ? ` · ${sinCoste} tarea${sinCoste === 1 ? '' : 's'} sin coste no aparece${sinCoste === 1 ? '' : 'n'}` : ''}`));

  const csv = () => {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const num = (n) => String(Number(n)).replace('.', ',');
    const rows = [[head], [`Fechas: ${dates}`, bill], [], ['Sección', 'Tarea', 'Importe (€)']];
    for (const g of groups) { for (const t of g.list) rows.push([g.name, t.title, num(t.cost)]); rows.push([g.name, 'Subtotal', num(sub(g))]); }
    rows.push([], ['', 'Total de las tareas', num(total)]);
    if (e.cost != null) rows.push(['', 'Coste anotado en la acción', num(e.cost)]);
    const blob = new Blob(['﻿' + rows.map((r) => r.map(cell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = el('a', { href: URL.createObjectURL(blob), download: `costes-${e.ref}.csv` }); document.body.append(a); a.click(); a.remove();
  };
  const print = () => {
    const w = window.open('', '_blank');
    if (!w) { toast('El navegador ha bloqueado la ventana de impresión', true); return; }
    w.document.write(`<!doctype html><meta charset="utf-8"><title>Costes ${esc(e.ref)}</title><style>body{font:14px/1.45 Inter,Arial,sans-serif;color:#1c2b2b;margin:32px}h1{font-size:20px;margin:0 0 4px}p{margin:2px 0;color:#555}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{padding:6px 8px;text-align:left;border-bottom:1px solid #ddd}td.n,th.n{text-align:right;white-space:nowrap}tr.s td{font-weight:700;background:#f3f6f6}tr.t td{font-weight:700;font-size:16px;border-top:2px solid #1c2b2b;border-bottom:0}</style><h1>${esc(head)}</h1><p>${esc(dates)} · ${esc(bill)}</p><table><tr><th>Sección</th><th>Tarea</th><th class="n">Importe</th></tr>${groups.map((g) => g.list.map((t) => `<tr><td>${esc(g.name)}</td><td>${esc(t.title)}</td><td class="n">${eur(t.cost)}</td></tr>`).join('') + `<tr class="s"><td colspan="2">Subtotal ${esc(g.name)}</td><td class="n">${eur(sub(g))}</td></tr>`).join('')}<tr class="t"><td colspan="2">Total de las tareas</td><td class="n">${eur(total)}</td></tr>${e.cost != null ? `<tr><td colspan="2">Coste anotado en la acción</td><td class="n">${eur(e.cost)}</td></tr>` : ''}</table>`);
    w.document.close(); w.focus(); setTimeout(() => w.print(), 300);
  };
  openModal({ title: 'Desglose de costes', wide: true, body: el('div', {}, el('p', { style: { margin: '0 0 12px' } }, el('b', {}, head), el('br'), el('span', { class: 'muted' }, dates)), table),
    actions: [{ label: 'Cerrar', cls: 'ghost' }, { label: 'Descargar para Excel', cls: 'ghost', keep: true, run: () => csv() }, { label: 'Imprimir / PDF', keep: true, run: () => print() }] });
}

function cloneModal(e) {
  const thisYear = new Date().getFullYear();
  const years = [...new Set([e.year + 1, thisYear, thisYear + 1, thisYear + 2, thisYear + 3])].filter((y) => y !== e.year).sort((a, b) => a - b);
  const year = select(years.map((y) => [String(y), String(y)]), String(e.year + 1), { 'aria-label': 'Año' });
  const name = el('input', { type: 'text', value: e.name, maxlength: 200 });
  const err = el('div', { class: 'err', role: 'alert' });
  openModal({ title: 'Clonar acción', body: el('div', { class: 'fields' }, el('div', { class: 'field wide' }, el('p', { class: 'muted', style: { margin: 0 } }, `Se copia «${e.name}» con sus tareas (todas sin hacer, sin importes ni resultados) y las fechas pasan al año que elijas.`)), field('¿A qué año la clonamos?', year), field('Nombre', name), el('div', { class: 'field wide' }, err)),
    actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Clonar', keep: true, run: async (_e, close) => {
      err.textContent = '';
      try { const r = await api('POST', `/api/events/${e.id}/clone`, { year: Number(year.value), name: name.value }); await loadEvents(); close(); toast(`Creada ${r.event.ref} con ${r.tasks} tareas`); location.hash = `#/evento/${r.event.id}`; }
      catch (er) { err.textContent = er.message; return false; }
    } }] });
}

const ddmm = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '');
const sentChip = (t) => (t.sent_to_production ? el('span', { class: 'sentprod', title: `Enviado a producción${t.sent_to_production.provider ? ` (${t.sent_to_production.provider})` : ''} el ${ddmm(t.sent_to_production.date)}` }, 'Enviado a producción', el('b', {}, ddmm(t.sent_to_production.date))) : null);
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

export async function eventView(id, openTaskId = null) {
  const data = await api('GET', `/api/events/${id}`);
  let e = data.event, tasks = data.tasks;
  const unlocked = Boolean(data.costs_unlocked);
  const lock = data.lock || { locked: false, needs_rating: false };
  let photos = data.photos || [];
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
  const opened = new Set();
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
        sentChip(t),
        select(Object.entries(state.meta.taskStatus), t.status, { class: 'stsel', 'aria-label': 'Estado de la tarea', style: { '--c': TASK_COLOR[t.status] }, onchange: (ev) => upTask(t, { status: ev.target.value }) }),
        select([['', 'Sin responsable'], ...state.meta.users.map((u) => [u.id, firstName(u)])], t.owner_id || '', { 'aria-label': 'Responsable de la tarea', onchange: (ev) => upTask(t, { owner_id: ev.target.value || null }) }),
        el('input', { type: 'date', value: t.due_on || '', 'aria-label': 'Fecha límite', onchange: (ev) => upTask(t, { due_on: ev.target.value || null }) }),
        !unlocked ? null : el('input', { type: 'number', min: 0, step: '0.01', placeholder: '€', value: t.cost ?? '', 'aria-label': 'Coste de la tarea', onchange: (ev) => upTask(t, { cost: ev.target.value === '' ? null : ev.target.value }) }),
        el('button', { class: `clipbtn${t.files?.length ? ' has' : ''}`, type: 'button', title: t.files?.length ? `${t.files.length} archivo${t.files.length === 1 ? '' : 's'}: pulsa para verlos` : 'Sin archivos: pulsa para añadir', 'aria-label': t.files?.length ? `${t.files.length} archivos` : 'Sin archivos', onclick: () => taskModal(t) }, icon('clip'), t.files?.length ? String(t.files.length) : null),
        el('button', { class: 'btn ghost small more', type: 'button', onclick: () => taskModal(t) }, 'Ampliar tarea')));
  };
  function drawTasks() {
    const roots = live().filter((t) => !t.parent_id);
    const order = [...state.meta.sections.map((s) => s.id), null];
    const groups = order.map((sid) => ({ sid, list: roots.filter((t) => (t.section_id || null) === sid) })).filter((g) => g.list.length);
    tasksBox.replaceChildren(...[...groups.map((g) => {
      const key = g.sid || 'none'; const open = opened.has(key);
      const done = g.list.filter((t) => t.status === 'finalizada').length;
      return el('div', { class: `tsec${open ? ' open' : ''}`, style: { '--sc': sectionOf(g.sid)?.color || '#98a2b3' } },
        el('button', { class: 'th', type: 'button', 'aria-expanded': String(open), onclick: () => { if (open) opened.delete(key); else opened.add(key); drawTasks(); } }, icon('chev', 'chev'), el('i', { class: 'sdot' }), sectionName(g.sid), el('small', { class: 'muted', style: { textTransform: 'none', fontWeight: 400 } }, `${done}/${g.list.length}`), !unlocked ? null : el('span', { class: 'secsum' }, fmtMoney(g.list.reduce((n, t) => n + (Number(t.cost) || 0) + live().filter((c) => c.parent_id === t.id).reduce((m, c) => m + (Number(c.cost) || 0), 0), 0)))),
        open ? g.list.flatMap((t) => [taskRow(t), ...live().filter((c) => c.parent_id === t.id).map((c) => taskRow(c, true))]) : null);
    }), groups.length ? null : el('p', { class: 'muted' }, 'Todavía no hay tareas. Añade la primera abajo.')].filter(Boolean));
    const total = live().length, done = live().filter((t) => t.status === 'finalizada').length;
    progress.replaceChildren(el('div', { class: 'bar' }, el('i', { style: { width: total ? `${Math.round((done / total) * 100)}%` : '0%' } })), `${done} de ${total} tareas hechas`);
  }
  const newTitle = el('input', { type: 'text', placeholder: 'Nueva tarea… (Intro para añadirla)', maxlength: 300, 'aria-label': 'Nueva tarea' });
  const newSection = select([['', 'Sin sección'], ...state.meta.sections.map((s) => [s.id, s.name])], '', { 'aria-label': 'Sección de la nueva tarea' });
  const addTask = async (extra = {}) => {
    const t = (extra.title ?? newTitle.value).trim(); if (!t) return;
    try { const { task } = await api('POST', `/api/events/${id}/tasks`, { title: t, section_id: newSection.value || null, ...extra }); tasks.push(task); if (extra.title === undefined) { newTitle.value = ''; opened.add(task.section_id || 'none'); } drawTasks(); refreshSummary(); loadEvents(); newTitle.focus(); }
    catch (er) { toast(er.message, true); }
  };
  newTitle.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addTask(); } });

  function taskModal(t) {

    // Archivos de la tarea: lista, subida a la carpeta de Drive de la acción y botón para quitarlos de la tarea
    const filesBox = el('div', { class: 'tfiles' });
    const sizeOf = (n) => (n == null ? '' : n > 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
    const drawFiles = () => {
      const msg = el('span', { class: 'muted' });
      const dest = select(['Creatividades', 'Documentación', 'Producción'].map((x) => [x, x]), 'Documentación', { 'aria-label': 'Carpeta de destino' });
      const pick = el('input', { type: 'file', multiple: true, hidden: true, onchange: async (ev) => {
        for (const file of ev.target.files) {
          msg.textContent = `Subiendo ${file.name}…`;
          try {
            const r = await fetch(`/api/tasks/${t.id}/files?folder=${encodeURIComponent(dest.value)}&name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'X-Upload': '1', 'Content-Type': file.type || 'application/octet-stream' }, body: file, credentials: 'same-origin' });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
            t.files = [...(t.files || []).filter((x) => x.id !== j.file.id), j.file];
          } catch (er) { toast(`${file.name}: ${er.message}`, true); }
        }
        drawFiles(); drawTasks();
      } });
      filesBox.replaceChildren(
        t.files?.length ? el('ul', { class: 'flist' }, t.files.map((f) => el('li', {}, icon('clip'), el('a', { href: f.url, target: '_blank', rel: 'noopener' }, f.name), el('small', { class: 'muted' }, `${f.folder}${f.size ? ` · ${sizeOf(f.size)}` : ''}`), isResultsName(f.name) ? el('button', { class: 'btn small', type: 'button', onclick: () => resultsModal(e, f, () => window.dispatchEvent(new HashChangeEvent('hashchange'))) }, 'Análisis de resultados') : null,
          el('button', { class: 'btn ghost small', type: 'button', 'aria-label': `Quitar ${f.name} de la tarea`, onclick: async () => { if (!(await confirmBox('Quitar archivo', `¿Quitar «${f.name}» de esta tarea? El archivo se queda en Drive.`, 'Quitar'))) return; try { await api('DELETE', `/api/task-files/${f.id}`); t.files = t.files.filter((x) => x.id !== f.id); drawFiles(); drawTasks(); } catch (er) { toast(er.message, true); } } }, 'Quitar')))) : el('p', { class: 'muted', style: { margin: '0 0 8px' } }, 'Esta tarea no tiene archivos.'),
        data.drive_enabled ? el('div', { class: 'tupload' }, dest, el('button', { class: 'btn small', type: 'button', onclick: () => pick.click() }, icon('plus'), 'Subir archivo'), pick, msg) : el('p', { class: 'muted' }, 'Google Drive no está configurado en el servidor.'));
    };
    drawFiles();
    const summary = el('textarea', { rows: 4 }, t.summary || '');
    const prio = select([['', 'Sin prioridad'], ...Object.entries(state.meta.priorities)], t.priority || '');
    const sec = select([['', 'Sin sección'], ...state.meta.sections.map((s) => [s.id, s.name])], t.section_id || '');
    const link = el('input', { type: 'url', placeholder: 'https://… (carpeta de Drive, presupuesto…)', value: t.links?.[0]?.url || '' });
    const sub = el('input', { type: 'text', placeholder: 'Nueva subtarea…' });
    openModal({ title: t.title, wide: true,
      body: el('div', { class: 'fields' }, field('Sección', sec), field('Prioridad', prio), field('Enlace', link), el('div', { class: 'field wide' }, el('label', {}, 'Resumen'), summary), el('div', { class: 'field wide' }, el('label', {}, 'Archivos de esta tarea'), sentChip(t), filesBox), field('Añadir una subtarea', sub)),
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

  // Público objetivo (selección múltiple)
  const audBox = el('div', { class: 'aud' });
  const audParts = () => String(e.audience || '').split(',').map((x) => x.trim()).filter(Boolean);
  const setAud = (list, other) => set('audience', [...list, ...(other ? [other] : [])].join(', '));
  const drawAud = () => {
    const cur = audParts(), picked = cur.filter((x) => AUDIENCES.includes(x)), other = cur.filter((x) => !AUDIENCES.includes(x)).join(', ');
    const otherIn = el('input', { type: 'text', value: other, maxlength: 120, placeholder: 'Otro (escribe aquí)', 'aria-label': 'Otro público objetivo', oninput: (ev) => setAud(audParts().filter((x) => AUDIENCES.includes(x)), ev.target.value.replace(/,/g, ' ').trim()) });
    audBox.replaceChildren(el('div', { class: 'chips aud-opts', role: 'group', 'aria-label': 'Público objetivo' }, AUDIENCES.map((a) => el('button', { type: 'button', class: `opt${picked.includes(a) ? ' on' : ''}`, 'aria-pressed': String(picked.includes(a)), onclick: () => { const now = audParts(); const o = now.filter((x) => !AUDIENCES.includes(x)).join(', '); setAud(picked.includes(a) ? AUDIENCES.filter((x) => x !== a && picked.includes(x)) : AUDIENCES.filter((x) => x === a || picked.includes(x)), o); drawAud(); } }, a))), otherIn);
  };
  drawAud();

  // ── Fotografías del evento: arrastrar y soltar en bloque ──
  const photosBox = el('div', { class: 'photos' });
  async function uploadPhotos(fileList) {
    const files = [...fileList].filter((f) => f.size > 0); if (!files.length) return;
    let done = 0, failed = 0; const msg = photosBox.querySelector('.pmsg');
    const one = async (file) => {
      try {
        const r = await fetch(`/api/events/${id}/photos?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'X-Upload': '1', 'Content-Type': file.type || 'application/octet-stream' }, body: file, credentials: 'same-origin' });
        const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
        photos = [...photos.filter((x) => x.id !== j.photo.id), j.photo];
      } catch (er) { failed++; toast(`${file.name}: ${er.message}`, true); }
      done++; if (msg) msg.textContent = `Subiendo ${done} de ${files.length}…`;
    };
    const queue = [...files];   // 3 subidas a la vez
    await Promise.all([0, 1, 2].map(async () => { while (queue.length) await one(queue.shift()); }));
    toast(failed ? `${files.length - failed} fotos subidas, ${failed} con fallo` : `${files.length} foto${files.length === 1 ? '' : 's'} subida${files.length === 1 ? '' : 's'}`, Boolean(failed));
    drawPhotos();
  }
  function drawPhotos() {
    const pick = el('input', { type: 'file', multiple: true, accept: 'image/*,video/*', hidden: true, onchange: (ev) => uploadPhotos(ev.target.files) });
    const zone = el('div', { class: 'dropzone', tabindex: 0, role: 'button', 'aria-label': 'Soltar fotos aquí o pulsar para elegirlas',
      onclick: () => pick.click(), onkeydown: (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick.click(); } },
      ondragover: (ev) => { ev.preventDefault(); zone.classList.add('over'); }, ondragleave: () => zone.classList.remove('over'),
      ondrop: (ev) => { ev.preventDefault(); zone.classList.remove('over'); uploadPhotos(ev.dataTransfer.files); } },
      icon('clip'), el('strong', {}, 'Arrastra aquí las fotos y vídeos del evento'), el('span', { class: 'muted' }, 'o pulsa para elegirlos. Se pueden subir muchos a la vez.'), el('span', { class: 'pmsg muted' }), pick);
    photosBox.replaceChildren(
      data.drive_enabled ? zone : el('p', { class: 'muted' }, 'Google Drive no está configurado en el servidor.'),
      photos.length ? el('div', { class: 'pgrid' }, photos.map((f) => el('a', { class: 'pthumb', href: f.url, target: '_blank', rel: 'noopener', title: f.name },
        el('img', { src: f.thumb, alt: f.name, loading: 'lazy', onerror: (ev) => { ev.target.replaceWith(el('span', { class: 'pfallback' }, f.name)); } }),
        el('button', { class: 'pdel', type: 'button', 'aria-label': `Quitar ${f.name}`, onclick: async (ev) => { ev.preventDefault(); ev.stopPropagation(); if (!(await confirmBox('Quitar foto', `¿Quitar «${f.name}» de la galería? El archivo se queda en Drive.`, 'Quitar'))) return; try { await api('DELETE', `/api/task-files/${f.id}`); photos = photos.filter((x) => x.id !== f.id); drawPhotos(); } catch (er) { toast(er.message, true); } } }, '✕')))) : el('p', { class: 'muted' }, 'Todavía no hay fotografías de este evento.'));
  }
  drawPhotos();

  // ── Documentación: archivos de las tareas guardados en la carpeta Documentación (con análisis de los Excel de resultados) ──
  const resultsLink = (e.links || []).find((l) => l.name === 'Archivo de resultados');
  const docsBox = el('div', { class: 'docs' });
  const openFolders = new Set();
  const drawDocs = () => {
    const all = [...(data.event_docs || []).map((f) => ({ ...f, task: 'De la acción' })), ...tasks.flatMap((t) => (t.files || []).map((f) => ({ ...f, task: t.title })))];
    const results = all.filter((f) => isResultsName(f.name)), rest = all.filter((f) => !isResultsName(f.name));
    const row = (f, withTask = true) => el('li', {}, icon('clip'), el('a', { href: f.url, target: '_blank', rel: 'noopener', title: f.name }, f.name), withTask ? el('small', { class: 'muted' }, f.task) : null);
    const folders = ['Creatividades', 'Documentación', 'Producción'].map((name) => ({ name, files: rest.filter((f) => f.folder === name).sort((x, y) => x.name.localeCompare(y.name, 'es')) })).filter((g) => g.files.length);
    docsBox.replaceChildren(
      results.length ? el('div', { class: 'docs-results' }, el('h4', {}, 'Informe de resultados'), el('ul', { class: 'flist' }, results.map((f) => el('li', { class: 'big' }, icon('clip'), el('a', { href: f.url, target: '_blank', rel: 'noopener', title: f.name }, f.name), el('button', { class: 'btn small', type: 'button', onclick: () => resultsModal(e, f, () => window.dispatchEvent(new HashChangeEvent('hashchange'))) }, 'Análisis de resultados'))))) : null,
      folders.length ? el('div', { class: 'docs-folders' }, folders.map((g) => { const d = el('details', { class: 'dfolder', ontoggle: () => { if (d.open) openFolders.add(g.name); else openFolders.delete(g.name); } }, el('summary', {}, el('span', { class: 'fico' }, '📁'), el('b', {}, g.name), el('span', { class: 'pend-n' }, String(g.files.length))), el('ul', { class: 'flist' }, g.files.map((f) => row(f)))); d.open = openFolders.has(g.name); return d; }))
        : (results.length ? null : el('p', { class: 'muted' }, 'Todavía no hay documentos en esta acción.')));
  };
  drawDocs();

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
      ...row('Coste de la acción', !unlocked ? lockedChip() : e.cost != null ? fmtMoney(e.cost) : '—'), ...row('Coste de las tareas', !unlocked ? lockedChip() : el('button', { class: 'linkbtn', type: 'button', title: 'Ver el desglose por sección', onclick: () => costModal(e, tasks, state.meta.sections) }, tcost ? fmtMoney(tcost) : '—', ' ▾')), ...row('Facturado', e.invoiced ? 'Sí' : 'No'), ...(resultsLink ? row('Resultados', el('a', { href: resultsLink.url, target: '_blank', rel: 'noopener' }, 'Archivo de resultados')) : []));
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
        el('button', { class: 'btn ghost small', type: 'button', onclick: () => cloneModal(e) }, icon('copy'), 'Clonar'),
        e.drive_url ? el('button', { class: 'btn small', type: 'button', onclick: () => productionModal(e) }, 'Enviar a producción') : null,
        el('button', { class: 'btn ghost small', type: 'button', onclick: async () => { if (!(await confirmBox('Archivar acción', `¿Archivar «${e.name}»? Dejará de salir en las listas (un administrador puede borrarla del todo).`, 'Archivar'))) return; await api('DELETE', `/api/events/${id}`); await loadEvents(); toast('Acción archivada'); location.hash = `#/anio/${e.year}`; } }, 'Archivar'),
        state.me.is_admin ? el('button', { class: 'btn danger small', type: 'button', onclick: async () => { if (!(await confirmBox('Borrar para siempre', `¿Borrar «${e.name}» con todas sus tareas? No se puede deshacer.`, 'Borrar para siempre', true))) return; await api('DELETE', `/api/events/${id}?hard=1`); await loadEvents(); toast('Acción borrada'); location.hash = `#/anio/${e.year}`; } }, 'Borrar') : null)),
      title),
    lockBanner(e, lock, state.me.role === 'super_admin'),
    el('div', { class: 'evt' },
      el('div', {},
        el('section', { class: 'card sec' }, el('h3', {}, 'Datos'), el('div', { class: 'fields' },
          field('Tipo de acción', select([['', 'Sin tipo'], ...state.meta.types.map((t) => [t.id, t.name])], e.type_id || '', { onchange: (ev) => set('type_id', ev.target.value || null) })),
          field('Responsable', select([['', 'Sin responsable'], ...state.meta.users.map((u) => [u.id, u.name || u.email])], e.owner_id || '', { onchange: (ev) => set('owner_id', ev.target.value || null) })),
          dateIn('starts_on', 'Inicio'), dateIn('ends_on', 'Fin'), field('Año', yearIn),
          field('Ubicación', el('input', { type: 'text', list: 'locs', value: e.location || '', maxlength: 120, oninput: (ev) => set('location', ev.target.value) })),
          field('Coste de la acción (€)', !unlocked ? lockedChip() : el('input', { type: 'text', inputmode: 'decimal', value: e.cost ?? '', placeholder: '0', onchange: (ev) => set('cost', ev.target.value === '' ? null : ev.target.value) })),
          field('Facturación', el('label', { class: 'av-switch' }, el('input', { type: 'checkbox', checked: e.invoiced, onchange: (ev) => set('invoiced', ev.target.checked) }), el('i'), 'Facturada')),
          el('div', { class: 'field wide' }, el('label', {}, 'Colaboradores'), collabBox)),
          el('datalist', { id: 'locs' }, state.meta.locations.map((l) => el('option', { value: l })))),
        el('section', { class: 'card sec' }, el('h3', {}, 'Descripción'), area('description', 'Qué es esta acción', 'wide', 5)),
        el('section', { class: 'card sec' }, el('h3', {}, 'Tareas', el('small', { class: 'muted' }, 'lo que hay que hacer para que salga adelante')), progress, tasksBox,
          el('div', { class: 'addtask' }, newTitle, newSection, el('button', { class: 'btn', type: 'button', onclick: () => addTask() }, icon('plus'), 'Añadir'))),
        el('section', { class: 'card sec' }, el('h3', {}, 'Briefing'), el('div', { class: 'fields' }, area('objective', 'Objetivo', 'wide', 3), el('div', { class: 'field wide' }, el('label', {}, 'Público objetivo'), audBox))),
        el('section', { class: 'card sec' }, el('h3', {}, 'Documentación', el('small', { class: 'muted' }, 'presupuestos, bases, resultados…')), docsBox),
        el('section', { class: 'card sec' }, el('h3', {}, 'Cierre del evento', el('small', { class: 'muted' }, 'para rellenar cuando termine')), el('div', { class: 'fields' },
          (() => { const f = field('Participantes / asistencia', el('input', { type: 'number', min: 0, value: e.participants ?? '', onchange: (ev) => set('participants', ev.target.value === '' ? null : Number(ev.target.value)) })); if (resultsLink) f.append(el('a', { class: 'rs-link', href: resultsLink.url, target: '_blank', rel: 'noopener' }, 'Archivo de resultados')); return f; })(),
          field('Valoración (1 a 5)', stars),
          area('kpi_result', 'Resultado / KPI', 'wide', 3), area('sponsors', 'Patrocinadores', 'wide', 2), area('incidents', 'Incidencias', 'wide', 3), area('improvements', 'Qué mejorar la próxima vez', 'wide', 3),
          el('div', { class: 'field wide note-next' }, el('label', {}, 'Notas para el año que viene'), el('textarea', { rows: 4, oninput: (ev) => set('notes_next', ev.target.value) }, e.notes_next ?? '')))),
        el('section', { class: 'card sec' }, el('h3', {}, 'Fotografías', el('small', { class: 'muted' }, 'recopilatorio del evento')), photosBox),
        el('section', { class: 'card sec' }, el('h3', {}, 'Enlaces y archivos', el('small', { class: 'muted' }, 'carpetas de Drive, bases legales, informes…')), e.drive_url ? el('p', {}, el('a', { class: 'btn ghost small', href: e.drive_url, target: '_blank', rel: 'noopener' }, icon('clip'), 'Abrir la carpeta de esta acción en Drive')) : null, linksBox)),
      el('aside', { class: 'side' },
        el('section', { class: 'card sec' }, el('h3', {}, 'Resumen'), summaryBox, e.notion_url ? el('p', {}, el('a', { href: e.notion_url, target: '_blank', rel: 'noopener', class: 'muted' }, 'Ver la ficha original en Notion')) : null),
        el('section', { class: 'card sec' }, el('h3', {}, 'Actividad'), logBox))));
  if (lock.locked) {   // bloqueada: solo quedan activos el cierre, la documentación y los enlaces
    page.querySelectorAll('.evt > div > section.card').forEach((sec) => { if (!/Cierre|Documentación|Enlaces/.test(sec.querySelector('h3')?.textContent || '')) sec.setAttribute('inert', ''); });
    page.querySelectorAll('.evt-h .stsel, .evt-h select, .evt-h input.title').forEach((x) => x.setAttribute('inert', ''));
  }
  drawTasks(); refreshLog();
  if (openTaskId) setTimeout(() => { const t = tasks.find((x) => x.id === openTaskId); if (t) taskModal(t); }, 50);   // enlace desde el aviso de pendientes
  return page;
}
