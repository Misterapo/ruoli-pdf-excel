function createArticleIndex(mappings = APP_CONFIG.articleMappings) {
  const index = new Map();

  for (const mapping of mappings) {
    for (const code of mapping.codici) {
      index.set(normalizeArticleCode(code), mapping);
    }
  }

  return index;
}

function mapArticleToColumn(articleCode) {
  const mapping = createArticleIndex().get(normalizeArticleCode(articleCode));
  return mapping
    ? { ...mapping, colonna_destinazione: mapping.voce, categoria_destinazione: mapping.tipo }
    : null;
}

function enrichRows(rows) {
  return rows.map((row) => {
    const mapping = mapArticleToColumn(row.articolo_normalizzato || row.articolo);

    if (!mapping) {
      return {
        ...row,
        articolo_normalizzato: normalizeArticleCode(row.articolo),
        categoria_destinazione: "NON MAPPATO",
        colonna_destinazione: "",
        note: appendNote(row.note, "Codice articolo non mappato")
      };
    }

    return {
      ...row,
      articolo_normalizzato: normalizeArticleCode(row.articolo),
      categoria_destinazione: mapping.categoria_destinazione,
      colonna_destinazione: mapping.colonna_destinazione,
      note: mapping.nota ? appendNote(row.note, mapping.nota) : row.note
    };
  });
}

function aggregateRows(rows, category, columns) {
  const accountingColumns = category === "MULTE"
    ? APP_CONFIG.multeAccountingColumns
    : APP_CONFIG.imuRifiutiAccountingColumns;
  const grouped = new Map();

  for (const row of rows.filter((item) => item.categoria_destinazione === category)) {
    const key = [
      row.prospetto_per_ruolo,
      row.codice_fiscale,
      row.denominazione,
      row.identificativo_cartella,
      row.anno_riferimento
    ].join("||");

    if (!grouped.has(key)) {
      const base = {};
      columns.forEach((column) => {
        base[column] = "";
      });
      accountingColumns.forEach((column) => {
        base[column] = 0;
      });
      base["PROSPETTO PER RUOLO"] = row.prospetto_per_ruolo;
      base["ANNO RIFERIMENTO"] = row.anno_riferimento;
      base.NOME = row.denominazione;
      base.NOTE = row.identificativo_cartella ? `Cartella ${row.identificativo_cartella}` : "";
      grouped.set(key, base);
    }

    const target = grouped.get(key);
    target[row.colonna_destinazione] = roundCurrency((target[row.colonna_destinazione] || 0) + row.riversato);
  }

  return [...grouped.values()].map((row) => {
    const total = accountingColumns.reduce((sum, column) => sum + (Number(row[column]) || 0), 0);
    return {
      ...row,
      TOTALI: roundCurrency(total)
    };
  });
}

function buildImuRifiutiRows(rows) {
  return aggregateRows(rows, "IMU - RIFIUTI", APP_CONFIG.imuRifiutiColumns);
}

function buildMulteRows(rows) {
  return aggregateRows(rows, "MULTE", APP_CONFIG.multeColumns);
}

function buildReversaliRows(rows) {
  return APP_CONFIG.articleMappings.map((mapping) => {
    const matchingRows = rows.filter((row) => row.colonna_destinazione === mapping.voce && row.categoria_destinazione === mapping.tipo);
    const total = roundCurrency(matchingRows.reduce((sum, row) => sum + row.riversato, 0));

    return {
      Tipo: mapping.tipo,
      Voce: mapping.voce,
      Capitolo: mapping.capitolo || "",
      Accertamento: mapping.accertamento || "",
      "Codici articolo": mapping.codici.join(" + "),
      "Prospetti per ruolo inclusi": uniqueValues(matchingRows.map((row) => row.prospetto_per_ruolo)).join("; "),
      Totale: total,
      Note: mapping.nota || ""
    };
  }).filter((row) => row.Totale !== 0);
}

function buildProspettiRows(rows) {
  const grouped = new Map();

  for (const row of rows) {
    const key = row.prospetto_per_ruolo || "Senza prospetto";
    if (!grouped.has(key)) {
      grouped.set(key, {
        "Prospetto per ruolo": key,
        Totale: 0,
        "Numero righe": 0,
        Stato: getRuoloAccertatoStatus(key)
      });
    }

    const item = grouped.get(key);
    item.Totale = roundCurrency(item.Totale + row.riversato);
    item["Numero righe"] += 1;
  }

  return [...grouped.values()];
}

function buildControls(records, rows, imuRows, multeRows) {
  const totalDetail = roundCurrency(rows.reduce((sum, row) => sum + row.riversato, 0));
  const totalImu = roundCurrency(imuRows.reduce((sum, row) => sum + (Number(row.TOTALI) || 0), 0));
  const totalMulte = roundCurrency(multeRows.reduce((sum, row) => sum + (Number(row.TOTALI) || 0), 0));
  const unmappedRows = rows.filter((row) => row.categoria_destinazione === "NON MAPPATO");
  const difference = roundCurrency(totalDetail - totalImu - totalMulte);
  const unmappedCodes = uniqueValues(unmappedRows.map((row) => row.articolo_normalizzato || row.articolo));
  const prospetti = uniqueValues(rows.map((row) => row.prospetto_per_ruolo).filter(Boolean));
  const status = unmappedRows.length > 0
    ? "DA VERIFICARE"
    : Math.abs(difference) < 0.01 ? "OK" : "ERRORE";

  return {
    status,
    summary: [
      { Controllo: "Numero PDF inclusi", Valore: records.length, Note: "" },
      { Controllo: "Elenco PDF inclusi", Valore: records.map((record) => record.source_file_name).join("; "), Note: "" },
      { Controllo: "Numero righe movimento estratte", Valore: rows.length, Note: "" },
      { Controllo: "Numero prospetti per ruolo trovati", Valore: prospetti.length, Note: prospetti.join("; ") },
      { Controllo: "Numero righe IMU - RIFIUTI", Valore: imuRows.length, Note: "" },
      { Controllo: "Numero righe MULTE", Valore: multeRows.length, Note: "" },
      { Controllo: "Totale riversato da dettaglio", Valore: totalDetail, Note: "" },
      { Controllo: "Totale foglio IMU - RIFIUTI", Valore: totalImu, Note: "" },
      { Controllo: "Totale foglio MULTE", Valore: totalMulte, Note: "" },
      { Controllo: "Totale codici non mappati", Valore: roundCurrency(unmappedRows.reduce((sum, row) => sum + row.riversato, 0)), Note: "" },
      { Controllo: "Differenza tra totale dettaglio e totale fogli principali", Valore: difference, Note: "" },
      { Controllo: "Codici articolo non mappati", Valore: unmappedCodes.join("; "), Note: "" },
      { Controllo: "Prospetti per ruolo trovati", Valore: prospetti.join("; "), Note: "" },
      { Controllo: "Esito finale", Valore: status, Note: status === "OK" ? "" : "Controllare codici non mappati o differenze." }
    ],
    totalDetail,
    totalImu,
    totalMulte,
    difference,
    unmappedCodes
  };
}

function buildWorkbookData(records) {
  const detailRows = records.flatMap((record) => record.rows || []);
  const imuRows = buildImuRifiutiRows(detailRows);
  const multeRows = buildMulteRows(detailRows);
  const reversaliRows = buildReversaliRows(detailRows);
  const prospettiRows = buildProspettiRows(detailRows);
  const controls = buildControls(records, detailRows, imuRows, multeRows);

  return {
    records,
    detailRows,
    imuRows,
    multeRows,
    reversaliRows,
    prospettiRows,
    controls
  };
}

function getRuoloAccertatoStatus(prospetto) {
  const found = APP_CONFIG.ruoliAccertati.find((item) => item.prospetto_per_ruolo === prospetto);

  if (!found) {
    return "ordinario";
  }

  return found.attivo
    ? `gia accertato - ${found.colonna_destinazione}`
    : `presente in configurazione, non attivo - ${found.accertamento}`;
}

function appendNote(currentNote, note) {
  return [currentNote, note].filter(Boolean).join("; ");
}

function uniqueValues(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ""))];
}

window.createArticleIndex = createArticleIndex;
window.mapArticleToColumn = mapArticleToColumn;
window.enrichRows = enrichRows;
window.aggregateRows = aggregateRows;
window.buildImuRifiutiRows = buildImuRifiutiRows;
window.buildMulteRows = buildMulteRows;
window.buildReversaliRows = buildReversaliRows;
window.buildProspettiRows = buildProspettiRows;
window.buildControls = buildControls;
window.buildWorkbookData = buildWorkbookData;
