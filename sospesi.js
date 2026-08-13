/* Importazione e abbinamento dei sospesi: funzioni pure, utilizzabili anche nei test Node. */
(function (root) {
  "use strict";

  function normalizeHeader(value) {
    return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  }

  function italianDateParts(day, month, year) {
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
    return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
  }

  function normalizeTreasuryDate(value) {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return italianDateParts(value.getUTCDate(), value.getUTCMonth() + 1, value.getUTCFullYear());
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      // Excel (sistema 1900): il giorno fittizio 29/02/1900 e' gia compensato dall'epoch.
      const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000);
      return italianDateParts(date.getUTCDate(), date.getUTCMonth() + 1, date.getUTCFullYear());
    }
    const text = String(value ?? "").trim();
    let match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (match) return italianDateParts(Number(match[1]), Number(match[2]), Number(match[3]));
    match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
    return match ? italianDateParts(Number(match[3]), Number(match[2]), Number(match[1])) : "";
  }

  function amountToCents(value) {
    if (value === null || value === undefined || value === "") return null;
    if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : null;
    let text = String(value).trim().replace(/\s|€|EUR/gi, "");
    if (!text) return null;
    const comma = text.lastIndexOf(",");
    const dot = text.lastIndexOf(".");
    if (comma > dot) text = text.replace(/\./g, "").replace(",", ".");
    else if (dot > comma && comma >= 0) text = text.replace(/,/g, "");
    else if (comma >= 0) text = text.replace(",", ".");
    text = text.replace(/[^0-9.-]/g, "");
    const number = Number(text);
    return Number.isFinite(number) ? Math.round(number * 100) : null;
  }

  function findColumn(headers, candidates) {
    const normalized = headers.map(normalizeHeader);
    return normalized.findIndex((header) => candidates.some((candidate) => header === candidate || header.includes(candidate)));
  }

  function parseTreasuryRows(matrix, fileName = "") {
    if (!Array.isArray(matrix) || !matrix.length) return { fileName, rows: [], discarded: [], duplicates: [] };
    const headers = matrix[0];
    const dateIndex = findColumn(headers, ["data effettuazione", "data operazione", "data"]);
    const amountIndex = findColumn(headers, ["importo"]);
    const numberIndex = findColumn(headers, ["riscossione", "numero riscossione", "numero sospeso", "sospeso"]);
    if ([dateIndex, amountIndex, numberIndex].includes(-1)) throw new Error("Intestazioni obbligatorie non trovate: data effettuazione, importo, riscossione.");
    const rows = [], discarded = [], duplicates = [], seen = new Set();
    matrix.slice(1).forEach((source, offset) => {
      const date = normalizeTreasuryDate(source[dateIndex]);
      const amountCents = amountToCents(source[amountIndex]);
      const number = String(source[numberIndex] ?? "").trim();
      const rowNumber = offset + 2;
      if (!date || amountCents === null || !number) {
        discarded.push({ rowNumber, reason: "Data, importo o riscossione mancante/non valido" });
        return;
      }
      const id = `${number}|${date}|${amountCents}`;
      const normalized = { id, numero_sospeso: number, data_effettuazione: date, importo_centesimi: amountCents, rowNumber };
      if (seen.has(id)) duplicates.push(normalized); else { seen.add(id); rows.push(normalized); }
    });
    return { fileName, rows, discarded, duplicates, importedAt: new Date().toISOString() };
  }

  function calculateMatches(records, suspesi, manualSelections = {}) {
    const results = {};
    const claimed = new Map();
    // Le scelte manuali valide hanno precedenza; i duplicati restano esplicitamente bloccanti.
    for (const record of records) {
      const chosenId = manualSelections[record.id];
      if (!chosenId) continue;
      const item = suspesi.find((entry) => entry.id === chosenId);
      if (!item) continue;
      results[record.id] = { status: "MANUALE", sospesoId: item.id, numero_sospeso: item.numero_sospeso };
      if (!claimed.has(item.id)) claimed.set(item.id, []);
      claimed.get(item.id).push(record.id);
    }
    for (const record of records) {
      if (results[record.id]) continue;
      const cents = amountToCents(record.total_riversato);
      const candidates = suspesi.filter((item) => item.data_effettuazione === normalizeTreasuryDate(record.data_riversamento)
        && item.importo_centesimi === cents && !claimed.has(item.id));
      if (candidates.length === 1) {
        const item = candidates[0];
        results[record.id] = { status: "AUTO_CERTA", sospesoId: item.id, numero_sospeso: item.numero_sospeso };
        claimed.set(item.id, [record.id]);
      } else {
        results[record.id] = { status: candidates.length ? "AMBIGUA" : "NON_TROVATA", candidates: candidates.map((item) => item.id), numero_sospeso: "" };
      }
    }
    for (const [id, pdfIds] of claimed) {
      if (pdfIds.length > 1) pdfIds.forEach((pdfId) => { results[pdfId] = { ...results[pdfId], reused: true }; });
    }
    return results;
  }

  const api = { normalizeHeader, normalizeTreasuryDate, amountToCents, parseTreasuryRows, calculateMatches };
  root.RuoliSuspesi = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
