# Ruoli PDF -> Excel

Web app statica che legge nel browser i riversamenti PDF di Agenzia Entrate-Riscossione, li abbina ai sospesi di tesoreria e genera Excel contabili. File e dati non vengono inviati a server.

## Flusso completo

1. Aprire `index.html` direttamente o tramite un server statico/GitHub Pages (non è richiesta una build).
2. Compilare e salvare Comune/Ente, anno gestione e operatore.
3. In **File sospesi di tesoreria**, importare o sostituire un `.xls`/`.xlsx` con le colonne `data effettuazione`, `importo` e `riscossione`. Maiuscole, spazi e punteggiatura delle intestazioni sono normalizzati. Le date possono essere date Excel o `GG/MM/AAAA`; gli importi sono convertiti in centesimi interi. L'interfaccia mostra file, righe valide, scarti e duplicati. Le righe incomplete non vengono usate.
4. Caricare uno o più PDF e premere **Analizza PDF**. I PDF vengono archiviati in IndexedDB.
5. Selezionare i PDF da esportare. L'app abbina ciascun riversamento mediante la sola chiave `data_riversamento + totale_riversato in centesimi`: `AUTO_CERTA` indica una corrispondenza unica, `NON_TROVATA` nessuna e `AMBIGUA` più risultati.
6. Per un caso non trovato o ambiguo, scegliere esplicitamente dalla colonna **Numero sospeso** un sospeso libero. La scelta diventa `MANUALE`. Uno stesso sospeso non può essere usato da due PDF; il riutilizzo, gli stati irrisolti e una mancata quadratura bloccano entrambi gli export.
7. Verificare le tabelle **IMU - RIFIUTI**, **MULTE**, **Dettaglio PDF**, **Riepilogo reversali**, **Riepilogo per anno** e **Controlli**.
8. Scaricare l'Excel completo oppure il solo riepilogo annuale. Quest'ultimo contiene `Riepilogo annuale` e un foglio `Anno YYYY` per ogni anno trovato.

## Riepilogo annuale e codici

Il riepilogo usa esclusivamente `anno_riferimento` dei movimenti e sempre l'importo `riversato`. Produce una riga per `Numero sospeso + Anno riferimento` e classifica:

- **ACQUA**: `9000`, `9170`, `9175`;
- **IMU**: `2R60`;
- **TARI**: `2R28`, `2Y54`, `0434`/`434`, `2S79`;
- **IRPEF**: `9361`, `9362`, `9363`, `933I` (lettera I).

La lista è una whitelist: nessun altro codice entra nel riepilogo annuale. Per ogni riga vale `TOTALE = ACQUA + IMU + TARI + IRPEF`; le righe sono ordinate per numero sospeso (ordinamento numerico naturale) e poi per anno crescente. Sanzioni, interessi, spese di notifica e altre voci non vengono divisi per anno, ma restano nel dettaglio, nelle tabelle contabili, nel riepilogo reversali e nell'Excel completo. La quadratura annuale confronta il riepilogo con il solo totale dei movimenti appartenenti alla whitelist e mostra separatamente il totale escluso. Le altre mappature, i capitoli e gli accertamenti restano configurabili in `config.js`.

## Archivio, JSON e privacy

IndexedDB conserva configurazione, PDF normalizzati, file sospesi normalizzato, esiti e scelte manuali. Export/import JSON versione 2 include tutti questi dati ed è retrocompatibile con gli archivi versione 1 privi dei nuovi campi. Rimozione del file sospesi elimina anche gli abbinamenti; lo svuotamento PDF non elimina automaticamente la tesoreria.

Il JSON può contenere dati personali: conservarlo come file riservato. Non inserire nel repository PDF, Excel o JSON reali. PDF.js e SheetJS sono caricati da CDN, ma l'elaborazione avviene localmente.

## Test

Eseguire `npm test`. I test non richiedono dipendenze e usano soltanto matrici e dati sintetici in memoria.
