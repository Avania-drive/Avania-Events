// Coloca las carpetas de las acciones en  RAÍZ / Cliente / Año / «REF NOMBRE»  (RAÍZ = DRIVE_ROOT_FOLDER del .env). Se puede repetir.
import 'dotenv/config';
import { q, closeDb } from '../src/db.js';
import { ensureFolder, moveTo, driveEnabled } from '../src/drive.js';

const root = String(process.env.DRIVE_ROOT_FOLDER || '').trim();
if (!driveEnabled() || !root) throw new Error('Faltan GOOGLE_SA_FILE o DRIVE_ROOT_FOLDER');
const clean = (n) => String(n).replace(/[\\/:*?"<>|]/g, '-').trim();
let moved = 0;
for (const e of (await q(`select e.id, e.ref, e.year, e.drive_folder_id, c.name client from events e join clients c on c.id = e.client_id where e.drive_folder_id is not null order by c.name, e.year, e.seq`)).rows) {
  const clientFolder = await ensureFolder(root, clean(e.client));
  const yearFolder = await ensureFolder(clientFolder, String(e.year));
  await moveTo(e.drive_folder_id, yearFolder); moved++;
  console.log(`${e.ref} → ${e.client} / ${e.year}`);
}
console.log(`${moved} carpetas colocadas`);
await closeDb();
