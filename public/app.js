import { el, api, icon, toast, openModal, field, initials, STATUS_COLOR } from './ui.js';
import { state, bus, loadMeta, loadEvents, setClient, visibleEvents } from './state.js';
import { dashboardView } from './dashboard.js';
import { listView } from './list.js';
import { eventView, newEventModal } from './event.js';
import { adminView } from './admin.js';
import { informesView } from './informes.js';

const app = document.getElementById('app');
const ROLE = { super_admin: 'Superadministrador', admin: 'Administrador', member: 'Equipo' };
const openYears = new Set();
let main, side, token = 0;

// ───────── Acceso ─────────
function brand() {
  return el('span', { class: 'brand' }, el('img', { class: 'logo-light', src: '/brand/avania-light.png', alt: 'Avania' }), el('img', { class: 'logo-dark', src: '/brand/avania-dark.png', alt: 'Avania' }), el('b', {}, 'EVENTS'));
}
function loginView() {
  const err = el('div', { class: 'err', role: 'alert' });
  const email = el('input', { type: 'email', id: 'em', autocomplete: 'username', required: true, autofocus: true });
  const pw = el('input', { type: 'password', id: 'pw', autocomplete: 'current-password', required: true });
  const go = el('button', { class: 'btn', type: 'submit' }, 'Entrar');
  document.body.classList.add('center-page');
  app.replaceChildren(el('main', { class: 'auth-card card' }, brand(), el('h1', {}, 'Entrar'), el('p', { class: 'muted' }, 'Acceso solo para el equipo de AVANIA.'),
    el('form', { onsubmit: async (e) => {
      e.preventDefault(); err.textContent = ''; go.disabled = true;
      try { await api('POST', '/api/login', { email: email.value, password: pw.value }); await boot(); } catch (er) { err.textContent = er.message; go.disabled = false; }
    } }, el('label', { for: 'em' }, 'Correo'), email, el('label', { for: 'pw' }, 'Contraseña'), pw, err, go)));
}
function passwordForm(forced, done) {
  const err = el('div', { class: 'err', role: 'alert' });
  const cur = el('input', { type: 'password', id: 'cur', autocomplete: 'current-password', required: true });
  const n1 = el('input', { type: 'password', id: 'n1', autocomplete: 'new-password', required: true, minlength: 12 });
  const n2 = el('input', { type: 'password', id: 'n2', autocomplete: 'new-password', required: true, minlength: 12 });
  const go = el('button', { class: 'btn', type: 'submit' }, 'Guardar contraseña');
  return el('form', { onsubmit: async (e) => {
    e.preventDefault(); err.textContent = '';
    if (n1.value !== n2.value) { err.textContent = 'Las dos contraseñas nuevas no coinciden'; return; }
    go.disabled = true;
    try { await api('POST', '/api/password', { current: cur.value, next: n1.value }); toast('Contraseña cambiada'); done(); } catch (er) { err.textContent = er.message; go.disabled = false; }
  } }, el('label', { for: 'cur' }, forced ? 'Contraseña temporal' : 'Contraseña actual'), cur, el('label', { for: 'n1' }, 'Contraseña nueva (mínimo 12 caracteres)'), n1, el('label', { for: 'n2' }, 'Repite la nueva'), n2, err, go);
}
function forcedPasswordView() {
  document.body.classList.add('center-page');
  app.replaceChildren(el('main', { class: 'auth-card card' }, brand(), el('h1', {}, 'Elige tu contraseña'), el('p', { class: 'muted' }, 'Es tu primer acceso: cambia la contraseña temporal por una tuya.'), passwordForm(true, () => boot())));
}
function accountModal() {
  const name = el('input', { type: 'text', value: state.me.name || '', maxlength: 120 });
  openModal({ title: 'Mi cuenta', body: [
    el('p', { class: 'muted' }, `${state.me.email} · ${ROLE[state.me.role]}`),
    field('Mi nombre (el que verá el equipo)', name),
    el('h3', {}, 'Cambiar contraseña'), passwordForm(false, () => {}),
  ], actions: [{ label: 'Guardar nombre', run: async () => { try { await api('PATCH', '/api/me', { name: name.value }); await loadMeta(); renderSide(); toast('Nombre guardado'); } catch (e) { toast(e.message, true); return false; } } }] });
}
async function logout() { await api('POST', '/api/logout'); state.me = null; loginView(); }

// ───────── Menú lateral ─────────
function renderSide() {
  if (!side) return;
  const evs = visibleEvents();
  const route = parseRoute();
  const years = [...new Set([new Date().getFullYear(), ...evs.map((e) => e.year)])].sort((a, b) => b - a);
  if (route.name === 'anio') openYears.add(Number(route.arg));
  if (route.name === 'evento') { const e = state.events.find((x) => x.id === route.arg); if (e) openYears.add(e.year); }
  const nav = (href, label, ic, cls = '', extra = []) => el('a', { class: `av-nav ${cls}`, href, 'aria-current': cls.includes('on') ? 'page' : undefined }, ic, el('span', {}, label), ...extra);
  const yearBlock = years.flatMap((y) => {
    const list = evs.filter((e) => e.year === y);
    const open = openYears.has(y);
    const on = route.name === 'anio' && Number(route.arg) === y;
    const items = [el('a', { class: `av-nav ${on ? 'on' : ''} ${open ? 'open' : ''}`, href: `#/anio/${y}`, 'aria-current': on ? 'page' : undefined },
      icon('cal'), el('span', {}, String(y)), el('small', { class: 'cnt' }, String(list.length)))];
    return items;
  });
  const clientSel = el('select', { class: 'client', 'aria-label': 'Cliente', onchange: (e) => setClient(e.target.value) },
    el('option', { value: '' }, 'Todos los clientes'), state.meta.clients.filter((c) => !c.archived).map((c) => el('option', { value: c.id, selected: state.client === c.id }, c.name)));
  side.replaceChildren(
    brand(),
    el('button', { class: 'av-acct', type: 'button', onclick: accountModal, 'aria-label': 'Mi cuenta' }, el('span', { class: 'av' }, initials(state.me)), el('span', { class: 'txt' }, el('b', {}, state.me.name || state.me.email), el('span', {}, ROLE[state.me.role]))),
    clientSel,
    nav('#/', 'Inicio', icon('home'), route.name === 'inicio' ? 'on' : ''),
    nav('#/informes', 'Informes', icon('doc'), route.name === 'informes' ? 'on' : ''),
    el('div', { class: 'av-group' }, 'Años'), ...yearBlock,
        el('div', { class: 'av-grow' }),
    el('div', { class: 'av-sep' }),
    state.me.is_admin ? nav('#/admin/equipo', 'Administración', icon('gear'), route.name === 'admin' ? 'on' : '') : null,
    el('button', { class: 'av-nav', type: 'button', onclick: logout }, icon('out'), el('span', {}, 'Salir')));
}

// ───────── Rutas ─────────
function parseRoute() {
  const [path, qs] = (location.hash || '#/').slice(1).split('?');
  const [, name = '', arg = '', arg2 = ''] = path.split('/');
  const q = new URLSearchParams(qs || '');
  return { name: name || 'inicio', arg: decodeURIComponent(arg), arg2, q };
}
async function route() {
  if (!state.me) return;
  document.body.classList.remove('av-open');
  const r = parseRoute();
  const mine = ++token;
  main.replaceChildren(el('div', { class: 'page' }, el('p', { class: 'muted' }, 'Cargando…')));
  renderSide();
  try {
    let node;
    if (r.name === 'inicio') node = await dashboardView();
    else if (r.name === 'anio') node = await listView({ year: Number(r.arg) });
    else if (r.name === 'tipo') node = await listView({ type: r.arg });
    else if (r.name === 'informes') node = await informesView();
    else if (r.name === 'evento') node = await eventView(r.arg);
    else if (r.name === 'admin') node = state.me.is_admin ? await adminView(r.arg || 'equipo') : el('div', { class: 'page' }, el('p', {}, 'No tienes permiso para ver esto.'));
    else node = el('div', { class: 'page' }, el('h1', {}, 'No encontrado'), el('p', { class: 'muted' }, 'Esa página no existe. '), el('a', { href: '#/' }, 'Volver al inicio'));
    if (mine !== token) return;
    main.replaceChildren(node);
    document.title = `${node.dataset?.title ? `${node.dataset.title} · ` : ''}Avania Events`;
    main.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  } catch (e) {
    if (mine !== token) return;
    if (e.status === 401) return boot();
    main.replaceChildren(el('div', { class: 'page' }, el('h1', {}, 'No se ha podido abrir'), el('p', { class: 'err' }, e.message), el('a', { href: '#/' }, 'Volver al inicio')));
  }
}

// ───────── Arranque ─────────
function shell() {
  document.body.classList.remove('center-page');
  side = el('aside', { class: 'av-side', 'aria-label': 'Menú principal' });
  main = el('main', { class: 'av-content', id: 'main', tabindex: '-1' });
  app.replaceChildren(el('div', { class: 'av-app' },
    el('div', { class: 'av-top' }, el('button', { type: 'button', 'aria-label': 'Abrir el menú', onclick: () => document.body.classList.toggle('av-open') }, icon('menu')), brand()),
    side, el('div', { class: 'av-scrim', onclick: () => document.body.classList.remove('av-open') }), main));
}
export async function boot() {
  let me;
  try { me = (await api('GET', '/api/me')).user; } catch { return loginView(); }
  state.me = me;
  if (me.must_change_password) return forcedPasswordView();
  await Promise.all([loadMeta(), loadEvents()]);
  shell();
  route();
}
window.addEventListener('hashchange', route);
bus.addEventListener('events', () => renderSide());
bus.addEventListener('refresh', () => route());
bus.addEventListener('client', () => { renderSide(); route(); });
window.addEventListener('ev:new', (e) => newEventModal(e.detail));
boot();
