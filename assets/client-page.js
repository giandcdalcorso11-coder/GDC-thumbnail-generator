/* GDC Thumbnail Studio — logica pagina cliente (Canale/Video, Galleria, Script,
   Genera, Editor, Proposte). Nessun framework: stato in variabili globali. */

if (!requireAuth()) { /* redirect già eseguito da requireAuth() */ }

const CLIENT_ID = new URLSearchParams(window.location.search).get('id');
if (!CLIENT_ID) { window.location.href = 'clients.html'; }

let CLIENT = null;
let VIDEOS = [];
let GALLERY = [];
let JOBS = [];
let PROVIDERS = [];
let ACTIVE_PROVIDER = null;
let TEXT_PROVIDERS = [];
let ACTIVE_TEXT_PROVIDER = null;
let SELECTED_VIDEO_ID = null;
let GALLERY_FILTER = 'all';
let CURRENT_SCRIPT_ROW = null;
let CURRENT_IMG_DETAIL_ID = null;

// ─────────────────────────────────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────────────────────────────────
async function init(){
  try {
    const rows = await sbSelect('thumb_clients', `id=eq.${CLIENT_ID}&select=*`);
    if (!rows.length) { toast('Cliente non trovato', 'err'); window.location.href = 'clients.html'; return; }
    CLIENT = rows[0];
  } catch(e) { toast('Errore caricamento cliente: ' + e.message, 'err'); return; }

  document.getElementById('mainContainer').style.display = '';
  document.getElementById('clientBrandName').textContent = CLIENT.name;
  renderClientHeader();

  initTabs(document.getElementById('tabBar').parentElement);
  wireGlobalHandlers();

  await Promise.all([loadVideos(), loadGallery(), loadProviders(), loadTextProviders()]);
  loadCaptureJobs();
}

function renderClientHeader(){
  document.getElementById('clientTitle').textContent = CLIENT.name;
  const tags = [];
  if (CLIENT.niche) tags.push(`<span class="tag tag-sabbia">${escapeHtml(CLIENT.niche)}</span>`);
  if (CLIENT.tone) tags.push(`<span class="tag tag-athlete">${escapeHtml(CLIENT.tone)}</span>`);
  tags.push(`<span class="tag tag-grigio">${{manual:'Manuale',auto:'Automatica',both:'Manuale + Auto'}[CLIENT.capture_mode]}</span>`);
  document.getElementById('clientTags').innerHTML = tags.join('');
  document.getElementById('captureAutoCard').classList.toggle('hidden', CLIENT.capture_mode === 'manual');
}

// ─────────────────────────────────────────────────────────────────────────
// VIDEO SELECTOR (globale, guida Script/Genera/Editor)
// ─────────────────────────────────────────────────────────────────────────
function renderActiveVideoSelect(){
  const sel = document.getElementById('activeVideoSelect');
  if (!VIDEOS.length) {
    sel.innerHTML = '<option value="">Nessun video — aggiungine uno in "Canale & Video"</option>';
    SELECTED_VIDEO_ID = null;
    return;
  }
  const prev = SELECTED_VIDEO_ID;
  sel.innerHTML = VIDEOS.map(v => `<option value="${v.id}">${escapeHtml(v.title)} — ${STATUS_LABEL[v.status] || v.status}</option>`).join('');
  SELECTED_VIDEO_ID = VIDEOS.some(v => v.id === prev) ? prev : VIDEOS[0].id;
  sel.value = SELECTED_VIDEO_ID;
}

function wireGlobalHandlers(){
  document.getElementById('activeVideoSelect').addEventListener('change', (e) => {
    SELECTED_VIDEO_ID = e.target.value;
    onSelectedVideoChanged();
  });
}

function onSelectedVideoChanged(){
  loadScriptForVideo();
  renderGenRefGrid();
  loadJobsForVideo();
}

const STATUS_LABEL = { new:'Nuovo', script:'Script pronto', generating:'In generazione', review:'In revisione', done:'Completato' };

// ─────────────────────────────────────────────────────────────────────────
// TAB: CANALE & VIDEO
// ─────────────────────────────────────────────────────────────────────────
async function loadVideos(){
  document.getElementById('videoList').innerHTML = '<div class="loader">Caricamento…</div>';
  VIDEOS = await sbSelect('thumb_videos', `client_id=eq.${CLIENT_ID}&select=*&order=created_at.desc`);
  renderVideoList();
  renderActiveVideoSelect();
  onSelectedVideoChanged();
}

function renderVideoList(){
  const el = document.getElementById('videoList');
  if (!VIDEOS.length){
    el.innerHTML = '<div class="empty"><div class="empty-icon">📺</div>Nessun video ancora. Importa dal canale o aggiungine uno manualmente.</div>';
    return;
  }
  el.innerHTML = VIDEOS.map(v => `
    <div class="card" style="padding:10px 14px;margin-bottom:8px;">
      <div class="flex items-center justify-between gap-10" style="flex-wrap:wrap;">
        <div style="min-width:0;flex:1;">
          <div style="font-weight:700;font-size:13.5px;">${escapeHtml(v.title)}</div>
          <div class="flex gap-6 mt-8" style="flex-wrap:wrap;">
            <span class="tag tag-grigio">${STATUS_LABEL[v.status] || v.status}</span>
            ${v.published_at ? `<span class="text-xs text-grigio">${formatDate(v.published_at)}</span>` : ''}
            ${v.url ? `<a class="text-xs" href="${escapeHtml(v.url)}" target="_blank" rel="noopener">Apri su YouTube ↗</a>` : ''}
          </div>
        </div>
        <div class="flex gap-6">
          <button class="btn btn-s btn-sm" onclick="selectVideoAndGoto('${v.id}','tab-script')">Script</button>
          <button class="btn btn-gh btn-sm" onclick="deleteVideo('${v.id}')">Elimina</button>
        </div>
      </div>
    </div>
  `).join('');
}

function selectVideoAndGoto(videoId, tabId){
  SELECTED_VIDEO_ID = videoId;
  document.getElementById('activeVideoSelect').value = videoId;
  onSelectedVideoChanged();
  document.querySelector(`[data-tab="${tabId}"]`)?.click();
}

function openNewVideo(){ document.getElementById('newVideoForm').reset(); openOverlay('newVideoOverlay'); }

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('newVideoForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('nv_url').value.trim();
    const ytId = (url.match(/(?:v=|youtu\.be\/|shorts\/)([\w-]{11})/) || [])[1] || null;
    try {
      await sbInsert('thumb_videos', {
        client_id: CLIENT_ID,
        title: document.getElementById('nv_title').value.trim(),
        url: url || null,
        youtube_video_id: ytId,
      });
      closeOverlay('newVideoOverlay');
      toast('Video aggiunto', 'ok');
      loadVideos();
    } catch(err){ toast('Errore: ' + err.message, 'err'); }
  });
});

async function deleteVideo(id){
  if (!confirm('Eliminare questo video e tutti i dati collegati (script, generazioni, proposte)?')) return;
  try { await sbDelete('thumb_videos', `id=eq.${id}`); toast('Video eliminato', 'ok'); loadVideos(); }
  catch(e){ toast('Errore: ' + e.message, 'err'); }
}

async function importFromChannel(){
  if (!CLIENT.channel_url) { toast('Imposta prima l\'URL del canale nella scheda cliente', 'err'); return; }
  toast('Recupero video dal canale…');
  const { ok, data } = await callEdgeFunction('fetch-channel-videos', { channel_url: CLIENT.channel_url });
  if (!ok) { toast('Errore: ' + (data.error || 'sconosciuto'), 'err'); return; }
  const existingIds = new Set(VIDEOS.map(v => v.youtube_video_id));
  const newOnes = data.videos.filter(v => !existingIds.has(v.youtube_video_id));
  if (!newOnes.length) { toast('Nessun video nuovo trovato', ''); return; }
  try {
    await sbInsert('thumb_videos', newOnes.map(v => ({
      client_id: CLIENT_ID, youtube_video_id: v.youtube_video_id,
      title: v.title, url: v.url, published_at: v.published_at,
    })), { returnRow: false });
    toast(`Importati ${newOnes.length} video`, 'ok');
    loadVideos();
  } catch(e){ toast('Errore import: ' + e.message, 'err'); }
}

// ─────────────────────────────────────────────────────────────────────────
// TAB: GALLERIA VOLTO
// ─────────────────────────────────────────────────────────────────────────
async function loadGallery(){
  GALLERY = await sbSelect('thumb_gallery_images', `client_id=eq.${CLIENT_ID}&select=*&order=created_at.desc`);
  renderGallery();
  renderGenRefGrid();
}

document.getElementById('galleryFilterBar')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-gf]');
  if (!btn) return;
  document.querySelectorAll('#galleryFilterBar .tab-btn').forEach(b => b.classList.toggle('on', b === btn));
  GALLERY_FILTER = btn.dataset.gf;
  renderGallery();
});

async function renderGallery(){
  const el = document.getElementById('galleryGrid');
  const list = GALLERY.filter(g => GALLERY_FILTER === 'all' || g.status === GALLERY_FILTER);
  if (!list.length){ el.innerHTML = '<div class="empty">Nessuna immagine in questa categoria.</div>'; return; }
  el.innerHTML = list.map(g => `<div class="img-card" id="gcard-${g.id}"><div class="loader" style="padding:30px 0;">…</div></div>`).join('');
  for (const g of list){
    resolveImageUrl(g.storage_path).then(url => {
      const card = document.getElementById(`gcard-${g.id}`);
      if (!card) return;
      const badgeClass = { candidate:'tag-grigio', approved:'tag-maker', rejected:'tag-life' }[g.status];
      const badgeLabel = { candidate:'Da rivedere', approved:'Approvata', rejected:'Rifiutata' }[g.status];
      card.innerHTML = `
        <img src="${url}" loading="lazy" onclick="openImgDetail('${g.id}')">
        <span class="tag ${badgeClass} img-badge">${badgeLabel}</span>
        <div class="img-actions">
          ${g.status !== 'approved' ? `<button class="btn btn-g" onclick="quickSetStatus('${g.id}','approved')">✓</button>` : ''}
          ${g.status !== 'rejected' ? `<button class="btn btn-o" onclick="quickSetStatus('${g.id}','rejected')">✕</button>` : ''}
        </div>`;
    });
  }
}

async function quickSetStatus(id, status){
  try { await sbUpdate('thumb_gallery_images', `id=eq.${id}`, { status }); const g = GALLERY.find(x=>x.id===id); if (g) g.status = status; renderGallery(); }
  catch(e){ toast('Errore: ' + e.message, 'err'); }
}

function openImgDetail(id){
  const g = GALLERY.find(x => x.id === id);
  if (!g) return;
  CURRENT_IMG_DETAIL_ID = id;
  document.getElementById('imgDetailPose').value = g.pose || '';
  document.getElementById('imgDetailExpr').value = g.expression || '';
  document.getElementById('imgDetailTags').value = (g.tags || []).join(', ');
  resolveImageUrl(g.storage_path).then(url => document.getElementById('imgDetailPreview').src = url);
  openOverlay('imgDetailOverlay');
}

async function setImgStatus(status){
  await quickSetStatus(CURRENT_IMG_DETAIL_ID, status);
}

async function saveImgDetail(){
  try {
    await sbUpdate('thumb_gallery_images', `id=eq.${CURRENT_IMG_DETAIL_ID}`, {
      pose: document.getElementById('imgDetailPose').value.trim() || null,
      expression: document.getElementById('imgDetailExpr').value.trim() || null,
      tags: document.getElementById('imgDetailTags').value.split(',').map(s=>s.trim()).filter(Boolean),
    });
    toast('Tag salvati', 'ok');
    closeOverlay('imgDetailOverlay');
    loadGallery();
  } catch(e){ toast('Errore: ' + e.message, 'err'); }
}

async function deleteImg(){
  if (!confirm('Eliminare questa immagine dalla galleria?')) return;
  const g = GALLERY.find(x => x.id === CURRENT_IMG_DETAIL_ID);
  try {
    await sbDelete('thumb_gallery_images', `id=eq.${CURRENT_IMG_DETAIL_ID}`);
    if (g) await sbDeleteObject(g.storage_path).catch(()=>{});
    closeOverlay('imgDetailOverlay');
    toast('Immagine eliminata', 'ok');
    loadGallery();
  } catch(e){ toast('Errore: ' + e.message, 'err'); }
}

function wireDropzone(zoneId, inputId, onFiles){
  const zone = document.getElementById(zoneId);
  const input = document.getElementById(inputId);
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { onFiles(Array.from(input.files)); input.value = ''; });
  ['dragenter','dragover'].forEach(evt => zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.add('drag'); }));
  ['dragleave','drop'].forEach(evt => zone.addEventListener(evt, e => { e.preventDefault(); zone.classList.remove('drag'); }));
  zone.addEventListener('drop', e => onFiles(Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'))));
}

wireDropzone('galleryDropzone', 'galleryFileInput', async (files) => {
  if (!files.length) return;
  toast(`Carico ${files.length} immagine/i…`);
  for (const file of files){
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `clients/${CLIENT_ID}/gallery/${uid()}.${ext}`;
      await sbUpload(path, file);
      await sbInsert('thumb_gallery_images', { client_id: CLIENT_ID, storage_path: path, source: 'manual', status: 'approved' }, { returnRow: false });
    } catch(e){ toast('Errore upload: ' + e.message, 'err'); }
  }
  toast('Caricamento completato', 'ok');
  loadGallery();
});

async function startCaptureJob(){
  try {
    await sbInsert('thumb_capture_jobs', { client_id: CLIENT_ID, status: 'queued' }, { returnRow: false });
    toast('Raccolta messa in coda. Verrà eseguita al prossimo passaggio della GitHub Action "Cattura Frame" (o avviala subito da Actions → Run workflow).', 'ok');
    loadCaptureJobs();
  } catch(e){ toast('Errore: ' + e.message, 'err'); }
}

async function loadCaptureJobs(){
  const jobs = await sbSelect('thumb_capture_jobs', `client_id=eq.${CLIENT_ID}&select=*&order=requested_at.desc&limit=5`);
  const el = document.getElementById('captureJobsList');
  if (!jobs.length){ el.innerHTML = ''; return; }
  const label = { queued:'In coda', running:'In esecuzione', done:'Completata', error:'Errore' };
  const cls = { queued:'tag-grigio', running:'tag-athlete', done:'tag-maker', error:'tag-life' };
  el.innerHTML = jobs.map(j => `
    <div class="flex items-center justify-between text-xs" style="padding:6px 0;border-top:1px solid var(--border);">
      <span>${formatDate(j.requested_at)}${j.frames_found != null ? ' · ' + j.frames_found + ' frame trovati' : ''}${j.error_message ? ' · ' + escapeHtml(j.error_message) : ''}</span>
      <span class="tag ${cls[j.status]}">${label[j.status]}</span>
    </div>
  `).join('');
}

// ─────────────────────────────────────────────────────────────────────────
// TAB: SCRIPT & ANALISI
// ─────────────────────────────────────────────────────────────────────────
async function loadScriptForVideo(){
  document.getElementById('analysisCard').classList.add('hidden');
  document.getElementById('scriptContent').value = '';
  CURRENT_SCRIPT_ROW = null;
  if (!SELECTED_VIDEO_ID) return;
  const rows = await sbSelect('thumb_scripts', `video_id=eq.${SELECTED_VIDEO_ID}&select=*&order=created_at.desc&limit=1`);
  if (rows.length){
    CURRENT_SCRIPT_ROW = rows[0];
    document.getElementById('scriptContent').value = rows[0].content || '';
    if (rows[0].analysis) renderAnalysis(rows[0].analysis);
  }
}

async function saveScript(){
  if (!SELECTED_VIDEO_ID) { toast('Seleziona prima un video', 'err'); return; }
  const content = document.getElementById('scriptContent').value.trim();
  const analysis = CURRENT_SCRIPT_ROW?.analysis || null;
  try {
    if (CURRENT_SCRIPT_ROW){
      await sbUpdate('thumb_scripts', `id=eq.${CURRENT_SCRIPT_ROW.id}`, { content });
    } else {
      CURRENT_SCRIPT_ROW = (await sbInsert('thumb_scripts', { video_id: SELECTED_VIDEO_ID, client_id: CLIENT_ID, content, analysis }))[0];
    }
    await sbUpdate('thumb_videos', `id=eq.${SELECTED_VIDEO_ID}`, { status: 'script' });
    toast('Script salvato', 'ok');
    loadVideos();
  } catch(e){ toast('Errore: ' + e.message, 'err'); }
}

async function loadTextProviders(){
  TEXT_PROVIDERS = await sbSelect('thumb_text_providers', 'select=*');
  ACTIVE_TEXT_PROVIDER = TEXT_PROVIDERS.find(p => p.active) || null;
  const el = document.getElementById('activeTextProviderBox');
  if (!el) return;
  if (!ACTIVE_TEXT_PROVIDER){ el.innerHTML = '<span class="text-grigio text-sm">Nessun motore di analisi attivo — vai in Motori AI.</span>'; return; }
  el.innerHTML = `<span class="tag tag-maker">${escapeHtml(ACTIVE_TEXT_PROVIDER.name)}</span> <span class="text-xs text-grigio">${ACTIVE_TEXT_PROVIDER.kind}${ACTIVE_TEXT_PROVIDER.config?.model ? ' · ' + escapeHtml(ACTIVE_TEXT_PROVIDER.config.model) : ''}</span>`;
}

async function analyzeScript(){
  if (!SELECTED_VIDEO_ID) { toast('Seleziona prima un video', 'err'); return; }
  const content = document.getElementById('scriptContent').value.trim();
  if (!content) { toast('Incolla prima lo script', 'err'); return; }
  if (!ACTIVE_TEXT_PROVIDER) { toast('Nessun motore di analisi attivo — vai in Motori AI', 'err'); return; }
  const errEl = document.getElementById('scriptError');
  errEl.classList.add('hidden');
  const btn = document.getElementById('analyzeBtn');
  btn.disabled = true; btn.textContent = 'Analisi in corso…';
  try {
    const { ok, data } = await callEdgeFunction('analyze-script', {
      content,
      provider_kind: ACTIVE_TEXT_PROVIDER.kind,
      provider_config: ACTIVE_TEXT_PROVIDER.config,
      client_context: { name: CLIENT.name, niche: CLIENT.niche, tone: CLIENT.tone },
    });
    if (!ok) throw new Error(data.error || 'Errore sconosciuto');
    renderAnalysis(data.analysis);
    // salva subito script + analisi
    if (CURRENT_SCRIPT_ROW){
      await sbUpdate('thumb_scripts', `id=eq.${CURRENT_SCRIPT_ROW.id}`, { content, analysis: data.analysis, analyzed_at: new Date().toISOString() });
    } else {
      CURRENT_SCRIPT_ROW = (await sbInsert('thumb_scripts', { video_id: SELECTED_VIDEO_ID, client_id: CLIENT_ID, content, analysis: data.analysis, analyzed_at: new Date().toISOString() }))[0];
    }
    await sbUpdate('thumb_videos', `id=eq.${SELECTED_VIDEO_ID}`, { status: 'script' });
    toast('Analisi completata e salvata', 'ok');
    loadVideos();
  } catch(e){
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.textContent = '🤖 Analizza con AI';
  }
}

function renderAnalysis(a){
  document.getElementById('analysisCard').classList.remove('hidden');
  document.getElementById('an_topic').textContent = a.topic || '—';
  document.getElementById('an_tone').textContent = a.tone || '—';
  document.getElementById('an_mood').textContent = a.visual_mood || '—';
  document.getElementById('an_keywords').innerHTML = (a.keywords||[]).map(k => `<span class="tag tag-grigio">${escapeHtml(k)}</span>`).join('');
  document.getElementById('an_palette').innerHTML = (a.color_palette||[]).map(c => `<div class="swatch" style="background:${escapeHtml(c)}" title="${escapeHtml(c)}"></div>`).join('');
  document.getElementById('an_titles').innerHTML = (a.title_suggestions||[]).map(t => `<span class="tag tag-sabbia pointer" onclick="copyText('${escapeHtml(t).replace(/'/g,"\\'")}')">${escapeHtml(t)}</span>`).join('');
  document.getElementById('an_expr').innerHTML = [...(a.expression_suggestions||[]), ...(a.pose_suggestions||[])].map(e => `<span class="tag tag-athlete">${escapeHtml(e)}</span>`).join('');
  document.getElementById('an_prompt').value = a.thumbnail_prompt || '';
  // prefill anche il tab Genera
  if (a.thumbnail_prompt) document.getElementById('genPrompt').value = a.thumbnail_prompt;
}

function copyText(t){ navigator.clipboard?.writeText(t); toast('Copiato: ' + t, 'ok'); }

// ─────────────────────────────────────────────────────────────────────────
// TAB: GENERA PROPOSTE
// ─────────────────────────────────────────────────────────────────────────
async function loadProviders(){
  PROVIDERS = await sbSelect('thumb_image_providers', 'select=*');
  ACTIVE_PROVIDER = PROVIDERS.find(p => p.active) || null;
  renderActiveProviderBox();
}

function renderActiveProviderBox(){
  const el = document.getElementById('activeProviderBox');
  if (!ACTIVE_PROVIDER){ el.innerHTML = '<span class="text-grigio text-sm">Nessun provider attivo — vai in Motore immagini.</span>'; return; }
  el.innerHTML = `<span class="tag tag-maker">${escapeHtml(ACTIVE_PROVIDER.name)}</span> <span class="text-xs text-grigio">${ACTIVE_PROVIDER.kind}${ACTIVE_PROVIDER.config?.model ? ' · ' + escapeHtml(ACTIVE_PROVIDER.config.model) : ''}</span>`;
  document.getElementById('generateBtn').classList.toggle('hidden', ACTIVE_PROVIDER.kind === 'manual');
  document.getElementById('genManualUpload').classList.toggle('hidden', ACTIVE_PROVIDER.kind !== 'manual');
}

let SELECTED_REF_IDS = new Set();
function renderGenRefGrid(){
  const el = document.getElementById('genRefGrid');
  const approved = GALLERY.filter(g => g.status === 'approved');
  if (!approved.length){ el.innerHTML = '<div class="empty text-sm">Nessuna immagine approvata in galleria ancora.</div>'; return; }
  el.innerHTML = approved.map(g => `<div class="img-card pointer" id="ref-${g.id}" onclick="toggleRef('${g.id}')"><div class="loader">…</div></div>`).join('');
  approved.forEach(g => resolveImageUrl(g.storage_path).then(url => {
    const card = document.getElementById(`ref-${g.id}`);
    if (!card) return;
    card.innerHTML = `<img src="${url}">`;
    card.style.outline = SELECTED_REF_IDS.has(g.id) ? '3px solid var(--maker)' : 'none';
  }));
}
function toggleRef(id){
  if (SELECTED_REF_IDS.has(id)) SELECTED_REF_IDS.delete(id); else SELECTED_REF_IDS.add(id);
  renderGenRefGrid();
}

async function runGenerate(){
  if (!SELECTED_VIDEO_ID) { toast('Seleziona un video', 'err'); return; }
  if (!ACTIVE_PROVIDER) { toast('Nessun provider attivo', 'err'); return; }
  const prompt = document.getElementById('genPrompt').value.trim();
  if (!prompt) { toast('Scrivi un prompt per la scena', 'err'); return; }

  const btn = document.getElementById('generateBtn');
  btn.disabled = true; btn.textContent = 'Generazione in corso…';

  let job;
  try {
    job = (await sbInsert('thumb_jobs', {
      client_id: CLIENT_ID, video_id: SELECTED_VIDEO_ID, provider_id: ACTIVE_PROVIDER.id,
      status: 'running',
      input: { prompt, negative_prompt: document.getElementById('genNegPrompt').value.trim(), aspect_ratio: document.getElementById('genAspect').value, reference_ids: [...SELECTED_REF_IDS] },
    }))[0];
    await sbUpdate('thumb_videos', `id=eq.${SELECTED_VIDEO_ID}`, { status: 'generating' });

    const refUrls = await Promise.all([...SELECTED_REF_IDS].map(id => resolveImageUrl(GALLERY.find(g=>g.id===id).storage_path)));

    const { ok, data } = await callEdgeFunction('generate-thumbnail', {
      provider_kind: ACTIVE_PROVIDER.kind,
      provider_config: ACTIVE_PROVIDER.config,
      prompt,
      negative_prompt: document.getElementById('genNegPrompt').value.trim(),
      reference_image_urls: refUrls,
      aspect_ratio: document.getElementById('genAspect').value,
    });

    if (!ok) throw new Error(data.error || 'Generazione fallita');

    let outputPath;
    if (data.image_base64){
      outputPath = `clients/${CLIENT_ID}/generated/${job.id}.png`;
      await sbUploadDataUrl(outputPath, data.image_base64);
    } else if (data.image_url){
      outputPath = data.image_url; // URL esterno diretto (fal.ai/Replicate CDN)
    } else {
      throw new Error('Nessuna immagine restituita dal provider');
    }
    await sbUpdate('thumb_jobs', `id=eq.${job.id}`, { status: 'done', output_image_path: outputPath });
    toast('Miniatura generata', 'ok');
  } catch(e){
    if (job) await sbUpdate('thumb_jobs', `id=eq.${job.id}`, { status: 'error', error_message: e.message }).catch(()=>{});
    toast('Errore generazione: ' + e.message, 'err');
  } finally {
    btn.disabled = false; btn.textContent = '✨ Genera miniatura';
    loadJobsForVideo();
  }
}

wireDropzone('manualResultDropzone', 'manualResultInput', async (files) => {
  const file = files[0]; if (!file || !SELECTED_VIDEO_ID) return;
  try {
    const jobId = uid();
    const path = `clients/${CLIENT_ID}/generated/${jobId}.png`;
    await sbUpload(path, file);
    await sbInsert('thumb_jobs', {
      id: jobId, client_id: CLIENT_ID, video_id: SELECTED_VIDEO_ID,
      provider_id: ACTIVE_PROVIDER?.id || null, status: 'done', output_image_path: path,
      input: { prompt: document.getElementById('genPrompt').value.trim(), manual_upload: true },
    }, { returnRow: false });
    toast('Immagine caricata come risultato', 'ok');
    loadJobsForVideo();
  } catch(e){ toast('Errore: ' + e.message, 'err'); }
});

async function loadJobsForVideo(){
  const el = document.getElementById('jobsGrid');
  if (!SELECTED_VIDEO_ID){ el.innerHTML = ''; return; }
  JOBS = await sbSelect('thumb_jobs', `video_id=eq.${SELECTED_VIDEO_ID}&select=*&order=created_at.desc`);
  renderJobsGrid();
}

function renderJobsGrid(){
  const el = document.getElementById('jobsGrid');
  if (!JOBS.length){ el.innerHTML = '<div class="empty text-sm">Nessuna generazione ancora per questo video.</div>'; return; }
  el.innerHTML = JOBS.map(j => `<div class="img-card" id="job-${j.id}"><div class="loader">…</div></div>`).join('');
  JOBS.forEach(j => {
    const card = document.getElementById(`job-${j.id}`);
    if (!card) return;
    if (j.status === 'error'){
      card.innerHTML = `<div class="empty text-xs" style="padding:14px;">⚠️ ${escapeHtml(j.error_message||'errore')}</div>`;
      return;
    }
    if (j.status !== 'done' || !j.output_image_path){
      card.innerHTML = `<div class="loader">In corso…</div>`;
      return;
    }
    resolveImageUrl(j.output_image_path).then(url => {
      card.innerHTML = `
        <img src="${url}">
        <div class="img-actions">
          <button class="btn btn-p" onclick="useJobInEditor('${j.id}')">Editor</button>
          <button class="btn btn-o" onclick="deleteJob('${j.id}')">✕</button>
        </div>`;
    });
  });
}

async function deleteJob(id){
  if (!confirm('Eliminare questo risultato?')) return;
  try { await sbDelete('thumb_jobs', `id=eq.${id}`); loadJobsForVideo(); } catch(e){ toast('Errore: '+e.message,'err'); }
}

function useJobInEditor(jobId){
  const j = JOBS.find(x => x.id === jobId);
  if (!j) return;
  resolveImageUrl(j.output_image_path).then(url => setEditorBackground(url, { sourceJobId: j.id }));
  document.querySelector('[data-tab="tab-editor"]').click();
}

// ─────────────────────────────────────────────────────────────────────────
// TAB: EDITOR (canvas 1280×720)
// ─────────────────────────────────────────────────────────────────────────
const canvas = () => document.getElementById('editorCanvas');
let EDITOR_BG = null; // HTMLImageElement
let EDITOR_SOURCE_JOB_ID = null;
let LAYERS = [];
let SELECTED_LAYER = null;
let DRAG = null; // { mode:'move'|'resize', layerId, startX, startY, orig:{...} }

function setEditorBackground(url, opts = {}){
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => { EDITOR_BG = img; EDITOR_SOURCE_JOB_ID = opts.sourceJobId || null; drawEditor(); };
  img.onerror = () => toast('Impossibile caricare l\'immagine (CORS o URL scaduto)', 'err');
  img.src = url;
}

document.getElementById('editorUploadInput')?.addEventListener('change', (e) => {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => setEditorBackground(reader.result, {});
  reader.readAsDataURL(file);
});

function pickBaseFromJobs(){
  const done = JOBS.filter(j => j.status === 'done' && j.output_image_path);
  showBasePicker(done, j => resolveImageUrl(j.output_image_path), j => setEditorBackground2(j));
}
function pickBaseFromGallery(){
  const approved = GALLERY.filter(g => g.status === 'approved');
  showBasePicker(approved, g => resolveImageUrl(g.storage_path), g => resolveImageUrl(g.storage_path).then(setEditorBackground));
}
function setEditorBackground2(j){ resolveImageUrl(j.output_image_path).then(url => setEditorBackground(url, { sourceJobId: j.id })); }

function showBasePicker(items, urlGetter, onPick){
  const el = document.getElementById('baseImagePicker');
  if (!items.length){ toast('Nessuna immagine disponibile qui', ''); return; }
  el.classList.remove('hidden');
  el.innerHTML = items.map((it,i) => `<div class="img-card pointer" id="bp-${i}"><div class="loader">…</div></div>`).join('');
  items.forEach((it,i) => urlGetter(it).then(url => {
    const card = document.getElementById(`bp-${i}`);
    if (!card) return;
    card.innerHTML = `<img src="${url}">`;
    card.onclick = () => { onPick(it); el.classList.add('hidden'); };
  }));
}

function addLayer(type){
  const id = uid();
  const base = { id, type, x: 480, y: 260, w: 320, h: 140, z: LAYERS.length };
  if (type === 'text') Object.assign(base, { text: 'Titolo miniatura', fontSize: 72, color: '#FFFFFF', stroke: '#000000', strokeWidth: 6, bold: true, w: 500, h: 90 });
  if (type === 'rect') Object.assign(base, { fill: CLIENT.brand_colors?.[0] || '#C4A865', opacity: 1 });
  if (type === 'circle') Object.assign(base, { fill: CLIENT.brand_colors?.[0] || '#C4A865', opacity: 1, w: 180, h: 180 });
  if (type === 'arrow') Object.assign(base, { color: '#FF3B30', thickness: 10, w: 260, h: 40 });
  if (type === 'logo'){
    if (!CLIENT.logo_path){ toast('Carica prima un logo nella scheda cliente', 'err'); return; }
    resolveImageUrl(CLIENT.logo_path).then(url => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { base.img = img; base.w = 160; base.h = 160; LAYERS.push(base); selectLayer(id); drawEditor(); };
      img.src = url;
    });
    return;
  }
  LAYERS.push(base);
  selectLayer(id);
  drawEditor();
}

function selectLayer(id){ SELECTED_LAYER = id; renderLayerList(); renderLayerProps(); drawEditor(); }

function renderLayerList(){
  const el = document.getElementById('layerList');
  if (!LAYERS.length){ el.innerHTML = '<div class="text-xs text-grigio">Nessun elemento. Aggiungine uno sopra.</div>'; return; }
  el.innerHTML = LAYERS.map(l => `
    <div class="layer-row ${l.id===SELECTED_LAYER?'on':''}" onclick="selectLayer('${l.id}')">
      <span style="flex:1;">${LAYER_ICON[l.type]} ${l.type === 'text' ? escapeHtml(l.text.slice(0,18)) : l.type}</span>
      <button class="btn btn-gh btn-sm" style="padding:2px 8px;" onclick="event.stopPropagation();removeLayer('${l.id}')">✕</button>
    </div>
  `).join('');
}
const LAYER_ICON = { text:'🔤', rect:'▭', circle:'⬤', arrow:'➜', logo:'🏷️' };

function removeLayer(id){
  LAYERS = LAYERS.filter(l => l.id !== id);
  if (SELECTED_LAYER === id) SELECTED_LAYER = null;
  renderLayerList(); renderLayerProps(); drawEditor();
}

function renderLayerProps(){
  const el = document.getElementById('layerProps');
  const l = LAYERS.find(x => x.id === SELECTED_LAYER);
  if (!l){ el.innerHTML = ''; return; }
  let html = '<div class="section-lbl">Proprietà</div>';
  if (l.type === 'text'){
    html += `
      <div class="field"><textarea class="textarea" style="min-height:50px;" oninput="updateLayer('${l.id}',{text:this.value})">${escapeHtml(l.text)}</textarea></div>
      <div class="grid grid-2">
        <div class="field"><label class="lbl">Dimensione</label><input class="inp" type="number" value="${l.fontSize}" oninput="updateLayer('${l.id}',{fontSize:+this.value})"></div>
        <div class="field"><label class="lbl">Colore</label><input class="inp" type="color" value="${l.color}" oninput="updateLayer('${l.id}',{color:this.value})"></div>
      </div>
      <div class="grid grid-2">
        <div class="field"><label class="lbl">Contorno</label><input class="inp" type="color" value="${l.stroke}" oninput="updateLayer('${l.id}',{stroke:this.value})"></div>
        <div class="field"><label class="lbl">Sp. contorno</label><input class="inp" type="number" value="${l.strokeWidth}" oninput="updateLayer('${l.id}',{strokeWidth:+this.value})"></div>
      </div>`;
  } else if (l.type === 'rect' || l.type === 'circle'){
    html += `
      <div class="field"><label class="lbl">Colore</label><input class="inp" type="color" value="${l.fill}" oninput="updateLayer('${l.id}',{fill:this.value})"></div>
      <div class="field"><label class="lbl">Opacità</label><input class="inp" type="range" min="0.1" max="1" step="0.05" value="${l.opacity}" oninput="updateLayer('${l.id}',{opacity:+this.value})"></div>`;
  } else if (l.type === 'arrow'){
    html += `
      <div class="field"><label class="lbl">Colore</label><input class="inp" type="color" value="${l.color}" oninput="updateLayer('${l.id}',{color:this.value})"></div>
      <div class="field"><label class="lbl">Spessore</label><input class="inp" type="number" value="${l.thickness}" oninput="updateLayer('${l.id}',{thickness:+this.value})"></div>`;
  } else if (l.type === 'logo'){
    html += `<div class="text-xs text-grigio">Trascina sul canvas per spostare, maniglia in basso a destra per ridimensionare.</div>`;
  }
  html += `<button class="btn btn-gh btn-sm btn-block mt-8" onclick="bringToFront('${l.id}')">Porta in primo piano</button>`;
  el.innerHTML = html;
}

function updateLayer(id, patch){
  const l = LAYERS.find(x => x.id === id);
  if (!l) return;
  Object.assign(l, patch);
  drawEditor();
  if (l.type === 'text') renderLayerList();
}
function bringToFront(id){
  const l = LAYERS.find(x => x.id === id);
  LAYERS = LAYERS.filter(x => x.id !== id); LAYERS.push(l);
  drawEditor(); renderLayerList();
}

function drawEditor(){
  const ctx = canvas().getContext('2d');
  ctx.clearRect(0,0,1280,720);
  ctx.fillStyle = '#000'; ctx.fillRect(0,0,1280,720);
  if (EDITOR_BG){
    const scale = Math.max(1280/EDITOR_BG.width, 720/EDITOR_BG.height);
    const w = EDITOR_BG.width*scale, h = EDITOR_BG.height*scale;
    ctx.drawImage(EDITOR_BG, (1280-w)/2, (720-h)/2, w, h);
  }
  for (const l of LAYERS){
    ctx.save();
    if (l.type === 'rect'){
      ctx.globalAlpha = l.opacity; ctx.fillStyle = l.fill; ctx.fillRect(l.x, l.y, l.w, l.h);
    } else if (l.type === 'circle'){
      ctx.globalAlpha = l.opacity; ctx.fillStyle = l.fill;
      ctx.beginPath(); ctx.ellipse(l.x+l.w/2, l.y+l.h/2, l.w/2, l.h/2, 0, 0, Math.PI*2); ctx.fill();
    } else if (l.type === 'arrow'){
      ctx.strokeStyle = l.color; ctx.fillStyle = l.color; ctx.lineWidth = l.thickness; ctx.lineCap = 'round';
      const y = l.y + l.h/2;
      ctx.beginPath(); ctx.moveTo(l.x, y); ctx.lineTo(l.x+l.w-24, y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(l.x+l.w, y); ctx.lineTo(l.x+l.w-34, y-20); ctx.lineTo(l.x+l.w-34, y+20); ctx.closePath(); ctx.fill();
    } else if (l.type === 'logo' && l.img){
      ctx.drawImage(l.img, l.x, l.y, l.w, l.h);
    } else if (l.type === 'text'){
      ctx.font = `${l.bold?'800':'600'} ${l.fontSize}px Jost, sans-serif`;
      ctx.textBaseline = 'top';
      const m = ctx.measureText(l.text);
      l.w = m.width; l.h = l.fontSize * 1.2;
      if (l.strokeWidth > 0){ ctx.lineWidth = l.strokeWidth; ctx.strokeStyle = l.stroke; ctx.lineJoin = 'round'; ctx.strokeText(l.text, l.x, l.y); }
      ctx.fillStyle = l.color; ctx.fillText(l.text, l.x, l.y);
    }
    if (l.id === SELECTED_LAYER){
      ctx.strokeStyle = '#4A9EFF'; ctx.lineWidth = 2; ctx.setLineDash([6,4]);
      ctx.strokeRect(l.x-4, l.y-4, l.w+8, l.h+8);
      ctx.setLineDash([]);
      ctx.fillStyle = '#4A9EFF'; ctx.fillRect(l.x+l.w-6, l.y+l.h-6, 14, 14);
    }
    ctx.restore();
  }
}

function canvasPointerPos(e){
  const rect = canvas().getBoundingClientRect();
  const scaleX = 1280 / rect.width, scaleY = 720 / rect.height;
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function initCanvasEvents(){
  const c = canvas();
  const down = (e) => {
    const { x, y } = canvasPointerPos(e);
    const l = LAYERS.find(x2 => x2.id === SELECTED_LAYER);
    if (l && x >= l.x+l.w-16 && x <= l.x+l.w+16 && y >= l.y+l.h-16 && y <= l.y+l.h+16 && l.type !== 'text'){
      DRAG = { mode:'resize', id:l.id, startX:x, startY:y, orig:{...l} };
      return;
    }
    for (let i = LAYERS.length-1; i>=0; i--){
      const lay = LAYERS[i];
      if (x>=lay.x && x<=lay.x+lay.w && y>=lay.y && y<=lay.y+lay.h){
        selectLayer(lay.id);
        DRAG = { mode:'move', id:lay.id, startX:x, startY:y, orig:{...lay} };
        return;
      }
    }
    selectLayer(null);
  };
  const move = (e) => {
    if (!DRAG) return;
    e.preventDefault();
    const { x, y } = canvasPointerPos(e);
    const l = LAYERS.find(x2 => x2.id === DRAG.id);
    if (!l) return;
    const dx = x - DRAG.startX, dy = y - DRAG.startY;
    if (DRAG.mode === 'move'){ l.x = DRAG.orig.x + dx; l.y = DRAG.orig.y + dy; }
    else { l.w = Math.max(20, DRAG.orig.w + dx); l.h = Math.max(20, DRAG.orig.h + dy); }
    drawEditor();
  };
  const up = () => { DRAG = null; };
  c.addEventListener('mousedown', down); c.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  c.addEventListener('touchstart', down, {passive:false}); c.addEventListener('touchmove', move, {passive:false}); window.addEventListener('touchend', up);
}
initCanvasEvents();

async function saveProposal(){
  if (!SELECTED_VIDEO_ID) { toast('Seleziona un video', 'err'); return; }
  if (!EDITOR_BG && !LAYERS.length) { toast('Scegli prima un\'immagine di base', 'err'); return; }
  try {
    const dataUrl = canvas().toDataURL('image/png');
    const path = `clients/${CLIENT_ID}/proposals/${uid()}.png`;
    await sbUploadDataUrl(path, dataUrl);
    await sbInsert('thumb_proposals', {
      client_id: CLIENT_ID, video_id: SELECTED_VIDEO_ID, source_job_id: EDITOR_SOURCE_JOB_ID,
      storage_path: path,
      title_text: document.getElementById('proposalLabel').value.trim() || null,
      status: 'draft',
    }, { returnRow: false });
    await sbUpdate('thumb_videos', `id=eq.${SELECTED_VIDEO_ID}`, { status: 'review' });
    toast('Proposta salvata', 'ok');
    document.querySelector('[data-tab="tab-proposals"]').click();
    loadProposals();
    loadVideos();
  } catch(e){ toast('Errore: ' + e.message, 'err'); }
}

// ─────────────────────────────────────────────────────────────────────────
// TAB: PROPOSTE FINALI
// ─────────────────────────────────────────────────────────────────────────
async function loadProposals(){
  const el = document.getElementById('proposalsByVideo');
  el.innerHTML = '<div class="loader">Caricamento…</div>';
  const proposals = await sbSelect('thumb_proposals', `client_id=eq.${CLIENT_ID}&select=*&order=created_at.desc`);
  if (!proposals.length){ el.innerHTML = '<div class="empty">Nessuna proposta ancora. Creane una dalla scheda Editor.</div>'; return; }
  const byVideo = {};
  for (const p of proposals) (byVideo[p.video_id] ||= []).push(p);

  el.innerHTML = Object.entries(byVideo).map(([videoId, list]) => {
    const v = VIDEOS.find(x => x.id === videoId);
    return `<div class="mt-12">
      <div class="section-lbl">${escapeHtml(v?.title || 'Video eliminato')}</div>
      <div class="gallery-grid" id="pv-${videoId}"></div>
    </div>`;
  }).join('');

  for (const [videoId, list] of Object.entries(byVideo)){
    const grid = document.getElementById(`pv-${videoId}`);
    grid.innerHTML = list.map(p => `<div class="img-card" id="prop-${p.id}"><div class="loader">…</div></div>`).join('');
    list.forEach(p => resolveImageUrl(p.storage_path).then(url => {
      const card = document.getElementById(`prop-${p.id}`);
      if (!card) return;
      const badgeClass = { draft:'tag-grigio', approved:'tag-maker', rejected:'tag-life', sent:'tag-athlete' }[p.status];
      const badgeLabel = { draft:'Bozza', approved:'Approvata', rejected:'Rifiutata', sent:'Inviata' }[p.status];
      card.innerHTML = `
        <img src="${url}">
        <span class="tag ${badgeClass} img-badge">${badgeLabel}</span>
        <div class="img-actions">
          <button class="btn btn-g" onclick="setProposalStatus('${p.id}','approved')">✓</button>
          <button class="btn btn-o" onclick="setProposalStatus('${p.id}','rejected')">✕</button>
          <a class="btn btn-s" href="${url}" download="proposta.png" target="_blank">⬇</a>
        </div>`;
    }));
  }
}

async function setProposalStatus(id, status){
  try { await sbUpdate('thumb_proposals', `id=eq.${id}`, { status }); loadProposals(); }
  catch(e){ toast('Errore: ' + e.message, 'err'); }
}

document.querySelector('[data-tab="tab-proposals"]')?.addEventListener('click', loadProposals);

// ─────────────────────────────────────────────────────────────────────────
// MODIFICA CLIENTE
// ─────────────────────────────────────────────────────────────────────────
function openEditClient(){
  document.getElementById('ec_name').value = CLIENT.name || '';
  document.getElementById('ec_channel_url').value = CLIENT.channel_url || '';
  document.getElementById('ec_niche').value = CLIENT.niche || '';
  document.getElementById('ec_tone').value = CLIENT.tone || '';
  document.getElementById('ec_capture_mode').value = CLIENT.capture_mode || 'manual';
  document.getElementById('ec_brand_colors').value = (CLIENT.brand_colors||[]).join(', ');
  document.getElementById('ec_notes').value = CLIENT.notes || '';
  document.getElementById('ec_logo_preview').src = '';
  if (CLIENT.logo_path) resolveImageUrl(CLIENT.logo_path).then(url => document.getElementById('ec_logo_preview').src = url);
  openOverlay('editClientOverlay');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('editClientForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      let logo_path = CLIENT.logo_path;
      const file = document.getElementById('ec_logo_input').files[0];
      if (file){
        const ext = (file.name.split('.').pop()||'png').toLowerCase();
        logo_path = `clients/${CLIENT_ID}/logo.${ext}`;
        await sbUpload(logo_path, file);
      }
      const payload = {
        name: document.getElementById('ec_name').value.trim(),
        channel_url: document.getElementById('ec_channel_url').value.trim() || null,
        niche: document.getElementById('ec_niche').value.trim() || null,
        tone: document.getElementById('ec_tone').value.trim() || null,
        capture_mode: document.getElementById('ec_capture_mode').value,
        brand_colors: document.getElementById('ec_brand_colors').value.split(',').map(s=>s.trim()).filter(Boolean),
        notes: document.getElementById('ec_notes').value.trim() || null,
        logo_path,
        updated_at: new Date().toISOString(),
      };
      CLIENT = (await sbUpdate('thumb_clients', `id=eq.${CLIENT_ID}`, payload))[0];
      renderClientHeader();
      closeOverlay('editClientOverlay');
      toast('Cliente aggiornato', 'ok');
    } catch(err){ toast('Errore: ' + err.message, 'err'); }
  });
});

init();
