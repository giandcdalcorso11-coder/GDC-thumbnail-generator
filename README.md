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
index.html            → landing page pubblica + login/registrazione (unico ingresso)
onboarding.html       → dopo il login: crea/riprende il proprio profilo (o va al Master)
clients.html          → pannello Master (solo titolare): elenco clienti, prospetto per profilo
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

### 0. Configurazione 100% gratuita di default

Di default **entrambi** i motori AI (analisi script e generazione immagini)
sono impostati su **Hugging Face**, che ha un livello gratuito: l'unico
costo è il tuo tempo per creare un token gratuito su
huggingface.co/settings/tokens e incollarlo come secret `HF_TOKEN` (vedi
punto 2). Nessuna carta di credito richiesta per iniziare. Il compromesso:
modelli meno potenti di Claude/GPT per l'analisi, e senza vincolo di identità
del volto per le immagini (vedi tabella al punto 3). Puoi passare a un
motore più potente (a pagamento) in qualsiasi momento da **providers.html**,
con un click — mai una modifica al codice.

### 1. Credenziali Supabase già pronte

Il progetto Supabase è lo stesso del workspace GDC (`pnzabwfsgkvejnrtrjcp`), già
configurato in `assets/app.js`. Le tabelle `thumb_*`, lo storage bucket
`thumb-assets` e le Edge Function sono già creati/deployati.

Accedi/registrati direttamente da `index.html` (la landing page pubblica),
con un utente Supabase Auth di questo progetto.

### 2. Secret delle Edge Function

Vai su **providers.html** → pulsante "🔐 Apri i secret su Supabase" (ti porta
dritto alla pagina secret del progetto giusto, calcolata automaticamente
dall'URL configurato). Ogni provider elencato nella pagina mostra anche un
link diretto per creare la relativa chiave API.

| Secret | Serve per | Costo |
|---|---|---|
| `HF_TOKEN` | Hugging Face — motore **di default**, sia analisi script che immagini | Gratuito |
| `ANTHROPIC_API_KEY` | Motore testo alternativo (Claude, più preciso) | A pagamento |
| `OPENAI_API_KEY` | Motore testo alternativo (GPT-4o mini) | A pagamento |
| `FAL_KEY` | Motore immagini alternativo (fal.ai, identità volto coerente) | A pagamento (crediti gratuiti iniziali) |
| `REPLICATE_API_TOKEN` | Motore immagini alternativo (Replicate, identità volto coerente) | A pagamento |

Senza nessun secret impostato il tool resta comunque usabile: ogni chiamata
AI mostra semplicemente un messaggio d'errore chiaro ("secret non
configurato"), il resto (clienti, galleria, editor, proposte) non dipende
da nessuna di queste chiavi.

### 3. Due motori intercambiabili, cambiabili in ogni momento

**providers.html** ha due sezioni indipendenti, ciascuna con un solo
provider attivo alla volta:

**Analisi script (testo)**
| Provider | Costo | Note |
|---|---|---|
| Hugging Face — Mistral-7B-Instruct | Gratuito | **Attivo di default.** Meno preciso di Claude/GPT ma zero costi. |
| Anthropic — Claude Haiku | A pagamento | Analisi più accurata e affidabile in JSON. |
| OpenAI — GPT-4o mini | A pagamento | Alternativa ad Anthropic. |

**Generazione immagini**
| Provider | Costo | Note |
|---|---|---|
| Hugging Face — FLUX.1-schnell | Gratuito | **Attivo di default.** Testo→immagine, **senza** vincolo di identità del volto tra le pose. |
| fal.ai — InstantID | A pagamento (crediti gratuiti iniziali) | Mantiene il volto di riferimento coerente tra le pose. |
| Replicate — InstantID | A pagamento | Idem, tariffazione a consumo. |
| Manuale | Gratuito | Generi l'immagine altrove (ChatGPT/Midjourney/Bing/Higgsfield/…) e la carichi tu nella scheda "Genera proposte". |

Per cambiare: imposta il secret richiesto (punto 2), poi premi "Attiva"
sulla card del provider in `providers.html` — vale sia per l'analisi script
sia per la generazione immagini, indipendentemente. Puoi anche modificare il
modello di un provider esistente (pulsante "Modifica", es. se un modello
Hugging Face smette di essere ospitato gratuitamente, ne scegli un altro
senza toccare il codice), o aggiungerne uno del tutto nuovo (stesso tipo,
endpoint diverso, o un provider non ancora previsto come Higgsfield —
richiede solo di scrivere l'adattatore nella Edge Function corrispondente).

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
