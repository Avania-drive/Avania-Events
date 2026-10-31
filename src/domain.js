// Reglas de los datos de Avania Events: estados, validación y limpieza de lo que llega del navegador.

export const EVENT_STATUS = { sin_empezar: 'Sin empezar', en_proceso: 'En proceso', terminado: 'Terminado', en_pausa: 'En pausa', cancelado: 'Cancelado' };
export const TASK_STATUS = { sin_decidir: 'Sin decidir', sin_empezar: 'Sin empezar', en_curso: 'En curso', finalizada: 'Finalizada', archivada: 'Archivada' };
export const PRIORITIES = { baja: 'Baja', media: 'Media', alta: 'Alta' };
export const LOCATIONS = ['PAC', 'Plaza Central', 'Parking Ext.', 'Coworker', 'Activity', 'Exterior'];

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v) => UUID.test(String(v ?? ''));

const text = (v, max, label) => { const s = String(v ?? '').trim(); if (s.length > max) throw bad(`${label} es demasiado largo (máximo ${max} caracteres)`); return s; };
const optText = (v, max, label) => { const s = text(v, max, label); return s === '' ? null : s; };
const date = (v, label) => {
  if (v === null || v === '' || v === undefined) return null;
  const s = String(v).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) throw bad(`${label} no es una fecha válida`);
  return s;
};
const money = (v, label) => {
  if (v === null || v === '' || v === undefined) return null;
  let s = String(v).trim().replace(/[€\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');   // 1.250,50 → 1250.50
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0 || n > 99_999_999) throw bad(`${label} no es un importe válido`);
  return Math.round(n * 100) / 100;
};
const int = (v, label, min, max) => {
  if (v === null || v === '' || v === undefined) return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${label} no es válido`);
  return n;
};
const pick = (v, allowed, label) => { if (!allowed.includes(v)) throw bad(`${label} no es válido`); return v; };
const uuidOrNull = (v, label) => { if (v === null || v === '' || v === undefined) return null; if (!isUuid(v)) throw bad(`${label} no es válido`); return v; };

/** Enlaces [{ name, url }]: solo http(s), hasta 30. */
export function cleanLinks(v) {
  if (!Array.isArray(v)) throw bad('Los enlaces no son válidos');
  return v.slice(0, 30).map((l) => ({ name: String(l?.name ?? '').trim().slice(0, 120), url: String(l?.url ?? '').trim().slice(0, 1000) }))
    .filter((l) => l.url && /^https?:\/\//i.test(l.url));
}

/** Campos de una acción que se pueden cambiar. `partial`: solo los que vienen. */
export function cleanEvent(b, { partial = false } = {}) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const set = (k, fn) => { if (has(k)) out[k] = fn(b[k]); };
  if (has('name') || !partial) { const n = text(b.name, 200, 'El nombre'); if (!n) throw bad('Pon el nombre de la acción'); out.name = n; }
  set('type_id', (v) => uuidOrNull(v, 'El tipo'));
  set('status', (v) => pick(v, Object.keys(EVENT_STATUS), 'El estado'));
  set('priority', (v) => pick(v, Object.keys(PRIORITIES), 'La prioridad'));
  set('owner_id', (v) => uuidOrNull(v, 'El responsable'));
  set('starts_on', (v) => date(v, 'La fecha de inicio'));
  set('ends_on', (v) => date(v, 'La fecha de fin'));
  set('location', (v) => optText(v, 120, 'La ubicación'));
  set('description', (v) => text(v, 20000, 'La descripción'));
  set('cost', (v) => money(v, 'El coste'));
  set('invoiced', (v) => v === true || v === 'true' || v === 1);
  set('objective', (v) => text(v, 5000, 'El objetivo'));
  set('audience', (v) => text(v, 5000, 'El público'));
  set('participants', (v) => int(v, 'Los participantes', 0, 10_000_000));
  set('kpi_result', (v) => text(v, 5000, 'El resultado'));
  set('sponsors', (v) => text(v, 5000, 'Los patrocinadores'));
  set('incidents', (v) => text(v, 5000, 'Las incidencias'));
  set('improvements', (v) => text(v, 5000, 'Las mejoras'));
  set('rating', (v) => int(v, 'La valoración', 1, 5));
  set('notes_next', (v) => text(v, 10000, 'Las notas'));
  set('links', cleanLinks);
  set('year', (v) => int(v, 'El año', 2000, 2100));
  if (out.starts_on && out.ends_on && out.ends_on < out.starts_on) throw bad('La fecha de fin no puede ser anterior a la de inicio');
  return out;
}

export function cleanTask(b, { partial = false } = {}) {
  const out = {};
  const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
  const set = (k, fn) => { if (has(k)) out[k] = fn(b[k]); };
  if (has('title') || !partial) { const t = text(b.title, 300, 'El título'); if (!t) throw bad('Escribe qué hay que hacer'); out.title = t; }
  set('section_id', (v) => uuidOrNull(v, 'La sección'));
  set('status', (v) => pick(v, Object.keys(TASK_STATUS), 'El estado'));
  set('priority', (v) => (v === null || v === '' ? null : pick(v, Object.keys(PRIORITIES), 'La prioridad')));
  set('owner_id', (v) => uuidOrNull(v, 'El responsable'));
  set('due_on', (v) => date(v, 'La fecha límite'));
  set('cost', (v) => money(v, 'El coste'));
  set('summary', (v) => text(v, 5000, 'El resumen'));
  set('links', cleanLinks);
  set('parent_id', (v) => uuidOrNull(v, 'La tarea principal'));
  return out;
}

/** Año de una acción: el de su fecha de inicio; si no tiene, el indicado; si no, el actual. */
export const yearFor = (startsOn, given) => (startsOn ? Number(startsOn.slice(0, 4)) : (given || new Date().getFullYear()));
