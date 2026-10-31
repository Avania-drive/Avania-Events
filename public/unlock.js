// Importes ocultos: se muestran tras escribir usuario y contraseña (30 minutos en esta sesión).
import { el, api, field, openModal, toast } from './ui.js';
import { state, loadEvents, bus } from './state.js';

export function openUnlock(onDone) {
  const email = el('input', { type: 'email', id: 'ul-user', autocomplete: 'username', required: true, placeholder: 'tu correo' });
  const pw = el('input', { type: 'password', id: 'ul-pass', autocomplete: 'current-password', required: true });
  const err = el('div', { class: 'gate-err', role: 'alert' });
  const row = (label, input) => el('div', { class: 'gate-row' }, el('label', { for: input.id }, label), input);
  const { close } = openModal({ title: 'Ver importes', body: el('form', { class: 'gate-form', onsubmit: (ev) => { ev.preventDefault(); go(); } },
    el('p', { class: 'gate-hint' }, 'Los importes están ocultos. Escribe tu usuario y tu contraseña para verlos; se vuelven a ocultar a los 30 minutos.'), row('Usuario (correo)', email), row('Contraseña', pw), err, el('input', { type: 'submit', hidden: true })),
    actions: [{ label: 'Cancelar', cls: 'ghost' }, { label: 'Ver importes', keep: true, run: () => { go(); return false; } }] });
  async function go() {
    err.textContent = '';
    try { await api('POST', '/api/informes/acceso', { email: email.value, password: pw.value }); state.costsUnlocked = true; close(); toast('Importes visibles durante 30 minutos'); await loadEvents(); bus.dispatchEvent(new Event('refresh')); onDone?.(); }
    catch (e) { err.textContent = e.message; pw.value = ''; pw.focus(); }
  }
  email.focus();
}
export const lockedChip = (onDone) => el('button', { class: 'lockchip', type: 'button', title: 'Importes ocultos: pulsa para desbloquear', onclick: (e) => { e.stopPropagation(); openUnlock(onDone); } }, '🔒 Oculto');
