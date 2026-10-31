// Google Drive con la cuenta de servicio (GOOGLE_SA_FILE). Las carpetas de las acciones cuelgan de DRIVE_ROOT_FOLDER; hay que compartirla con la cuenta como editor.
import fs from 'node:fs';
import crypto from 'node:crypto';

const API = 'https://www.googleapis.com/drive/v3';
const b64 = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
let sa = null, tok = null;
const account = () => {
  if (sa !== null) return sa || null;
  try { const j = JSON.parse(fs.readFileSync(process.env.GOOGLE_SA_FILE, 'utf8')); sa = j.client_email && j.private_key ? { email: j.client_email, key: j.private_key } : false; } catch { sa = false; }
  return sa || null;
};
export const driveEnabled = () => Boolean(process.env.GOOGLE_SA_FILE && account());

async function token() {
  if (tok && tok.exp > Date.now() + 60e3) return tok.value;
  const a = account(), now = Math.floor(Date.now() / 1000);
  const head = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: a.email, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
  const sig = crypto.createSign('RSA-SHA256').update(head).sign(a.key).toString('base64url');
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${sig}` }), signal: AbortSignal.timeout(15_000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error('Google no ha aceptado la cuenta de servicio');
  tok = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tok.value;
}
async function call(method, path, { params = {}, body, headers = {} } = {}) {
  const url = `${path.startsWith('http') ? path : API + path}?${new URLSearchParams({ supportsAllDrives: 'true', ...params })}`;
  const r = await fetch(url, { method, headers: { Authorization: `Bearer ${await token()}`, ...(body && !(body instanceof Uint8Array) && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body && typeof body === 'object' && !Buffer.isBuffer(body) && !(body instanceof Uint8Array) ? JSON.stringify(body) : body, signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`Google Drive respondió ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? {} : r.json();
}
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

export const listChildren = async (folderId) => (await call('GET', '/files', { params: { q: `'${folderId}' in parents and trashed = false`, pageSize: '200', fields: 'files(id,name,mimeType,size,webViewLink,modifiedTime)', includeItemsFromAllDrives: 'true', orderBy: 'name' } })).files || [];
export async function ensureFolder(parentId, name) {
  const found = (await call('GET', '/files', { params: { q: `'${parentId}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = '${esc(name)}'`, fields: 'files(id)', includeItemsFromAllDrives: 'true' } })).files?.[0];
  return found?.id || (await call('POST', '/files', { params: { fields: 'id' }, body: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] } })).id;
}
/** Sube un archivo (Buffer) a una carpeta; si ya hay uno con ese nombre devuelve el existente sin duplicarlo. */
export async function uploadFile(parentId, name, data, mime = 'application/octet-stream') {
  const dup = (await call('GET', '/files', { params: { q: `'${parentId}' in parents and trashed = false and name = '${esc(name)}'`, fields: 'files(id)', includeItemsFromAllDrives: 'true' } })).files?.[0];
  if (dup) return { id: dup.id, existed: true };
  const boundary = `b${crypto.randomBytes(8).toString('hex')}`;
  const head = Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name, parents: [parentId] })}\r\n--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`);
  const body = Buffer.concat([head, data, Buffer.from(`\r\n--${boundary}--`)]);
  const r = await fetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id`, { method: 'POST', headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': `multipart/related; boundary=${boundary}` }, body, signal: AbortSignal.timeout(300_000) });
  if (!r.ok) throw new Error(`Subida a Drive: ${r.status} ${(await r.text()).slice(0, 160)}`);
  return r.json();
}

/** Manda a la papelera una carpeta (recuperable desde Drive). */
export const trashFile = (id) => call('PATCH', `/files/${id}`, { params: { fields: 'id' }, body: { trashed: true } });
/** Subcarpetas que lleva cada acción. */
export const ACTION_SUBFOLDERS = ['Creatividades', 'Documentación', 'Producción', 'Fotografías'];

/** Mueve una carpeta a otra (cambia su carpeta padre). */
export async function moveTo(id, newParentId) {
  const cur = (await call('GET', `/files/${id}`, { params: { fields: 'parents' } })).parents || [];
  if (cur.length === 1 && cur[0] === newParentId) return;
  await call('PATCH', `/files/${id}`, { params: { addParents: newParentId, removeParents: cur.join(','), fields: 'id' } });
}

/** Copia un archivo a otra carpeta (el original se queda donde está). */
export const copyFile = (id, parentId, name) => call('POST', `/files/${id}/copy`, { params: { fields: 'id,name' }, body: { parents: [parentId], ...(name ? { name } : {}) } });
/** Da acceso de lectura a una persona concreta (sin aviso de Google; el aviso lo mandamos nosotros). */
export const shareWith = (id, email, role = 'reader') => call('POST', `/files/${id}/permissions`, { params: { sendNotificationEmail: 'false', fields: 'id' }, body: { type: 'user', role, emailAddress: email } });
export const folderUrl = (id) => `https://drive.google.com/drive/folders/${id}`;

/** Descarga el contenido de un archivo (Buffer). */
export async function downloadFile(id) {
  const r = await fetch(`${API}/files/${id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${await token()}` }, signal: AbortSignal.timeout(120_000) });
  if (!r.ok) throw new Error(`Google Drive respondió ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
