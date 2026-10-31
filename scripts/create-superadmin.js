// Crea (o restablece) un superadministrador y muestra su contraseña temporal. Se cambia al entrar.
//   npm run superadmin -- correo@dominio "Nombre"
import { q, closeDb } from '../src/db.js';
import { hashPassword, randomToken } from '../src/crypto.js';

const email = String(process.argv[2] || '').trim().toLowerCase();
const name = process.argv[3] || '';
if (!email) { console.error('Uso: npm run superadmin -- correo@dominio "Nombre"'); process.exit(1); }
const temp = randomToken(9);
await q(
  `insert into team_users (email, name, role, password_hash) values ($1,$2,'super_admin',$3)
   on conflict (email) do update set role = 'super_admin', password_hash = $3, must_change_password = true, active = true`, [email, name, hashPassword(temp)]);
console.log(`Superadministrador listo: ${email}\nContraseña temporal (se cambia al entrar): ${temp}`);
await closeDb();
