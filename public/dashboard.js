// Inicio: lo que hay en marcha, lo que viene y lo que falta por cerrar.
import { el, api, icon, fmtRange, fmtMoney, fmtDate, STATUS_COLOR, today } from './ui.js';
import { state, clientOf, userOf } from './state.js';

const eventRow = (e, late = false) => el('a', { class: `rowlink${late ? ' late' : ''}`, href: `#/evento/${e.id}` },
  el('i', { class: 'dot', style: { background: STATUS_COLOR[e.status], width: '8px', height: '8px', borderRadius: '50%', flex: 'none' } }),
  el('span', { class: 'ref' }, e.ref), el('span', { class: 'nm' }, e.name), el('span', { class: 'meta' }, fmtRange(e.starts_on, e.ends_on)));
const panel = (title, rows, empty) => el('section', { class: 'card panel' }, el('h3', {}, title), rows.length ? rows : el('p', { class: 'empty' }, empty));

export async function dashboardView() {
  const d = await api('GET', `/api/dashboard${state.client ? `?client=${state.client}` : ''}`);
  const c = d.counts;
  const hi = state.me.name ? `Hola, ${state.me.name.split(' ')[0]}` : 'Hola';
  const page = el('div', { class: 'page', 'data-title': 'Inicio' },
    el('div', { class: 'page-h' }, el('h1', {}, hi), el('button', { class: 'btn', type: 'button', onclick: () => window.dispatchEvent(new CustomEvent('ev:new', { detail: { client_id: state.client } })) }, icon('plus'), 'Nueva acción'),
      el('p', { class: 'sub' }, state.client ? `Solo ${clientOf(state.client)?.name}.` : 'Todos los clientes.')),
    el('div', { class: 'tiles' },
      el('div', { class: 'card tile hero' }, el('span', { class: 'val' }, String(c.en_proceso)), el('span', { class: 'lbl' }, 'Acciones en proceso')),
      el('div', { class: 'card tile' }, el('span', { class: 'val' }, String(c.proximas)), el('span', { class: 'lbl' }, 'Empiezan en los próximos 30 días')),
      el('div', { class: `card tile${c.tareas_vencidas ? ' warn' : ''}` }, el('span', { class: 'val' }, String(c.tareas_vencidas)), el('span', { class: 'lbl' }, 'Tareas con la fecha pasada'))),
    el('div', { class: 'cols' },
      panel('En proceso', d.inProgress.map((e) => eventRow(e)), 'No hay ninguna acción en proceso.'),
      panel('Próximas', d.upcoming.map((e) => eventRow(e)), 'No hay acciones próximas.'),
      panel('Mis tareas', d.myTasks.map((t) => el('a', { class: `rowlink${t.overdue ? ' late' : ''}`, href: `#/evento/${t.event_id}` }, el('span', { class: 'nm' }, t.title), el('span', { class: 'ref' }, t.ref), el('span', { class: 'meta' }, t.due_on ? (t.overdue ? `venció el ${fmtDate(t.due_on)}` : fmtDate(t.due_on)) : 'sin fecha'))), 'No tienes tareas pendientes.'),
      panel('Terminadas y sin facturar', d.toInvoice.map((e) => el('a', { class: 'rowlink', href: `#/evento/${e.id}` }, el('span', { class: 'ref' }, e.ref), el('span', { class: 'nm' }, e.name), el('span', { class: 'meta' }, fmtMoney(e.cost)))), 'No queda nada por facturar.')));
  return page;
}
