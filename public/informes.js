// Informes: resumen global de las acciones y una ficha-resumen por cada una, filtrable por año.
import { el, select, icon, fmtRange, fmtMoney, statusBadge, STATUS_COLOR, MONTHS_SHORT } from './ui.js';
import { state, visibleEvents, clientOf, typeOf, userOf } from './state.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const sum = (l, f) => l.reduce((n, x) => n + (Number(f(x)) || 0), 0);

function barList(rows, total) {
  return el('div', { class: 'rep-bars' }, rows.map(({ label, n, color }) => el('div', { class: 'rep-bar' },
    el('span', { class: 'l' }, label), el('div', { class: 'bar', style: { '--c': color } }, el('i', { style: { width: `${pct(n, total)}%`, background: color || 'var(--accent)' } })), el('span', { class: 'n' }, String(n)))));
}

function card(e) {
  const t = typeOf(e.type_id), o = userOf(e.owner_id), late = e.tasks_overdue > 0;
  return el('a', { class: 'card rep-card', href: `#/evento/${e.id}` },
    el('div', { class: 'top' }, el('span', { class: 'ref' }, e.ref), statusBadge(state.meta.eventStatus[e.status], STATUS_COLOR[e.status])),
    el('h3', {}, e.name),
    el('div', { class: 'meta' }, [e.starts_on ? fmtRange(e.starts_on, e.ends_on) : 'Sin fecha', t?.name, o ? (o.name || o.email) : null].filter(Boolean).join(' · ')),
    el('div', { class: 'prog' }, el('div', { class: 'bar' }, el('i', { style: { width: `${pct(e.tasks_done, e.tasks_total)}%` } })),
      `${e.tasks_done} de ${e.tasks_total} tareas${late ? ` · ${e.tasks_overdue} vencida${e.tasks_overdue === 1 ? '' : 's'}` : ''}`),
    el('div', { class: 'foot' }, el('span', {}, e.cost != null ? fmtMoney(e.cost) : 'Sin coste'), el('span', { class: e.invoiced ? 'ok' : 'muted' }, e.invoiced ? 'Facturada' : 'Sin facturar')));
}

export async function informesView() {
  const all = visibleEvents().filter((e) => !e.archived);
  const years = [...new Set(all.map((e) => e.year))].sort((a, b) => b - a);
  let year = years.includes(new Date().getFullYear()) ? String(new Date().getFullYear()) : '';
  const body = el('div');
  const yearSel = select([['', 'Todos los años'], ...years.map((y) => [String(y), String(y)])], year, { 'aria-label': 'Año', onchange: (ev) => { year = ev.target.value; draw(); } });

  function draw() {
    const l = all.filter((e) => !year || String(e.year) === year);
    const tasks = sum(l, (e) => e.tasks_total), done = sum(l, (e) => e.tasks_done), late = sum(l, (e) => e.tasks_overdue);
    const cost = sum(l, (e) => e.cost), billed = sum(l.filter((e) => e.invoiced), (e) => e.cost), unbilled = cost - billed;
    const byStatus = Object.entries(state.meta.eventStatus).map(([k, label]) => ({ label, n: l.filter((e) => e.status === k).length, color: STATUS_COLOR[k] })).filter((r) => r.n);
    const byType = [...state.meta.types.map((t) => ({ label: t.name, n: l.filter((e) => e.type_id === t.id).length, color: t.color })), { label: 'Sin tipo', n: l.filter((e) => !e.type_id).length, color: '#98a2b3' }].filter((r) => r.n).sort((a, b) => b.n - a.n);
    const months = Array.from({ length: 12 }, (_, i) => ({ label: MONTHS_SHORT[i], n: l.filter((e) => e.starts_on && Number(e.starts_on.slice(5, 7)) === i + 1).length })).filter((r) => r.n);
    const noDate = l.filter((e) => !e.starts_on).length; if (noDate) months.push({ label: 'Sin fecha', n: noDate, color: '#98a2b3' });
    const sorted = [...l].sort((a, b) => (a.starts_on || '9999').localeCompare(b.starts_on || '9999'));

    body.replaceChildren(
      el('h2', { class: 'rep-h' }, 'Informe global'),
      l.length ? null : el('p', { class: 'muted' }, 'No hay acciones en este periodo.'),
      el('div', { class: 'tiles' },
        el('div', { class: 'card tile hero' }, el('span', { class: 'val' }, String(l.length)), el('span', { class: 'lbl' }, l.length === 1 ? 'Acción' : 'Acciones')),
        el('div', { class: 'card tile' }, el('span', { class: 'val' }, `${pct(done, tasks)} %`), el('span', { class: 'lbl' }, `Tareas hechas (${done} de ${tasks})`)),
        el('div', { class: `card tile${late ? ' warn' : ''}` }, el('span', { class: 'val' }, String(late)), el('span', { class: 'lbl' }, 'Tareas con la fecha pasada')),
        el('div', { class: 'card tile' }, el('span', { class: 'val' }, fmtMoney(cost) || '0 €'), el('span', { class: 'lbl' }, 'Coste de las acciones')),
        el('div', { class: 'card tile' }, el('span', { class: 'val' }, fmtMoney(unbilled) || '0 €'), el('span', { class: 'lbl' }, `Sin facturar (facturado: ${fmtMoney(billed) || '0 €'})`))),
      el('div', { class: 'cols rep-cols' },
        el('section', { class: 'card sec' }, el('h3', {}, 'Por estado'), barList(byStatus, l.length)),
        el('section', { class: 'card sec' }, el('h3', {}, 'Por tipo de acción'), barList(byType, l.length)),
        el('section', { class: 'card sec' }, el('h3', {}, 'Por mes de inicio'), barList(months, l.length))),
      el('h2', { class: 'rep-h' }, 'Cada acción'),
      el('div', { class: 'rep-grid' }, sorted.map(card)));
  }
  draw();
  return el('div', { class: 'page', 'data-title': 'Informes' },
    el('div', { class: 'page-h' }, el('h1', {}, 'Informes'), el('span', { style: { marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' } }, yearSel,
      el('button', { class: 'btn ghost', type: 'button', onclick: () => window.print() }, 'Imprimir')),
      el('p', { class: 'sub' }, state.client ? `Solo ${clientOf(state.client)?.name}.` : 'Todos los clientes.')),
    body);
}
