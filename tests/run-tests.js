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
  record("s1", "203", "30/01/2026", [movement(2021, "9000", 10), movement(2021, "9170", 2), movement(2021, "2R60", 3), movement(2021, "0434", 4), movement(2021, "933I", 5), movement(2021, "XXXX", 6)]),
  record("s2", "1245", "22/06/2026", [movement(2022, "9175", 7.52)])
]);
assert.deepStrictEqual(annual.map((x) => x["Anno riferimento"]), ["2021", "2022"], "raggruppamento più anni");
assert.strictEqual(annual[0].ACQUA, 12, "ACQUA");
assert.strictEqual(annual[0].IMU, 3, "IMU");
assert.strictEqual(annual[0].TARI, 4, "TARI e zero iniziale");
assert.strictEqual(annual[0].IRPEF, 5, "933I in IRPEF");
assert.strictEqual(annual[0].ACQUA + annual[0].IMU + annual[0].TARI + annual[0].IRPEF + annual[0].ALTRI, annual[0].TOTALE, "quadratura categorie");
assert.strictEqual(mapArticleToColumn("933I").voce, "IRPEF", "933I nella mappatura generale");

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
