// Informes: resumen global de las acciones y una ficha-resumen por cada una, filtrable por año.
import { el, api, select, field, toast, fmtRange, fmtMoney, statusBadge, STATUS_COLOR, MONTHS_SHORT } from './ui.js';
import { state, visibleEvents, clientOf, typeOf, userOf } from './state.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const sum = (l, f) => l.reduce((n, x) => n + (Number(f(x)) || 0), 0);

function barList(rows, total) {
  return el('div', { class: 'rep-bars' }, rows.map(({ label, n, color }) => el('div', { class: 'rep-bar' },
    el('span', { class: 'l' }, label), el('div', { class: 'bar', style: { '--c': color } }, el('i', { style: { width: `${pct(n, total)}%`, background: color || 'var(--accent)' } })), el('span', { class: 'n' }, String(n)))));
}

function card(e) {
  const t = typeOf(e.type_id), o = userOf(e.owner_id), late = e.tasks_overdue > 0;
  return el('a', { class: 'card rep-card', href: `#/evento/${e.id}`, style: { '--c': t?.color || '#98a2b3' } },
    el('div', { class: 'rtop' }, el('span', { class: 'ref' }, e.ref), statusBadge(state.meta.eventStatus[e.status], STATUS_COLOR[e.status])),
    el('h3', {}, e.name),
    el('div', { class: 'meta' }, [e.starts_on ? fmtRange(e.starts_on, e.ends_on) : 'Sin fecha', o ? (o.name || o.email) : null].filter(Boolean).join(' · ')),
    el('div', { class: 'prog' }, el('div', { class: 'bar' }, el('i', { style: { width: `${pct(e.tasks_done, e.tasks_total)}%` } })),
      `${e.tasks_done} de ${e.tasks_total} tareas${late ? ` · ${e.tasks_overdue} vencida${e.tasks_overdue === 1 ? '' : 's'}` : ''}`),
    el('div', { class: 'foot' }, e.cost != null ? el('strong', { class: 'price' }, fmtMoney(e.cost)) : el('span', { class: 'muted' }, 'Sin coste'), el('span', { class: e.invoiced ? 'ok' : 'muted' }, e.invoiced ? 'Facturada' : 'Sin facturar')),
    el('div', { class: 'ttype' }, el('i', { class: 'dot' }), t?.name || 'Sin tipo'));
}


const GROUPS = { fecha: 'Fecha de inicio', tipo: 'Tipo de acción', estado: 'Estado', facturacion: 'Facturación', responsable: 'Responsable', mes: 'Mes' };
const BILLING = { '': 'Facturación: todas', facturada: 'Facturadas', sin_facturar: 'Sin facturar', por_facturar: 'Terminadas y sin facturar' };
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// Clave y nombre del grupo de una acción según cómo se clasifique
function groupOf(e, by) {
  if (by === 'tipo') { const t = typeOf(e.type_id); return { key: e.type_id || 'none', label: t?.name || 'Sin tipo', color: t?.color || '#98a2b3', order: t ? state.meta.types.indexOf(t) : 99 }; }
  if (by === 'estado') return { key: e.status, label: state.meta.eventStatus[e.status], color: STATUS_COLOR[e.status], order: Object.keys(state.meta.eventStatus).indexOf(e.status) };
  if (by === 'facturacion') { const k = e.invoiced ? 'a' : e.status === 'terminado' ? 'b' : 'c'; return { key: k, label: { a: 'Facturadas', b: 'Terminadas y sin facturar', c: 'Sin facturar (aún sin terminar)' }[k], color: { a: '#16a34a', b: '#dc2626', c: '#98a2b3' }[k], order: k.charCodeAt(0) }; }
  if (by === 'responsable') { const u = userOf(e.owner_id); return { key: e.owner_id || 'none', label: u ? u.name || u.email : 'Sin responsable', color: '#0f766e', order: u ? 0 : 1 }; }
  if (by === 'mes') { const m = e.starts_on ? Number(e.starts_on.slice(5, 7)) : 99; return { key: String(m), label: m === 99 ? 'Sin fecha' : `${MONTH_NAMES[m - 1][0].toUpperCase()}${MONTH_NAMES[m - 1].slice(1)}`, color: '#0f766e', order: m }; }
  return { key: 'all', label: '', color: '#98a2b3', order: 0 };
}

function gate(onOk) {
  const email = el('input', { type: 'email', id: 'gate-user', name: 'usuario', autocomplete: 'username', required: true, placeholder: 'tu correo' });
  const pw = el('input', { type: 'password', id: 'gate-pass', name: 'clave', autocomplete: 'current-password', required: true });
  const err = el('div', { class: 'gate-err', role: 'alert' });
  const row = (label, input) => el('div', { class: 'gate-row' }, el('label', { for: input.id }, label), input);
  return el('div', { class: 'gate-wrap' }, el('form', { class: 'card gate', onsubmit: async (ev) => {
    ev.preventDefault(); err.textContent = '';
    try { await api('POST', '/api/informes/acceso', { email: email.value, password: pw.value }); onOk(); } catch (e) { err.textContent = e.message; pw.value = ''; pw.focus(); }
  } },
    el('h2', {}, 'Acceso a informes'),
    el('p', { class: 'gate-hint' }, 'Los informes incluyen importes. Escribe tu usuario y tu contraseña para abrirlos. Se cierran solos a los 30 minutos.'),
    row('Usuario (correo)', email), row('Contraseña', pw), err,
    el('button', { class: 'btn gate-btn', type: 'submit' }, 'Abrir informes')));
}

export async function informesView() {
  const page = el('div', { class: 'page', 'data-title': 'Informes' });
  const open = async () => {
    let all;
    try { all = (await api('GET', `/api/informes${state.client ? `?client=${state.client}` : ''}`)).events; }
    catch (e) {
      if (e.code !== 'reports_locked' && !/usuario y contrase/i.test(e.message)) throw e;
      page.replaceChildren(el('div', { class: 'page-h' }, el('h1', {}, 'Informes')), gate(open)); return;
    }
    draw(all);
  };
  function draw(all) {
    const f = { year: String(new Date().getFullYear()), type: '', status: '', billing: '', owner: '', by: 'fecha' };
    const years = [...new Set(all.map((e) => e.year))].sort((a, b) => b - a);
    if (!years.includes(Number(f.year))) f.year = '';
    const body = el('div');
    const sel = (key, options) => select(options, f[key], { 'aria-label': key, onchange: (ev) => { f[key] = ev.target.value; render(); } });
    const bar = el('div', { class: 'toolbar rep-bar-f' },
      sel('year', [['', 'Todos los años'], ...years.map((y) => [String(y), String(y)])]),
      sel('type', [['', 'Tipo: todos'], ...state.meta.types.map((t) => [t.id, t.name]), ['none', 'Sin tipo']]),
      sel('status', [['', 'Estado: todos'], ...Object.entries(state.meta.eventStatus)]),
      sel('billing', Object.entries(BILLING)),
      sel('owner', [['', 'Responsable: todos'], ...state.meta.users.map((u) => [u.id, u.name || u.email])]),
      el('label', { class: 'grp' }, 'Clasificar por', sel('by', Object.entries(GROUPS))));
    const keep = (e) => (!f.year || String(e.year) === f.year) && (!f.type || (f.type === 'none' ? !e.type_id : e.type_id === f.type)) && (!f.status || e.status === f.status) && (!f.owner || e.owner_id === f.owner)
      && (!f.billing || (f.billing === 'facturada' ? e.invoiced : f.billing === 'sin_facturar' ? !e.invoiced : e.status === 'terminado' && !e.invoiced));

    function render() {
      const l = all.filter(keep);
      const tasks = sum(l, (e) => e.tasks_total), done = sum(l, (e) => e.tasks_done), late = sum(l, (e) => e.tasks_overdue);
      const cost = sum(l, (e) => e.cost), billed = sum(l.filter((e) => e.invoiced), (e) => e.cost), unbilled = cost - billed;
      const byStatus = Object.entries(state.meta.eventStatus).map(([k, label]) => ({ label, n: l.filter((e) => e.status === k).length, color: STATUS_COLOR[k] })).filter((r) => r.n);
      const byType = [...state.meta.types.map((t) => ({ label: t.name, n: l.filter((e) => e.type_id === t.id).length, color: t.color })), { label: 'Sin tipo', n: l.filter((e) => !e.type_id).length, color: '#98a2b3' }].filter((r) => r.n).sort((a, b) => b.n - a.n);
      const months = Array.from({ length: 12 }, (_, i) => ({ label: MONTHS_SHORT[i], n: l.filter((e) => e.starts_on && Number(e.starts_on.slice(5, 7)) === i + 1).length })).filter((r) => r.n);
      const noDate = l.filter((e) => !e.starts_on).length; if (noDate) months.push({ label: 'Sin fecha', n: noDate, color: '#98a2b3' });
      const byDate = (a, b) => (a.starts_on || '9999').localeCompare(b.starts_on || '9999');
      let groups;
      if (f.by === 'fecha') groups = [{ label: '', items: [...l].sort(byDate) }];
      else { const m = new Map(); for (const e of l) { const g = groupOf(e, f.by); if (!m.has(g.key)) m.set(g.key, { ...g, items: [] }); m.get(g.key).items.push(e); } groups = [...m.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)); groups.forEach((g) => g.items.sort(byDate)); }

      body.replaceChildren(...[
        el('h2', { class: 'rep-h' }, 'Informe global'),
        l.length ? null : el('p', { class: 'muted' }, 'No hay acciones con esos filtros.'),
        el('div', { class: 'tiles' },
          el('div', { class: 'card tile hero' }, el('span', { class: 'val' }, String(l.length)), el('span', { class: 'lbl' }, l.length === 1 ? 'Acción' : 'Acciones')),
          el('div', { class: 'card tile' }, el('span', { class: 'val' }, `${pct(done, tasks)} %`), el('span', { class: 'lbl' }, `Tareas hechas (${done} de ${tasks})`)),
          el('div', { class: `card tile${late ? ' warn' : ''}` }, el('span', { class: 'val' }, String(late)), el('span', { class: 'lbl' }, 'Tareas con la fecha pasada')),
          el('div', { class: 'card tile' }, el('strong', { class: 'val' }, fmtMoney(cost) || '0 €'), el('span', { class: 'lbl' }, 'Coste de las acciones')),
          el('div', { class: 'card tile' }, el('strong', { class: 'val' }, fmtMoney(unbilled) || '0 €'), el('span', { class: 'lbl' }, `Sin facturar (facturado: ${fmtMoney(billed) || '0 €'})`))),
        el('div', { class: 'cols rep-cols' },
          el('section', { class: 'card sec' }, el('h3', {}, 'Por estado'), barList(byStatus, l.length)),
          el('section', { class: 'card sec' }, el('h3', {}, 'Por tipo de acción'), barList(byType, l.length)),
          el('section', { class: 'card sec' }, el('h3', {}, 'Por mes de inicio'), barList(months, l.length))),
        el('h2', { class: 'rep-h' }, f.by === 'fecha' ? 'Cada acción' : `Cada acción, por ${GROUPS[f.by].toLowerCase()}`),
        ...groups.map((g) => el('section', { class: 'rep-group', style: { '--g': g.color || '#98a2b3' } },
          g.label ? el('h3', { class: 'rep-gh' }, el('i', { class: 'dot' }), g.label, el('small', {}, `${g.items.length} · `, el('strong', {}, fmtMoney(sum(g.items, (e) => e.cost)) || '0 €'))) : null,
          el('div', { class: 'rep-grid' }, g.items.map(card))))].filter(Boolean));
    }
    render();
    page.replaceChildren(
      el('div', { class: 'page-h' }, el('h1', {}, 'Informes'), el('span', { style: { marginLeft: 'auto', display: 'flex', gap: '8px' } },
        el('button', { class: 'btn ghost', type: 'button', onclick: () => window.print() }, 'Imprimir'),
        el('button', { class: 'btn ghost', type: 'button', onclick: async () => { await api('POST', '/api/informes/bloquear'); toast('Informes bloqueados'); open(); } }, 'Bloquear')),
        el('p', { class: 'sub' }, state.client ? `Solo ${clientOf(state.client)?.name}.` : 'Todos los clientes.')),
      bar, body);
  }
  await open();
  return page;
}
