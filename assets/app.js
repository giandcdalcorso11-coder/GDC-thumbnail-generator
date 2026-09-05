/* GDC Thumbnail Studio — config & helper condivisi (nessun build step, vanilla JS) */

// Progetto Supabase DEDICATO a questo tool — separato dal workspace GDC
// principale (nessuna tabella, utente o dato in comune).
const SUPA_URL = 'https://qjzpoljhahmfvsbhyxtq.supabase.co';
const SUPA_KEY = 'sb_publishable_PPfm8hUNj8glxwqWjdV0uA_S3Db8U4d';
const BUCKET = 'thumb-assets';
const GITHUB_REPO = 'giandcdalcorso11-coder/GDC-thumbnail-generator';

// Nomi reali delle Edge Function sul progetto Supabase — centralizzati qui
// perché il nome dato in dashboard al momento del deploy può differire da
// quello "canonico" del codice sorgente (es. underscore vs trattino).
// Se rinomini una function, aggiorna solo qui.
const EDGE_FN = {
  analyzeScript: 'analyze_script',
  generateThumbnail: 'generate_thumbnail',
  fetchChannelVideos: 'fetch_channel_videos',
};

// Link diretti per gestire secret/chiavi API senza dover cercare — usati in providers.html
function supabaseSecretsUrl(){
  const ref = SUPA_URL.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/)?.[1];
  return ref ? `https://supabase.com/dashboard/project/${ref}/settings/functions` : 'https://supabase.com/dashboard';
}
function githubSecretsUrl(){
  return `https://github.com/${GITHUB_REPO}/settings/secrets/actions`;
}
const PROVIDER_KEY_LINKS = {
  huggingface: { label: 'Crea token gratuito Hugging Face', url: 'https://huggingface.co/settings/tokens' },
  fal:         { label: 'Crea API key fal.ai',               url: 'https://fal.ai/dashboard/keys' },
  replicate:   { label: 'Crea token Replicate',               url: 'https://replicate.com/account/api-tokens' },
  anthropic:   { label: 'Crea chiave Anthropic',               url: 'https://console.anthropic.com/settings/keys' },
  openai:      { label: 'Crea chiave OpenAI',                  url: 'https://platform.openai.com/api-keys' },
  manual:      null,
};

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

// ── FILIGRANA (miniature finali) ────────────────────────────────────────
// Impostazione di piattaforma (un'unica riga): logo o testo sovrapposto alle
// miniature finali finché la proposta non è "sbloccata" (thumb_proposals.unlocked).
// Applicata solo lato client, al momento della visualizzazione/download —
// il file pulito resta quello salvato dall'Editor.
let PLATFORM_SETTINGS = null;
async function loadPlatformSettings(){
  try {
    const rows = await sbSelect('thumb_app_settings', 'select=*&limit=1');
    PLATFORM_SETTINGS = rows[0] || null;
  } catch(e) { PLATFORM_SETTINGS = null; }
  return PLATFORM_SETTINGS;
}

function loadImageEl(url){
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Immagine non caricabile: ' + url));
    img.src = url;
  });
}

function watermarkAnchor(pos, w, h, itemW, itemH){
  const pad = Math.round(w * 0.025);
  const map = {
    'bottom-right': { x: w - itemW - pad, y: h - itemH - pad },
    'bottom-left':  { x: pad, y: h - itemH - pad },
    'top-right':    { x: w - itemW - pad, y: pad },
    'top-left':     { x: pad, y: pad },
  };
  return map[pos] || map['bottom-right'];
}

async function drawWatermark(ctx, w, h){
  const s = PLATFORM_SETTINGS;
  ctx.save();
  ctx.globalAlpha = s?.watermark_opacity ?? 0.85;
  if (s?.watermark_logo_path){
    try {
      const logoUrl = await resolveImageUrl(s.watermark_logo_path);
      const logo = await loadImageEl(logoUrl);
      const lw = w * 0.18, lh = lw * (logo.naturalHeight / logo.naturalWidth);
      const { x, y } = watermarkAnchor(s.watermark_position, w, h, lw, lh);
      ctx.drawImage(logo, x, y, lw, lh);
      ctx.restore();
      return;
    } catch(e) { /* fallback su testo qui sotto */ }
  }
  const text = s?.watermark_text || 'GDC Thumbnail Studio';
  const fontSize = Math.round(h * 0.045);
  ctx.font = `700 ${fontSize}px Jost, sans-serif`;
  const metrics = ctx.measureText(text);
  const { x, y } = watermarkAnchor(s?.watermark_position, w, h, metrics.width, fontSize);
  ctx.lineWidth = Math.max(2, Math.round(fontSize * 0.12));
  ctx.strokeStyle = 'rgba(0,0,0,.65)';
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

// Ritorna una data URL pronta per <img src> / download: con filigrana se
// `unlocked` è false, l'immagine pulita altrimenti.
async function watermarkedDataUrl(cleanUrl, unlocked){
  if (unlocked) return cleanUrl;
  const img = await loadImageEl(cleanUrl);
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  if (!PLATFORM_SETTINGS) await loadPlatformSettings();
  await drawWatermark(ctx, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
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
