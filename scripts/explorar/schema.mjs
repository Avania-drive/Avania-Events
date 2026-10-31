import 'dotenv/config';
const h = { Authorization: 'Bearer ' + process.env.NOTION_TOKEN, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
const ids = { 'ACCIONES 25': '17ce76e6-16b3-81e1-8e39-f4024e7b8da9', 'Tareas(2025?)': '17ce76e6-16b3-818d-aafb-fa58f1e2824a', 'Proyectos 24': '7f7d92ad-7594-4bfd-aaac-21e910e06b78', 'Tareas 24 (b)': '54204bf3-64df-4b3b-8e38-04babb49dce2', 'Acciones 23 (a)': '86ffb991-9de5-41c2-a173-3de0514db156', 'Acciones 23 (b)': '17ce76e6-16b3-805e-8840-e000867e311e' };
for (const [n, id] of Object.entries(ids)) {
  const d = await (await fetch('https://api.notion.com/v1/databases/' + id, { headers: h })).json();
  console.log('=== ' + n + ' · ' + (d.title || []).map((x) => x.plain_text).join('') + ' · padre:', JSON.stringify(d.parent));
  console.log(Object.entries(d.properties).map(([k, v]) => `${k}:${v.type}${v.type === 'relation' ? '→' + (v.relation.database_id || '').slice(0, 8) : ''}`).join(' | '));
}
