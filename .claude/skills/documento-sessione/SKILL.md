---
name: documento-sessione
description: Mantiene il documento di sessione del progetto (vision, pipeline di lavoro a step e storico di sessioni con attività svolte, bug risolti, decisioni prese e file consegnati). Usa quando si conclude una sessione di lavoro significativa, si prende una decisione tecnica/di prodotto importante, si risolve un bug, si aggiorna lo stato della pipeline, prima di /clear o /compact, o quando si apre il documento e serve verificare che non sia disallineato rispetto ad aggiornamenti fatti altrove (es. Claude Code vs Claude.ai).
---

# Documento di Sessione

Questa skill mantiene un documento persistente per progetto — nome file
`documento-sessione-<nome-progetto>.md` (percorso da definire) — in un unico
file con quattro parti: vision fissa, pipeline di lavoro a step, e uno
storico di sessioni (voci più recenti in cima) che registra cosa è stato
fatto, bug risolti, decisioni prese e file consegnati/modificati.

Funziona su qualsiasi progetto: usa un linguaggio generico ("verifica",
"criterio di completamento") invece di termini legati a un dominio specifico
(hardware, web, ecc.), adattando i dettagli al progetto corrente.

## Quando attivarti

- L'utente dice esplicitamente "aggiorna il documento di sessione" / `/documento-sessione`
- Si conclude una sessione di lavoro in cui è stato fatto qualcosa di rilevante
  (non necessariamente una decisione — anche solo progressi concreti)
- Si conclude una discussione dove è stata scelta una strada tra più opzioni
- Un'idea o un approccio viene esplicitamente scartato ("non facciamo così perché...")
- Un bug viene diagnosticato e/o risolto
- Lo stato di uno o più step della pipeline cambia (iniziato, completato, bloccato, rimandato)
- Prima di un `/clear` o `/compact`: chiedi all'utente se ci sono attività,
  bug o decisioni della sessione corrente non ancora registrate

## Struttura del documento

```
# Documento di Sessione — <nome progetto>

**Versione:** N (incrementata di 1 ogni volta che il file viene rigenerato,
indipendentemente da cosa è cambiato — è un contatore di revisioni, non di
sessioni)
**Ultimo aggiornamento:** [YYYY-MM-DD HH:MM] — coincide con la data/ora della
voce più recente in cima allo Storico sessioni

## Vision
<contenuto libero>

## Pipeline
<eventuale regola/principio generale valido per tutta la pipeline>
<blocchi per step, vedi sotto>

## Storico sessioni
<voci di sessione, più recente in cima>
```

La prima volta che crei il documento per un progetto, parti da **Versione: 1**.
Ogni volta che rigeneri il file (nuova voce, modifica a Pipeline/Vision,
qualsiasi aggiornamento), incrementa di 1 sia il numero di Versione sia
Ultimo aggiornamento — anche per Claude Code, non solo su Claude.ai: è un
contatore univoco del documento, utile per verificare a colpo d'occhio se due
copie (es. una sul PC via Claude Code, una caricata su un Progetto
Claude.ai) sono allineate o no.

Quando consegni il file (specialmente su Claude.ai, dove l'utente deve
scaricarlo e ricaricarlo manualmente), **dichiara sempre il numero di
versione nel messaggio di accompagnamento**, es. "Documento aggiornato alla
versione 7." — così l'utente può confrontarlo subito con la versione che ha
già caricato nel Progetto senza dover aprire il file.

## Come aggiornare la Vision

Modificala solo se l'utente comunica un cambiamento di direzione del progetto
nel suo complesso — non per aggiornamenti di stato o dettagli implementativi.
È una delle sezioni (insieme alla Pipeline) modificabile direttamente. Ogni
modifica va comunque registrata nella voce di sessione corrente (vedi
"Impatto su Vision/Pipeline").

## Come aggiornare la Pipeline

La Pipeline è organizzata **a step**, non come tabella semplice: ogni step
importante è un blocco a sé. Usa una tabella riassuntiva in cima solo se il
progetto ha molti step piccoli e ripetitivi; altrimenti i blocchi bastano.

Formato di ogni blocco:

```
### Step <n> — <nome step>

**Stato:** da fare / in corso / bloccato / completato

**Obiettivo:** cosa deve essere vero perché lo step sia considerato chiuso

**Decisioni progettuali:** decisioni di design prese finora per questo step
(o "nessuna ancora" se lo step è solo esecuzione)

**Criterio di completamento:** come si verifica concretamente che lo step è
concluso (un test, una revisione, una metrica, una conferma dell'utente —
qualunque cosa sia rilevante per il progetto)

**Note (cronologia dello step):**
- [YYYY-MM-DD] <aggiornamento su questo step in quella sessione>
- [YYYY-MM-DD] <aggiornamento successivo>
```

- Le Note di ogni step sono un log **append in fondo**, in ordine cronologico
  (a differenza dello Storico sessioni generale, che va più recente in cima):
  qui si legge in avanti per seguire l'evoluzione di quello specifico step.
- Aggiorna lo Stato sulla riga/blocco esistente quando cambia — non duplicare
  lo step.
- Se uno step si scompone in sotto-step, usa una numerazione tipo `Step 3.1`,
  `Step 3.2` come blocchi separati sotto lo step principale.
- Ogni modifica alla Pipeline va comunque registrata anche nella voce di
  sessione corrente (vedi "Impatto su Vision/Pipeline") — la Pipeline mostra
  lo stato attuale per step, lo Storico sessioni mostra cosa è successo quando.

## Pattern per i bug (Sintomo / Causa / Fix)

Quando in sessione si diagnostica o risolve un bug, usalo dentro "Cosa è
stato fatto" invece di una narrazione libera — è più facile da ritrovare:

```
**Bug: <titolo breve>**

**Sintomo:** cosa si osservava, in modo concreto e riproducibile
**Causa:** perché succedeva (se non accertata con certezza, dillo esplicitamente
invece di presentarla come confermata)
**Fix applicato:** cosa è stato cambiato, e se è verificato o ancora da confermare
```

Se un bug non è ancora risolto a fine sessione, usa comunque questo formato
con "Fix applicato: nessuno — vedi Problemi aperti" e riportalo nella
sessione successiva quando si riprende in mano.

## Come aggiungere una voce allo Storico sessioni

1. Ogni nuova voce va inserita subito dopo l'intestazione "## Storico sessioni"
   (in cima, sopra le voci precedenti) — mai in fondo al file.
2. Apri sempre la voce con un **riepilogo di una riga in grassetto**, denso,
   che permetta di capire il contenuto della sessione senza leggere il resto:

   ```
   ### [YYYY-MM-DD HH:MM] Titolo breve della sessione

   **Riepilogo:** una frase che condensa cosa è successo in sessione — il
   contenuto principale, non un titolo generico.

   **Cosa è stato fatto:** elenco concreto delle attività svolte (implementazioni,
   fix — usa il pattern Sintomo/Causa/Fix per i bug —, test, contenuti prodotti)

   **Decisioni prese:** (solo se presenti)
   - Contesto: perché serviva decidere qualcosa
   - Decisione: cosa è stato scelto
   - Alternative scartate: cosa non è stato fatto e perché
   - Da rivedere se: condizioni che renderebbero la decisione da riconsiderare

   **File consegnati/modificati:** elenco secco dei file toccati in sessione,
   separato dalla narrazione — cosa è stato creato, modificato, o consegnato
   come artefatto scaricabile

   **Impatto su Vision/Pipeline:** (solo se una delle due è stata modificata in
   questa sessione) — cosa è cambiato e perché

   ---
   ```
3. Ometti le sotto-sezioni non pertinenti a quella sessione (es. niente
   decisioni prese → ometti quella parte). "Riepilogo" e "Cosa è stato fatto"
   sono le uniche sempre presenti.
4. Usa la data/ora corrente reale (chiedila al sistema se non la conosci, non inventarla).
5. Se una nuova decisione supera o annulla una decisione precedente, NON
   modificare né cancellare la voce vecchia. Aggiungi invece nella nuova voce:
   `Supera la decisione del: [data voce precedente] — [motivo del cambio]`
   Stesso principio se una sessione scopre che un dato precedente (es. uno
   stato riportato nella Pipeline) era sbagliato: segnala la discrepanza nella
   nuova voce senza riscrivere quella vecchia.

## Uso su Claude.ai (chat e Progetti) — differenza rispetto a Claude Code

Il formato e le regole sopra restano identici. Cambia solo **come il documento
persiste tra una sessione e l'altra**, perché qui non c'è un filesystem su cui
Claude scrive direttamente:

- All'inizio di una sessione in un Progetto, se `documento-sessione-<progetto>.md`
  è già presente nei file del Progetto, leggilo da lì prima di aggiornarlo.
- Quando aggiorni il documento (nuova voce di sessione, cambio Pipeline, ecc.),
  **genera il file completo aggiornato come file scaricabile** (non solo testo
  in chat) — l'utente deve poterlo scaricare e ricaricare.
- Dopo aver generato il file, ricorda esplicitamente all'utente di **sostituire
  la versione precedente nei file del Progetto** (rimuovere la vecchia,
  caricare la nuova) — altrimenti la sessione successiva non vedrà l'aggiornamento.
- Se il Progetto non ha ancora questo file, crealo da zero e segnala che va
  aggiunto ai file del Progetto per essere disponibile nelle chat successive.
- In una chat singola fuori da un Progetto, il documento non persiste in alcun
  modo tra una chat e l'altra: la skill ha senso soprattutto dentro un Progetto.

### Prevenire il disallineamento tra Claude Code e Claude.ai

Se lo stesso progetto viene aggiornato sia da Claude Code (che scrive
direttamente sul file) sia da Claude.ai (dove l'utente ricarica manualmente il
file nei Progetti), le due copie possono disallinearsi. Per prevenirlo:

- Prima di aggiungere una nuova voce, controlla la **Versione** e la data/ora
  dell'ultima voce già presenti nel documento — la Versione è il modo più
  rapido per accorgersi di un disallineamento, prima ancora di leggere le date.
- Se quella data è precedente all'ultima volta che ricordi di aver lavorato su
  questo progetto (in Claude Code o in un'altra chat), o se il contenuto non
  corrisponde a quanto ti aspetteresti, **segnalalo esplicitamente all'utente
  prima di procedere**: "l'ultima voce nel documento è del [data] — ti risulta
  corretto, o potrebbe esserci una versione più recente non ancora caricata qui?"
- Non procedere ad aggiornare silenziosamente un documento che sembra
  disallineato: meglio chiedere conferma che sovrascrivere una versione più
  recente prodotta altrove.
- Se l'utente conferma il disallineamento, aiutalo a unire le voci mancanti
  (mai eliminare voci, solo integrarle nell'ordine cronologico corretto)
  invece di scegliere una delle due copie e scartare l'altra.

## Controllo "strade già scartate" (solo su richiesta)

Non è un controllo automatico. Solo se l'utente chiede esplicitamente
("l'abbiamo già provato?", "controlla se è già stato scartato") cerca nello
storico sessioni una voce con "Alternative scartate" pertinente e riportala.

## Regole ferree

- Non riscrivere né cancellare mai voci passate dello storico: si aggiunge
  solo in cima, salvo correzioni di errori materiali esplicitamente richieste
  dall'utente. Vision e Pipeline sono le uniche sezioni modificabili
  direttamente, perché rappresentano lo stato attuale, non uno storico — ma
  ogni modifica va comunque tracciata nella voce di sessione corrente.
- Una voce di storico per sessione, non spezzettare la stessa sessione in più voci.
- Non registrare micro-dettagli irrilevanti (es. "corretto un typo"): il livello
  di dettaglio giusto è quello che permette, rileggendo tra un mese, di capire
  cosa è stato fatto e perché senza dover ricostruire il ragionamento da zero.
- Prima di chiudere una sessione lunga o prima di un `/clear`/`/compact`, chiedi
  sempre se ci sono attività, bug o decisioni non ancora registrate.
