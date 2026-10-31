// Piezas comunes de la interfaz de Avania Events.
export const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style' && typeof v === 'object') { for (const [p, x] of Object.entries(v)) (p.startsWith('--') ? n.style.setProperty(p, x) : (n.style[p] = x)); }
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k === 'value') n.value = v;
    else if (k === 'checked' || k === 'selected' || k === 'disabled') n[k] = !!v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(c));
  return n;
};
export const svg = (inner, cls = '') => { const t = document.createElement('template'); t.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" class="${cls}">${inner}</svg>`; return t.content.firstChild; };
const P = {
  home: '<path d="M4 11 12 4l8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  cal: '<rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M8 3v4M16 3v4M4 10h16"/>',
  tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5 6-5s5.4 1.6 6 5"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 15.4c1.8.6 2.8 2 3 4.6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  out: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  check: '<path d="m5 12.5 4.2 4.2L19 7"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  box: '<path d="M12 3 4 7v10l8 4 8-4V7z"/><path d="M4 7l8 4 8-4M12 11v10"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>',
  gantt: '<path d="M4 6h9M8 12h12M6 18h8"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  euro: '<path d="M17 6.5A6 6 0 1 0 17 17.5M4 10h9M4 14h9"/>',
  alert: '<path d="M12 4 3 20h18zM12 10v5M12 17.5h.01"/>',
  flag: '<path d="M5 21V4M5 5h12l-2 4 2 4H5"/>',
};
export const icon = (name, cls = '') => svg(P[name] ?? '', cls);

export async function api(method, url, body) {
  const r = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  let j = {}; try { j = await r.json(); } catch { /* sin cuerpo */ }
  if (!r.ok) throw Object.assign(new Error(j.error || `Error ${r.status}`), { status: r.status, code: j.code });
  return j;
}

export const say = (msg) => { const l = document.getElementById('live'); if (l) l.textContent = msg; };
export function toast(msg, bad = false) {
  const t = el('div', { class: `toast${bad ? ' bad' : ''}`, role: 'status' }, msg);
  document.body.append(t); say(msg);
  setTimeout(() => t.remove(), bad ? 4200 : 2400);
}

// Fechas e importes (siempre en español de España).
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
export const monthName = (i) => MONTHS[i];
export const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const pd = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const parseDay = pd;
export function fmtDate(s) { if (!s) return ''; const d = pd(s); return `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`; }
export function fmtDateLong(s) { if (!s) return ''; const d = pd(s); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
export function fmtRange(a, b) {
  if (!a && !b) return 'Sin fecha';
  if (!b || a === b) return fmtDate(a);
  if (!a) return `hasta ${fmtDate(b)}`;
  const x = pd(a), y = pd(b);
  return x.getUTCMonth() === y.getUTCMonth() && x.getUTCFullYear() === y.getUTCFullYear() ? `${x.getUTCDate()}–${y.getUTCDate()} ${MONTHS_SHORT[y.getUTCMonth()]}` : `${fmtDate(a)} – ${fmtDate(b)}`;
}
export const fmtMoney = (n) => (n == null || n === '' ? '' : new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: Number(n) % 1 ? 2 : 0 }).format(Number(n)));
export const today = () => new Date().toISOString().slice(0, 10);
export const initials = (u) => String(u?.name || u?.email || '?').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
export const firstName = (u) => String(u?.name || String(u?.email || '').split('@')[0] || '').split(/\s+/)[0];
export const debounce = (fn, ms = 600) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = (...a) => { clearTimeout(t); return fn(...a); }; return d; };

// Colores de los estados.
export const STATUS_COLOR = { sin_empezar: '#98a2b3', en_proceso: '#d97706', terminado: '#16a34a', en_pausa: '#7c3aed', cancelado: '#dc2626' };
export const TASK_COLOR = { sin_decidir: '#db2777', sin_empezar: '#98a2b3', en_curso: '#d97706', finalizada: '#16a34a', archivada: '#667085' };
export const statusBadge = (label, color) => el('span', { class: 'st', style: { '--c': color } }, label);

// Ventana modal con foco atrapado, Esc y clic fuera.
export function openModal({ title, body, actions = [], wide = false }) {
  const prev = document.activeElement;
  const close = () => { box.remove(); prev?.focus?.(); };
  const box = el('div', { class: 'modal', onmousedown: (e) => e.target === box && close() },
    el('div', { class: `card dlg${wide ? ' wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      el('div', { class: 'dlg-h' }, el('h2', {}, title), el('button', { class: 'x', type: 'button', 'aria-label': 'Cerrar', onclick: close }, '✕')),
      el('div', { class: 'dlg-b' }, body),
      actions.length ? el('div', { class: 'dlg-f' }, actions.map((a) => el('button', { class: `btn ${a.cls || ''}`, type: 'button', onclick: async (e) => { const r = await a.run?.(e, close); if (r !== false && !a.keep) close(); } }, a.label))) : null));
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  document.body.append(box);
  (box.querySelector('[autofocus]') || box.querySelector('input,select,textarea,button.btn'))?.focus();
  return { close, box };
}
export const confirmBox = (title, text, okLabel = 'Aceptar', danger = false) => new Promise((resolve) => {
  let done = false;
  const m = openModal({ title, body: el('p', {}, text), actions: [
    { label: 'Cancelar', cls: 'ghost', run: () => { done = true; resolve(false); } },
    { label: okLabel, cls: danger ? 'danger' : '', run: () => { done = true; resolve(true); } }] });
  m.box.addEventListener('remove', () => {});
  new MutationObserver((_, o) => { if (!document.body.contains(m.box)) { o.disconnect(); if (!done) resolve(false); } }).observe(document.body, { childList: true });
});

// Campo de formulario con etiqueta.
export const field = (label, input, hint) => { const id = `f${Math.random().toString(36).slice(2, 8)}`; input.id ||= id; return el('div', { class: 'field' }, el('label', { for: input.id }, label), input, hint ? el('small', { class: 'muted' }, hint) : null); };
export const select = (options, value, attrs = {}) => el('select', attrs, options.map(([v, t]) => el('option', { value: v, selected: String(v) === String(value ?? '') }, t)));
