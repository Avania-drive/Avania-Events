// Descarga en data/ el contenido en bruto de las bases de Notion de 2023-2025 (solo lectura).
import 'dotenv/config';
import fs from 'node:fs';
const h = { Authorization: 'Bearer ' + process.env.NOTION_TOKEN, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function post(url, body) {
  for (let i = 0; i < 8; i++) {
    const r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify(body) });
    if (r.status === 429) { await sleep((Number(r.headers.get('retry-after')) || 2) * 1000 + 300); continue; }
    if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
  }
  throw new Error('limitado');
}
const dbs = { acciones25: '17ce76e6-16b3-81e1-8e39-f4024e7b8da9', tareas25: '17ce76e6-16b3-818d-aafb-fa58f1e2824a', proyectos24: '7f7d92ad-7594-4bfd-aaac-21e910e06b78', tareas24: '54204bf3-64df-4b3b-8e38-04babb49dce2', acciones23: '86ffb991-9de5-41c2-a173-3de0514db156' };
for (const [k, id] of Object.entries(dbs)) {
  const out = []; let cursor;
  do { const j = await post(`https://api.notion.com/v1/databases/${id}/query`, { page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }); out.push(...j.results); cursor = j.has_more ? j.next_cursor : null; await sleep(150); } while (cursor);
  fs.writeFileSync(`data/hist-${k}.json`, JSON.stringify(out));
  console.log(k, out.length);
}
