const DATE_REGEX = /\b\d{2}\/\d{2}\/\d{4}\b/;
const AMOUNT_REGEX = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
const MOVEMENT_START_REGEX = /^(\d{2}\/\d{2}\/\d{4})\s+([A-Z0-9]+)\s+(\d{4})\b/i;

function parseItalianAmount(value) {
  if (value === null || value === undefined || value === "") {
    return 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const normalized = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  const number = Number.parseFloat(normalized);
  return Number.isFinite(number) ? number : 0;
}

function normalizeArticleCode(code) {
  const cleaned = String(code ?? "")
    .toUpperCase()
    .replace(/\s+/g, "")
    .trim();

  if (/^\d+$/.test(cleaned)) {
    return String(Number.parseInt(cleaned, 10));
  }

  return cleaned;
}

function parsePdfText(pages, sourceFileName) {
  const allText = pages.map((page) => page.text).join("\n");
  const dataRiversamento = findFirst(allText, /PROSPETTO DEL RIVERSAMENTO DEL\s+(\d{2}\/\d{2}\/\d{4})/i);
  const enteImpositore = cleanText(findFirst(allText, /Ente Impositore:\s*(.+)/i));
  const rows = [];
  const context = {
    source_file_name: sourceFileName,
    data_riversamento: dataRiversamento,
    ente_impositore: enteImpositore,
    anno_ruolo: "",
    numero_ruolo: "",
    prospetto_per_ruolo: "",
    codice_fiscale: "",
    denominazione: "",
    identificativo_partita_ente: "",
    identificativo_cartella: ""
  };

  for (const page of pages) {
    const lines = normalizeLines(page.text);

    for (const line of lines) {
      updateContextFromLine(context, line);

      if (!MOVEMENT_START_REGEX.test(line)) {
        continue;
      }

      const movement = parseMovementLine(line, context, page.pageNumber);
      if (movement) {
        rows.push(movement);
      }
    }
  }

  const totalRiversato = roundCurrency(rows.reduce((sum, row) => sum + row.riversato, 0));
  const prospetti = unique(rows.map((row) => row.prospetto_per_ruolo).filter(Boolean));

  return {
    id: buildPdfId(sourceFileName, dataRiversamento, totalRiversato),
    source_file_name: sourceFileName,
    data_riversamento: dataRiversamento,
    ente_impositore: enteImpositore,
    total_riversato: totalRiversato,
    row_count: rows.length,
    prospetti,
    imported_at: new Date().toISOString(),
    status: rows.length ? "OK" : "NESSUNA RIGA",
    rows
  };
}

function updateContextFromLine(context, line) {
  const prospettoMatch = line.match(/Prospetto per ruolo\s+(\d{4})\s*\/\s*([A-Z0-9]+)/i);
  if (prospettoMatch) {
    context.anno_ruolo = prospettoMatch[1];
    context.numero_ruolo = prospettoMatch[2];
    context.prospetto_per_ruolo = `${prospettoMatch[1]} / ${prospettoMatch[2]}`;
  }

  const taxpayerMatch = line.match(/Codice Fiscale:\s*([A-Z0-9]+)\s+Denominazione:\s*(.+)/i);
  if (taxpayerMatch) {
    context.codice_fiscale = taxpayerMatch[1].trim().toUpperCase();
    context.denominazione = cleanText(taxpayerMatch[2]);
    context.identificativo_partita_ente = "";
    context.identificativo_cartella = "";
  }

  const partitaMatch = line.match(/Identificativo partita ente:\s*(.+)/i);
  if (partitaMatch) {
    context.identificativo_partita_ente = cleanText(partitaMatch[1]);
  }

  const cartellaMatch = line.match(/Identificativo cartella:\s*([A-Z0-9-]+)/i);
  if (cartellaMatch) {
    context.identificativo_cartella = cartellaMatch[1].trim();
  }
}

function parseMovementLine(line, context, pageNumber) {
  const startMatch = line.match(MOVEMENT_START_REGEX);
  const amounts = line.match(AMOUNT_REGEX) || [];

  if (!startMatch || amounts.length < 9) {
    return null;
  }

  const beforeFirstAmount = line.slice(0, line.indexOf(amounts[0])).trim();
  const tokensBeforeAmount = beforeFirstAmount.split(/\s+/);
  const tipoImpostaTokens = tokensBeforeAmount.slice(3);
  const numericValues = amounts.slice(-9).map(parseItalianAmount);

  return {
    ...context,
    data_registrazione: startMatch[1],
    articolo: startMatch[2].toUpperCase(),
    articolo_normalizzato: normalizeArticleCode(startMatch[2]),
    anno_riferimento: startMatch[3],
    tipo_imposta: tipoImpostaTokens.join(" "),
    riscosso: numericValues[0],
    compenso_totale: numericValues[1],
    compenso_quota_recupero: numericValues[2],
    iva: numericValues[3],
    mora: numericValues[4],
    anticipi: numericValues[5],
    recuperi: numericValues[6],
    altro: numericValues[7],
    riversato: numericValues[8],
    pagina_pdf: pageNumber,
    raw_text: line,
    colonna_destinazione: "",
    categoria_destinazione: "",
    note: ""
  };
}

function normalizeLines(text) {
  return String(text ?? "")
    .replace(/\u00ad/g, "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function findFirst(text, regex) {
  const match = String(text ?? "").match(regex);
  return match ? match[1].trim() : "";
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values)];
}

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function buildPdfId(sourceFileName, dataRiversamento, totalRiversato) {
  const base = `${sourceFileName}|${dataRiversamento}|${totalRiversato.toFixed(2)}`;
  let hash = 0;

  for (let index = 0; index < base.length; index += 1) {
    hash = ((hash << 5) - hash + base.charCodeAt(index)) | 0;
  }

  return `pdf_${Math.abs(hash)}`;
}

window.parseItalianAmount = parseItalianAmount;
window.normalizeArticleCode = normalizeArticleCode;
window.parsePdfText = parsePdfText;
window.roundCurrency = roundCurrency;
