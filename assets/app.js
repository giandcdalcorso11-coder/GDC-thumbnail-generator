/* GDC Thumbnail Studio — config & helper condivisi (nessun build step, vanilla JS) */

// Stesso progetto Supabase del workspace GDC principale: le tabelle di questo
// tool sono tutte prefissate `thumb_` e non toccano nulla dell'altra app.
const SUPA_URL = 'https://pnzabwfsgkvejnrtrjcp.supabase.co';
const SUPA_KEY = 'sb_publishable_DCzX82HTZ1avt-NJxGAz4Q_6ZlxMudV';
const BUCKET = 'thumb-assets';

// ── AUTH ──────────────────────────────────────────────────────────────────
function getToken(){ return sessionStorage.getItem('thumb_token'); }
function getRefreshToken(){ return sessionStorage.getItem('thumb_refresh'); }
function getUserId(){ return sessionStorage.getItem('thumb_uid'); }
function getUserEmail(){ return sessionStorage.getItem('thumb_email'); }

function setSession(session){
  sessionStorage.setItem('thumb_token', session.access_token);
  sessionStorage.setItem('thumb_refresh', session.refresh_token || '');
  sessionStorage.setItem('thumb_uid', session.user?.id || '');
  sessionStorage.setItem('thumb_email', session.user?.email || '');
}

function clearSession(){
  sessionStorage.removeItem('thumb_token');
  sessionStorage.removeItem('thumb_refresh');
  sessionStorage.removeItem('thumb_uid');
  sessionStorage.removeItem('thumb_email');
}

function requireAuth(){
  if (!getToken()) { window.location.href = 'login.html'; return false; }
  return true;
}

function sessionExpired(){
  clearSession();
  toast('Sessione scaduta, effettua di nuovo il login', 'err');
  setTimeout(() => window.location.href = 'login.html', 1200);
}

async function logout(){
  try {
    await fetch(`${SUPA_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${getToken()}` },
    });
  } catch(e) { /* ignora */ }
  clearSession();
  window.location.href = 'login.html';
}

// ── POSTGREST (tabelle thumb_*) ─────────────────────────────────────────
async function sbFetch(path, options = {}){
  const headers = Object.assign({
    apikey: SUPA_KEY,
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
  }, options.headers || {});
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, { ...options, headers });
  if (res.status === 401) { sessionExpired(); throw new Error('session-expired'); }
  return res;
}

async function sbSelect(table, query = ''){
  const res = await sbFetch(`${table}?${query}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbInsert(table, data, { returnRow = true } = {}){
  const res = await sbFetch(table, {
    method: 'POST',
    body: JSON.stringify(data),
    headers: returnRow ? { Prefer: 'return=representation' } : {},
  });
  if (!res.ok) throw new Error(await res.text());
  return returnRow ? res.json() : null;
}

async function sbUpdate(table, match, data){
  const res = await sbFetch(`${table}?${match}`, {
    method: 'PATCH',
    body: JSON.stringify(data),
    headers: { Prefer: 'return=representation' },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

async function sbDelete(table, match){
  const res = await sbFetch(`${table}?${match}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await res.text());
}

// ── STORAGE ───────────────────────────────────────────────────────────────
async function sbUpload(path, file){
  const res = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true',
    },
    body: file,
  });
  if (!res.ok) throw new Error(await res.text());
  return path;
}

async function sbUploadDataUrl(path, dataUrl){
  const blob = await (await fetch(dataUrl)).blob();
  return sbUpload(path, blob);
}

async function sbSignedUrl(path, expiresIn = 3600){
  const res = await fetch(`${SUPA_URL}/storage/v1/object/sign/${BUCKET}/${path}`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn }),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return `${SUPA_URL}/storage/v1${data.signedURL}`;
}

async function sbDeleteObject(path){
  const res = await fetch(`${SUPA_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'DELETE',
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(await res.text());
}

// Renderizza <img> risolvendo storage_path privato -> URL firmato,
// o passando diretto se è già un URL http(s) (es. output di fal.ai/Replicate).
const _signedUrlCache = new Map();
async function resolveImageUrl(pathOrUrl){
  if (!pathOrUrl) return '';
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  if (_signedUrlCache.has(pathOrUrl)) return _signedUrlCache.get(pathOrUrl);
  const url = await sbSignedUrl(pathOrUrl);
  _signedUrlCache.set(pathOrUrl, url);
  return url;
}

// ── EDGE FUNCTIONS ────────────────────────────────────────────────────────
async function callEdgeFunction(name, body){
  const res = await fetch(`${SUPA_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) { sessionExpired(); throw new Error('session-expired'); }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.ok !== false, status: res.status, data };
}

// ── UI HELPERS ────────────────────────────────────────────────────────────
function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function uid(){ return crypto.randomUUID(); }

function formatDate(d){
  if (!d) return '—';
  return new Date(d).toLocaleDateString('it-IT', { day:'numeric', month:'short', year:'numeric' });
}

function toast(msg, kind = ''){
  let wrap = document.getElementById('toastWrap');
  if (!wrap){
    wrap = document.createElement('div');
    wrap.id = 'toastWrap';
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast ${kind}`.trim();
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

function openOverlay(id){ document.getElementById(id).classList.add('open'); }
function closeOverlay(id){ document.getElementById(id).classList.remove('open'); }

function initTabs(container){
  container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      container.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('on', b === btn));
      container.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('on', p.id === target));
      window.location.hash = target;
    });
  });
  const fromHash = window.location.hash.replace('#','');
  if (fromHash && container.querySelector(`#${CSS.escape(fromHash)}`)) {
    container.querySelector(`[data-tab="${fromHash}"]`)?.click();
  }
}
