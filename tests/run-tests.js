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
  record("s1", "203", "30/01/2026", [
    movement(2014, "9000", 10), movement(2011, "9170", 2), movement(2013, "2R60", 3),
    movement(2012, "0434", 4), movement(2012, "933I", 5), movement(2012, "424", 6),
    movement(2020, "5242", 7), movement(2018, "5243", 8), movement(2019, "1C34", 9), movement(2017, "5354", 10)
  ]),
  record("s3", "25", "20/01/2026", [movement(2022, "2R28", 1)])
]);
assert.deepStrictEqual(annual.map((x) => `${x["Numero sospeso"]}/${x["Anno riferimento"] || "ACCESSORI"}`), [
  "25/2022", "25/ACCESSORI", "203/2011", "203/2012", "203/2013", "203/2014", "203/2020", "203/ACCESSORI", "1245/2020", "1245/ACCESSORI"
], "ordinamento naturale per sospeso, anno crescente e accessori finali");
const annual203_2012 = annual.find((row) => row["Numero sospeso"] === "203" && row["Anno riferimento"] === "2012");
assert.strictEqual(annual203_2012.TARI, 4, "0424/424 escluso dalla TARI annuale");
assert.strictEqual(annual203_2012.IRPEF, 5, "933I nella colonna IRPEF");
const annual203_2020 = annual.find((row) => row["Numero sospeso"] === "203" && row["Anno riferimento"] === "2020");
assert.strictEqual(annual203_2020.MULTE, 7, "5242 nella colonna MULTE dell'anno corretto");
const accessories203 = annual.find((row) => row["Numero sospeso"] === "203" && row["Tipo riga"] === "ACCESSORI NON RIPARTITI");
assert.strictEqual(accessories203["Anno riferimento"], "", "anno vuoto per gli accessori");
assert.strictEqual(accessories203["TARI SANZIONI/INTERESSI"], 6, "424 nelle sanzioni TARI");
assert.strictEqual(accessories203["MULTE SANZIONI/INTERESSI"], 17, "5243 e 1C34 aggregati senza anno");
assert.strictEqual(accessories203["MULTE SPESE NOTIFICA"], 10, "5354 aggregato senza anno");
assert.strictEqual(annual.filter((row) => row["Numero sospeso"] === "203" && row["Tipo riga"] === "ACCESSORI NON RIPARTITI").length, 1, "accessori non duplicati tra anni");
for (const row of annual.filter((item) => item["Tipo riga"] === "TRIBUTI PER ANNO")) {
  assert.strictEqual(PRINCIPAL_COLUMNS.reduce((sum, column) => sum + row[column], 0), row.TOTALE, "totale annuale dei soli tributi principali");
  assert(ACCESSORY_COLUMNS.every((column) => row[column] === 0), "nessun accessorio sulle righe annuali");
}
assert(!ACCESSORY_COLUMNS.some((column) => column.includes("IRPEF")), "assenza di colonne accessorie IRPEF");

const categoryCodes = [
  ["2R60", 1], ["2R61", 2], ["2R62", 3], ["2S76", 4], ["2R63", 5],
  ["9000", 6], ["9170", 7], ["9175", 8], ["1C27", 9], ["9001", 10], ["1S15", 11],
  ["0424", 12], ["9361", 1], ["9362", 2], ["9363", 3], ["933I", 4]
];
const categoryRows = buildAnnualSummary([record("categories", "A2", "30/01/2026", categoryCodes.map(([code, amount]) => movement(2020, code, amount)))]);
const categoryAnnual = categoryRows.find((row) => row["Tipo riga"] === "TRIBUTI PER ANNO");
const categoryAccessories = categoryRows.find((row) => row["Tipo riga"] === "ACCESSORI NON RIPARTITI");
assert.strictEqual(categoryAnnual.IMU, 1, "solo codice IMU principale nella colonna annuale");
assert.strictEqual(categoryAccessories["IMU SANZIONI/INTERESSI"], 9, "accessori IMU nella colonna corretta");
assert.strictEqual(categoryAccessories["IMU SPESE NOTIFICA"], 5, "notifica IMU nella colonna corretta");
assert.strictEqual(categoryAnnual.ACQUA, 21, "codici principali ACQUA aggregati");
assert.strictEqual(categoryAccessories["ACQUA SANZIONI/INTERESSI"], 19, "accessori ACQUA aggregati");
assert.strictEqual(categoryAccessories["ACQUA SPESE NOTIFICA"], 11, "notifica ACQUA aggregata");
assert.strictEqual(categoryAnnual.IRPEF, 10, "9361 + 9362 + 9363 + 933I nella stessa colonna");
assert.strictEqual(categoryAccessories["TARI SANZIONI/INTERESSI"], 12, "0424 classificato come accessorio TARI");

const accessoryOnly = buildAnnualSummary([record("only", "9B", "01/02/2026", [movement(2010, "5354", 2.5)])]);
assert.strictEqual(accessoryOnly.length, 1, "sospeso con soli accessori produce una riga");
assert.strictEqual(accessoryOnly[0]["Tipo riga"], "ACCESSORI NON RIPARTITI", "riga unica di tipo accessori");

const accountingMovements = enrichRows(categoryCodes.map(([code, amount]) => movement(2020, code, amount)));
const accountingRecord = record("accounting", "A2", "30/01/2026", accountingMovements);
const accountingData = buildWorkbookData([accountingRecord]);
assert.strictEqual(accountingData.controls.annualDifference, 0, "quadratura annuale indipendente");
assert.strictEqual(accountingData.controls.accessoryDifference, 0, "quadratura accessori indipendente");
assert.strictEqual(accountingData.controls.relevantDifference, 0, "quadratura complessiva rilevante");
assert.strictEqual(accountingData.accessoryRows.length, 1, "una riga Accessori per sospeso");
assert.strictEqual(accountingData.controls.exportAllowed, true, "quadrature valide consentono export");
const mismatchedPdfTotal = { ...accountingRecord, total_riversato: accountingRecord.total_riversato + 1 };
assert.strictEqual(buildWorkbookData([mismatchedPdfTotal]).controls.exportAllowed, false, "quadratura contabile completa rispetto al totale PDF obbligatoria");

const fakeSheets = [];
function excelColumn(index) {
  let value = index + 1;
  let result = "";
  while (value) { value -= 1; result = String.fromCharCode(65 + (value % 26)) + result; value = Math.floor(value / 26); }
  return result;
}
global.XLSX = {
  utils: {
    book_new: () => ({ SheetNames: [] }),
    aoa_to_sheet: (data) => {
      const sheet = {};
      data.forEach((row, r) => row.forEach((value, c) => { sheet[`${excelColumn(c)}${r + 1}`] = { v: value, t: typeof value === "number" ? "n" : "s" }; }));
      return sheet;
    },
    encode_range: () => "A1:Z99",
    encode_cell: ({ r, c }) => `${excelColumn(c)}${r + 1}`,
    book_append_sheet: (workbook, sheet, name) => { workbook.SheetNames.push(name); fakeSheets.push({ name, sheet }); }
  },
  writeFile: () => {}
};
vm.runInThisContext(fs.readFileSync("excel.js", "utf8"), { filename: "excel.js" });
exportAnnualWorkbook(accountingData, { annoGestione: 2026 });
assert.deepStrictEqual(fakeSheets.map(({ name }) => name), ["Riepilogo annuale", "Accessori per sospeso", "Anno 2020"], "struttura fogli annuali");
const yearSheet = fakeSheets.find(({ name }) => name === "Anno 2020").sheet;
assert(!Object.values(yearSheet).some((cell) => ACCESSORY_COLUMNS.includes(cell.v)), "foglio Anno YYYY privo di colonne accessorie");
const accessorySheet = fakeSheets.find(({ name }) => name === "Accessori per sospeso").sheet;
assert.strictEqual(Object.values(accessorySheet).filter((cell) => cell.v === "A2").length, 1, "una sola riga per sospeso nel foglio accessori");
for (const { sheet } of fakeSheets) {
  for (const cell of Object.values(sheet).filter((item) => typeof item.v === "number")) {
    assert.strictEqual(cell.t, "n", "cella importo Excel numerica");
    if (cell.z) assert.strictEqual(cell.z, "#,##0.00", "cella importo formattata con due decimali");
  }
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
