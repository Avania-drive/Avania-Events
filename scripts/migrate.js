import { migrate } from '../src/migrate.js';
import { closeDb } from '../src/db.js';
try { await migrate(); console.log('migraciones al día'); } catch (e) { console.error('error en la migración:', e.message); process.exitCode = 1; }
await closeDb();
