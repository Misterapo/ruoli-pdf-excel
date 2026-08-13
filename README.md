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
8. Scaricare l'Excel completo oppure il solo riepilogo annuale. Entrambi includono `Riepilogo annuale` e `Accessori per sospeso`; l'export annuale aggiunge un foglio `Anno YYYY` per ogni anno trovato.

## Riepilogo annuale e codici

Il riepilogo usa sempre l'importo `riversato`, elaborato in centesimi interi. Per ogni numero sospeso presenta prima le righe `TRIBUTI PER ANNO`, una per ogni `anno_riferimento` in ordine crescente, e infine una sola riga `ACCESSORI NON RIPARTITI`, con anno vuoto. I gruppi sono ordinati naturalmente per numero sospeso; un sospeso composto soltanto da accessori è comunque mostrato.

I tributi principali ripartiti per anno sono:

- **ACQUA**: `9000`, `9170`, `9175`;
- **IMU**: `2R60`;
- **TARI**: `2R28`, `2Y54`, `0434`/`434`, `2S79`;
- **MULTE**: `5242`;
- **IRPEF**: `9361`, `9362`, `9363`, `933I` (lettera I).

I quattro codici IRPEF confluiscono nell'unica colonna annuale `IRPEF`, senza colonne accessorie. Per una riga annuale vale `TOTALE = ACQUA + IMU + TARI + MULTE + IRPEF`.

Sanzioni/interessi e spese di notifica sono invece aggregate una sola volta per sospeso nelle otto colonne accessorie ACQUA, IMU, TARI e MULTE. In particolare, `424`/`0424` è un accessorio TARI; `5243` e `1C34` sono sanzioni/interessi MULTE; `5354` è notifica MULTE. Il totale della riga accessori è la somma delle sole otto colonne accessorie. Questi movimenti restano anche nel dettaglio, nelle tabelle contabili e nel riepilogo reversali, senza modificare le mappature generali in `config.js`.

## Fogli Excel e quadrature

- `Riepilogo annuale` riproduce le righe tributi e accessori della tabella web, senza ripetizioni;
- `Accessori per sospeso` contiene una sola riga per sospeso e le otto colonne accessorie;
- ogni `Anno YYYY` contiene esclusivamente ACQUA, IMU, TARI, MULTE e IRPEF dell'anno indicato, senza accessori;
- gli importi sono celle Excel numeriche formattate con due decimali.

I controlli indipendenti applicano le formule: `differenza annuale = totale righe tributi - totale tributi principali ammessi dalla sorgente`; `differenza accessori = totale Accessori per sospeso - totale accessori ammessi dalla sorgente`; `differenza rilevante = (tributi + accessori del riepilogo) - (tributi + accessori della sorgente)`. Resta inoltre obbligatoria la quadratura contabile completa fra dettaglio, fogli contabili e totale riversato dei PDF. Qualunque differenza, codice realmente non mappato o abbinamento mancante, ambiguo o riutilizzato blocca l'export.

## Archivio, JSON e privacy

IndexedDB conserva configurazione, PDF normalizzati, file sospesi normalizzato, esiti e scelte manuali. Export/import JSON versione 2 include tutti questi dati ed è retrocompatibile con gli archivi versione 1 privi dei nuovi campi. Rimozione del file sospesi elimina anche gli abbinamenti; lo svuotamento PDF non elimina automaticamente la tesoreria.

Il JSON può contenere dati personali: conservarlo come file riservato. Non inserire nel repository PDF, Excel o JSON reali. PDF.js e SheetJS sono caricati da CDN, ma l'elaborazione avviene localmente.

## Test

Eseguire `npm test`. I test non richiedono dipendenze e usano soltanto matrici e dati sintetici in memoria.
