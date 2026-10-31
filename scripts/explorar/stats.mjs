import fs from 'node:fs';
const load = (k) => JSON.parse(fs.readFileSync(`data/hist-${k}.json`, 'utf8'));
const title = (p) => Object.values(p.properties).find((x) => x.type === 'title')?.title?.map((t) => t.plain_text).join('') || '';
const dist = (arr) => Object.entries(arr.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {})).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}(${v})`).join(' ');
for (const k of ['acciones25', 'tareas25', 'proyectos24', 'tareas24', 'acciones23']) {
  const pages = load(k); console.log(`\n######## ${k}: ${pages.length}`);
  const props = Object.keys(pages[0].properties);
  for (const name of props) {
    const t = pages[0].properties[name].type;
    if (['select', 'status'].includes(t)) console.log(` ${name||'(título)'}: ${dist(pages.map((p) => p.properties[name]?.[t]?.name ?? '—'))}`);
    else if (t === 'multi_select') console.log(` ${name}: ${dist(pages.flatMap((p) => p.properties[name]?.multi_select?.map((x) => x.name) || []))}`);
    else if (t === 'checkbox') console.log(` ${name}: ${dist(pages.map((p) => String(p.properties[name]?.checkbox)))}`);
    else if (t === 'date') { const ds = pages.map((p) => p.properties[name]?.date?.start).filter(Boolean).sort(); console.log(` ${name}: ${ds.length} con fecha, de ${ds[0]} a ${ds[ds.length - 1]}`); }
    else if (t === 'files') console.log(` ${name}: ${pages.filter((p) => p.properties[name]?.files?.length).length} páginas con archivos, ${pages.reduce((n, p) => n + (p.properties[name]?.files?.length || 0), 0)} archivos`);
    else if (t === 'people') console.log(` ${name}: ${dist(pages.flatMap((p) => p.properties[name]?.people?.map((x) => x.name || x.id.slice(0, 6)) || []))}`);
    else if (t === 'relation') console.log(` ${name}: ${pages.filter((p) => p.properties[name]?.relation?.length).length} con relación`);
  }
  console.log(' ejemplos:', pages.slice(0, 6).map(title));
}
