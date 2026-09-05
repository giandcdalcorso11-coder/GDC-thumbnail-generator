# GDC Thumbnail Studio

Tool per la generazione (semi-)automatica di miniature YouTube: galleria del
volto del creator con pose/espressioni, analisi AI dello script del video,
generazione immagini con motore intercambiabile, editor titoli/grafica ed
elenco proposte finali per ogni video.

Progetto **separato** dal workspace GDC principale (repo `gdc-dashboard`):
nessun file di quel repo viene toccato. Condivide solo il progetto Supabase
esistente, in tabelle nuove e isolate con prefisso `thumb_`.

## Stack

- Frontend: HTML/CSS/JS statico, nessun build step (apri i file o servili da
  un host statico qualsiasi: GitHub Pages, Netlify, Vercel, ecc.).
- Backend: Supabase (Postgres + RLS, Storage, Auth, Edge Functions).
- Automazione pesante (download video + estrazione frame): script Python +
  GitHub Actions, stesso pattern degli altri agenti del workspace GDC.

## Struttura

```
index.html            → redirect a clients.html
login.html            → accesso (stesso account Supabase Auth del workspace GDC)
clients.html          → elenco clienti (canali), stats, crea/modifica cliente
providers.html        → gestione motore di generazione immagini (intercambiabile)
client.html           → scheda cliente con le 6 fasi del workflow (tab):
                         Canale & Video · Galleria volto · Script & Analisi ·
                         Genera proposte · Editor · Proposte finali
assets/style.css       → design system condiviso
assets/app.js          → config Supabase + helper (auth, REST, storage, edge functions)
assets/client-page.js  → logica della scheda cliente

supabase/functions/
  analyze-script/       → chiama Claude per analizzare tono/argomento/idee titolo
  generate-thumbnail/   → dispatcher provider immagine (huggingface/fal/replicate/manual)
  fetch-channel-videos/ → legge il feed RSS pubblico di un canale YouTube (no API key)

scripts/capture_frames.py       → yt-dlp + ffmpeg + rilevamento volto (OpenCV)
.github/workflows/capture_frames.yml → esegue lo script su schedule/manuale
```

## Setup

### 1. Credenziali Supabase già pronte

Il progetto Supabase è lo stesso del workspace GDC (`pnzabwfsgkvejnrtrjcp`), già
configurato in `assets/app.js`. Le tabelle `thumb_*`, lo storage bucket
`thumb-assets` e le Edge Function sono già creati/deployati.

Per accedere in `login.html` usa un utente già esistente in Supabase Auth su
questo progetto (stessa base utenti del workspace GDC principale).

### 2. Secret delle Edge Function (Supabase Dashboard → Edge Functions → Secrets)

| Secret | Serve per | Obbligatorio? |
|---|---|---|
| `ANTHROPIC_API_KEY` | `analyze-script` (analisi AI dello script) | Sì, per usare "Analizza con AI" |
| `HF_TOKEN` | Provider Hugging Face (gratuito) | Solo se attivi quel provider |
| `FAL_KEY` | Provider fal.ai (identità volto coerente) | Solo se attivi quel provider |
| `REPLICATE_API_TOKEN` | Provider Replicate (identità volto coerente) | Solo se attivi quel provider |

Senza `ANTHROPIC_API_KEY` il resto del tool funziona lo stesso: l'analisi AI
mostrerà solo un messaggio d'errore, tutto il resto (galleria, generazione,
editor, proposte) non dipende da essa.

### 3. Motore di generazione immagini — cambiarlo è un click

Vai su **providers.html** ("⚙️ Motore immagini" nella barra in alto): è
già presente un provider **Manuale** attivo di default (nessuna chiave
richiesta: generi l'immagine altrove — es. ChatGPT/Midjourney/Bing — e la
carichi nella scheda "Genera proposte"). Sono anche pre-caricati, pronti da
attivare appena imposti la relativa chiave:

- **Hugging Face — FLUX.1-schnell**: gratuito (serve solo un token gratuito
  da huggingface.co/settings/tokens), testo→immagine, **senza** identità del
  volto vincolata (buono per iniziare / per grafica generica).
- **fal.ai — InstantID**: a pagamento (con crediti gratuiti di benvenuto),
  mantiene il volto di riferimento coerente tra le pose.
- **Replicate — InstantID**: idem, tariffazione a consumo.

Per attivarne uno: imposta il secret richiesto su Supabase, poi premi
"Attiva" sulla sua card in `providers.html`. Puoi anche aggiungere un
provider "personalizzato" (stesso tipo, modello diverso, o un tuo endpoint)
dal pulsante in fondo alla pagina — nessuna modifica al codice necessaria.
La generazione passa sempre dalla stessa Edge Function `generate-thumbnail`,
che legge il provider attivo dalla tabella `thumb_image_providers`.

### 4. Raccolta screenshot del volto — manuale e/o automatica, per cliente

Ogni cliente ha un campo "Acquisizione screenshot" (Manuale / Automatica /
Entrambe), modificabile in ogni momento dalla scheda cliente. In pratica,
nella tab **Galleria volto** trovi sempre entrambe le opzioni:

- **Manuale**: trascina/carica le immagini — vengono segnate "approvate"
  subito (le hai scelte tu).
- **Automatica**: premi "Avvia raccolta automatica" → crea una riga in coda
  (`thumb_capture_jobs`). Viene lavorata da `scripts/capture_frames.py` che:
  1. legge i video recenti dal feed RSS pubblico del canale (no API key),
  2. scarica ogni video con `yt-dlp` (qualità ridotta, ~480p, per velocità),
  3. estrae alcuni fotogrammi con `ffmpeg`,
  4. tiene solo quelli con un volto rilevato (OpenCV Haar Cascade),
  5. li carica in galleria come **"da rivedere"** — approvi/rifiuti tu prima
     che vengano usati come riferimento per la generazione.

Lo script gira via GitHub Actions (`.github/workflows/capture_frames.yml`):
schedulato ogni 6 ore, oppure lancialo subito da **Actions → Cattura Frame →
Run workflow** subito dopo aver messo in coda un cliente dal tool.

Richiede due secret di repository GitHub (Settings → Secrets and variables →
Actions):

| Secret | Valore |
|---|---|
| `SUPABASE_URL` | `https://pnzabwfsgkvejnrtrjcp.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key del progetto Supabase (Dashboard → Project Settings → API) — **non è l'anon key**, bypassa la RLS: tenerla solo nei secret di GitHub Actions, mai nel frontend. |

### 5. Pubblicare il frontend

Il sito è statico: puoi aprirlo localmente, oppure pubblicarlo con GitHub
Pages, Netlify, Vercel o qualsiasi host statico. Nessun build step richiesto.

## Workflow d'uso, in breve

1. **Clienti** → crea un cliente con URL canale, nicchia, tono, colori brand.
2. **Canale & Video** → importa i video recenti dal canale (RSS) o aggiungili a mano.
3. **Galleria volto** → carica foto o avvia la raccolta automatica; approva le migliori.
4. **Script & Analisi** → incolla lo script del video, premi "Analizza con AI":
   ottieni tono, argomento, palette colori, idee di titolo, pose/espressioni
   consigliate e un prompt pronto per la generazione.
5. **Genera proposte** → scegli le foto di riferimento del volto approvate,
   il prompt (prefillato dallo step precedente), premi Genera (o carica
   un'immagine fatta altrove, se il provider è "Manuale").
6. **Editor** → scegli l'immagine di base, aggiungi titolo/testo, forme,
   frecce, logo del cliente; salva come proposta.
7. **Proposte finali** → tutte le proposte per ogni video, approvale/scaricale.
