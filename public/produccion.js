// Informe de producción: consumos (unidades) y gastos (€) por año, con barras y círculos; pendiente de facturar y enlace a Holded.
import { el, api, select, toast, fmtMoney } from './ui.js';
import { state } from './state.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => { const n = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v); n.append(...kids.filter((k) => k != null)); return n; };
const num = (x) => Number(x) || 0;
const PALETTE = ['#0f766e', '#d97706', '#7c3aed', '#2563eb', '#dc2626', '#0891b2', '#65a30d', '#c026d3', '#ea580c', '#64748b'];
const HOLDED_URL = 'https://app.holded.com';

const money = (n) => fmtMoney(n) || '0 €';
const units = (n) => new Intl.NumberFormat('es-ES').format(n);

// Agrupa por etiqueta sumando (para sumar varios años o clientes) y deja el top N con «Otros»
function top(rows, key, n = 8) {
  const m = new Map();
  for (const r of rows) { const c = m.get(r.label) || { label: r.label, color: r.color, n: 0, cost: 0, actions: 0, files: 0 }; c.n += num(r.n); c.cost += num(r.cost); c.actions += num(r.actions); c.files += num(r.files); m.set(r.label, c); }
  const all = [...m.values()].filter((r) => num(r[key]) > 0).sort((a, b) => b[key] - a[key]);
  if (all.length <= n) return all;
  const rest = all.slice(n - 1).reduce((a, r) => ({ ...a, n: a.n + r.n, cost: a.cost + r.cost }), { label: 'Otros', color: '#98a2b3', n: 0, cost: 0 });
  return [...all.slice(0, n - 1), rest];
}

// Barras horizontales con el valor al final
function bars(rows, key, fmt) {
  const max = Math.max(...rows.map((r) => r[key]), 1);
  return el('div', { class: 'pr-bars' }, rows.map((r, i) => el('div', { class: 'pr-bar', title: `${r.label}: ${fmt(r[key])}` },
    el('span', { class: 'l' }, r.label), el('div', { class: 'bar' }, el('i', { style: { width: `${(r[key] / max) * 100}%`, background: r.color || PALETTE[i % PALETTE.length] } })), el('span', { class: 'n' }, fmt(r[key])))));
}

// Círculo (donut) con leyenda
function donut(rows, key, fmt) {
  const total = rows.reduce((n, r) => n + r[key], 0) || 1, R = 52, C = 2 * Math.PI * R;
  let off = 0;
  const arcs = rows.map((r, i) => { const len = (r[key] / total) * C; const a = svg('circle', { cx: 70, cy: 70, r: R, fill: 'none', stroke: r.color && rows.length < 4 ? r.color : PALETTE[i % PALETTE.length], 'stroke-width': 24, 'stroke-dasharray': `${len} ${C - len}`, 'stroke-dashoffset': -off, transform: 'rotate(-90 70 70)' }, svg('title', {}, `${r.label}: ${fmt(r[key])}`)); off += len; return a; });
  const g = svg('svg', { viewBox: '0 0 140 140', class: 'pr-donut', role: 'img', 'aria-label': 'Gráfico circular' }, ...arcs, svg('text', { x: 70, y: 74, 'text-anchor': 'middle', class: 'pr-dtot' }, fmt(total)));
  return el('div', { class: 'pr-pie' }, g, el('ul', { class: 'pr-leg' }, rows.map((r, i) => el('li', {}, el('i', { style: { background: r.color && rows.length < 4 ? r.color : PALETTE[i % PALETTE.length] } }), el('span', { class: 'l' }, r.label), el('b', {}, `${Math.round((r[key] / total) * 100)} %`)))));
}

// Columnas por año: gasto frente a facturación
function yearColumns(years, onPick, picked) {
  const W = Math.max(320, years.length * 96), H = 190, base = 160, max = Math.max(...years.flatMap((y) => [num(y.spent), num(y.budget)]), 1);
  const h = (v) => (num(v) / max) * (base - 24);
  const kids = [];
  years.forEach((y, i) => {
    const x = 20 + i * 96, sel = String(y.year) === picked;
    kids.push(svg('g', { class: `pr-ycol${sel ? ' on' : ''}`, tabindex: 0, role: 'button', 'aria-label': `Año ${y.year}`, onclick: () => onPick(String(y.year)) },
      svg('rect', { x: x - 6, y: 0, width: 84, height: H, fill: 'transparent' }),
      svg('rect', { x, y: base - h(y.budget), width: 30, height: h(y.budget), rx: 3, fill: '#94a3b8' }, svg('title', {}, `Facturación ${y.year}: ${money(y.budget)}`)),
      svg('rect', { x: x + 34, y: base - h(y.spent), width: 30, height: h(y.spent), rx: 3, fill: '#0f766e' }, svg('title', {}, `Gastos ${y.year}: ${money(y.spent)}`)),
      svg('text', { x: x + 32, y: base + 16, 'text-anchor': 'middle', class: 'yl' }, String(y.year)),
      svg('text', { x: x + 49, y: base - h(y.spent) - 4, 'text-anchor': 'middle', class: 'yv' }, num(y.spent) ? Math.round(num(y.spent) / 1000 * 10) / 10 + ' k' : '')));
  });
  const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pr-years', role: 'img', 'aria-label': 'Gastos y facturación por año', style: `min-width:${W}px` }, ...kids);
  return el('div', { class: 'pr-ywrap' }, g, el('p', { class: 'pr-key' }, el('i', { style: { background: '#94a3b8' } }), 'Facturación', el('i', { style: { background: '#0f766e' } }), 'Gastos (coste de tareas)', el('small', { class: 'muted' }, 'Pulsa un año para verlo abajo')));
}

function chartCard(title, hint, rows, key, fmt, empty) {
  const body = rows.length ? el('div', { class: 'pr-both' }, bars(rows, key, fmt), donut(rows, key, fmt)) : el('p', { class: 'muted' }, empty || 'Sin datos con importe en este periodo.');
  return el('section', { class: 'card sec pr-card' }, el('h3', {}, title, hint ? el('small', { class: 'muted' }, hint) : null), body);
}

const concept = (p) => `${p.ref} · ${p.name} (${p.client})`;
async function copy(text) { try { await navigator.clipboard.writeText(text); toast('Copiado'); } catch { toast('No se pudo copiar', true); } }

export function produccionView(data, ui) {
  const { year, setYear } = ui;
  const sel = (rows) => rows.filter((r) => !year || String(r.year) === year);
  const years = data.years;
  const Y = years.filter((y) => !year || String(y.year) === year);
  const spent = Y.reduce((n, y) => n + num(y.spent), 0), budget = Y.reduce((n, y) => n + num(y.budget), 0), tasks = Y.reduce((n, y) => n + y.tasks, 0), actions = Y.reduce((n, y) => n + y.actions, 0);
  const pending = data.pending.filter((p) => !year || String(p.year) === year);
  const pendTotal = pending.reduce((n, p) => n + num(p.budget), 0);
  const label = year || 'todos los años';

  const sections = top(sel(data.sections), 'cost', 9), sectionsN = top(sel(data.sections), 'n', 9);
  const types = top(sel(data.types), 'cost', 9), typesN = top(sel(data.types), 'n', 9);
  const providers = top(sel(data.providers), 'n', 9);
  const items = top(sel(data.items), 'cost', 10), itemsN = top(sel(data.items), 'n', 10);

  const emailBtn = el('button', { class: 'btn', type: 'button', onclick: async (ev) => {
    ev.currentTarget.disabled = true;
    try { const r = await api('POST', '/api/informes/enviar', { year, client: state.client || undefined }); toast(`Enviado a ${state.me.email}`); } catch (e) { toast(e.message, true); }
    ev.currentTarget.disabled = false;
  } }, 'Enviarme por correo');
  const linkUrl = `${location.origin}/#/informes?vista=produccion&anio=${year}`;

  return el('div', { class: 'pr' },
    el('div', { class: 'pr-act' }, el('span', { class: 'muted' }, `Informe de ${label}. Solo cuentan acciones activas (sin archivar ni canceladas).`),
      el('span', { class: 'pr-btns' }, el('button', { class: 'btn ghost', type: 'button', onclick: () => copy(linkUrl) }, 'Copiar enlace'), emailBtn)),
    el('div', { class: 'tiles' },
      el('div', { class: 'card tile hero' }, el('strong', { class: 'val' }, money(spent)), el('span', { class: 'lbl' }, 'Gastos (coste de tareas)')),
      el('div', { class: 'card tile' }, el('strong', { class: 'val' }, money(budget)), el('span', { class: 'lbl' }, 'Importe de facturación')),
      el('div', { class: 'card tile' }, el('strong', { class: 'val' }, money(budget - spent)), el('span', { class: 'lbl' }, `Resultado${budget ? ` · margen ${Math.round(((budget - spent) / budget) * 100)} %` : ''}`)),
      el('div', { class: 'card tile' }, el('span', { class: 'val' }, units(tasks)), el('span', { class: 'lbl' }, `Conceptos con coste en ${units(actions)} acciones`)),
      el('div', { class: `card tile${pending.length ? ' warn' : ''}` }, el('strong', { class: 'val' }, money(pendTotal)), el('span', { class: 'lbl' }, `Pendiente de facturar (${pending.length})`))),
    el('section', { class: 'card sec pr-card' }, el('h3', {}, 'Año a año'), years.length ? yearColumns(years, setYear, year) : el('p', { class: 'muted' }, 'Todavía no hay datos.')),

    el('h2', { class: 'rep-h' }, 'Gastos'),
    el('div', { class: 'pr-two' },
      chartCard('Qué más gasta: por sección', 'importe', sections, 'cost', money),
      chartCard('Qué más gasta: por tipo de acción', 'importe', types, 'cost', money)),
    chartCard('Qué más gasta: conceptos', 'tareas con el mismo nombre en distintas acciones, sumadas', items, 'cost', money),

    el('h2', { class: 'rep-h' }, 'Consumos'),
    el('p', { class: 'muted pr-note' }, 'Consumo = unidades: cuántos conceptos con coste se contratan y cuántos envíos a producción se hacen.'),
    el('div', { class: 'pr-two' },
      chartCard('Qué más consume: por sección', 'conceptos con coste', sectionsN, 'n', units),
      chartCard('Qué más consume: por tipo de acción', 'conceptos con coste', typesN, 'n', units)),
    el('div', { class: 'pr-two' },
      chartCard('Qué más consume: conceptos repetidos', 'veces que aparece', itemsN.filter((r) => r.n > 1).length ? itemsN : [], 'n', units, 'No hay conceptos repetidos con coste.'),
      chartCard('Producción por proveedor', 'envíos', providers, 'n', units, 'Aún no hay envíos a producción.')),

    el('h2', { class: 'rep-h' }, 'Pendiente de facturar'),
    el('section', { class: 'card sec pr-card' },
      pending.length ? el('div', { class: 'pr-tw' }, el('table', { class: 'pr-tbl' },
        el('thead', {}, el('tr', {}, ['Acción', 'Cliente', 'Año', 'A facturar', 'Gastos', ''].map((h) => el('th', {}, h)))),
        el('tbody', {}, pending.map((p) => el('tr', {},
          el('td', {}, el('a', { href: `#/evento/${p.id}` }, `${p.ref} · ${p.name}`)), el('td', {}, p.client), el('td', {}, String(p.year)),
          el('td', { class: 'r' }, p.budget == null ? el('span', { class: 'muted' }, 'Sin importe') : money(p.budget)), el('td', { class: 'r' }, money(p.cost)),
          el('td', { class: 'r' }, el('button', { class: 'btn ghost small', type: 'button', title: 'Copia el concepto y abre Holded en otra pestaña', onclick: () => { copy(`${concept(p)} — ${p.budget == null ? '' : money(p.budget)}`); window.open(HOLDED_URL, '_blank', 'noopener'); } }, 'Facturar en Holded'))))),
        el('tfoot', {}, el('tr', {}, el('td', { colspan: 3 }, 'Total pendiente'), el('td', { class: 'r' }, money(pendTotal)), el('td', {}, ''), el('td', {}, '')))))
        : el('p', { class: 'muted' }, 'No hay acciones terminadas pendientes de facturar.'),
      el('p', { class: 'muted pr-note' }, 'El botón copia «referencia · acción (cliente) — importe» y abre Holded para pegarlo en la factura.')));
}
