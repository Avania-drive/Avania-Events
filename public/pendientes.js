// Aviso diario: la primera vez que alguien entra cada día, una ventana grande con las tareas sin terminar y las acciones sin facturar.
import { el, api, openModal, fmtDate, statusBadge, TASK_COLOR } from './ui.js';
import { state, bus, userOf } from './state.js';

export async function refreshPending() {
  try { const d = await api('GET', '/api/pendientes'); state.pending = d; bus.dispatchEvent(new Event('pending')); return d; } catch { return null; }
}
export async function maybeShowPending() {
  const d = await refreshPending();
  if (!d || d.seen_today || (!d.tasks.length && !d.toInvoice.length)) return;
  openPendingModal(d);
}
export function openPendingModal(d) {
  const byEvent = new Map();
  for (const t of d.tasks) { if (!byEvent.has(t.event_id)) byEvent.set(t.event_id, { ref: t.ref, name: t.event_name, id: t.event_id, tasks: [] }); byEvent.get(t.event_id).tasks.push(t); }
  const late = d.tasks.filter((t) => t.overdue).length;
  const done = async (close) => { try { await api('POST', '/api/pendientes/visto'); } catch { /* si falla, volverá a salir */ } close(); };
  const body = el('div', { class: 'pend' },
    el('div', { class: 'pend-warn', role: 'alert' }, el('strong', {}, `${d.tasks.length} tarea${d.tasks.length === 1 ? '' : 's'} sin terminar${late ? ` (${late} con la fecha pasada)` : ''}`),
      d.toInvoice.length ? el('strong', {}, `${d.toInvoice.length} ${d.toInvoice.length === 1 ? 'acción terminada' : 'acciones terminadas'} sin facturar`) : null),
    d.toInvoice.length ? el('section', {}, el('h3', {}, 'Sin facturar'), el('ul', { class: 'pend-list' }, d.toInvoice.map((e) => el('li', {}, el('span', { class: 'ref' }, e.ref), el('a', { href: `#/evento/${e.id}`, 'data-close': '1' }, e.name))))) : null,
    ...[...byEvent.values()].map((g) => el('section', {}, el('h3', {}, el('span', { class: 'ref' }, g.ref), el('a', { href: `#/evento/${g.id}`, 'data-close': '1' }, g.name), el('small', { class: 'muted' }, ` ${g.tasks.length}`)),
      el('ul', { class: 'pend-list' }, g.tasks.map((t) => el('li', { class: t.overdue ? 'late' : '' },
        el('a', { href: `#/evento/${g.id}?t=${t.id}`, 'data-close': '1' }, t.title),
        t.due_on ? el('small', { class: t.overdue ? 'late' : 'muted' }, t.overdue ? `venció el ${fmtDate(t.due_on)}` : `para el ${fmtDate(t.due_on)}`) : null,
        t.owner_id && userOf(t.owner_id) ? el('small', { class: 'muted' }, userOf(t.owner_id).name || userOf(t.owner_id).email) : null,
        statusBadge(state.meta.taskStatus[t.status], TASK_COLOR[t.status])))))));
  const { close, box } = openModal({ title: 'Tareas pendientes', body, wide: true, actions: [{ label: 'Lo reviso más tarde', keep: true, run: (_e, c) => done(c) }] });
  box.classList.add('pend-modal');
  box.addEventListener('click', (e) => { if (e.target.closest('a[data-close]')) done(close); });   // al abrir una tarea el aviso se cierra y no vuelve a salir hoy
}
