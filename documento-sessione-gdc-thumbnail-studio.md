# Documento di Sessione — GDC Thumbnail Studio

**Versione:** 2
**Ultimo aggiornamento:** [2026-09-08 20:15]

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

**Obiettivo:** login/signup funzionante, con creazione o rivendicazione di
un profilo cliente e redirect automatico alla propria area di lavoro.

**Decisioni progettuali:** self-signup lasciato aperto a chiunque abbia il
link (stessa protezione della webapp GDC principale: auth + RLS, non
isolamento dati) — accettato consapevolmente come limitazione temporanea,
da rivedere quando il tool avrà utenti reali.

**Criterio di completamento:** login/signup operativi, `onboarding.html`
individua un profilo esistente per l'utente o ne propone la creazione/
rivendicazione, redirect a `client.html?id=…` funzionante.

**Note (cronologia dello step):**
- [2026-09-05] Creato `login.html` (login/signup), redirect iniziale a `clients.html`.
- [2026-09-07] Creato `onboarding.html` (crea/rivendica profilo via `owner_user_id`); redirect da login/index cambiato da `clients.html` a `onboarding.html`.

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
livelli (testo, forme, freccia, logo).

**Criterio di completamento:** dal video selezionato si arriva a una
proposta salvata in `thumb_proposals`, passando per tutti gli step
intermedi senza vicoli ciechi.

**Note (cronologia dello step):**
- [2026-09-07] Costruito lo stepper verticale (accordion a step singolo), sostituendo il precedente layout a tab piatto.
- [2026-09-07] Aggiunta card "Dal tuo kit permanente" nello step Galleria volto: riuso con un tocco delle foto già presenti nel Kit, senza ricaricarle.
- [2026-09-07] Aggiunto pulsante "✏️ Modifica con AI" su ogni foto di galleria/kit: overlay con istruzione testuale, motore di modifica selezionabile, risultato sostituibile o salvabile come nuova immagine.
- [2026-09-08] **Decisione:** rimossa dallo step Script la possibilità di analizzare un URL YouTube al posto dello script — capacità spostata nel Kit permanente (Step 6). Vedi "Decisioni prese" della sessione dell'8 settembre.

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

**Stato:** completato (fase attuale, senza isolamento privacy)

**Obiettivo:** vista di controllo su tutti i profili, video, proposte e
sblocchi — per ora accessibile senza restrizioni oltre il login.

**Decisioni progettuali:** nessun filtro privacy tra clienti per ora,
esplicitamente segnalato in UI come cosa da rivedere prima di aprire il
tool ad altri utenti reali.

**Criterio di completamento:** da ridefinire quando si introdurrà
l'isolamento dati per cliente/utente.

**Note (cronologia dello step):**
- [2026-09-07] Rietichettato `clients.html` come "Pannello Master"; aggiunta colonna sblocchi alle statistiche e badge "Assegnato/Non assegnato" per profilo.
- [2026-09-08] Aggiunto pulsante "← Indietro" nella topbar (mancava una navigazione comoda, c'era solo "Esci").

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
