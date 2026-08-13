const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
global.window = global;
for (const file of ["parser.js", "sospesi.js", "config.js", "mapper.js"]) vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });

const excelDate = (Date.UTC(2026, 0, 30) - Date.UTC(1899, 11, 30)) / 86400000;
assert.strictEqual(RuoliSuspesi.normalizeTreasuryDate(excelDate), "30/01/2026", "data Excel");
assert.strictEqual(RuoliSuspesi.normalizeTreasuryDate("22/06/2026"), "22/06/2026", "data italiana");
assert.strictEqual(RuoliSuspesi.amountToCents("€ 1.234,56"), 123456, "centesimi italiani");
assert.strictEqual(RuoliSuspesi.amountToCents(692.53), 69253, "centesimi numerici");

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

const pdf = (id, date, total) => ({ id, data_riversamento: date, total_riversato: total, rows: [] });
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
console.log("OK: tutti i test deterministici superati");
