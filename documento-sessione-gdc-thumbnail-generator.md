# Documento di Sessione — GDC Thumbnail Generator

**Versione:** 8
**Ultimo aggiornamento:** [2026-09-09 00:45]

## Vision

Tool di generazione miniature YouTube con coerenza del volto, per creator/clienti
di GDC — **completamente separato** dalla webapp GDC-DASHBOARD esistente
(repo GitHub separata `GDC-thumbnail-generator`, progetto Supabase dedicato
`mjcnvpwjvwrucwjptgiu`, nessun dato/tabella/utente in comune). La webapp
GDC-DASHBOARD non va mai toccata da questo progetto; un eventuale tool di
amministrazione/monitoraggio verrà aggiunto lì, ma solo più avanti e
separatamente.

Modello di prodotto: una **piattaforma** (nello spirito di Higgsfield) in cui
ogni fase — analisi script, generazione immagine, modifica immagine — ha
motori AI intercambiabili con un solo click, senza mai toccare il codice.
Di default tutto è **gratuito** (Hugging Face), ma ogni cliente può portare
le proprie chiavi API di provider a pagamento (Anthropic, OpenAI, Google
Gemini, fal.ai, Replicate) e cambiarle in ogni momento — fal.ai e Replicate
fungono già da gateway pressoché universali verso decine di altri modelli
tramite il campo "Modello" a testo libero, senza bisogno di aggiungere un
motore dedicato per ognuno. Il ricavo di GDC non viene dal possesso dei
modelli, ma dallo **sblocco a pagamento della filigrana** sulle miniature
finali (prezzo legato a dimensione canale/difficoltà, da definire — il
meccanismo di sblocco esiste già, il pagamento reale è futuro).

L'app è pensata come un vero prodotto per clienti, non un pannello interno:
prima interazione = creazione/rivendicazione del proprio profilo
(onboarding), poi un'area di lavoro personale con percorso a step verticali
per la creazione di una miniatura, una tab Profilo con Kit permanente
(immagini/documenti/note di stile riusabili su ogni miniatura futura, non
legati a un singolo video) e una tab Impostazioni con motori AI centralizzati,
notifiche e dati sensibili account. Esiste inoltre un Pannello Master
separato dove GDC vede tutto (clienti, video, proposte, sblocchi) — senza
ancora isolamento/privacy tra clienti, consapevolmente rimandato a quando il
tool sarà aperto a più utenti reali.

**Correzione di rotta importante (8 set 2026):** il video che si sta
"miniaturizzando" di solito **non esiste ancora su YouTube** — quindi
l'analisi diretta di un URL YouTube non può far parte del percorso critico
per creare una miniatura. Il flusso principale resta "prompt-first": scaletta
o idea del video nuovo (testo, incollato a mano) → analisi → prompt →
generazione, usando le foto già raccolte in Kit/Galleria come riferimento
volto. L'analisi diretta di un video *già pubblicato* (via URL, solo Google
Gemini è in grado di "guardarlo") è un arricchimento **opzionale e
occasionale** della base di conoscenza del canale (stile, tono, palette),
non qualcosa da rifare ad ogni miniatura.

Obiettivo finale di UX (non ancora costruito): un solo pulsante di avvio che,
una volta impostati i motori preferiti, porta automaticamente fino alla
generazione della miniatura; dopo l'anteprima, l'utente può intervenire in
modo mirato in ogni sezione per correggere.

## Pipeline

### Step 1 — Onboarding & Autenticazione

**Stato:** completato

**Obiettivo:** una landing page pubblica di presentazione con login/signup
integrati come unico punto di ingresso, poi creazione o rivendicazione di
un profilo cliente e redirect automatico alla propria area di lavoro (o al
Pannello Master, se l'account è quello del titolare).

**Decisioni progettuali:** self-signup lasciato aperto a chiunque abbia il
link — non più un problema di isolamento dati (risolto l'8 settembre con
la RLS reale, vedi Step 8), resta solo una scelta di prodotto per ora
(chiunque può crearsi un profilo cliente). **[8-9 set 2026, notte]**
`index.html` non è più un redirect immediato ma la landing page vera e
propria: header, hero con il pitch del prodotto e i punti chiave, e la
card di login/registrazione posizionata in alto nella hero (non in una
pagina separata). `login.html` è stato eliminato — la sua logica è
confluita in `index.html`, che resta l'unico ingresso sia per il titolare
sia per i clienti (il redirect post-login a `onboarding.html`/
`clients.html` distingue i due casi).

**Criterio di completamento:** login/signup operativi dalla landing page,
`onboarding.html` individua un profilo esistente per l'utente o ne
propone la creazione/rivendicazione, redirect a `client.html?id=…`
(cliente) o `clients.html` (Master) funzionante.

**Note (cronologia dello step):**
- [2026-09-05] Creato `login.html` (login/signup), redirect iniziale a `clients.html`.
- [2026-09-07] Creato `onboarding.html` (crea/rivendica profilo via `owner_user_id`); redirect da login/index cambiato da `clients.html` a `onboarding.html`.
- [2026-09-08, notte] `index.html` diventa una vera landing page (presentazione + login/signup integrati in alto); `login.html` eliminato, logica confluita in `index.html`. Eliminato anche il profilo di prova "Giuseppe Castagna" per lasciare il tool pulito prima di un test reale.

### Step 2 — Schema dati & Storage (Supabase dedicato)

**Stato:** completato, con correzioni successive

**Obiettivo:** progetto Supabase separato dalla webapp GDC principale, con
tutte le tabelle, RLS e bucket storage necessari.

**Decisioni progettuali:** RLS con policy permissive `to authenticated
using(true)` — la sicurezza è demandata all'autenticazione, non a un
isolamento per utente (coerente con la fase attuale mono-tenant).

**Criterio di completamento:** ogni nuova funzionalità ha lo schema
corrispondente applicato sul progetto live, verificato via query diretta.

**Note (cronologia dello step):**
- [2026-09-05] Creato progetto Supabase dedicato `mjcnvpwjvwrucwjptgiu`; migrazione 0001 iniziale (clienti, video, galleria, script, provider immagine/testo, job, proposte, capture job, impostazioni piattaforma).
- [2026-09-07] Migrazione 0002 (`owner_user_id` su clienti + tabella `thumb_client_assets` per il Kit).
- [2026-09-07] Migrazione 0003 (`thumb_edit_providers` + `notification_prefs` su clienti).
- [2026-09-07] Migrazione 0004 — **bug**: indice unique su `thumb_videos(client_id, youtube_video_id)` mancante/parziale (vedi bug in Step 9), corretto in due passaggi.
- [2026-09-07] Migrazione 0005 (kind `openai` ammesso su provider immagine/modifica).

### Step 3 — Motori AI pluggable (analisi script, generazione immagine, modifica immagine)

**Stato:** in corso (nucleo completo, ampliabile in ogni momento)

**Obiettivo:** ogni categoria ha provider intercambiabili con chiave API
incollabile in-app, gratuiti di default, senza mai richiedere modifiche di
codice per cambiare motore.

**Decisioni progettuali:** Hugging Face gratuito come motore attivo di
default in tutte e 3 le categorie. Aggiunti Google Gemini (unico capace di
analizzare un video direttamente da URL YouTube) e OpenAI (`gpt-image-1`,
generazione/modifica dirette) su richiesta esplicita dell'utente. fal.ai e
Replicate coprono già di fatto "tutte le altre IA" tramite il campo
"Modello" a testo libero — non serve un motore dedicato per ogni brand.
Midjourney non ha un'API pubblica: non integrabile in alcun modo.

**Criterio di completamento:** per ogni categoria, almeno un motore
gratuito funzionante end-to-end più la possibilità di aggiungerne altri
dall'interfaccia (Impostazioni), senza deploy.

**Note (cronologia dello step):**
- [2026-09-05] Edge function `analyze-script` (Hugging Face) e `generate-thumbnail` (Hugging Face/fal/Replicate/manuale) create e deployate.
- [2026-09-05] `providers.html` con gestione chiavi API in-app e link diretti alle pagine di creazione chiave per provider.
- [2026-09-05/06] Switch endpoint Hugging Face deprecato (`api-inference` → `router.huggingface.co`); fix modello analisi testo instradato erroneamente su provider a pagamento (pin esplicito `:hf-inference`).
- [2026-09-07] Nuova edge function `edit-image` + tabella `thumb_edit_providers` (modifica immagine via istruzione testuale, HF gratuito di default).
- [2026-09-07] Selettore modello inline (pulsante + tendina, icona 🆓/💰) in ogni step, al posto del solo link a `providers.html`.
- [2026-09-07] Aggiunti Google Gemini (analisi/video, tier gratuito) e OpenAI (`gpt-image-1`, generazione e modifica dirette) come nuovi motori; dropdown "Tipo", link chiave API e icone gratis/pagamento aggiornati ovunque.

### Step 4 — Area di lavoro cliente (stepper verticale)

**Stato:** completato, poi corretto concettualmente

**Obiettivo:** percorso a step verticali (Canale & Video → Galleria volto →
Script & Analisi → Genera proposte → Editor → Anteprima & Sblocco), con
apertura automatica dello step corrispondente ai dati reali già presenti.

**Decisioni progettuali:** Script & Analisi lavora **solo su testo
incollato** — il video nuovo non è ancora su YouTube, quindi non ha senso
un URL da analizzare in questo step (vedi Step 6 per l'analisi da URL,
spostata nel Kit). L'editor compone la miniatura su canvas 1280×720 con
livelli (testo, forme, freccia, logo). **Formato di generazione (8 set
2026):** lo step Genera non è più vincolato al 16:9 YouTube — preset
piattaforma selezionabili con pulsanti (etichette testuali, mai loghi
social veri) per YouTube 1280×720, Shorts/TikTok/Reels 1080×1920,
Instagram post 1080×1350, Facebook/LinkedIn 1200×630, Pinterest
1000×1500; ogni motore AI riceve width/height reali e li traduce nel
proprio formato.

**Criterio di completamento:** dal video selezionato si arriva a una
proposta salvata in `thumb_proposals`, passando per tutti gli step
intermedi senza vicoli ciechi.

**Note (cronologia dello step):**
- [2026-09-07] Costruito lo stepper verticale (accordion a step singolo), sostituendo il precedente layout a tab piatto.
- [2026-09-07] Aggiunta card "Dal tuo kit permanente" nello step Galleria volto: riuso con un tocco delle foto già presenti nel Kit, senza ricaricarle.
- [2026-09-07] Aggiunto pulsante "✏️ Modifica con AI" su ogni foto di galleria/kit: overlay con istruzione testuale, motore di modifica selezionabile, risultato sostituibile o salvabile come nuova immagine.
- [2026-09-08] **Decisione:** rimossa dallo step Script la possibilità di analizzare un URL YouTube al posto dello script — capacità spostata nel Kit permanente (Step 6). Vedi "Decisioni prese" della sessione dell'8 settembre.
- [2026-09-08 22:20] Aggiunti preset formato/piattaforma nello step Genera, e corretto un bug per cui 3 motori su 4 ignoravano il formato scelto. Vedi Storico sessioni.

### Step 5 — Filigrana & sblocco a pagamento

**Stato:** completato (meccanismo); pagamento reale non implementato

**Obiettivo:** ogni proposta finale ha una filigrana (logo o testo GDC)
finché non viene "sbloccata"; il file salvato dall'Editor resta sempre
pulito, la filigrana è applicata solo lato client in anteprima/download.

**Decisioni progettuali:** sblocco attualmente manuale/placeholder (nessun
pagamento reale collegato) — il collegamento a un sistema di pagamento vero
è esplicitamente rimandato a più avanti. **Modello di monetizzazione scelto
(8 set 2026):** Modello A (sblocco a pagamento, BYOK) con un'aggiunta — un
tetto di generazioni AI gratuite al mese, ampliabile con un abbonamento.
Non sostituisce lo sblocco, lo affianca. Prezzi indicativi da validare con
dati reali: 30 generazioni/mese gratuite; abbonamento "Creator" €9,90/mese
per generazioni ampliate (~150/mese) + 2 sblocchi inclusi; sblocco singolo
€4 (scontato a €3 per gli abbonati). Vedi Storico sessioni per il
ragionamento e le fonti di mercato.

**Criterio di completamento:** collegamento reale a un provider di
pagamento; per ora resta manuale. Il tetto di generazioni/mese e
l'abbonamento "Creator" non sono ancora implementati (solo decisi).

**Note (cronologia dello step):**
- [prima della sessione corrente] Meccanismo di filigrana e flag `unlocked` su `thumb_proposals` costruiti nelle fasi iniziali del progetto — non modificati in questa sessione.
- [2026-09-08] Scelto il modello di monetizzazione: sblocco a pagamento + tetto di generazioni mensili ampliabile via abbonamento (non ancora implementato in codice).

### Step 6 — Profilo cliente & Kit permanente

**Stato:** completato

**Obiettivo:** dati anagrafici del profilo modificabili, Kit di
immagini/documenti/note riusabili su ogni miniatura futura, più
un'azione opzionale per arricchire il Kit dallo stile del canale.

**Decisioni progettuali:** l'analisi di un video già pubblicato (via
Google Gemini) vive qui, non nello step Script — è un arricchimento
occasionale della base di conoscenza del canale (tono, mood, palette),
salvabile come nota di stile nel Kit, non un passaggio per ogni nuova
miniatura.

**Criterio di completamento:** Kit e profilo persistono tra una sessione e
l'altra, sono visibili/modificabili dalla tab Profilo, e le foto del Kit
sono richiamabili dalla Galleria volto di ogni video.

**Note (cronologia dello step):**
- [2026-09-07] Creata tab Profilo con form dati cliente + sezione Kit permanente (foto, documenti, note di stile).
- [2026-09-08] Aggiunta card "🧠 Impara dallo stile del canale": incolli l'URL di un video già pubblicato, Gemini lo analizza (tema, tono, mood visivo, palette, parole chiave), il risultato è salvabile con un tap come nota di stile nel Kit.

### Step 7 — Impostazioni (motori AI centralizzati, notifiche, dati sensibili)

**Stato:** completato (base)

**Obiettivo:** gestione di tutti i motori AI (analisi/generazione/modifica)
in un solo posto, sincronizzata con i selettori rapidi negli step;
preferenze di notifica salvabili da subito; gestione email/password
dell'account.

**Decisioni progettuali:** le notifiche sono solo storage/preferenze per
ora — l'invio effettivo (email/push) è esplicitamente rimandato a più
avanti, comunicato chiaramente in UI.

**Criterio di completamento:** attivare/modificare un motore da
Impostazioni si riflette immediatamente nei selettori rapidi degli step, e
viceversa (stesse tabelle DB condivise).

**Note (cronologia dello step):**
- [2026-09-07] Creata tab Impostazioni con CRUD completo dei 3 tipi di provider, card Notifiche (placeholder) e card Dati sensibili (email + cambio password via Supabase Auth).

### Step 8 — Pannello Master

**Stato:** completato — isolamento reale introdotto l'8 settembre (sera)

**Obiettivo:** vista di controllo su tutti i profili — riservata al
titolare, senza accesso allo spazio di lavoro dei singoli clienti.

**Decisioni progettuali:** **[8 set 2026, sera] Supera la decisione del:
7-8 set 2026 (stato "nessun filtro privacy ancora")** — l'utente ha
notato che il pannello Master era raggiungibile da un link visibile nelle
pagine cliente. Controllando il codice è emerso un problema più a monte:
tutte le tabelle avevano RLS `for all to authenticated using (true)`,
quindi qualsiasi account cliente poteva leggere/scrivere i dati di TUTTI
gli altri clienti chiamando direttamente le API Supabase, a prescindere
dai link mostrati in interfaccia. Proposte due opzioni (solo fix UI, o
fix UI + isolamento reale nel database) — l'utente ha scelto la seconda.
Implementato: `is_master()` (funzione Postgres, email fissa dell'account
titolare) vede/gestisce tutto; un cliente vede/scrive solo le righe
collegate al proprio `owner_user_id`, sia sulle tabelle (`thumb_clients`
e le 7 tabelle figlie via `client_id`) sia sui file dello storage bucket
`thumb-assets` (path `clients/<client_id>/...`). Le tabelle di
configurazione motori AI globali (`thumb_image_providers`,
`thumb_text_providers`, `thumb_edit_providers`, `thumb_app_settings`)
restano permissive per ora — sono condivise da tutti i clienti così come
strutturato oggi il tool (nessun motore ancora "per cliente"); vanno
riviste quando si lavorerà sulla webapp clienti. Lato frontend: nessun
link "Master" più visibile nelle pagine cliente (rimosso del tutto, non
solo nascosto); l'account Master viene reindirizzato automaticamente a
`clients.html` dopo il login (rilevato via email fissa), invece di
vedere un link cliccabile.

Anche la UX del pannello è cambiata: cliccare un profilo cliente non
apre più il suo spazio di lavoro (`client.html?id=...`) ma un prospetto
di sola lettura — profilo salvato (canale, nicchia, tono, logo, colori
brand, note), contatori di attività, kit permanente — su richiesta
esplicita dell'utente ("non mi interessa accedere al suo profilo per
lavorare sui suoi lavori"). "Modifica profilo" resta disponibile ma solo
per i campi anagrafici, tramite la sheet di modifica già esistente.

**Criterio di completamento:** isolamento dati verificato con un vero
account cliente non-Master (non ancora testato con un secondo account
reale — solo verificato a livello di policy SQL); motori AI ancora da
rendere per-cliente in un secondo momento.

**Note (cronologia dello step):**
- [2026-09-07] Rietichettato `clients.html` come "Pannello Master"; aggiunta colonna sblocchi alle statistiche e badge "Assegnato/Non assegnato" per profilo.
- [2026-09-08] Aggiunto pulsante "← Indietro" nella topbar (mancava una navigazione comoda, c'era solo "Esci").
- [2026-09-08, sera] Isolamento reale Master/cliente (RLS + storage) via migrazione `0006_master_rls.sql`; rimossi i link "Master" dalle pagine cliente; pannello Master ridisegnato con prospetto di sola lettura per profilo invece di accesso diretto allo spazio di lavoro; aggiunta card "Motori AI attivi oggi" (configurazione globale, non ancora per-cliente); inserito il logo reale GDC (`assets/logo-gdc.svg`, fornito dall'utente) al posto del monogramma placeholder nelle pagine Master/onboarding/login.

### Step 9 — Raccolta automatica frame volto (yt-dlp/ffmpeg/OpenCV via GitHub Action)

**Stato:** bloccato — limite esterno noto

**Obiettivo:** estrarre automaticamente fotogrammi con volto dai video già
pubblicati del canale, come alternativa/complemento al caricamento manuale
nella Galleria volto.

**Decisioni progettuali:** **retrocesso a strumento secondario** (8
settembre): serve a costruire la banca-volti da video passati, non è parte
del percorso critico per pubblicare una nuova miniatura (che di solito non
è ancora online). Non verrà investito altro tempo di debug su questo se
non richiesto esplicitamente.

**Criterio di completamento:** una run della GitHub Action completa un job
"in coda" scaricando almeno un video reale e produce fotogrammi candidati
in `thumb_gallery_images` con `source='auto'`.

**Note (cronologia dello step):**
- [2026-09-07] **Bug 1 — job restano "in coda" indefinitamente.** Sintomo: ogni run del workflow falliva in meno di un secondo (`MissingSchema`). Causa: i secret `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` non erano mai stati impostati su GitHub per il progetto Supabase dedicato. Fix: l'utente ha aggiunto i secret dal pannello GitHub → confermato.
- [2026-09-07] **Bug 2 — job falliscono in <1s anche con i secret impostati.** Sintomo: `job fallito: Expecting value: line 1 column 1 (char 0)`. Causa: `sb_update()` in `capture_frames.py` chiamava `.json()` sulla risposta di una PATCH senza header `Prefer: return=representation` — PostgREST risponde 204 con corpo vuoto, e il parsing JSON di un corpo vuoto genera esattamente quell'errore. Fix: parse solo se `r.content` è non vuoto → confermato (i job passano allo step successivo).
- [2026-09-07] **Bug 3 — upsert video fallisce con 400 Bad Request.** Sintomo: `on_conflict=client_id,youtube_video_id` restituisce 400 subito dopo il download. Causa: mancava un indice unique corrispondente su `thumb_videos(client_id, youtube_video_id)` — perso nella migrazione al progetto Supabase dedicato. Fix (primo tentativo): creato l'indice con `create unique index if not exists` — **non ha funzionato** perché esisteva già un indice con lo stesso nome ma **parziale** (`WHERE youtube_video_id IS NOT NULL`), quindi l'`IF NOT EXISTS` non ha fatto nulla; PostgREST non può usare un indice parziale come target di `ON CONFLICT`. Fix (secondo tentativo): eliminato e ricreato come indice pieno + `notify pgrst, 'reload schema'` → confermato (upsert funzionante).
- [2026-09-07] **Bug 4 — non risolto: YouTube blocca il download.** Sintomo: ogni download `yt-dlp` fallisce con `Sign in to confirm you're not a bot`, pur risolvendo correttamente canale (`UCirnRRX1fQkWGjFKUNYNM6g`) e feed RSS (3 video trovati). Causa: blocco anti-bot di YouTube sugli IP dei runner GitHub Actions — non un bug nel nostro codice. Fix applicato: nessuno che funzioni — tentato `--extractor-args youtube:player_client=android` (workaround comunitario noto), **non ha risolto** (stesso errore su tutti i 9 tentativi). Fix rimasto ma non implementato: autenticazione via cookie di una sessione YouTube reale (da esportare dal browser, salvare come secret, rinnovare periodicamente — più fragile e con implicazioni di sicurezza). Deprioritizzato dopo la decisione dell'8 settembre: il caricamento manuale in Kit/Galleria resta la via consigliata.

## Storico sessioni

### [2026-09-09 00:45] Rinomina prodotto in "Thumbnail Generator", rifinitura landing page

**Riepilogo:** Primo giro di feedback dell'utente sulla landing page appena costruita: rinominare il prodotto da "Thumbnail Studio" a "Thumbnail Generator", ingrandire il logo, invertire la gerarchia delle azioni nella card di accesso (Crea account come CTA dominante, non Accedi) e curare meglio spazi/gerarchia visiva.

**Cosa è stato fatto:**
- Rinominato "GDC Thumbnail Studio" → "GDC Thumbnail Generator" in tutti i punti visibili: titoli pagina, topbar, footer della landing, placeholder del testo filigrana in `providers.html`, valore di default e riga già salvata in `thumb_app_settings.watermark_text` sul progetto Supabase, `README.md`, commenti di intestazione in `app.js`/`client-page.js`. Rinominato anche questo documento di sessione (file e titolo).
- Logo (`.brand-logo`, condiviso) ingrandito da 24px a 30px di altezza — l'utente lo trovava poco leggibile alla dimensione precedente.
- `index.html`: la card di accesso ora parte in modalità "Crea account" invece di "Accedi" (di default, non al click) — motivazione esplicita dell'utente: "idealmente tutti saranno al primo accesso". Pulsante ingrandito con una nuova classe riutilizzabile `.btn-lg`; card con bordo/ombra per distinguerla come azione principale della pagina. La sezione "Come funziona" sotto è stata appiattita (card senza bordo, icone più tenui) per arretrare visivamente rispetto alla card di accesso — non più due blocchi di pari peso.
- Spaziature della landing rifinite (hero, card di accesso, sezione features).

**Decisioni prese:**
- Contesto: quale azione mostrare come principale nella card di accesso.
- Decisione: "Crea account" di default, "Accedi" relegato a link secondario sotto — segue il ragionamento dell'utente che la maggior parte del traffico sarà primo accesso, non utenti di ritorno.

**File consegnati/modificati:**
- `index.html`, `assets/style.css` (`.brand-logo`, nuova `.btn-lg`)
- `client.html`, `clients.html`, `onboarding.html`, `providers.html`, `README.md`, `assets/app.js`, `assets/client-page.js` (rinomina testo)
- Database: `thumb_app_settings.watermark_text` (valore e default di colonna) aggiornato
- `documento-sessione-gdc-thumbnail-studio.md` → rinominato in `documento-sessione-gdc-thumbnail-generator.md`

**Impatto su Vision/Pipeline:** nessuna modifica a Vision/Pipeline — è un affinamento della card di accesso già coperta dallo Step 1, non un nuovo step.

---

### [2026-09-09 00:20] Landing page pubblica su index.html, login unificato, pulizia profilo di prova

**Riepilogo:** L'utente ha notato che non esiste un link separato per la "piattaforma clienti" (è lo stesso login di sempre) e ha chiesto di trasformare `index.html` — prima un semplice redirect — in una vera landing page di presentazione con una sezione di login/registrazione in alto, utilizzabile sia dal titolare che dai clienti. Contestualmente ha chiesto di eliminare il profilo di prova "Giuseppe Castagna" per iniziare un test pulito con una sua mail secondaria.

**Cosa è stato fatto:**
- `index.html` riscritto da zero: header con logo, hero con pitch del prodotto ("Miniature YouTube coerenti con il tuo volto, generate con l'AI") e 4 punti chiave, card di login/registrazione posizionata in alto nella hero (non su una pagina a parte), sezione "Come funziona" con le 6 fasi reali del workflow (Galleria volto, Script & Analisi, Genera proposte, Editor, Sblocco trasparente, Motori a scelta).
- `login.html` eliminato: la sua logica (login/signup via Supabase Auth, toggle tra le due modalità) è confluita in `index.html`, che ora è l'unico punto di ingresso per titolare e clienti — dopo il login il redirect a `onboarding.html` (che già distingue Master da cliente) resta invariato.
- Aggiornati tutti i riferimenti a `login.html` in `assets/app.js` (`requireAuth()`, `sessionExpired()`, `logout()`) verso `index.html`; aggiornato `README.md`.
- Eliminato il profilo di prova "Giuseppe Castagna" da `thumb_clients` (cascata su 5 video, 1 script, 4 capture job collegati — nessun file nello storage bucket era presente per questo profilo, verificato prima di procedere). Il tool risulta ora senza alcun cliente, pronto per un test pulito.

**Decisioni prese:**
- Contesto: dove posizionare login/registrazione sulla nuova landing page.
- Decisione: card di accesso "in alto", dentro la hero stessa, non dietro un click — così chi arriva sul link può accedere o registrarsi subito, vedendo comunque la presentazione del prodotto.
- Contesto: se mantenere `login.html` come pagina separata o unificarla.
- Decisione: eliminarla ed unificare tutto in `index.html`, un solo punto di ingresso invece di due pagine con logica quasi identica.

**File consegnati/modificati:**
- `index.html` (riscritto)
- `login.html` (eliminato)
- `assets/app.js` (redirect da 'login.html' a 'index.html')
- `README.md` (struttura pagine aggiornata)
- Database: eliminato il profilo di prova "Giuseppe Castagna" e le righe collegate

**Impatto su Vision/Pipeline:** aggiornato lo Step 1 (Onboarding & Autenticazione) — vedi Pipeline per il dettaglio completo.

---

### [2026-09-08 23:45] Tab "Guida modelli" con ricerca sui motori collegabili

**Riepilogo:** Aggiunta in `client.html` una tab "Guida modelli", raggiungibile da icone info (tooltip al passaggio del mouse) vicino ai tre selettori di motore, con schede sui modelli disponibili per ciascun task (generazione immagine, analisi script, modifica immagine), basate su ricerche web aggiornate a settembre 2026.

**Cosa è stato fatto:**
- Nuova tab "Guida modelli" (icone info → `goToGuide('text'|'image'|'edit')` → apre la tab e scorre alla sezione giusta).
- Ricerca web mirata sui modelli effettivamente collegabili nei 3 kind di provider di questo tool (non modelli generici): per l'immagine, confronto identity-preservation tra PuLID (94-96%), InstantID (88-92%, già default fal.ai) e i motori senza reference (FLUX.1-schnell su Hugging Face, gpt-image-1 su OpenAI); per il testo, Gemini 2.5/3 Flash (gratuito, unico che legge anche video da URL), Claude Haiku 4.5 (default attuale), GPT-4o mini, Qwen2.5-7B (gratuito HF); per l'editing, FLUX.1 Kontext (default fal.ai, oggi lo standard) vs Instruct-Pix2Pix (HF, gratuito ma modello 2023, superato) vs gpt-image-1.
- **Scoperta rilevante dalla ricerca sul codice** (non solo sui modelli esterni): leggendo `runHuggingFace()` e `runOpenAI()` in `generate-thumbnail.ts` è emerso che questi due motori non inviano mai `reference_image_urls` — generano solo dal prompt testuale, ignorando le foto della Galleria volto. Solo fal.ai (con InstantID/PuLID) e Replicate (se il modello scelto lo supporta) usano davvero la coerenza del volto. Segnalato esplicitamente in guida per ogni motore, non nascosto.
- Aggiunta icona `icon-info` in `assets/icons.svg`; CSS per tooltip a comparsa (`.info-tip`) e per le card modello (`.model-card`, evidenziate con `.rec` per i consigliati) in `client.html`.

**Decisioni prese:**
- Contesto: come segnalare i motori che non usano le foto di riferimento, senza nasconderlo.
- Decisione: nota esplicita "Attenzione" dentro la card di ogni motore che ignora `reference_image_urls`, stesso principio di trasparenza già usato nella tab Prezzi.
- Da rivedere se: quando cambieranno i motori di default configurati (es. se gpt-image-1 verrà sostituito prima del ritiro OpenAI del 23 ottobre 2026), aggiornare anche questa guida.

**File consegnati/modificati:**
- `client.html` (tab Guida modelli, icone info sui 3 step, CSS `.info-tip`/`.model-card`)
- `assets/client-page.js` (funzione `goToGuide()`)
- `assets/icons.svg` (icona `icon-info`)

**Impatto su Vision/Pipeline:** nessuna modifica a Vision. Non ho aggiunto un nuovo step Pipeline dedicato — la guida è parte dello Step 4 (Area di lavoro cliente), stesso principio già usato per il redesign visivo dell'8/9 (non un contenitore per ogni sessione di polish).

---

### [2026-09-08 23:10] Isolamento reale Master/cliente (RLS + storage) e logo reale

**Riepilogo:** L'utente ha notato che il pannello Master era raggiungibile da un link nelle pagine cliente; la ricerca sul codice ha rivelato un problema più ampio (RLS completamente permissiva su tutte le tabelle) risolto con un vero isolamento dei dati, più redesign del pannello Master e inserimento del logo reale fornito dall'utente.

**Cosa è stato fatto:**
- **Bug/gap di sicurezza: accesso dati non isolato tra clienti.** Sintomo: il pulsante "Master" era visibile da `client.html`/`onboarding.html`. Causa: tutte le tabelle avevano RLS `for all to authenticated using (true)` — qualsiasi account cliente poteva leggere/scrivere i dati di TUTTI gli altri clienti chiamando direttamente le API Supabase, a prescindere dai link mostrati. Fix applicato (verificato a livello di policy SQL, non ancora con un secondo account cliente reale): migrazione `0006_master_rls.sql` — funzione `is_master()` (email fissa del titolare) e `owns_client()`; `thumb_clients` e le 7 tabelle figlie ristrette per `owner_user_id`/`client_id`; storage bucket `thumb-assets` ristretto per path `clients/<client_id>/...`. Le tabelle di configurazione motori AI globali restano permissive (non ancora per-cliente, nota lasciata in migrazione).
- Rimossi del tutto i link "Master"/"Pannello Master" da `client.html` e `onboarding.html`; l'account Master viene reindirizzato automaticamente a `clients.html` dopo login (`isMaster()`/`requireMaster()` in `app.js`, email fissa).
- Pannello Master ridisegnato: cliccare un cliente apre un prospetto di sola lettura (profilo, colori, logo, note, contatori attività, kit permanente) invece del suo spazio di lavoro, su richiesta esplicita dell'utente. Aggiunta card "Motori AI attivi oggi" (configurazione globale).
- Inserito il logo reale (`assets/logo-gdc.svg`, caricato dall'utente direttamente sul repo GitHub perché l'upload in chat non funzionava) al posto del monogramma placeholder in Master/Motori AI/onboarding/login.

**Decisioni prese:**
- Contesto: che livello di fix per l'accesso al Master — solo UI o anche database.
- Decisione (scelta dall'utente tra due opzioni proposte): fix UI + isolamento reale nel database.
- Supera la decisione del: 7-8 set 2026 (Step 8 Pipeline, stato "nessun filtro privacy ancora, da rivedere").

**File consegnati/modificati:**
- `supabase/migrations/0006_master_rls.sql` (nuovo, applicato al progetto Supabase)
- `assets/app.js` (`MASTER_EMAIL`, `isMaster()`, `requireMaster()`)
- `client.html`, `onboarding.html`, `providers.html`, `clients.html` (rimozione link, redirect, prospetto cliente, `requireMaster()`)
- `assets/style.css` (`.brand-logo`, utility `.mb-2`/`.mb-12`)
- `assets/logo-gdc.svg` (nuovo, spostato da upload GitHub)

**Impatto su Vision/Pipeline:** aggiornato lo Step 8 (Pannello Master) — vedi Pipeline per il dettaglio completo del cambiamento.

---

### [2026-09-08 22:20] Preset multi-piattaforma per la generazione (YouTube, Shorts, IG, FB/LinkedIn, Pinterest)

**Riepilogo:** Il tool nasce per le miniature YouTube ma il cliente vuole
ampliarlo agli altri formati social. Prima di implementare ho verificato il
codice reale: **il formato scelto in fase di generazione veniva davvero
applicato solo dal provider OpenAI** — Hugging Face, fal.ai e Replicate
ricevevano il prompt ma ignoravano completamente `aspect_ratio`. Corretto
questo insieme all'aggiunta dei preset piattaforma.

**Cosa è stato fatto:**
- `supabase/functions/generate-thumbnail/index.ts` (e il gemello a file
  singolo `supabase/functions-standalone/generate-thumbnail.ts`): aggiunti
  `width`/`height` a `GenerateRequest`. `runHuggingFace` ora passa
  `parameters.width/height`, `runFal` passa `image_size:{width,height}`,
  `runReplicate` passa `width/height` nell'input. `runOpenAI` (che accetta
  solo 3 taglie fisse) usa una nuova funzione `nearestOpenAiSize()` che
  sceglie la taglia più vicina al rapporto larghezza/altezza richiesto
  invece della vecchia mappa fissa su 3 aspect ratio.
- Funzione ridistribuita su Supabase (progetto `mjcnvpwjvwrucwjptgiu`,
  `generate-thumbnail` ora in versione 3).
- `client.html`: il vecchio `<select>` "Formato" (16:9/1:1/4:3) sostituito
  da pulsanti preset piattaforma (`.format-presets`/`.format-preset`) —
  YouTube 1280×720, Shorts/TikTok/Reels 1080×1920, Instagram post
  1080×1350, Facebook/LinkedIn 1200×630, Pinterest 1000×1500. Etichette
  testuali e icone outline generiche, **mai loghi social reali** (stesso
  ragionamento sul rischio marchio già applicato ai loghi provider/GDC).
- Aggiunta icona `icon-smartphone` in `assets/icons.svg` per il preset
  verticale (Shorts/TikTok/Reels/Stories).
- `assets/client-page.js`: nuovo stato `SELECTED_FORMAT` e funzione
  `selectFormatPreset(btn)`; `runGenerate()` ora passa `width`/`height`
  reali (non solo la stringa `aspect_ratio`) all'edge function e li salva
  in `thumb_jobs.input`.

**Decisioni prese:**
- Contesto: come mostrare i preset piattaforma senza rischi di marchio.
- Decisione: pulsanti con etichetta testuale + icona outline generica
  (tv/smartphone/immagine/documento/tag), mai il logo reale del social.
- Contesto: OpenAI gpt-image-1 accetta solo 3 taglie fisse, non può
  generare esattamente 1080×1920 o 1000×1500.
- Decisione: mappare sul rapporto più vicino (landscape/quadrato/verticale)
  invece di bloccare il preset per quel provider — l'immagine generata
  potrebbe avere un rapporto leggermente diverso da quello richiesto se il
  provider attivo è OpenAI; accettabile perché resta comunque nella stessa
  famiglia di orientamento (orizzontale/quadrato/verticale).

**File consegnati/modificati:**
- `supabase/functions/generate-thumbnail/index.ts`
- `supabase/functions-standalone/generate-thumbnail.ts` (ridistribuito su Supabase)
- `client.html` (preset piattaforma al posto del select Formato)
- `assets/client-page.js` (`SELECTED_FORMAT`, `selectFormatPreset()`, `runGenerate()`)
- `assets/icons.svg` (icona `icon-smartphone`)
- `assets/style.css` (`.format-presets`/`.format-preset`)

**Impatto su Vision/Pipeline:** nessuna modifica a Vision (resta valido
"nato per YouTube, pensato per allargarsi"). Aggiornato lo Step 4 (Area di
lavoro cliente) con la nuova capacità di formato; nessun nuovo step
dedicato, perché il preset piattaforma è parte dello stesso step Genera
già esistente.

---

### [2026-09-08 21:40] Redesign visivo: icone, tab Prezzi trasparente, CTA profilo

**Riepilogo:** Prima passata di redesign grafico su tutto il tool — sistema
di icone SVG al posto delle emoji, wordmark provvisorio, nuova tab "Prezzi"
che spiega il modello di monetizzazione senza nasconderlo, e una CTA
visiva che spinge a completare il profilo prima di generare.

**Cosa è stato fatto:**
- Creato `assets/icons.svg`: sprite SVG condiviso con ~28 icone outline monocromatiche (currentColor), più l'helper `icon(name, cls)` in `app.js` per generarle nelle stringhe dinamiche.
- Sostituite tutte le emoji dell'interfaccia (topbar, tab, titoli step, pulsanti, badge, stati vuoti) con le nuove icone, in `client.html`, `clients.html`, `providers.html`, `onboarding.html` e `assets/client-page.js`.
- L'indicatore gratis/pagamento dei motori AI (prima 🆓/💰) è diventato un pallino colorato (`.cost-dot`), coerente con il linguaggio visivo già usato per il `brand-dot`.
- Aggiunto un wordmark provvisorio (`.brand-mark` monogramma + `.brand-word` testo) al posto del semplice pallino+testo — pronto per essere sostituito dal logo reale quando l'utente lo carica (ha il file ma deve essere al PC).
- Nuova tab **Prezzi** in `client.html`: spiega in chiaro le 30 generazioni gratuite/mese, l'abbonamento Creator (9,90€/mese, ~150 generazioni + 2 sblocchi inclusi) e lo sblocco singolo (4€, 3€ da abbonato) — dichiarando esplicitamente cosa è già attivo (il prezzo di sblocco, mostrato anche nel pulsante e nel dialogo di conferma) e cosa non lo è ancora (il tetto mensile, l'abbonamento ricorrente).
- Aggiunta una card di completezza profilo nella tab Crea miniatura: barra di avanzamento + checklist (URL canale, nicchia/tono, logo, almeno una foto nel Kit), con CTA verso il Profilo — si nasconde da sola quando il profilo è completo.

**Decisioni prese:**
- Contesto: il logo GDC reale non era disponibile in questa sessione (l'utente ce l'ha ma deve caricarlo da PC).
- Decisione: usare un wordmark testuale curato come placeholder (monogramma "G" + testo), sostituibile in un secondo momento senza toccare il resto del markup.
- Contesto: come mostrare gratis/pagamento senza emoji.
- Decisione: pallino colorato invece di un'icona a forma libera (es. moneta) — più chiaro perché riusa un linguaggio visivo (il brand-dot) già presente nel tool, invece di richiedere un'interpretazione del pittogramma.
- Da rivedere se: quando l'utente carica il file logo reale, sostituire il contenuto di `.brand-mark` (o passare a un `<img>`) in tutte le pagine che mostrano il brand a livello app (onboarding, Pannello Master, Motori AI).

**File consegnati/modificati:**
- `assets/icons.svg` (nuovo)
- `assets/app.js` (helper `icon()`)
- `assets/style.css` (classi `.icon*`, `.brand-mark`/`.brand-word`, `.cost-dot`, `.empty-icon` aggiornata)
- `client.html` (icone, wordmark, tab Prezzi, card completezza profilo)
- `clients.html`, `providers.html`, `onboarding.html` (icone, wordmark)
- `assets/client-page.js` (icone nelle stringhe dinamiche, `costIcon()` riscritta, `renderProfileCompleteness()`, prezzo reale su pulsante/dialogo di sblocco)

**Impatto su Vision/Pipeline:** nessuna modifica a Vision. La Pipeline non
ha un nuovo step dedicato al design — il lavoro rientra negli step 4
(Area di lavoro), 5 (Filigrana & sblocco, ora con prezzo visibile in UI) e
8 (Pannello Master, wordmark); non ho aggiunto un blocco Pipeline separato
per restare aderente al principio "uno step = un pezzo di funzionalità",
non un contenitore per ogni sessione di polish.

---

### [2026-09-08 20:15] Scelto il modello di monetizzazione: sblocco + tetto generazioni

**Riepilogo:** Dopo aver studiato l'artifact di confronto (sezione "Sblocco o
crediti?"), l'utente ha scelto il Modello A con un'aggiunta — sblocco a
pagamento per miniatura più un tetto di generazioni AI gratuite al mese,
ampliabile con un abbonamento; su richiesta, ricercati prezzi di mercato
comparabili per proporre cifre concrete.

**Cosa è stato fatto:**
- Aggiunto l'header **Versione**/**Ultimo aggiornamento** a questo documento (skill `documento-sessione` aggiornata dall'utente nella stessa sessione).
- Ricerca di mercato su modelli comparabili: tool AI di thumbnail YouTube (Krea $9/mese, Juma $8/mese, Thumbmagic $20-60/mese, vidIQ Boost ~$19/mese, Canva $12,99/mese), tetti di generazione freemium (Leonardo AI: 150 token/giorno gratis ≈ 30-50 immagini/giorno, poi $12/$30/$60 al mese), pacchetti "pay once per asset finito e usabile" (Aragon AI: $35-75 una tantum per 20-100 headshot), pay-per-download stock photo (Shutterstock, poco comparabile: minimo 2 immagini, $29+/immagine, modello pensato per licensing non per creator tool).
- Proposta una struttura di prezzo concreta (vedi Decisioni prese) e registrata come decisione nello Step 5 della Pipeline.

**Decisioni prese:**
- Contesto: l'utente ha studiato l'artifact "Sblocco o crediti?" (voce precedente) e ha scelto una via di mezzo tra Modello A puro e un sistema a crediti completo, chiedendo aiuto sui prezzi.
- Decisione: restare su Modello A (sblocco a pagamento, BYOK, costo AI a carico del cliente) aggiungendo un tetto di generazioni gratuite al mese come leva di upgrade — non per proteggere un costo AI (che con BYOK resta a zero per GDC), ma come meccanica freemium classica e per contenere l'uso dell'infrastruttura condivisa (storage/funzioni Supabase, che scalano con ogni generazione indipendentemente da chi paga il motore AI). Cifre proposte da validare con dati reali: 30 generazioni/mese gratuite; abbonamento "Creator" a €9,90/mese per generazioni ampliate (~150/mese) con 2 sblocchi inclusi; sblocco singolo a €4 (€3 per abbonati). Il prezzo dell'abbonamento è ancorato al basso della fascia di mercato dei tool thumbnail-specifici (Krea $9, Juma $8), giustificabile dalla coerenza volto/stile che i tool generici non offrono; il prezzo di sblocco resta vicino a quanto già simulato nel calcolatore dell'artifact precedente, supportato dal comparabile Aragon (le persone pagano cifre reali, non centesimi, per un asset AI finito e pronto all'uso).
- Alternative scartate: nessun tetto di generazioni (Modello A puro, voce precedente) — scartato dall'utente perché non cattura valore dai clienti che generano molto; sistema a crediti completo (Modello B) — già scartato nell'artifact per il rischio di costo lato GDC.
- Da rivedere se: dopo 4-6 settimane di utilizzo reale (vedi Step 9... cioè sezione "Prossimi passi" dell'artifact), i numeri di generazioni/sblocchi effettivi si discostano molto dalle stime — in quel caso ricalibrare tetto gratuito, prezzo abbonamento e prezzo sblocco prima di implementarli.

**File consegnati/modificati:**
- `documento-sessione-gdc-thumbnail-studio.md` (Versione 1 → 2: header versione aggiunto, Step 5 e questa voce aggiornati)
- `.claude/skills/documento-sessione/SKILL.md` (aggiornata dall'utente con l'header Versione — vedi voce precedente per il commit)

**Impatto su Vision/Pipeline:** Step 5 della Pipeline aggiornato con il
modello di monetizzazione scelto (sblocco + tetto generazioni/abbonamento);
implementazione ancora da fare, resta un `da fare` dentro lo step.

---

### [2026-09-08 19:30] Skill documento-sessione, correzione workflow, prima stesura del documento

**Riepilogo:** Discussa e implementata la correzione concettuale del
workflow (l'analisi da URL YouTube non serve per il video nuovo, solo per
imparare lo stile dal canale), confermato che il fix anti-bot yt-dlp non
ha funzionato, installata la skill `documento-sessione` e creato questo
documento come prima stesura.

**Cosa è stato fatto:**
- Discusso con l'utente il disallineamento tra il flusso "analizza da URL
  YouTube" e la realtà (il video nuovo non è ancora pubblicato); l'utente
  ha confermato la correzione proposta.
- Rimossa la possibilità di analizzare un URL YouTube dallo step Script &
  Analisi (torna puramente testuale, per l'idea/scaletta del video nuovo).
- Aggiunta nella tab Profilo → Kit permanente una nuova card "🧠 Impara
  dallo stile del canale": analizza con Gemini un video già pubblicato ed
  estrae tono/mood/palette/parole chiave, salvabili come nota di stile.
- Confermato via log GitHub Actions che il workaround `player_client=android`
  per il blocco anti-bot di YouTube (vedi Step 9, Bug 4) non ha funzionato:
  errore identico su tutti i tentativi.
- Creato il file `.claude/skills/documento-sessione/SKILL.md` (contenuto
  fornito interamente dall'utente) e questo documento di sessione.

**Decisioni prese:**
- Contesto: il flusso "analizza il video da URL YouTube" era stato appena
  costruito (sessione del 7 settembre) come parte dello step Script, ma
  l'utente ha fatto notare che un video da miniaturizzare di solito non è
  ancora su YouTube.
- Decisione: l'analisi da URL YouTube (solo Gemini) diventa un'azione
  opzionale e occasionale dentro il Kit permanente ("impara dallo stile del
  canale"), non parte del percorso critico per creare una miniatura. Lo
  step Script torna a lavorare solo su testo incollato.
- Alternative scartate: mantenere l'analisi da URL nello step Script con
  fallback automatico quando lo script è vuoto (implementato il 7
  settembre, poi rimosso lo stesso giorno 8 settembre dopo la discussione).
- Da rivedere se: in futuro si vorrà supportare video "programmati"/non
  ancora pubblicati ma già caricati privatamente su YouTube — in quel caso
  l'analisi da URL potrebbe tornare utile anche nel percorso principale.
- Contesto: la raccolta automatica frame resta bloccata dal blocco anti-bot
  di YouTube (Step 9, Bug 4), il fix noto non ha funzionato.
- Decisione: non investire altro tempo di debug su questo per ora, dato che
  è stato riconosciuto come strumento secondario — il caricamento manuale
  resta la via consigliata.
- Da rivedere se: l'utente chiede esplicitamente di riprovare (es. con
  autenticazione via cookie) o se emergono molti clienti con canali attivi
  per cui la raccolta automatica farebbe risparmiare tempo reale.

**File consegnati/modificati:**
- `.claude/skills/documento-sessione/SKILL.md` (nuovo)
- `documento-sessione-gdc-thumbnail-studio.md` (nuovo, questo file)
- `client.html`, `assets/client-page.js` (rimossa analisi da URL dallo step Script, aggiunta card "Impara dallo stile del canale" nel Kit)

**Impatto su Vision/Pipeline:** aggiunta alla Vision la correzione di rotta
sul workflow "prompt-first"; Step 4 e Step 6 della Pipeline aggiornati di
conseguenza; Step 9 aggiornato con il Bug 4 non risolto e la
deprioritizzazione.

---

### [2026-09-07] Sessione principale: editing AI, Kit, Impostazioni, motori Gemini/OpenAI, caccia ai bug della raccolta frame

**Riepilogo:** Giornata più intensa del progetto — costruiti selettore
motore inline, editing immagine con AI, collegamento Kit→Galleria, tab
Impostazioni completa, navigazione "indietro"; risolti in sequenza tre bug
distinti della raccolta automatica frame (secret mancanti, parsing JSON su
risposta vuota, indice unique mancante/parziale) fino a un quarto bug
esterno (blocco anti-bot YouTube) non risolvibile lato codice; integrati
Google Gemini e OpenAI come nuovi motori AI su richiesta esplicita
dell'utente, con Gemini capace di analizzare un video direttamente da URL.

**Cosa è stato fatto:**
- Verificata la protezione della pagina di login (stessa logica della
  webapp GDC principale: auth + RLS, self-signup lasciato aperto
  temporaneamente su richiesta dell'utente).
- Aggiunto un selettore modello inline (pulsante + tendina, icona 🆓/💰)
  in ogni step, al posto del solo link a `providers.html`.
- Aggiunta una nuova categoria di provider "modifica immagine"
  (`thumb_edit_providers`, edge function `edit-image`), con pulsante
  "✏️ Modifica con AI" su ogni foto di galleria/kit (overlay: istruzione
  testuale, motore selezionabile, sostituisci o salva come nuova).
- Aggiunto il collegamento Kit permanente → Galleria volto (riuso con un
  tocco delle foto già caricate nel Kit).
- Creata la tab Impostazioni: gestione centralizzata dei 3 tipi di motore
  AI (sincronizzata con i selettori rapidi), preferenze di notifica
  (placeholder, invio non ancora attivo), cambio email/password account.
- Aggiunto un pulsante "← Indietro" nella topbar di `client.html`,
  `clients.html` e `providers.html` (mancava, c'era solo "Esci"); il link
  "Gestisci provider" nel selettore modello ora passa alla tab
  Impostazioni sulla stessa pagina invece di navigare altrove.

- **Bug: raccolta frame — job restano "in coda" indefinitamente**
  **Sintomo:** ogni run del workflow GitHub Actions falliva in <1s con `MissingSchema`.
  **Causa:** i secret `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` non erano mai stati impostati su GitHub per il progetto Supabase dedicato.
  **Fix applicato:** l'utente ha aggiunto i secret dal pannello GitHub — verificato con una run manuale.

- **Bug: raccolta frame — fallisce ancora in <1s dopo il fix dei secret**
  **Sintomo:** `job fallito: Expecting value: line 1 column 1 (char 0)`.
  **Causa:** `sb_update()` in `capture_frames.py` chiamava `.json()` su una risposta PostgREST 204 senza corpo (mancava `Prefer: return=representation`).
  **Fix applicato:** parse solo se `r.content` non è vuoto — verificato (i job avanzano allo step successivo).

- **Bug: raccolta frame — upsert video fallisce con 400 Bad Request**
  **Sintomo:** `on_conflict=client_id,youtube_video_id` → 400 subito dopo il download.
  **Causa:** indice unique mancante su `thumb_videos(client_id, youtube_video_id)`, perso nella migrazione al progetto Supabase dedicato.
  **Fix applicato:** primo tentativo (`create unique index if not exists`) fallito silenziosamente perché un indice con lo stesso nome esisteva già ma **parziale** (`WHERE youtube_video_id IS NOT NULL`), non utilizzabile da PostgREST come target di `ON CONFLICT`; secondo tentativo (drop + ricrea pieno + `notify pgrst reload schema`) verificato funzionante.

- **Bug: raccolta frame — YouTube blocca ogni download (non risolto)**
  **Sintomo:** `yt-dlp` fallisce ogni video con `Sign in to confirm you're not a bot`, pur risolvendo correttamente canale e feed RSS (3 video trovati).
  **Causa:** blocco anti-bot di YouTube sugli IP dei runner GitHub Actions — non un problema del nostro codice.
  **Fix applicato:** nessuno funzionante — tentato `--extractor-args youtube:player_client=android` (workaround comunitario noto), stesso errore su tutti i 9 tentativi. Vedi Step 9 per l'opzione rimasta (autenticazione via cookie) e la decisione di deprioritizzare.

- Su richiesta esplicita dell'utente, integrati due nuovi motori AI:
  **Google Gemini** (analisi script, unico capace di guardare un video
  direttamente da un URL YouTube pubblico via `fileData`/`generateContent`,
  tier gratuito) e **OpenAI `gpt-image-1`** (generazione e modifica dirette
  di immagini, senza passare da fal.ai/Replicate). Aggiornati schema
  (constraint `kind`), edge function, dropdown "Tipo", link chiave API e
  icone gratis/pagamento in tutta l'interfaccia.

**Decisioni prese:**
- Contesto: l'utente ha chiesto se Gemini/ChatGPT fossero integrabili e a
  quali condizioni (gratis/pagamento), con interesse specifico per la
  capacità di Gemini di analizzare un video.
- Decisione: integrare Gemini (tier gratuito, capacità video nativa) e
  OpenAI (`gpt-image-1`, pagamento) come nuovi motori pluggable, mantenendo
  fal.ai/Replicate come "gateway universali" per qualunque altro modello
  tramite il campo Modello libero, invece di aggiungere un motore dedicato
  per ogni brand.
- Alternative scartate: aggiungere Stability AI o Google Imagen come motori
  dedicati — scartato per contenere lo scope e l'incertezza sulle esatte
  condizioni di accesso (Imagen richiede tipicamente un progetto Google
  Cloud con billing, meno coerente col principio "gratis di default").
  Midjourney scartato perché non ha un'API pubblica: non integrabile in
  nessun tool di terze parti.
- Contesto: workaround per il blocco anti-bot YouTube su yt-dlp.
- Decisione: provare `player_client=android` (fix comunitario noto, basso
  rischio/basso costo) prima di considerare l'autenticazione via cookie
  (più invasiva, richiede manutenzione).
- Da rivedere se: il blocco persiste e si vuole comunque una raccolta
  automatica funzionante — allora servirà valutare l'autenticazione via
  cookie o un provider/proxy alternativo.

**File consegnati/modificati:**
- `client.html`, `assets/client-page.js`, `assets/app.js` — selettore modello inline, editing AI immagini, Kit→Galleria, tab Impostazioni, navigazione indietro, integrazione Gemini/OpenAI.
- `clients.html`, `providers.html` — navigazione indietro, dropdown "Tipo" aggiornati con Gemini/OpenAI.
- `supabase/functions/edit-image/index.ts` + `supabase/functions-standalone/edit-image.ts` (nuova edge function, poi estesa con provider OpenAI).
- `supabase/functions/analyze-script/index.ts` + standalone — aggiunto provider `gemini` con analisi video da URL.
- `supabase/functions/generate-thumbnail/index.ts` + standalone — aggiunto provider `openai`.
- `supabase/migrations/0003_edit_providers_and_notifications.sql`, `0004_thumb_videos_unique_idx.sql` (due iterazioni), `0005_gemini_openai_providers.sql`.
- `scripts/capture_frames.py` — fix `sb_update()`, log diagnostico canale/RSS, workaround `player_client=android` (non risolutivo).

**Impatto su Vision/Pipeline:** aggiunto alla Vision il modello di
piattaforma "porta la tua chiave" con fal.ai/Replicate come gateway
universali; Step 3, 4, 6, 7, 8 e 9 della Pipeline creati o aggiornati con
lo stato di fine giornata.

---

### [2026-09-05] Costruzione iniziale del progetto

**Riepilogo:** Creata da zero la repo separata `GDC-thumbnail-generator`
con schema dati, edge function per analisi/generazione, frontend base,
filigrana/sblocco placeholder e provider gratuiti di default; risolti i
primi problemi di deploy (progetto Supabase sbagliato, funzioni con nome
demo, endpoint Hugging Face deprecato).

**Cosa è stato fatto:**
- Creata la repo GitHub `GDC-thumbnail-generator`, separata dalla webapp
  GDC-DASHBOARD esistente su richiesta esplicita dell'utente.
- Progettato e applicato lo schema dati iniziale su un progetto Supabase
  dedicato (clienti, video, galleria volto, script, provider immagine/
  testo, job di generazione, proposte, capture job, impostazioni
  piattaforma), con RLS e bucket storage privato.
- Costruite le prime edge function pluggable: `analyze-script` (Hugging
  Face/Anthropic/OpenAI) e `generate-thumbnail` (Hugging Face/fal.ai/
  Replicate/manuale), con chiave API risolvibile da config in-DB o da
  secret Supabase.
- Costruito il frontend iniziale: gestione clienti, scheda cliente con
  galleria volto (manuale + estrazione automatica via script Python
  `capture_frames.py` + GitHub Action), script e generazione.
- Aggiunta gestione in-app delle chiavi API (`providers.html`) con link
  diretti alle pagine di creazione chiave per ogni provider, invece di
  richiedere solo secret su Supabase.
- Costruito il meccanismo di filigrana (canvas lato client) e sblocco
  placeholder sulle proposte finali.
- Pubblicato su GitHub Pages come prima hosting live.

- **Bug: deploy punta al progetto Supabase sbagliato**
  **Sintomo:** URL/chiave del progetto non corrispondevano più a quanto
  visto nelle funzioni deployate.
  **Causa:** l'utente aveva eliminato e ricreato l'organizzazione/progetto
  Supabase durante la configurazione iniziale.
  **Fix applicato:** aggiornati `SUPA_URL`/`SUPA_KEY` sul progetto
  effettivamente attivo (`mjcnvpwjvwrucwjptgiu`) — verificato.

- **Bug: funzioni deployate con codice demo**
  **Sintomo:** le funzioni create dalla Dashboard Supabase contenevano il
  template "Hello world" invece del nostro codice, sotto nomi
  auto-generati (`quick-service`, `smart-api`, `swift-service`).
  **Causa:** il flusso "Deploy a new function" della Dashboard genera un
  nome/codice placeholder che va sovrascritto manualmente.
  **Fix applicato:** codice sostituito mantenendo il nome auto-generato,
  poi mappato in `EDGE_FN` lato frontend — verificato.

- **Bug: endpoint Hugging Face deprecato**
  **Sintomo:** chiamate a `api-inference.huggingface.co` fallivano.
  **Causa:** endpoint dismesso da Hugging Face in favore del gateway
  unificato `router.huggingface.co`.
  **Fix applicato:** entrambe le edge function aggiornate al nuovo
  endpoint — verificato.

**Decisioni prese:**
- Contesto: l'utente ha chiarito che il tool doveva essere un prodotto
  autonomo per creator, non un pannello di gestione interno, e che i
  motori AI dovevano essere gratuiti di default ma sostituibili.
- Decisione: architettura a provider pluggable (tabella per tipo,
  `active` boolean, config JSON con chiave/modello/secret) fin dal primo
  schema, con Hugging Face come motore attivo di default ovunque.
- Alternative scartate: hardcodare un singolo provider a pagamento come
  motore principale — scartato perché in contrasto con l'obiettivo
  "completamente gratuito, anche a costo di modelli meno performanti".

**File consegnati/modificati:**
- Struttura iniziale della repo `GDC-thumbnail-generator` (frontend,
  `supabase/functions/`, `supabase/migrations/0001_init.sql`,
  `scripts/capture_frames.py`, `.github/workflows/capture_frames.yml`).

**Impatto su Vision/Pipeline:** prima stesura di Vision e Pipeline
(Step 1, 2, 3, 5, 9 creati in questa fase).

---
