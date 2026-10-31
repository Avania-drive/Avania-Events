// Crea en la unidad compartida (DRIVE_ROOT_FOLDER) la estructura  Cliente / Año / «REF NOMBRE» / Creatividades · Documentación · Producción
// para cada acción y la enlaza en la base de datos. Las carpetas antiguas (de «Mi unidad») no se mueven ni se borran. Se puede repetir.
import 'dotenv/config';
import { q, closeDb } from '../src/db.js';
import { ensureFolder, driveEnabled, ACTION_SUBFOLDERS } from '../src/drive.js';

const root = String(process.env.DRIVE_ROOT_FOLDER || '').trim();
if (!driveEnabled() || !root) throw new Error('Faltan GOOGLE_SA_FILE o DRIVE_ROOT_FOLDER');
const clean = (n) => String(n).replace(/[\\/:*?"<>|]/g, '-').trim();
let n = 0;
for (const e of (await q(`select e.id, e.ref, e.name, e.year, c.name client from events e join clients c on c.id = e.client_id where not e.archived order by c.name, e.year, e.seq`)).rows) {
  const id = await ensureFolder(await ensureFolder(await ensureFolder(root, clean(e.client)), String(e.year)), clean(`${e.ref} ${e.name}`));
  for (const s of ACTION_SUBFOLDERS) await ensureFolder(id, s);
  await q('update events set drive_folder_id = $1 where id = $2', [id, e.id]); n++;
  console.log(`${e.ref} → ${e.client} / ${e.year}`);
}
console.log(`${n} carpetas listas en la unidad compartida`);
await closeDb();
