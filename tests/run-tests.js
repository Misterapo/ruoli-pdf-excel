const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
global.window = global;
for (const file of ["parser.js", "sospesi.js", "config.js", "mapper.js"]) vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
vm.runInThisContext(fs.readFileSync("storage.js", "utf8"), { filename: "storage.js" });

const excelDate = (Date.UTC(2026, 0, 30) - Date.UTC(1899, 11, 30)) / 86400000;
assert.strictEqual(RuoliSuspesi.normalizeTreasuryDate(excelDate), "30/01/2026", "data Excel");
assert.strictEqual(RuoliSuspesi.normalizeTreasuryDate("22/06/2026"), "22/06/2026", "data italiana");
assert.strictEqual(RuoliSuspesi.normalizeTreasuryDate(new Date(2026, 0, 30)), "30/01/2026", "data Excel locale Europe/Rome");
assert.strictEqual(RuoliSuspesi.amountToCents("€ 1.234,56"), 123456, "centesimi italiani");
assert.strictEqual(RuoliSuspesi.amountToCents(692.53), 69253, "centesimi numerici");
assert.strictEqual(RuoliSuspesi.amountToCents("N/D"), null, "importo testuale senza cifre non valido");

const imported = RuoliSuspesi.parseTreasuryRows([
  [" Data-effettuazione ", "IMPORTO (€)", "Riscossione!"],
  [excelDate, "692,53", 203],
  ["22/06/2026", 7.52, 1245],
  ["", 9, 99],
  [excelDate, "692,53", 203]
], "sintetico.xlsx");
assert.strictEqual(imported.rows.length, 2, "lettura righe valide");
assert.strictEqual(imported.discarded.length, 1, "righe incomplete scartate");
assert.strictEqual(imported.duplicates.length, 1, "duplicati segnalati");
const preferredDate = RuoliSuspesi.parseTreasuryRows([
  ["Data valuta", "Data effettuazione", "Importo", "Riscossione"],
  ["29/01/2026", "30/01/2026", "692,53", "203"]
]);
assert.strictEqual(preferredDate.rows[0].data_effettuazione, "30/01/2026", "priorità a Data effettuazione");
const preferredAmountAndNumber = RuoliSuspesi.parseTreasuryRows([
  ["Data effettuazione", "Importo commissioni", "Importo", "Data riscossione", "Riscossione"],
  ["30/01/2026", "1,50", "692,53", "29/01/2026", "203"]
]);
assert.strictEqual(preferredAmountAndNumber.rows[0].importo_centesimi, 69253, "priorità all'intestazione Importo esatta");
assert.strictEqual(preferredAmountAndNumber.rows[0].numero_sospeso, "203", "priorità all'intestazione Riscossione esatta");
const invalidTextAmount = RuoliSuspesi.parseTreasuryRows([
  ["Data effettuazione", "Importo", "Riscossione"],
  ["30/01/2026", "N/D", "204"]
]);
assert.strictEqual(invalidTextAmount.rows.length, 0, "importo senza cifre non importato");
assert.strictEqual(invalidTextAmount.discarded.length, 1, "importo senza cifre scartato");

const pdf = (id, date, total) => ({ id, data_riversamento: date, total_riversato: total, rows: [{}] });
let matches = RuoliSuspesi.calculateMatches([pdf("a", "30/01/2026", 692.53)], imported.rows);
assert.strictEqual(matches.a.status, "AUTO_CERTA", "corrispondenza certa");
matches = RuoliSuspesi.calculateMatches([pdf("a", "01/01/2026", 1)], imported.rows);
assert.strictEqual(matches.a.status, "NON_TROVATA", "corrispondenza assente");
const duplicateCandidate = { ...imported.rows[0], id: "altro-id", numero_sospeso: "204" };
matches = RuoliSuspesi.calculateMatches([pdf("a", "30/01/2026", 692.53)], [...imported.rows, duplicateCandidate]);
assert.strictEqual(matches.a.status, "AMBIGUA", "corrispondenza ambigua non scelta");
matches = RuoliSuspesi.calculateMatches([pdf("a", "30/01/2026", 692.53), pdf("b", "22/06/2026", 7.52)], imported.rows, { a: imported.rows[0].id });
assert.strictEqual(matches.a.status, "MANUALE", "risoluzione manuale");
matches = RuoliSuspesi.calculateMatches([pdf("a", "30/01/2026", 692.53), pdf("b", "30/01/2026", 692.53)], imported.rows, { a: imported.rows[0].id, b: imported.rows[0].id });
assert(matches.a.reused && matches.b.reused, "riutilizzo vietato e segnalato");
const emptyPdf = { ...pdf("empty", "30/01/2026", 0), rows: [], status: "NESSUNA RIGA" };
matches = RuoliSuspesi.calculateMatches([emptyPdf], imported.rows, { empty: imported.rows[0].id });
assert.strictEqual(matches.empty.status, "NON_TROVATA", "PDF senza movimenti non abbinabile manualmente");
assert.strictEqual(matches.empty.invalidParse, true, "PDF senza movimenti segnalato come non analizzato");

const record = (id, number, date, movements) => ({ id, data_riversamento: date, total_riversato: movements.reduce((s, x) => s + x.riversato, 0), match: { status: "MANUALE", numero_sospeso: number, sospesoId: id }, rows: movements });
const movement = (year, code, amount) => ({ anno_riferimento: String(year), articolo: code, riversato: amount });
const annual = buildAnnualSummary([
  record("s2", "1245", "22/06/2026", [movement(2020, "9175", 7.52)]),
  record("s1", "203", "30/01/2026", [movement(2014, "9000", 10), movement(2011, "9170", 2), movement(2013, "2R60", 3), movement(2012, "0434", 4), movement(2012, "933I", 5), movement(2012, "424", 6)]),
  record("s3", "25", "20/01/2026", [movement(2022, "2R28", 1)])
]);
assert.deepStrictEqual(annual.map((x) => `${x["Numero sospeso"]}/${x["Anno riferimento"]}`),
  ["25/2022", "203/2011", "203/2012", "203/2013", "203/2014", "1245/2020"],
  "ordinamento naturale per sospeso, poi anno crescente con tutte le righe 203 consecutive");
const annual203_2012 = annual.find((row) => row["Numero sospeso"] === "203" && row["Anno riferimento"] === "2012");
assert.strictEqual(annual203_2012.TARI, 4, "TARI e zero iniziale");
assert.strictEqual(annual203_2012.IRPEF, 5, "933I in IRPEF");
assert.strictEqual(annual203_2012.TOTALE, 9, "424 escluso dal totale annuale");
assert(!Object.prototype.hasOwnProperty.call(annual203_2012, "ALTRI"), "ALTRI assente dalle righe annuali");
assert(!ANNUAL_COLUMNS.includes("ALTRI"), "ALTRI assente dalle intestazioni annuali");
for (const row of annual) assert.strictEqual(row.ACQUA + row.IMU + row.TARI + row.IRPEF, row.TOTALE, "totale limitato alle quattro categorie");

const categoryCases = buildAnnualSummary([record("categories", "203", "30/01/2026", [
  ...["2R61", "2R62", "2R63", "2Y98", "2R51", "2Y99", "1C39", "2R95", "2S74", "2Z01", "2SZ01", "1S15"].map((code) => movement(2020, code, 10)),
  movement(2020, "2R60", 1), movement(2020, "2R28", 2), movement(2020, "2Y54", 3),
  movement(2020, "0434", 4), movement(2020, "434", 5), movement(2020, "2S79", 6), movement(2020, "933I", 7)
])])[0];
assert.strictEqual(categoryCases.IMU, 1, "solo 2R60 incluso in IMU");
assert.strictEqual(categoryCases.TARI, 20, "soli codici principali inclusi in TARI");
assert.strictEqual(categoryCases.IRPEF, 7, "933I incluso in IRPEF");
assert.strictEqual(categoryCases.TOTALE, 28, "accessori esclusi dal totale");
assert.strictEqual(mapArticleToColumn("933I").voce, "IRPEF", "933I nella mappatura generale");

const accountingMovements = enrichRows([movement(2020, "2R28", 20), movement(2020, "424", 6)]);
const accountingRecord = record("accounting", "203", "30/01/2026", accountingMovements);
const accountingData = buildWorkbookData([accountingRecord]);
assert.strictEqual(accountingData.controls.annualRelevantTotal, 20, "quadratura annuale sul solo totale ammesso");
assert.strictEqual(accountingData.controls.annualTotal, 20, "riepilogo annuale coincide con il rilevante");
assert.strictEqual(accountingData.controls.annualExcludedTotal, 6, "totale accessori esclusi esposto senza ripartizione annuale");
assert.strictEqual(accountingData.controls.annualDifference, 0, "differenza annuale in centesimi nulla");
assert.strictEqual(accountingData.detailRows.reduce((sum, row) => sum + row.riversato, 0), 26, "accessorio conservato nel dettaglio");
assert.strictEqual(accountingData.imuRows[0]["TARI/TARSU/TARES SANZ/INTERESSI"], 6, "accessorio conservato nella contabilità");
assert.strictEqual(accountingData.reversaliRows.find((row) => row.Voce === "TARI/TARSU/TARES SANZ/INTERESSI").Totale, 6, "accessorio conservato nelle reversali");
assert.strictEqual(accountingData.controls.exportAllowed, true, "accessorio mappato escluso dall'annuale non blocca l'export");
const mismatchedPdfTotal = { ...accountingRecord, total_riversato: 27 };
assert.strictEqual(buildWorkbookData([mismatchedPdfTotal]).controls.exportAllowed, false, "quadratura contabile completa rispetto al totale PDF ancora obbligatoria");

const fakeSheets = [];
global.XLSX = {
  utils: {
    book_new: () => ({ SheetNames: [] }),
    aoa_to_sheet: (data) => {
      const sheet = {};
      data.forEach((row, r) => row.forEach((value, c) => { sheet[`${String.fromCharCode(65 + c)}${r + 1}`] = { v: value, t: typeof value === "number" ? "n" : "s" }; }));
      return sheet;
    },
    encode_range: () => "A1:J9",
    encode_cell: ({ r, c }) => `${String.fromCharCode(65 + c)}${r + 1}`,
    book_append_sheet: (workbook, sheet, name) => { workbook.SheetNames.push(name); fakeSheets.push({ name, sheet }); }
  },
  writeFile: () => {}
};
vm.runInThisContext(fs.readFileSync("excel.js", "utf8"), { filename: "excel.js" });
exportAnnualWorkbook(accountingData, { annoGestione: 2026 });
assert.deepStrictEqual(fakeSheets.map(({ name }) => name), ["Riepilogo annuale", "Anno 2020"], "riepilogo generale e foglio annuale prodotti nello stesso ordine");
for (const { sheet } of fakeSheets) {
  assert(!Object.values(sheet).some((cell) => cell.v === "ALTRI"), "ALTRI assente dagli export annuali");
  const moneyCell = Object.values(sheet).find((cell) => cell.v === 20 && cell.t === "n");
  assert(moneyCell && moneyCell.z === "#,##0.00", "importi Excel numerici con due decimali");
}

const archived933I = {
  id: "archived-933i",
  rows: [{
    articolo: "933I",
    articolo_normalizzato: "933I",
    categoria_destinazione: "NON MAPPATO",
    colonna_destinazione: ""
  }]
};
const enrichedArchiveRecord = RuoliStorage.enrichPdfRecord(archived933I);
assert.strictEqual(enrichedArchiveRecord.rows[0].categoria_destinazione, "IMU - RIFIUTI", "record PDF archiviato riarricchito con mappatura corrente");
assert.strictEqual(enrichedArchiveRecord.rows[0].colonna_destinazione, "IRPEF", "933I archiviato riclassificato come IRPEF");

const repeatedlyEnriched = RuoliStorage.enrichPdfRecord({
  id: "still-unmapped",
  rows: [{ articolo: "ZZZZ", note: "Nota operatore; Codice articolo non mappato; Altra nota; Codice articolo non mappato" }]
});
const enrichedAgain = RuoliStorage.enrichPdfRecord(repeatedlyEnriched);
assert.strictEqual(
  enrichedAgain.rows[0].note,
  "Nota operatore; Altra nota; Codice articolo non mappato",
  "riarricchimenti ripetuti mantengono le altre note e una sola diagnosi generata"
);

const migrated933I = RuoliStorage.enrichPdfRecord({
  id: "migrated-933i",
  rows: [{ articolo: "933I", note: "Nota operatore; Codice articolo non mappato; Altra nota" }]
});
assert.strictEqual(migrated933I.rows[0].colonna_destinazione, "IRPEF", "933I archiviato migrato a IRPEF");
assert.strictEqual(migrated933I.rows[0].note, "Nota operatore; Altra nota", "933I migrato perde solo la diagnosi non più valida");

const normalizedV1 = RuoliStorage.normalizeArchivePayload({ version: 1, records: [archived933I] });
assert.strictEqual(normalizedV1.records.length, 1, "record versione 1 conservati nell'importazione sostitutiva");
assert.strictEqual(normalizedV1.records[0].rows[0].colonna_destinazione, "IRPEF", "record versione 1 riarricchito");
assert.strictEqual(normalizedV1.treasury, null, "tesoreria mancante in versione 1 sostituita con archivio vuoto");
assert.deepStrictEqual(normalizedV1.matches, {}, "abbinamenti mancanti in versione 1 sostituiti con archivio vuoto");
const normalizedNullStores = RuoliStorage.normalizeArchivePayload({ records: [], treasury: null, matches: null, settings: null });
assert.deepStrictEqual(normalizedNullStores.records, [], "elenco PDF vuoto mantiene semantica di sostituzione completa");
assert.strictEqual(normalizedNullStores.treasury, null, "tesoreria nulla mantiene semantica di sostituzione completa");
assert.deepStrictEqual(normalizedNullStores.matches, {}, "abbinamenti nulli mantengono semantica di sostituzione completa");
assert.deepStrictEqual(normalizedNullStores.settings, APP_CONFIG.defaultSettings, "impostazioni mancanti ripristinate ai valori predefiniti");

const replacedStores = Object.fromEntries(["pdfs", "settings", "treasury", "matches"].map((name) => [name, { cleared: 0, values: [] }]));
const fakeDb = {
  transaction() {
    const transaction = {
      objectStore(name) {
        return {
          clear() { replacedStores[name].cleared += 1; },
          put(value) { replacedStores[name].values.push(value); }
        };
      }
    };
    queueMicrotask(() => transaction.oncomplete());
    return transaction;
  }
};

const unmappedRecord = record("unmapped", "999", "30/01/2026", [{
  ...movement(2026, "ZZZZ", 10), articolo_normalizzato: "ZZZZ", categoria_destinazione: "NON MAPPATO", colonna_destinazione: ""
}]);
const blocked = buildWorkbookData([unmappedRecord]);
assert.strictEqual(blocked.controls.annualDifference, 0, "totale annuale coerente nel caso non mappato");
assert.strictEqual(blocked.controls.matched, 1, "PDF validamente abbinato nel caso non mappato");
assert.strictEqual(blocked.controls.exportAllowed, false, "codice non mappato blocca export");
assert.strictEqual(blocked.controls.status, "BLOCCATO", "esito bloccato con codice non mappato");

emptyPdf.match = { status: "MANUALE", numero_sospeso: "203", sospesoId: imported.rows[0].id };
const emptyBlocked = buildWorkbookData([emptyPdf], imported.rows);
assert.strictEqual(emptyBlocked.controls.exportAllowed, false, "PDF senza movimenti blocca export anche con match manuale preesistente");
assert.strictEqual(emptyBlocked.controls.status, "BLOCCATO", "PDF senza movimenti mantiene l'esito bloccato");

(async () => {
  await RuoliStorage.replaceArchiveStores(fakeDb, normalizedV1);
  assert(Object.values(replacedStores).every((store) => store.cleared === 1), "importazione pulisce tutti gli archivi prima del ripristino");
  assert.strictEqual(replacedStores.pdfs.values.length, 1, "importazione ripristina soltanto i PDF del JSON");
  assert.strictEqual(replacedStores.settings.values.length, 1, "importazione sostituisce sempre le impostazioni");
  assert.strictEqual(replacedStores.treasury.values.length, 0, "tesoreria mancante elimina quella preesistente");
  assert.strictEqual(replacedStores.matches.values.length, 0, "abbinamenti mancanti eliminano quelli preesistenti");

  let persisted = {};
  const latest = { pdf1: { status: "MANUALE", sospesoId: "s1", numero_sospeso: "203", manualSospesoId: "s1" } };
  const pendingSave = Promise.resolve().then(() => { persisted = structuredClone(latest); });
  const payload = await RuoliStorage.exportArchiveAfter(pendingSave, async () => ({ matches: persisted }));
  assert.strictEqual(payload.matches.pdf1.manualSospesoId, "s1", "export immediato include ultima scelta manuale");
  console.log("OK: tutti i test deterministici superati");
})().catch((error) => { console.error(error); process.exitCode = 1; });
