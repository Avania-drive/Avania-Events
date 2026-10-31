// Acceso a Postgres (Supabase) por DATABASE_URL. Con EVENTS_PGLITE=1 y sin DATABASE_URL se usa una base en memoria (solo para las pruebas).
import 'dotenv/config';
import pg from 'pg';

// Las fechas (DATE) se quedan como texto «2026-10-31» y los importes (numeric) como número, sin sorpresas de zona horaria.
pg.types.setTypeParser(1082, (v) => v);
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

export const usingPglite = !process.env.DATABASE_URL && process.env.EVENTS_PGLITE === '1';
let impl;
if (usingPglite) {
  const { PGlite, types } = await import('@electric-sql/pglite');
  const db = new PGlite({ parsers: { [types.DATE]: (v) => v, [types.NUMERIC]: (v) => (v === null ? null : Number(v)) } });
  impl = { q: (t, p) => db.query(t, p), exec: (t) => db.exec(t), end: () => db.close() };
} else {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 5 });
  impl = { q: (t, p) => pool.query(t, p), exec: (t) => pool.query(t), end: () => pool.end() };
}
export const q = (text, params) => impl.q(text, params);
export const execSql = (text) => impl.exec(text);
export const closeDb = () => impl.end();
