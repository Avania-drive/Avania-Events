// Estado compartido: datos de partida (clientes, tipos, secciones, equipo) y la lista de acciones que usa el menú lateral.
import { api } from './ui.js';

export const bus = new EventTarget();
export const state = {
  me: null, meta: null, events: [],
  client: (() => { try { return localStorage.getItem('ev_client') || ''; } catch { return ''; } })(),
};
export const setClient = (id) => { state.client = id; try { localStorage.setItem('ev_client', id); } catch { /* sin almacenamiento */ } bus.dispatchEvent(new Event('client')); };
export const clientOf = (id) => state.meta.clients.find((c) => c.id === id);
export const typeOf = (id) => state.meta.types.find((t) => t.id === id);
export const userOf = (id) => state.meta.users.find((u) => u.id === id);
export const sectionOf = (id) => state.meta.sections.find((s) => s.id === id);

export async function loadMeta() { state.meta = await api('GET', '/api/meta'); state.me = state.meta.me; }
export async function loadEvents() {
  const r = await api('GET', '/api/events');
  state.events = r.events; state.costsUnlocked = Boolean(r.costs_unlocked);
  bus.dispatchEvent(new Event('events'));
}
export const visibleEvents = () => state.events.filter((e) => !state.client || e.client_id === state.client);
export const queryClient = () => (state.client ? `&client=${state.client}` : '');
