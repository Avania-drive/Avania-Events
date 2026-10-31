// Vista de un año o de un tipo de acción: lista (por meses), tablero por estado y cronograma.
import { el, api, icon, select, fmtRange, fmtMoney, initials, STATUS_COLOR, today, parseDay, monthName, toast, statusBadge, debounce } from './ui.js';
import { lockedChip } from './unlock.js';
import { state, clientOf, typeOf, userOf, queryClient, loadEvents } from './state.js';

const MODE_KEY = 'ev_mode';
const getMode = () => { try { return localStorage.getItem(MODE_KEY) || 'cajas'; } catch { return 'cajas'; } };
const setMode = (m) => { try { localStorage.setItem(MODE_KEY, m); } catch { /* sin almacenamiento */ } };

// Más cercanas primero: las que están en curso o aún no han llegado, de la más próxima a la más lejana; después las ya pasadas, de la más reciente a la más antigua; al final, las sin fecha.
const nearFirst = (list) => {
  const now = today(), end = (e) => e.ends_on || e.starts_on;
  const rank = (e) => (!e.starts_on ? 2 : end(e) >= now ? 0 : 1);
  return [...list].sort((a, b) => rank(a) - rank(b) || (rank(a) === 1 ? b.starts_on.localeCompare(a.starts_on) : rank(a) === 0 ? (a.starts_on > now ? a.starts_on : now).localeCompare(b.starts_on > now ? b.starts_on : now) || a.starts_on.localeCompare(b.starts_on) : a.name.localeCompare(b.name)));
};

export async function listView(scope) {
  const byYear = scope.year != null;
  const type = scope.type ? typeOf(scope.type) : null;
  if (!byYear && !type) throw Object.assign(new Error('Ese tipo de acción no existe'), { status: 404 });
  const url = `/api/events?${byYear ? `year=${scope.year}` : `type=${scope.type}`}${queryClient()}`;
  const res = await api('GET', url);
  let events = res.events; const unlocked = Boolean(res.costs_unlocked);
  const f = { search: '', status: '', owner: '', type: '' };
  let mode = getMode();
  if (!byYear && mode === 'cronograma') mode = 'cajas';
  const body = el('div');
  const stats = el('div', { class: 'tiles' });

  const shown = () => events.filter((e) => (!f.status || e.status === f.status) && (!f.owner || e.owner_id === f.owner) && (!f.type || e.type_id === f.type)
    && (!f.search || `${e.name} ${e.ref}`.toLowerCase().includes(f.search.toLowerCase())));

  function drawStats(list) {
    const done = list.reduce((n, e) => n + e.tasks_done, 0), total = list.reduce((n, e) => n + e.tasks_total, 0);
    const t = (val, lbl, cls = '') => el('div', { class: `card tile ${cls}` }, el('span', { class: 'val' }, val), el('span', { class: 'lbl' }, lbl));
    stats.replaceChildren(t(String(list.length), list.length === 1 ? 'acción' : 'acciones', 'hero'), t(total ? `${Math.round((done / total) * 100)} %` : '—', `tareas hechas (${done} de ${total})`));
  }

  const ownerCell = (id) => { const u = userOf(id); return u ? el('span', { class: 'who' }, el('span', { class: 'avatar' }, initials(u)), u.name || u.email.split('@')[0]) : el('span', { class: 'muted' }, '—'); };
  const progress = (e) => (e.tasks_total ? el('div', { class: 'prog' }, el('div', { class: 'bar' }, el('i', { style: { width: `${Math.round((e.tasks_done / e.tasks_total) * 100)}%` } })), `${e.tasks_done}/${e.tasks_total}${e.tasks_overdue ? ` · ${e.tasks_overdue} vencidas` : ''}`) : el('span', { class: 'muted' }, 'Sin tareas'));
  const cliChip = (e) => (state.client ? null : el('span', { class: 'cli', style: { '--c': e.client_color }, title: e.client_name }, e.client_code));
  const typeChip = (e) => { const t = typeOf(e.type_id); return t ? el('span', { class: 'chip', style: { '--c': t.color } }, t.name) : null; };
  const stBadge = (e) => statusBadge(state.meta.eventStatus[e.status], STATUS_COLOR[e.status]);

  let dateDir = 'asc';   // orden por fecha de inicio en la lista: asc = la más temprana primero
  function drawList(list) {
    if (!list.length) return el('div', { class: 'card empty-big' }, 'No hay acciones con esos filtros.');
    const groups = new Map();
    const dir = dateDir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => (!a.starts_on - !b.starts_on) || dir * (a.starts_on || '').localeCompare(b.starts_on || '') || a.name.localeCompare(b.name));
    for (const e of list) {
      const key = byYear ? (e.starts_on ? Number(e.starts_on.slice(5, 7)) : 99) : e.year;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    const keys = [...groups.keys()].sort((a, b) => (byYear ? (a === 99) - (b === 99) || dir * (a - b) : b - a));
    const rows = keys.flatMap((k) => [
      el('tr', { class: 'mrow' }, el('td', { colspan: 8 }, byYear ? (k === 99 ? 'Sin fecha' : monthName(k - 1)) : String(k))),
      ...groups.get(k).map((e) => el('tr', { class: 'ev', tabindex: 0, onclick: () => (location.hash = `#/evento/${e.id}`), onkeydown: (ev) => ev.key === 'Enter' && (location.hash = `#/evento/${e.id}`) },
        el('td', { class: 'nm' }, el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } }, el('span', { class: 'ref' }, e.ref), cliChip(e), el('strong', {}, e.name), typeChip(e))),
        el('td', {}, fmtRange(e.starts_on, e.ends_on)), el('td', {}, stBadge(e)), el('td', {}, ownerCell(e.owner_id)), el('td', {}, progress(e)),
        el('td', { class: 'num' }, !unlocked ? lockedChip() : e.budget != null ? fmtMoney(e.budget) : el('span', { class: 'muted' }, '—')), el('td', {}, e.invoiced ? el('span', { class: 'yes' }, 'Facturado') : el('span', { class: 'muted' }, e.status === 'terminado' ? 'Sin facturar' : '—'))))]);
    return el('div', { class: 'card table-wrap' }, el('table', { class: 't' }, el('thead', {}, el('tr', {}, ['Acción', 'Fechas', 'Estado', 'Responsable', 'Tareas', 'Facturación', 'Factura'].map((h, i) => (h === 'Fechas'
      ? el('th', { 'aria-sort': dateDir === 'asc' ? 'ascending' : 'descending' }, el('button', { class: 'sortbtn', type: 'button', title: dateDir === 'asc' ? 'Ahora: de la más temprana a la más tardía. Pulsa para invertir.' : 'Ahora: de la más tardía a la más temprana. Pulsa para invertir.', onclick: () => { dateDir = dateDir === 'asc' ? 'desc' : 'asc'; draw(); } }, 'Fechas', el('span', { class: 'arr', 'aria-hidden': 'true' }, dateDir === 'asc' ? '▲' : '▼')))
      : el('th', { class: i === 5 ? 'num' : '' }, h))))), el('tbody', {}, rows)));
  }

  function drawBoxes(list) {
    if (!list.length) return el('div', { class: 'card empty-big' }, 'No hay acciones con esos filtros.');
    const groups = [...state.meta.types.map((t) => ({ name: t.name, color: t.color, items: nearFirst(list.filter((e) => e.type_id === t.id)) })), { name: 'Sin tipo', color: '#98a2b3', items: nearFirst(list.filter((e) => !e.type_id)) }].filter((g) => g.items.length);
    return el('div', { class: 'tboxes' }, groups.map((g) => el('section', { class: 'tbox', style: { '--c': g.color } },
      el('h3', {}, el('i', { class: 'dot' }), g.name, el('small', {}, String(g.items.length))),
      el('div', { class: 'tcards' }, g.items.map((e) => el('a', { class: 'tcard', href: `#/evento/${e.id}` },
        el('div', { class: 'top' }, el('span', { class: 'ref' }, e.ref), cliChip(e), stBadge(e)),
        el('strong', {}, e.name),
        el('div', { class: 'meta' }, fmtRange(e.starts_on, e.ends_on)),
        e.tasks_total ? el('div', { class: 'prog' }, el('div', { class: 'bar' }, el('i', { style: { width: `${Math.round((e.tasks_done / e.tasks_total) * 100)}%` } })), `${e.tasks_done}/${e.tasks_total} tareas`) : el('div', { class: 'meta' }, 'Sin tareas'),
        userOf(e.owner_id) ? el('div', { class: 'who' }, el('span', { class: 'avatar' }, initials(userOf(e.owner_id))), userOf(e.owner_id).name || userOf(e.owner_id).email.split('@')[0]) : null))))));
  }

  function drawBoard(list) {
    const cols = Object.entries(state.meta.eventStatus).map(([key, label]) => {
      const cards = list.filter((e) => e.status === key);
      const col = el('div', { class: 'bcol', 'data-status': key },   // el estado solo se cambia en la ficha, en el Resumen
      el('h4', {}, el('i', { class: 'dot', style: { width: '8px', height: '8px', borderRadius: '50%', background: STATUS_COLOR[key] } }), label, el('small', { class: 'muted' }, String(cards.length))),
        cards.map((e) => el('a', { class: 'card bcard', href: `#/evento/${e.id}`},
          el('div', { class: 'top' }, el('span', { class: 'ref' }, e.ref), cliChip(e), typeChip(e)), el('div', { class: 'nm' }, e.name),
          el('div', { class: 'meta' }, el('span', {}, fmtRange(e.starts_on, e.ends_on)), e.owner_id ? ownerCell(e.owner_id) : null, unlocked && e.budget != null ? el('span', {}, fmtMoney(e.budget)) : null), progress(e))));
      return col;
    });
    return el('div', { class: 'board' }, cols);
  }

  function drawTimeline(list) {
    const y = scope.year, start = Date.UTC(y, 0, 1), span = Date.UTC(y + 1, 0, 1) - start;
    const dated = list.filter((e) => e.starts_on);
    if (!dated.length) return el('div', { class: 'card empty-big' }, 'Ninguna acción de este año tiene fecha todavía.');
    const pos = (d) => Math.min(100, Math.max(0, ((parseDay(d).getTime() - start) / span) * 100));
    const rows = dated.sort((a, b) => a.starts_on.localeCompare(b.starts_on)).map((e) => {
      const l = pos(e.starts_on), r = Math.max(pos(e.ends_on || e.starts_on) + (100 / 365), l + 0.8);
      return el('div', { class: 'tl-row' },
        el('a', { class: 'tl-label', href: `#/evento/${e.id}`, title: e.name }, el('i', { class: 'dot', style: { width: '8px', height: '8px', borderRadius: '50%', background: STATUS_COLOR[e.status], flex: 'none' } }), e.name),
        el('div', { class: 'tl-track' }, el('a', { class: 'tl-bar', href: `#/evento/${e.id}`, style: { left: `${l}%`, width: `${Math.min(r, 100) - l}%`, '--c': typeOf(e.type_id)?.color || 'var(--accent)' }, title: `${e.name} · ${fmtRange(e.starts_on, e.ends_on)}` }, fmtRange(e.starts_on, e.ends_on))));
    });
    const t = today();
    const todayLine = t.startsWith(String(y)) ? el('div', { class: 'tl-today', style: { left: `calc(230px + (100% - 230px) * ${pos(t) / 100})` } }) : null;
    return el('div', { class: 'card tl' }, el('div', { class: 'tl-grid' }, todayLine,
      el('div', { class: 'tl-head' }, el('div', { class: 'tl-label' }, ''), el('div', { class: 'tl-months' }, Array.from({ length: 12 }, (_, i) => el('span', {}, monthName(i).slice(0, 3))))), rows,
      list.length > dated.length ? el('div', { class: 'tl-label muted' }, `${list.length - dated.length} acciones sin fecha no salen aquí.`) : null));
  }

  function draw() {
    const list = shown();
    drawStats(list);
    body.replaceChildren(mode === 'cajas' ? drawBoxes(list) : mode === 'tablero' ? drawBoard(list) : mode === 'cronograma' && byYear ? drawTimeline(list) : drawList(list));
    modes.forEach((b) => b.classList.toggle('on', b.dataset.mode === mode));
  }
  const modes = [['cajas', 'box', 'Cajas'], ['lista', 'list', 'Lista'], ['tablero', 'board', 'Tablero'], ...(byYear ? [['cronograma', 'gantt', 'Cronograma']] : [])]
    .map(([m, ic, label]) => el('button', { type: 'button', 'data-mode': m, onclick: () => { mode = m; setMode(m); draw(); } }, icon(ic), label));

  const users = [['', 'Responsable: todos'], ...state.meta.users.map((u) => [u.id, u.name || u.email])];
  const toolbar = el('div', { class: 'toolbar' },
    el('input', { type: 'search', placeholder: 'Buscar acción o referencia…', 'aria-label': 'Buscar', oninput: debounce((e) => { f.search = e.target.value.trim(); draw(); }, 200) }),
    byYear ? select([['', 'Tipo: todos'], ...state.meta.types.map((t) => [t.id, t.name])], '', { 'aria-label': 'Tipo', onchange: (e) => { f.type = e.target.value; draw(); } }) : null,
    select([['', 'Estado: todos'], ...Object.entries(state.meta.eventStatus)], '', { 'aria-label': 'Estado', onchange: (e) => { f.status = e.target.value; draw(); } }),
    select(users, '', { 'aria-label': 'Responsable', onchange: (e) => { f.owner = e.target.value; draw(); } }),
    el('div', { class: 'tabs seg', role: 'tablist' }, modes));

  const title = byYear ? `Acciones ${scope.year}` : type.name;
  const page = el('div', { class: 'page', 'data-title': title },
    el('div', { class: 'page-h' },
      el('h1', {}, byYear ? title : el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '10px' } }, el('i', { class: 'dot', style: { width: '12px', height: '12px', borderRadius: '50%', background: type.color } }), title)),
      el('button', { class: 'btn', type: 'button', onclick: () => window.dispatchEvent(new CustomEvent('ev:new', { detail: { year: byYear ? scope.year : undefined, type_id: type?.id, client_id: state.client } })) }, icon('plus'), 'Nueva acción'),
      el('p', { class: 'sub' }, `${byYear ? 'Todas las acciones del año' : 'Todas las acciones de este tipo, de todos los años'}${state.client ? ` · solo ${clientOf(state.client)?.name}` : ''}.`)),
    stats, toolbar, body);
  draw();
  return page;
}
