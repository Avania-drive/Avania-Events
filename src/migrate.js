// Aplica los .sql de /sql que falten, en orden, y apunta cuáles ya están (tabla _migrations).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { q, execSql } from './db.js';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'sql');
export async function migrate(log = console.log) {
  await execSql('create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())');
  const done = new Set((await q('select name from _migrations')).rows.map((r) => r.name));
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    await execSql(fs.readFileSync(path.join(dir, file), 'utf8'));
    await q('insert into _migrations (name) values ($1)', [file]);
    log(`aplicada ${file}`);
  }
}
