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
let EDIT_PROVIDERS = [];
let ACTIVE_EDIT_PROVIDER = null;
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
  populateProfileForm();

  initTabs(document.getElementById('mainTabBar').parentElement);
  initStepper();
  wireGlobalHandlers();

  await Promise.all([loadVideos(), loadGallery(), loadProviders(), loadTextProviders(), loadEditProviders(), loadKit()]);
  loadCaptureJobs();
  initSettingsTab();
  renderProfileCompleteness();
}

// ─────────────────────────────────────────────────────────────────────────
// CTA "profilo completo" — nudge visivo per compilare il profilo prima di
// generare, così le miniature hanno un riferimento volto/stile affidabile.
// ─────────────────────────────────────────────────────────────────────────
function renderProfileCompleteness(){
  const card = document.getElementById('profileCompletenessCard');
  if (!card || !CLIENT) return;
  const checks = [
    { label: 'URL canale', done: !!CLIENT.channel_url },
    { label: 'Nicchia e tono', done: !!(CLIENT.niche && CLIENT.tone) },
    { label: 'Logo caricato', done: !!CLIENT.logo_path },
    { label: 'Almeno una foto nel Kit', done: (KIT_ASSETS || []).some(a => a.kind === 'image') },
  ];
  const done = checks.filter(c => c.done).length;
  const pct = Math.round(done / checks.length * 100);
  if (pct >= 100){ card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  document.getElementById('pcPercent').textContent = pct;
  document.getElementById('pcBar').style.width = pct + '%';
  document.getElementById('pcChecklist').innerHTML = checks.map(c => `
    <span class="tag ${c.done ? 'tag-maker' : 'tag-grigio'}">${c.done ? icon('check','icon-sm') : icon('x','icon-sm')} ${c.label}</span>
  `).join('');
}

// ─────────────────────────────────────────────────────────────────────────
// STEPPER VERTICALE (accordion a step singolo, si apre da solo al punto
// raggiunto in base ai dati reali: script salvato, generazione fatta, ecc.)
// ─────────────────────────────────────────────────────────────────────────
function initStepper(){
  document.querySelectorAll('.stepper .step-head').forEach(head => {
    head.addEventListener('click', () => {
      const card = head.closest('.step-card');
      const wasOpen = card.classList.contains('open');
      document.querySelectorAll('.stepper .step-card').forEach(c => c.classList.remove('open'));
      if (!wasOpen){ card.classList.add('open'); if (card.id === 'step-preview') loadProposals(); }
    });
  });
}

function openStep(id){
  document.querySelectorAll('.stepper .step-card').forEach(c => c.classList.toggle('open', c.id === id));
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  if (id === 'step-preview') loadProposals();
}

function setStepState(id, state){ document.getElementById(id)?.classList.add(state); }

async function updateStepperProgress(){
  document.querySelectorAll('.stepper .step-card').forEach(c => c.classList.remove('done', 'current'));
  document.getElementById('step-gallery')?.classList.toggle('done', GALLERY.some(g => g.status === 'approved'));

  if (!SELECTED_VIDEO_ID){ setStepState('step-video', 'current'); openStep('step-video'); return; }
  setStepState('step-video', 'done');

  const hasScript = !!(CURRENT_SCRIPT_ROW && CURRENT_SCRIPT_ROW.content);
  if (!hasScript){ setStepState('step-script', 'current'); openStep('step-script'); return; }
  setStepState('step-script', 'done');

  if (!JOBS.length){ setStepState('step-generate', 'current'); openStep('step-generate'); return; }
  setStepState('step-generate', 'done');

  let hasProposal = false;
  try {
    const rows = await sbSelect('thumb_proposals', `video_id=eq.${SELECTED_VIDEO_ID}&select=id&limit=1`);
    hasProposal = rows.length > 0;
  } catch(e) { /* ignora, resta sullo step editor */ }

  if (!hasProposal){ setStepState('step-editor', 'current'); openStep('step-editor'); return; }
  setStepState('step-editor', 'done');
  setStepState('step-preview', 'current');
  openStep('step-preview');
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

async function onSelectedVideoChanged(){
  await loadScriptForVideo();
  renderGenRefGrid();
  await loadJobsForVideo();
  await updateStepperProgress();
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
    el.innerHTML = `<div class="empty"><div class="empty-icon">${icon('tv')}</div>Nessun video ancora. Importa dal canale o aggiungine uno manualmente.</div>`;
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
            ${v.url ? `<a class="text-xs" href="${escapeHtml(v.url)}" target="_blank" rel="noopener">Apri su YouTube ${icon('external-link','icon-sm')}</a>` : ''}
          </div>
        </div>
        <div class="flex gap-6">
          <button class="btn btn-s btn-sm" onclick="selectVideoAndGoto('${v.id}','step-script')">Script</button>
          <button class="btn btn-gh btn-sm" onclick="deleteVideo('${v.id}')">Elimina</button>
        </div>
      </div>
    </div>
  `).join('');
}

function selectVideoAndGoto(videoId, stepId){
  SELECTED_VIDEO_ID = videoId;
  document.getElementById('activeVideoSelect').value = videoId;
  onSelectedVideoChanged().then(() => openStep(stepId));
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
  const { ok, data } = await callEdgeFunction(EDGE_FN.fetchChannelVideos, { channel_url: CLIENT.channel_url });
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
  renderKitToGalleryGrid();
}

// Kit permanente → Galleria: riusa una foto già caricata nel profilo (senza
// ricaricarla) segnandola come approvata per questo video. Riusa lo stesso
// storage_path del kit, niente duplicazione del file.
function renderKitToGalleryGrid(){
  const el = document.getElementById('kitToGalleryGrid');
  if (!el) return;
  const kitImages = (KIT_ASSETS || []).filter(a => a.kind === 'image' && a.storage_path);
  const card = document.getElementById('kitToGalleryCard');
  if (!kitImages.length){ card.classList.add('hidden'); return; }
  card.classList.remove('hidden');
  const alreadyUsed = new Set(GALLERY.map(g => g.storage_path));
  el.innerHTML = kitImages.map(a => `<div class="kit-pick-card" id="ktg-${a.id}" onclick="addKitImageToGallery('${a.id}')"><div class="loader">…</div></div>`).join('');
  kitImages.forEach(a => resolveImageUrl(a.storage_path).then(url => {
    const c = document.getElementById(`ktg-${a.id}`);
    if (!c) return;
    const used = alreadyUsed.has(a.storage_path);
    c.innerHTML = `<img src="${url}"><div class="kit-pick-add">${used ? icon('check') + ' già in galleria' : icon('plus') + ' usa qui'}</div>`;
    if (used) c.style.opacity = '.55';
  }));
}

async function addKitImageToGallery(kitAssetId){
  const a = KIT_ASSETS.find(x => x.id === kitAssetId);
  if (!a) return;
  if (GALLERY.some(g => g.storage_path === a.storage_path)) { toast('Già presente in galleria', ''); return; }
  try {
    await sbInsert('thumb_gallery_images', { client_id: CLIENT_ID, storage_path: a.storage_path, source: 'manual', status: 'approved' }, { returnRow: false });
    toast('Aggiunta alla galleria', 'ok');
    loadGallery();
  } catch(e){ toast('Errore: ' + e.message, 'err'); }
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
          ${g.status !== 'approved' ? `<button class="btn btn-g" onclick="quickSetStatus('${g.id}','approved')">${icon('check')}</button>` : ''}
          ${g.status !== 'rejected' ? `<button class="btn btn-o" onclick="quickSetStatus('${g.id}','rejected')">${icon('x')}</button>` : ''}
          <button class="btn btn-s" onclick="event.stopPropagation();openImgEdit('gallery','${g.id}')">${icon('pencil')}</button>
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
  renderModelPickerButton('text');
}

async function loadEditProviders(){
  EDIT_PROVIDERS = await sbSelect('thumb_edit_providers', 'select=*');
  ACTIVE_EDIT_PROVIDER = EDIT_PROVIDERS.find(p => p.active) || null;
  renderModelPickerButton('edit');
}

async function analyzeScript(){
  if (!SELECTED_VIDEO_ID) { toast('Seleziona prima un video', 'err'); return; }
  if (!ACTIVE_TEXT_PROVIDER) { toast('Nessun motore di analisi attivo — vai in Impostazioni', 'err'); return; }
  const content = document.getElementById('scriptContent').value.trim();
  if (!content) { toast('Scrivi prima l\'idea o la scaletta del video', 'err'); return; }
  const errEl = document.getElementById('scriptError');
  errEl.classList.add('hidden');
  const btn = document.getElementById('analyzeBtn');
  btn.disabled = true; btn.textContent = 'Analisi in corso…';
  try {
    const { ok, data } = await callEdgeFunction(EDGE_FN.analyzeScript, {
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
    btn.disabled = false; btn.innerHTML = `${icon('bot','icon-sm')} Analizza con AI`;
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
  renderModelPickerButton('image');
  document.getElementById('generateBtn').classList.toggle('hidden', ACTIVE_PROVIDER?.kind === 'manual');
  document.getElementById('genManualUpload').classList.toggle('hidden', ACTIVE_PROVIDER?.kind !== 'manual');
}

// ─────────────────────────────────────────────────────────────────────────
// SELETTORE MODELLO INLINE (pulsante + tendina in ogni step, con pallino
// gratis/pagamento per provider) — evita di dover uscire su providers.html
// solo per cambiare motore o modello attivo.
// ─────────────────────────────────────────────────────────────────────────
const FREE_PROVIDER_KINDS = new Set(['huggingface', 'manual', 'gemini']);
// Pallino colorato (non un'icona a forma libera): gratis/pagamento è
// un'informazione di stato, più chiara con un indicatore standard + testo
// che con un pittogramma ambiguo.
function costIcon(kind){
  const free = FREE_PROVIDER_KINDS.has(kind);
  return `<span class="cost-dot ${free ? 'free' : 'paid'}" title="${free ? 'Gratis' : 'A pagamento'}"></span>`;
}

const MODEL_PICKERS = {
  text: { table: 'thumb_text_providers', list: () => TEXT_PROVIDERS, active: () => ACTIVE_TEXT_PROVIDER, reload: loadTextProviders },
  image: { table: 'thumb_image_providers', list: () => PROVIDERS, active: () => ACTIVE_PROVIDER, reload: loadProviders },
  edit: { table: 'thumb_edit_providers', list: () => EDIT_PROVIDERS, active: () => ACTIVE_EDIT_PROVIDER, reload: loadEditProviders },
};
const MODEL_PICKER_IDS = { text: 'textModelPicker', image: 'imageModelPicker', edit: 'editModelPicker' };

function toggleModelPicker(kind){
  const wrap = document.getElementById(MODEL_PICKER_IDS[kind]);
  const willOpen = !wrap.classList.contains('open');
  document.querySelectorAll('.model-picker.open').forEach(p => p.classList.remove('open'));
  if (willOpen){ renderModelPicker(kind); wrap.classList.add('open'); }
}

function renderModelPickerButton(kind){
  const btn = document.getElementById(MODEL_PICKER_IDS[kind] + 'Btn');
  if (!btn) return;
  const active = MODEL_PICKERS[kind].active();
  btn.innerHTML = active ? `${costIcon(active.kind)} ${escapeHtml(active.name)} ▾` : `Nessun motore attivo ▾`;
}

function renderModelPicker(kind){
  const cfg = MODEL_PICKERS[kind];
  const listEl = document.getElementById(MODEL_PICKER_IDS[kind] + 'List');
  const list = cfg.list();
  const manageLink = `<a class="model-picker-manage" href="#" onclick="event.preventDefault();goToSettingsProviders();">${icon('settings','icon-sm')} Gestisci / aggiungi provider</a>`;
  if (!list.length){
    listEl.innerHTML = '<div class="model-picker-empty">Nessun provider configurato.</div>' + manageLink;
    return;
  }
  listEl.innerHTML = list.map(p => `
    <div class="model-picker-row ${p.active ? 'active' : ''}" onclick="selectModel('${kind}','${p.id}')">
      <span class="model-picker-cost">${costIcon(p.kind)}</span>
      <span style="flex:1;min-width:0;">
        <div>${escapeHtml(p.name)}</div>
        ${p.config?.model ? `<div class="text-xs text-grigio">${escapeHtml(p.config.model)}</div>` : ''}
      </span>
      ${p.active ? icon('check','icon-sm') : ''}
    </div>
  `).join('') + manageLink;
}

async function selectModel(kind, id){
  const cfg = MODEL_PICKERS[kind];
  const wrap = document.getElementById(MODEL_PICKER_IDS[kind]);
  const p = cfg.list().find(x => x.id === id);
  if (!p || p.active){ wrap.classList.remove('open'); return; }
  try {
    await sbUpdate(cfg.table, 'active=eq.true', { active: false });
    await sbUpdate(cfg.table, `id=eq.${id}`, { active: true });
    toast('Motore attivato: ' + p.name, 'ok');
    await cfg.reload();
  } catch(e){ toast('Errore: ' + e.message, 'err'); }
  wrap.classList.remove('open');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.model-picker')) document.querySelectorAll('.model-picker.open').forEach(p => p.classList.remove('open'));
});

// Naviga alla tab Impostazioni → Motori AI senza uscire dalla pagina (chiude
// eventuale overlay/tendina aperti sopra, così la tab si vede subito).
function goToSettingsProviders(){
  document.querySelectorAll('.model-picker.open').forEach(p => p.classList.remove('open'));
  document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open'));
  document.querySelector('#mainTabBar [data-tab="view-settings"]')?.click();
  window.scrollTo({ top: 0, behavior: 'smooth' });
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

let SELECTED_FORMAT = { w: 1280, h: 720, ratio: '16:9' };
function selectFormatPreset(btn){
  document.querySelectorAll('#genFormatPresets .format-preset').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  SELECTED_FORMAT = { w: Number(btn.dataset.w), h: Number(btn.dataset.h), ratio: btn.dataset.ratio };
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
      input: { prompt, negative_prompt: document.getElementById('genNegPrompt').value.trim(), aspect_ratio: SELECTED_FORMAT.ratio, width: SELECTED_FORMAT.w, height: SELECTED_FORMAT.h, reference_ids: [...SELECTED_REF_IDS] },
    }))[0];
    await sbUpdate('thumb_videos', `id=eq.${SELECTED_VIDEO_ID}`, { status: 'generating' });

    const refUrls = await Promise.all([...SELECTED_REF_IDS].map(id => resolveImageUrl(GALLERY.find(g=>g.id===id).storage_path)));

    const { ok, data } = await callEdgeFunction(EDGE_FN.generateThumbnail, {
      provider_kind: ACTIVE_PROVIDER.kind,
      provider_config: ACTIVE_PROVIDER.config,
      prompt,
      negative_prompt: document.getElementById('genNegPrompt').value.trim(),
      reference_image_urls: refUrls,
      aspect_ratio: SELECTED_FORMAT.ratio,
      width: SELECTED_FORMAT.w,
      height: SELECTED_FORMAT.h,
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
    btn.disabled = false; btn.innerHTML = `${icon('sparkles','icon-sm')} Genera miniatura`;
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
      card.innerHTML = `<div class="empty text-xs" style="padding:14px;">${escapeHtml(j.error_message||'errore')}</div>`;
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
          <button class="btn btn-o" onclick="deleteJob('${j.id}')">${icon('x')}</button>
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
  openStep('step-editor');
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
      <span style="flex:1;display:flex;align-items:center;gap:6px;">${LAYER_ICON[l.type]} ${l.type === 'text' ? escapeHtml(l.text.slice(0,18)) : l.type}</span>
      <button class="btn btn-gh btn-sm" style="padding:2px 8px;" onclick="event.stopPropagation();removeLayer('${l.id}')">${icon('x','icon-sm')}</button>
    </div>
  `).join('');
}
const LAYER_ICON = { text: icon('type','icon-sm'), rect: icon('square','icon-sm'), circle: icon('circle-mark','icon-sm'), arrow: icon('arrow-right','icon-sm'), logo: icon('tag','icon-sm') };

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
    openStep('step-preview');
    updateStepperProgress();
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

  await loadPlatformSettings();
  for (const [videoId, list] of Object.entries(byVideo)){
    const grid = document.getElementById(`pv-${videoId}`);
    grid.innerHTML = list.map(p => `<div class="img-card" id="prop-${p.id}"><div class="loader">…</div></div>`).join('');
    list.forEach(p => resolveImageUrl(p.storage_path).then(async cleanUrl => {
      const card = document.getElementById(`prop-${p.id}`);
      if (!card) return;
      const displayUrl = await watermarkedDataUrl(cleanUrl, p.unlocked);
      const badgeClass = { draft:'tag-grigio', approved:'tag-maker', rejected:'tag-life', sent:'tag-athlete' }[p.status];
      const badgeLabel = { draft:'Bozza', approved:'Approvata', rejected:'Rifiutata', sent:'Inviata' }[p.status];
      card.innerHTML = `
        <img src="${displayUrl}">
        <span class="tag ${badgeClass} img-badge">${badgeLabel}</span>
        ${!p.unlocked ? `<span class="tag tag-sabbia" style="position:absolute;top:6px;right:6px;">${icon('lock','icon-sm')} Filigrana</span>` : ''}
        <div class="img-actions">
          <button class="btn btn-g" onclick="setProposalStatus('${p.id}','approved')">${icon('check')}</button>
          <button class="btn btn-o" onclick="setProposalStatus('${p.id}','rejected')">${icon('x')}</button>
          ${!p.unlocked ? `<button class="btn btn-s" onclick="unlockProposal('${p.id}')" title="Sblocca togliendo la filigrana — 4€ a miniatura, 3€ se hai l'abbonamento Creator">${icon('unlock')} 4€</button>` : ''}
          <a class="btn btn-s" href="${displayUrl}" download="proposta.png">${icon('download')}</a>
        </div>`;
    }));
  }
}

async function unlockProposal(id){
  if (!confirm('Sblocco: 4€ a miniatura (3€ con l\'abbonamento Creator). Il pagamento vero non è ancora collegato — per ora lo sblocco è gratuito mentre testiamo il tool, ma il prezzo è quello reale che verrà applicato. Continuare?')) return;
  try { await sbUpdate('thumb_proposals', `id=eq.${id}`, { unlocked: true }); loadProposals(); }
  catch(e){ toast('Errore: ' + e.message, 'err'); }
}

async function setProposalStatus(id, status){
  try { await sbUpdate('thumb_proposals', `id=eq.${id}`, { status }); loadProposals(); }
  catch(e){ toast('Errore: ' + e.message, 'err'); }
}

// ─────────────────────────────────────────────────────────────────────────
// TAB: PROFILO
// ─────────────────────────────────────────────────────────────────────────
function populateProfileForm(){
  document.getElementById('prof_name').value = CLIENT.name || '';
  document.getElementById('prof_channel_url').value = CLIENT.channel_url || '';
  document.getElementById('prof_niche').value = CLIENT.niche || '';
  document.getElementById('prof_tone').value = CLIENT.tone || '';
  document.getElementById('prof_capture_mode').value = CLIENT.capture_mode || 'manual';
  document.getElementById('prof_brand_colors').value = (CLIENT.brand_colors||[]).join(', ');
  document.getElementById('prof_notes').value = CLIENT.notes || '';
  document.getElementById('prof_logo_preview').src = '';
  if (CLIENT.logo_path) resolveImageUrl(CLIENT.logo_path).then(url => document.getElementById('prof_logo_preview').src = url);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('profileForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      let logo_path = CLIENT.logo_path;
      const file = document.getElementById('prof_logo_input').files[0];
      if (file){
        const ext = (file.name.split('.').pop()||'png').toLowerCase();
        logo_path = `clients/${CLIENT_ID}/logo.${ext}`;
        await sbUpload(logo_path, file);
      }
      const payload = {
        name: document.getElementById('prof_name').value.trim(),
        channel_url: document.getElementById('prof_channel_url').value.trim() || null,
        niche: document.getElementById('prof_niche').value.trim() || null,
        tone: document.getElementById('prof_tone').value.trim() || null,
        capture_mode: document.getElementById('prof_capture_mode').value,
        brand_colors: document.getElementById('prof_brand_colors').value.split(',').map(s=>s.trim()).filter(Boolean),
        notes: document.getElementById('prof_notes').value.trim() || null,
        logo_path,
        updated_at: new Date().toISOString(),
      };
      CLIENT = (await sbUpdate('thumb_clients', `id=eq.${CLIENT_ID}`, payload))[0];
      renderClientHeader();
      renderProfileCompleteness();
      toast('Profilo aggiornato', 'ok');
    } catch(err){ toast('Errore: ' + err.message, 'err'); }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// TAB: PROFILO — "impara dallo stile del canale" (opzionale, una tantum):
// analizza un video GIÀ pubblicato con Gemini per estrarre tono/mood/palette
// tipici del canale, salvabili come nota di stile nel Kit. Diverso dallo
// step Script (che riguarda il video nuovo, non ancora online).
// ─────────────────────────────────────────────────────────────────────────
let KIT_CHANNEL_ANALYSIS = null;

function formatChannelAnalysis(a){
  return [
    a.video_summary ? `Di cosa parla: ${a.video_summary}` : null,
    a.topic ? `Argomento: ${a.topic}` : null,
    a.tone ? `Tono: ${a.tone}` : null,
    a.visual_mood ? `Mood visivo: ${a.visual_mood}` : null,
    (a.keywords||[]).length ? `Parole chiave: ${a.keywords.join(', ')}` : null,
    (a.color_palette||[]).length ? `Palette: ${a.color_palette.join(', ')}` : null,
  ].filter(Boolean).join('\n');
}

async function runKitChannelAnalysis(){
  const url = document.getElementById('kitAnalysisUrl').value.trim();
  if (!url) { toast('Incolla l\'URL di un video già pubblicato', 'err'); return; }
  const geminiProvider = TEXT_PROVIDERS.find(p => p.kind === 'gemini');
  if (!geminiProvider) { toast('Aggiungi un motore Google Gemini in Impostazioni — è l\'unico che può guardare un video', 'err'); return; }
  const errEl = document.getElementById('kitAnalysisError');
  errEl.classList.add('hidden');
  const btn = document.getElementById('kitAnalysisBtn');
  btn.disabled = true; btn.textContent = 'Guardo il video…';
  try {
    const { ok, data } = await callEdgeFunction(EDGE_FN.analyzeScript, {
      content: '',
      video_url: url,
      provider_kind: 'gemini',
      provider_config: geminiProvider.config,
      client_context: { name: CLIENT.name, niche: CLIENT.niche, tone: CLIENT.tone },
    });
    if (!ok) throw new Error(data.error || 'Errore sconosciuto');
    KIT_CHANNEL_ANALYSIS = data.analysis;
    document.getElementById('kitAnalysisResult').classList.remove('hidden');
    document.getElementById('kitAnalysisSummary').textContent = formatChannelAnalysis(data.analysis);
  } catch(e){
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.innerHTML = `${icon('sparkles','icon-sm')} Analizza con Gemini`;
  }
}

async function saveKitChannelAnalysisAsNote(){
  if (!KIT_CHANNEL_ANALYSIS) return;
  try {
    await sbInsert('thumb_client_assets', {
      client_id: CLIENT_ID, kind: 'note',
      note_text: formatChannelAnalysis(KIT_CHANNEL_ANALYSIS),
      title: 'Analisi canale — ' + new Date().toLocaleDateString('it-IT'),
    }, { returnRow: false });
    toast('Nota di stile salvata nel Kit', 'ok');
    document.getElementById('kitAnalysisUrl').value = '';
    document.getElementById('kitAnalysisResult').classList.add('hidden');
    KIT_CHANNEL_ANALYSIS = null;
    loadKit();
  } catch(e){ toast('Errore: ' + e.message, 'err'); }
}

// ─────────────────────────────────────────────────────────────────────────
// TAB: PROFILO — kit permanente (foto/documenti/note riusabili sempre)
// ─────────────────────────────────────────────────────────────────────────
let KIT_ASSETS = [];

async function loadKit(){
  KIT_ASSETS = await sbSelect('thumb_client_assets', `client_id=eq.${CLIENT_ID}&select=*&order=created_at.desc`);
  renderKit();
  renderKitToGalleryGrid();
  renderProfileCompleteness();
}

function renderKit(){
  const el = document.getElementById('kitGrid');
  if (!KIT_ASSETS.length){ el.innerHTML = '<div class="empty text-sm">Nessun elemento nel kit ancora.</div>'; return; }
  el.innerHTML = KIT_ASSETS.map(a => `<div class="kit-card" id="kit-${a.id}"><div class="loader">…</div></div>`).join('');
  KIT_ASSETS.forEach(a => {
    const card = document.getElementById(`kit-${a.id}`);
    if (!card) return;
    if (a.kind === 'image' && a.storage_path){
      resolveImageUrl(a.storage_path).then(url => {
        card.innerHTML = `<img src="${url}"><div class="kit-body"><span class="text-xs">${escapeHtml(a.title||'Foto')}</span></div><button class="btn btn-s btn-sm kit-edit" onclick="openImgEdit('kit','${a.id}')">${icon('pencil','icon-sm')}</button><button class="btn btn-o btn-sm kit-del" onclick="deleteKitAsset('${a.id}')">${icon('x','icon-sm')}</button>`;
      });
    } else if (a.kind === 'document' && a.storage_path){
      resolveImageUrl(a.storage_path).then(url => {
        card.innerHTML = `<div class="kit-body"><div style="opacity:.6;">${icon('file-text','icon-lg')}</div><a class="text-xs" href="${url}" target="_blank" rel="noopener">${escapeHtml(a.title||'Documento')}</a></div><button class="btn btn-o btn-sm kit-del" onclick="deleteKitAsset('${a.id}')">${icon('x','icon-sm')}</button>`;
      });
    } else {
      card.innerHTML = `<div class="kit-body"><span class="text-xs" style="font-weight:700;display:flex;align-items:center;gap:5px;">${icon('pencil','icon-sm')} ${escapeHtml(a.title||'Nota')}</span><span class="text-xs text-grigio">${escapeHtml((a.note_text||'').slice(0,140))}</span></div><button class="btn btn-o btn-sm kit-del" onclick="deleteKitAsset('${a.id}')">${icon('x','icon-sm')}</button>`;
    }
  });
}

async function deleteKitAsset(id){
  if (!confirm('Eliminare questo elemento dal kit?')) return;
  const a = KIT_ASSETS.find(x => x.id === id);
  try {
    await sbDelete('thumb_client_assets', `id=eq.${id}`);
    if (a?.storage_path) await sbDeleteObject(a.storage_path).catch(()=>{});
    loadKit();
  } catch(e){ toast('Errore: ' + e.message, 'err'); }
}

wireDropzone('kitImageDropzone', 'kitImageInput', async (files) => {
  if (!files.length) return;
  for (const file of files){
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `clients/${CLIENT_ID}/kit/${uid()}.${ext}`;
      await sbUpload(path, file);
      await sbInsert('thumb_client_assets', { client_id: CLIENT_ID, kind: 'image', storage_path: path, title: file.name }, { returnRow: false });
    } catch(e){ toast('Errore upload: ' + e.message, 'err'); }
  }
  toast('Foto aggiunte al kit', 'ok');
  loadKit();
});

document.getElementById('kitDocInput')?.addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  try {
    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase();
    const path = `clients/${CLIENT_ID}/kit/${uid()}.${ext}`;
    await sbUpload(path, file);
    await sbInsert('thumb_client_assets', { client_id: CLIENT_ID, kind: 'document', storage_path: path, title: file.name }, { returnRow: false });
    toast('Documento caricato', 'ok');
    loadKit();
  } catch(err){ toast('Errore: ' + err.message, 'err'); }
  e.target.value = '';
});

function openKitNoteField(){ document.getElementById('kitNoteField').classList.remove('hidden'); }

async function addKitNote(){
  const text = document.getElementById('kitNoteText').value.trim();
  if (!text) return;
  try {
    await sbInsert('thumb_client_assets', { client_id: CLIENT_ID, kind: 'note', note_text: text, title: text.slice(0,40) }, { returnRow: false });
    document.getElementById('kitNoteText').value = '';
    document.getElementById('kitNoteField').classList.add('hidden');
    toast('Nota aggiunta', 'ok');
    loadKit();
  } catch(e){ toast('Errore: ' + e.message, 'err'); }
}

// ─────────────────────────────────────────────────────────────────────────
// MODIFICA IMMAGINE CON AI (galleria + kit) — istruzione testuale su
// un'immagine esistente, provider intercambiabile (thumb_edit_providers,
// stesso pattern pluggable di analisi/generazione).
// ─────────────────────────────────────────────────────────────────────────
let EDIT_SOURCE = null; // { type:'gallery'|'kit', id, path, origUrl }
let EDIT_RESULT_B64 = null;

async function openImgEdit(type, id){
  const item = (type === 'gallery' ? GALLERY : KIT_ASSETS).find(x => x.id === id);
  if (!item || !item.storage_path) return;
  const origUrl = await resolveImageUrl(item.storage_path);
  EDIT_SOURCE = { type, id, path: item.storage_path, origUrl };
  EDIT_RESULT_B64 = null;
  document.getElementById('editOrigImg').src = origUrl;
  document.getElementById('editPrompt').value = '';
  document.getElementById('editError').classList.add('hidden');
  document.getElementById('editResultImg').style.display = 'none';
  document.getElementById('editResultPlaceholder').classList.remove('hidden');
  document.getElementById('editApplyRow').classList.add('hidden');
  renderModelPickerButton('edit');
  openOverlay('imgEditOverlay');
}

async function runImageEdit(){
  if (!ACTIVE_EDIT_PROVIDER) { toast('Nessun motore di modifica attivo — vai in Impostazioni', 'err'); return; }
  const prompt = document.getElementById('editPrompt').value.trim();
  if (!prompt) { toast("Scrivi un'istruzione di modifica", 'err'); return; }
  const errEl = document.getElementById('editError');
  errEl.classList.add('hidden');
  const btn = document.getElementById('editRunBtn');
  btn.disabled = true; btn.textContent = 'Modifica in corso…';
  try {
    const { ok, data } = await callEdgeFunction(EDGE_FN.editImage, {
      provider_kind: ACTIVE_EDIT_PROVIDER.kind,
      provider_config: ACTIVE_EDIT_PROVIDER.config,
      image_url: EDIT_SOURCE.origUrl,
      edit_prompt: prompt,
    });
    if (!ok) throw new Error(data.error || 'Modifica fallita');
    EDIT_RESULT_B64 = data.image_base64;
    const img = document.getElementById('editResultImg');
    img.src = EDIT_RESULT_B64;
    img.style.display = '';
    document.getElementById('editResultPlaceholder').classList.add('hidden');
    document.getElementById('editApplyRow').classList.remove('hidden');
  } catch(e){
    errEl.textContent = e.message;
    errEl.classList.remove('hidden');
  } finally {
    btn.disabled = false; btn.innerHTML = `${icon('sparkles','icon-sm')} Genera modifica`;
  }
}

async function applyEditResult(mode){
  if (!EDIT_RESULT_B64 || !EDIT_SOURCE) return;
  try {
    if (mode === 'replace'){
      await sbUploadDataUrl(EDIT_SOURCE.path, EDIT_RESULT_B64);
      _signedUrlCache.delete(EDIT_SOURCE.path); // forza un nuovo URL firmato per evitare la cache del browser sull'immagine vecchia
      toast('Immagine sostituita', 'ok');
    } else {
      const newPath = EDIT_SOURCE.type === 'gallery'
        ? `clients/${CLIENT_ID}/gallery/${uid()}.png`
        : `clients/${CLIENT_ID}/kit/${uid()}.png`;
      await sbUploadDataUrl(newPath, EDIT_RESULT_B64);
      if (EDIT_SOURCE.type === 'gallery'){
        await sbInsert('thumb_gallery_images', { client_id: CLIENT_ID, storage_path: newPath, source: 'manual', status: 'approved' }, { returnRow: false });
      } else {
        await sbInsert('thumb_client_assets', { client_id: CLIENT_ID, kind: 'image', storage_path: newPath, title: 'Modificata con AI' }, { returnRow: false });
      }
      toast('Salvata come nuova immagine', 'ok');
    }
    closeOverlay('imgEditOverlay');
    if (EDIT_SOURCE.type === 'gallery') loadGallery(); else loadKit();
  } catch(e){ toast('Errore: ' + e.message, 'err'); }
}

// ─────────────────────────────────────────────────────────────────────────
// TAB: IMPOSTAZIONI — motori AI in un unico posto (sincronizzato con i
// pulsanti rapidi negli step), preferenze notifiche (placeholder), dati
// sensibili account (email/password).
// ─────────────────────────────────────────────────────────────────────────
const SETTINGS_SECTIONS = {
  text:  { listId: 'settingsListText',  kinds: { huggingface:'Hugging Face', gemini:'Google Gemini', anthropic:'Anthropic', openai:'OpenAI' } },
  image: { listId: 'settingsListImage', kinds: { huggingface:'Hugging Face', fal:'fal.ai', replicate:'Replicate', openai:'OpenAI', manual:'Manuale' } },
  edit:  { listId: 'settingsListEdit',  kinds: { huggingface:'Hugging Face', fal:'fal.ai', replicate:'Replicate', openai:'OpenAI' } },
};

function initSettingsTab(){
  renderSettingsSection('text');
  renderSettingsSection('image');
  renderSettingsSection('edit');
  document.getElementById('sec_email').value = getUserEmail() || '';
  renderNotifPrefs();
}

function renderSettingsSection(key){
  const s = SETTINGS_SECTIONS[key];
  const list = MODEL_PICKERS[key].list();
  const el = document.getElementById(s.listId);
  if (!el) return;
  if (!list.length){ el.innerHTML = '<div class="text-xs text-grigio">Nessun provider configurato.</div>'; return; }
  el.innerHTML = list.map(p => {
    const keyLink = PROVIDER_KEY_LINKS[p.kind];
    const free = FREE_PROVIDER_KINDS.has(p.kind);
    return `
    <div class="settings-provider-row ${p.active ? 'active' : ''}">
      <div class="flex items-center justify-between" style="flex-wrap:wrap;gap:8px;">
        <div>
          <div style="font-weight:800;font-size:13.5px;">${escapeHtml(p.name)}</div>
          <div class="flex gap-6 mt-8" style="flex-wrap:wrap;">
            <span class="tag tag-grigio">${s.kinds[p.kind] || p.kind}</span>
            ${p.config?.model ? `<span class="tag tag-sabbia">${escapeHtml(p.config.model)}</span>` : ''}
            <span class="tag ${free ? 'tag-maker' : 'tag-athlete'}">${free ? 'Gratis' : 'A pagamento'}</span>
            ${p.active ? `<span class="tag tag-maker">${icon('check','icon-sm')} Attivo</span>` : ''}
            ${p.kind !== 'manual' ? (p.config?.api_key ? `<span class="tag tag-maker">${icon('key','icon-sm')} Chiave impostata</span>` : `<span class="tag tag-life">Chiave mancante</span>`) : ''}
          </div>
          ${keyLink ? `<a class="text-xs" href="${keyLink.url}" target="_blank" rel="noopener">${keyLink.label} ${icon('external-link','icon-sm')}</a>` : ''}
        </div>
        <div class="flex gap-6" style="flex-direction:column;">
          ${!p.active ? `<button class="btn btn-g btn-sm" onclick="activateSettingsProvider('${key}','${p.id}')">Attiva</button>` : ''}
          <button class="btn btn-gh btn-sm" onclick="editSettingsProvider('${key}','${p.id}')">Modifica</button>
          <button class="btn btn-gh btn-sm" onclick="deleteSettingsProviderRow('${key}','${p.id}')">Elimina</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function fillSettingsKindSelect(target){
  document.getElementById('sf_kind').innerHTML = Object.entries(SETTINGS_SECTIONS[target].kinds).map(([k,l]) => `<option value="${k}">${l}</option>`).join('');
}

function updateSettingsKeyLink(){
  const link = PROVIDER_KEY_LINKS[document.getElementById('sf_kind').value];
  document.getElementById('sf_key_link').innerHTML = link ? `<a href="${link.url}" target="_blank" rel="noopener">${link.label} ${icon('external-link','icon-sm')}</a>` : '';
}
document.getElementById('sf_kind')?.addEventListener('change', updateSettingsKeyLink);

function openSettingsProviderForm(target){
  document.getElementById('settingsProvForm').reset();
  document.getElementById('sf_target').value = target;
  document.getElementById('sf_editId').value = '';
  document.getElementById('settingsProvTitle').textContent = 'Nuovo provider';
  fillSettingsKindSelect(target);
  updateSettingsKeyLink();
  openOverlay('settingsProvOverlay');
}

function editSettingsProvider(key, id){
  const p = MODEL_PICKERS[key].list().find(x => x.id === id);
  if (!p) return;
  document.getElementById('sf_target').value = key;
  fillSettingsKindSelect(key);
  document.getElementById('sf_editId').value = id;
  document.getElementById('sf_name').value = p.name;
  document.getElementById('sf_kind').value = p.kind;
  document.getElementById('sf_model').value = p.config?.model || '';
  document.getElementById('sf_api_key').value = p.config?.api_key || '';
  document.getElementById('sf_secret').value = p.config?.secret_name || '';
  document.getElementById('sf_extra').value = p.config?.extra_params ? JSON.stringify(p.config.extra_params) : '';
  document.getElementById('settingsProvTitle').textContent = 'Modifica provider';
  updateSettingsKeyLink();
  openOverlay('settingsProvOverlay');
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('settingsProvForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const target = document.getElementById('sf_target').value;
    const editId = document.getElementById('sf_editId').value;
    const table = MODEL_PICKERS[target].table;
    let extra = {};
    const raw = document.getElementById('sf_extra').value.trim();
    if (raw) { try { extra = JSON.parse(raw); } catch { toast('JSON parametri extra non valido', 'err'); return; } }
    const payload = {
      name: document.getElementById('sf_name').value.trim(),
      kind: document.getElementById('sf_kind').value,
      config: {
        model: document.getElementById('sf_model').value.trim() || undefined,
        api_key: document.getElementById('sf_api_key').value.trim() || undefined,
        secret_name: document.getElementById('sf_secret').value.trim() || undefined,
        extra_params: Object.keys(extra).length ? extra : undefined,
      },
    };
    try {
      if (editId) await sbUpdate(table, `id=eq.${editId}`, payload);
      else await sbInsert(table, { ...payload, active: false }, { returnRow: false });
      closeOverlay('settingsProvOverlay');
      await MODEL_PICKERS[target].reload();
      renderSettingsSection(target);
      toast('Provider salvato', 'ok');
    } catch(err){ toast('Errore: ' + err.message, 'err'); }
  });
});

async function activateSettingsProvider(key, id){
  await selectModel(key, id);
  renderSettingsSection(key);
}

async function deleteSettingsProviderRow(key, id){
  if (!confirm('Eliminare questo provider?')) return;
  try {
    await sbDelete(MODEL_PICKERS[key].table, `id=eq.${id}`);
    await MODEL_PICKERS[key].reload();
    renderSettingsSection(key);
  } catch(e){ toast('Errore: ' + e.message, 'err'); }
}

// ── NOTIFICHE (placeholder: salviamo la preferenza, l'invio arriva più avanti) ──
const NOTIF_EVENTS = [
  { key: 'proposal_ready', label: 'Nuova proposta generata' },
  { key: 'proposal_approved', label: 'Proposta approvata' },
  { key: 'unlock_requested', label: 'Richiesta di sblocco/pagamento' },
  { key: 'capture_done', label: 'Raccolta frame completata' },
];

function renderNotifPrefs(){
  const el = document.getElementById('notifPrefsList');
  if (!el) return;
  const prefs = CLIENT.notification_prefs || {};
  el.innerHTML = NOTIF_EVENTS.map(ev => `
    <label class="flex items-center gap-8 mb-8" style="cursor:pointer;">
      <input type="checkbox" id="notif_${ev.key}" ${prefs[ev.key] ? 'checked' : ''}>
      <span class="text-sm">${ev.label}</span>
    </label>
  `).join('');
}

async function saveNotificationPrefs(){
  const prefs = {};
  NOTIF_EVENTS.forEach(ev => { prefs[ev.key] = document.getElementById(`notif_${ev.key}`).checked; });
  try {
    CLIENT = (await sbUpdate('thumb_clients', `id=eq.${CLIENT_ID}`, { notification_prefs: prefs }))[0];
    toast('Preferenze salvate (invio non ancora attivo)', 'ok');
  } catch(e){ toast('Errore: ' + e.message, 'err'); }
}

// ── DATI SENSIBILI (email/password account, via Supabase Auth) ──
async function changePassword(){
  const p1 = document.getElementById('sec_pass1').value;
  const p2 = document.getElementById('sec_pass2').value;
  if (!p1 || p1.length < 6) { toast('La password deve avere almeno 6 caratteri', 'err'); return; }
  if (p1 !== p2) { toast('Le due password non coincidono', 'err'); return; }
  try {
    const res = await fetch(`${SUPA_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: { apikey: SUPA_KEY, Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: p1 }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).msg || 'Errore aggiornamento password');
    document.getElementById('sec_pass1').value = '';
    document.getElementById('sec_pass2').value = '';
    toast('Password aggiornata', 'ok');
  } catch(e){ toast('Errore: ' + e.message, 'err'); }
}

init();
