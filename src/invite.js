// Invitación por correo a una persona del equipo: enlace de un solo uso (48 h) para elegir su contraseña. Solo se guarda el hash del enlace.
import { q } from './db.js';
import { randomToken, sha256 } from './crypto.js';
import { sendMail, PUBLIC_URL } from './mailer.js';

const INVITE_HOURS = 48;
export async function sendInvite(user, { reminder = false } = {}) {
  const token = randomToken(32);
  await q('update team_users set invite_hash = $1, invite_expires_at = $2 where id = $3',
    [sha256(token), new Date(Date.now() + INVITE_HOURS * 3600e3).toISOString(), user.id]);
  const hi = user.name ? `Hola, ${String(user.name).split(' ')[0]}.` : 'Hola.';
  await sendMail({
    to: user.email,
    subject: reminder ? 'Tu acceso a Avania Events (enlace nuevo)' : 'Te hemos dado acceso a Avania Events',
    title: reminder ? 'Tu enlace de acceso a Avania Events' : 'Bienvenido a Avania Events',
    paragraphs: [
      `${hi} ${reminder ? 'Aquí tienes un enlace nuevo' : 'Te hemos creado un usuario'} en Avania Events, donde llevamos todos los eventos y acciones de AVANIA. Pulsa el botón para elegir tu contraseña (mínimo 12 caracteres).`,
      `Tu usuario es ${user.email}. El enlace sirve una sola vez y caduca en ${INVITE_HOURS} horas; si caduca, pide que te envíen otro.`,
    ],
    button: { label: 'Elegir mi contraseña', url: `${PUBLIC_URL}/invitacion?t=${token}` },
  });
}
