// Deja en la carpeta de cada acción solo Creatividades, Documentación y Producción. Las demás subcarpetas, si están vacías, van a la papelera. Se puede repetir.
import 'dotenv/config';
import { q, closeDb } from '../src/db.js';
import { ensureFolder, listChildren, trashFile, driveEnabled, ACTION_SUBFOLDERS } from '../src/drive.js';

if (!driveEnabled()) throw new Error('Falta GOOGLE_SA_FILE');
let made = 0, trashed = 0, kept = [];
for (const ev of (await q('select ref, drive_folder_id from events where drive_folder_id is not null order by seq')).rows) {
  for (const f of await listChildren(ev.drive_folder_id)) {
    if (f.mimeType !== 'application/vnd.google-apps.folder' || ACTION_SUBFOLDERS.includes(f.name)) continue;
    if ((await listChildren(f.id)).length) { kept.push(`${ev.ref}/${f.name}`); continue; }   // con contenido no se toca
    await trashFile(f.id); trashed++;
  }
  for (const name of ACTION_SUBFOLDERS) { const before = (await listChildren(ev.drive_folder_id)).some((f) => f.name === name); await ensureFolder(ev.drive_folder_id, name); if (!before) made++; }
}
console.log(`${trashed} subcarpetas sobrantes a la papelera · ${made} carpetas creadas${kept.length ? ` · NO tocadas por tener contenido: ${kept.join(', ')}` : ''}`);
await closeDb();
