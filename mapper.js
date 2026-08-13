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
    const note = removeGeneratedUnmappedNote(row.note);

    if (!mapping) {
      return {
        ...row,
        articolo_normalizzato: normalizeArticleCode(row.articolo),
        categoria_destinazione: "NON MAPPATO",
        colonna_destinazione: "",
        note: appendNote(note, "Codice articolo non mappato")
      };
    }

    return {
      ...row,
      articolo_normalizzato: normalizeArticleCode(row.articolo),
      categoria_destinazione: mapping.categoria_destinazione,
      colonna_destinazione: mapping.colonna_destinazione,
      note: mapping.nota ? appendNote(note, mapping.nota) : note
    };
  });
}

function removeGeneratedUnmappedNote(currentNote) {
  return String(currentNote || "")
    .split(";")
    .map((note) => note.trim())
    .filter((note) => note && note !== "Codice articolo non mappato")
    .join("; ");
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

const ANNUAL_COLUMNS = ["Numero sospeso", "Data riversamento", "Anno riferimento", "ACQUA", "IMU", "TARI", "IRPEF", "TOTALE", "Codici inclusi", "Note"];
const ANNUAL_GROUPS = {
  ACQUA: new Set(["9000", "9170", "9175"].map(normalizeArticleCode)),
  IMU: new Set(["2R60"].map(normalizeArticleCode)),
  TARI: new Set(["2R28", "2Y54", "0434", "434", "2S79"].map(normalizeArticleCode)),
  IRPEF: new Set(["9361", "9362", "9363", "933I"].map(normalizeArticleCode))
};

function buildAnnualSummary(records) {
  const grouped = new Map();
  for (const record of records) {
    const match = record.match || {};
    const number = match.numero_sospeso || "";
    for (const movement of record.rows || []) {
      const year = String(movement.anno_riferimento || "").trim();
      const group = annualGroupForCode(movement.articolo_normalizzato || movement.articolo);
      if (!year || !group) continue;
      const key = `${number}||${year}`;
      if (!grouped.has(key)) grouped.set(key, {
        "Numero sospeso": number, "Data riversamento": record.data_riversamento || "", "Anno riferimento": year,
        ACQUA: 0, IMU: 0, TARI: 0, IRPEF: 0, TOTALE: 0, "Codici inclusi": "", Note: ""
      });
      const target = grouped.get(key);
      const code = normalizeArticleCode(movement.articolo_normalizzato || movement.articolo);
      const cents = RuoliSuspesi.amountToCents(movement.riversato) || 0;
      target[group] += cents;
      target.TOTALE += cents;
      target._codes = target._codes || new Set();
      if (code) target._codes.add(code);
    }
  }
  return [...grouped.values()].map((row) => {
    row["Codici inclusi"] = [...(row._codes || [])].sort().join(" + ");
    delete row._codes;
    for (const column of ["ACQUA", "IMU", "TARI", "IRPEF", "TOTALE"]) row[column] /= 100;
    return row;
  }).sort(compareAnnualRows);
}

function annualGroupForCode(articleCode) {
  const code = normalizeArticleCode(articleCode);
  return Object.keys(ANNUAL_GROUPS).find((name) => ANNUAL_GROUPS[name].has(code)) || null;
}

function compareAnnualRows(a, b) {
  return String(a["Numero sospeso"]).localeCompare(String(b["Numero sospeso"]), "it", { numeric: true })
    || String(a["Anno riferimento"]).localeCompare(String(b["Anno riferimento"]), "it", { numeric: true })
    || String(a["Data riversamento"]).localeCompare(String(b["Data riversamento"]), "it", { numeric: true });
}

function buildControls(records, rows, imuRows, multeRows, annualRows = [], allSuspesi = []) {
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

  const matched = records.filter((record) => ["AUTO_CERTA", "MANUALE"].includes(record.match?.status) && !record.match?.reused);
  const manual = records.filter((record) => record.match?.status === "MANUALE").length;
  const missing = records.filter((record) => record.match?.status === "NON_TROVATA").length;
  const ambiguous = records.filter((record) => record.match?.status === "AMBIGUA").length;
  const reused = records.filter((record) => record.match?.reused).length;
  const usedIds = new Set(matched.map((record) => record.match.sospesoId));
  const annualCents = annualRows.reduce((sum, row) => sum + (RuoliSuspesi.amountToCents(row.TOTALE) || 0), 0);
  const annualRelevantCents = records.flatMap((record) => record.rows || []).reduce((sum, movement) =>
    sum + (annualGroupForCode(movement.articolo_normalizzato || movement.articolo)
      ? (RuoliSuspesi.amountToCents(movement.riversato) || 0)
      : 0), 0);
  const annualExcludedCents = records.flatMap((record) => record.rows || []).reduce((sum, movement) =>
    sum + (!annualGroupForCode(movement.articolo_normalizzato || movement.articolo)
      ? (RuoliSuspesi.amountToCents(movement.riversato) || 0)
      : 0), 0);
  const pdfCents = records.reduce((sum, record) => sum + (RuoliSuspesi.amountToCents(record.total_riversato) || 0), 0);
  const detailCents = rows.reduce((sum, row) => sum + (RuoliSuspesi.amountToCents(row.riversato) || 0), 0);
  const parsedMovementsValid = records.every((record) => Array.isArray(record.rows) && record.rows.length > 0);
  const matchingValid = records.length > 0 && parsedMovementsValid
    && matched.length === records.length && !missing && !ambiguous && !reused;
  const annualValid = annualCents === annualRelevantCents;
  const accountingValid = status === "OK" && RuoliSuspesi.amountToCents(difference) === 0
    && detailCents === pdfCents && unmappedRows.length === 0;
  const exportAllowed = matchingValid && annualValid && accountingValid;
  const finalStatus = exportAllowed ? status : "BLOCCATO";
  return {
    status: finalStatus,
    summary: [
      { Controllo: "Numero PDF inclusi", Valore: records.length, Note: "" },
      { Controllo: "PDF selezionati", Valore: records.length, Note: "" },
      { Controllo: "PDF abbinati", Valore: matched.length, Note: "" },
      { Controllo: "Abbinamenti manuali", Valore: manual, Note: "" },
      { Controllo: "Sospesi non trovati", Valore: missing, Note: "" },
      { Controllo: "Abbinamenti ambigui", Valore: ambiguous, Note: "" },
      { Controllo: "Sospesi riutilizzati", Valore: reused, Note: "" },
      { Controllo: "Sospesi importati ma non utilizzati", Valore: allSuspesi.filter((item) => !usedIds.has(item.id)).length, Note: "" },
      { Controllo: "Totale rilevante per riepilogo annuale", Valore: annualRelevantCents / 100, Note: "Solo codici ammessi" },
      { Controllo: "Totale riepilogo annuale", Valore: annualCents / 100, Note: "" },
      { Controllo: "Importi esclusi dal riepilogo annuale", Valore: annualExcludedCents / 100, Note: "Non suddivisi per anno" },
      { Controllo: "Differenza annuale", Valore: (annualCents - annualRelevantCents) / 100, Note: annualValid ? "OK" : "NON QUADRATO" },
      { Controllo: "Elenco PDF inclusi", Valore: records.map((record) => record.source_file_name).join("; "), Note: "" },
      { Controllo: "Numero righe movimento estratte", Valore: rows.length, Note: "" },
      { Controllo: "Numero prospetti per ruolo trovati", Valore: prospetti.length, Note: prospetti.join("; ") },
      { Controllo: "Numero righe IMU - RIFIUTI", Valore: imuRows.length, Note: "" },
      { Controllo: "Numero righe MULTE", Valore: multeRows.length, Note: "" },
      { Controllo: "Totale riversato da dettaglio", Valore: totalDetail, Note: "" },
      { Controllo: "Totale riversato dei PDF", Valore: pdfCents / 100, Note: "" },
      { Controllo: "Differenza tra dettaglio e totale PDF", Valore: (detailCents - pdfCents) / 100, Note: detailCents === pdfCents ? "OK" : "NON QUADRATO" },
      { Controllo: "Totale foglio IMU - RIFIUTI", Valore: totalImu, Note: "" },
      { Controllo: "Totale foglio MULTE", Valore: totalMulte, Note: "" },
      { Controllo: "Totale codici non mappati", Valore: roundCurrency(unmappedRows.reduce((sum, row) => sum + row.riversato, 0)), Note: "" },
      { Controllo: "Differenza tra totale dettaglio e totale fogli principali", Valore: difference, Note: "" },
      { Controllo: "Codici articolo non mappati", Valore: unmappedCodes.join("; "), Note: "" },
      { Controllo: "Prospetti per ruolo trovati", Valore: prospetti.join("; "), Note: "" },
      { Controllo: "Esito finale", Valore: finalStatus, Note: exportAllowed ? "" : "Risolvere abbinamenti e quadratura prima dell'export." }
    ],
    totalDetail,
    totalImu,
    totalMulte,
    difference,
    unmappedCodes, matched: matched.length, manual, missing, ambiguous, reused,
    unused: allSuspesi.filter((item) => !usedIds.has(item.id)).length,
    annualRelevantTotal: annualRelevantCents / 100, annualTotal: annualCents / 100,
    annualExcludedTotal: annualExcludedCents / 100,
    annualDifference: (annualCents - annualRelevantCents) / 100,
    exportAllowed
  };
}

function buildWorkbookData(records, allSuspesi = []) {
  const detailRows = records.flatMap((record) => record.rows || []);
  const imuRows = buildImuRifiutiRows(detailRows);
  const multeRows = buildMulteRows(detailRows);
  const reversaliRows = buildReversaliRows(detailRows);
  const prospettiRows = buildProspettiRows(detailRows);
  const annualRows = buildAnnualSummary(records);
  const controls = buildControls(records, detailRows, imuRows, multeRows, annualRows, allSuspesi);

  return {
    records,
    detailRows,
    imuRows,
    multeRows,
    reversaliRows,
    prospettiRows,
    annualRows,
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
window.buildAnnualSummary = buildAnnualSummary;
window.annualGroupForCode = annualGroupForCode;
window.compareAnnualRows = compareAnnualRows;
window.ANNUAL_COLUMNS = ANNUAL_COLUMNS;
window.buildWorkbookData = buildWorkbookData;
