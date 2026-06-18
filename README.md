# Ruoli PDF -> Excel

Web app statica per leggere localmente PDF di riversamento Agenzia Entrate-Riscossione e generare un file Excel di lavoro.

## Uso

1. Apri `index.html` nel browser o pubblica la cartella su GitHub Pages.
2. Compila la configurazione archivio: Comune / Ente, anno gestione e operatore.
3. Carica uno o piu PDF di riversamento.
4. Premi **Analizza PDF**.
5. Seleziona nell'archivio locale i PDF da includere.
6. Controlla le anteprime:
   - `IMU - RIFIUTI`
   - `MULTE`
   - `Riepilogo reversali`
   - `Controlli`
7. Scarica l'Excel completo.

## Privacy

I PDF vengono letti nel browser con PDF.js. Nessun PDF e nessun dato estratto viene caricato su server esterni dall'app.

Non caricare nella repository PDF reali, Excel reali o file con dati personali. Gli allegati reali servono solo per capire la struttura.

## Archivio locale

L'app usa IndexedDB, quindi i dati restano nel browser e nel profilo utente del PC.

Funzioni disponibili:

- salvataggio automatico dei PDF analizzati;
- deduplica su nome file, data riversamento e totale riversato;
- eliminazione di un singolo PDF;
- svuotamento archivio;
- export archivio in JSON;
- import archivio da JSON.

Il JSON esportato puo contenere dati personali estratti dai PDF: trattarlo come un file riservato.

## Excel generato

Il workbook contiene:

1. `IMU - RIFIUTI`
2. `MULTE`
3. `Dettaglio PDF`
4. `Riepilogo reversali`
5. `Controlli`

Il nome file segue queste regole:

- `RUOLI_YYYY.xlsx` se non c'e una data unica;
- `RUOLI_YYYY-MM-DD.xlsx` se i PDF selezionati hanno la stessa data riversamento;
- `RUOLI_YYYY_periodo.xlsx` se sono selezionate date diverse.

## Configurazione codici

Le mappature degli articoli sono in `config.js`, dentro `ARTICLE_MAPPINGS`.

Ogni voce contiene:

- `tipo`: `IMU - RIFIUTI` oppure `MULTE`;
- `voce`: colonna Excel di destinazione;
- `codici`: articoli da riconoscere;
- `capitolo`;
- `accertamento`;
- `nota` opzionale.

I codici numerici sono confrontati anche senza zeri iniziali: per esempio `0434` e `434` vengono trattati come equivalenti.

## Capitoli e accertamenti

Capitoli e accertamenti iniziali sono configurati in `config.js` nelle stesse voci di `ARTICLE_MAPPINGS`.

La struttura `RUOLI_ACCERTATI` prepara la gestione futura dei ruoli gia accertati. In questa prima versione viene mostrato lo stato dei prospetti trovati, ma gli importi non vengono spostati automaticamente se `attivo` e `false`.

## Pubblicazione su GitHub Pages

La web app non richiede build.

1. Carica nella repository solo i file sorgente dell'app.
2. Non caricare PDF, Excel reali o JSON di archivio.
3. Attiva GitHub Pages sulla branch desiderata.
4. Apri l'URL pubblicato.

Le librerie pubbliche PDF.js e SheetJS sono caricate da CDN. I dati dei PDF restano comunque nel browser.
