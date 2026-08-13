const DB_NAME = "ruoli_pdf_excel";
const DB_VERSION = 2;
const PDF_STORE = "pdfs";
const SETTINGS_STORE = "settings";
const SETTINGS_KEY = "archive";
const TREASURY_STORE = "treasury";
const MATCH_STORE = "matches";
const TREASURY_KEY = "current";

function openRuoliDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(PDF_STORE)) {
        db.createObjectStore(PDF_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(TREASURY_STORE)) db.createObjectStore(TREASURY_STORE, { keyPath: "key" });
      if (!db.objectStoreNames.contains(MATCH_STORE)) db.createObjectStore(MATCH_STORE, { keyPath: "pdfId" });
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAllPdfRecords() {
  const db = await openRuoliDatabase();
  return runStoreRequest(db, PDF_STORE, "readonly", (store) => store.getAll())
    .then((records) => records.sort((a, b) => String(b.imported_at).localeCompare(String(a.imported_at))));
}

async function savePdfRecord(record) {
  const db = await openRuoliDatabase();
  const existing = await runStoreRequest(db, PDF_STORE, "readonly", (store) => store.get(record.id));

  if (existing) {
    return { saved: false, duplicate: true, record: existing };
  }

  await runStoreRequest(db, PDF_STORE, "readwrite", (store) => store.put(record));
  return { saved: true, duplicate: false, record };
}

async function deletePdfRecord(id) {
  const db = await openRuoliDatabase();
  return runStoreRequest(db, PDF_STORE, "readwrite", (store) => store.delete(id));
}

async function clearPdfRecords() {
  const db = await openRuoliDatabase();
  return runStoreRequest(db, PDF_STORE, "readwrite", (store) => store.clear());
}

async function getTreasuryFile() {
  const db = await openRuoliDatabase();
  const stored = await runStoreRequest(db, TREASURY_STORE, "readonly", (store) => store.get(TREASURY_KEY));
  return stored?.value || null;
}

async function saveTreasuryFile(value) {
  const db = await openRuoliDatabase();
  return runStoreRequest(db, TREASURY_STORE, "readwrite", (store) => store.put({ key: TREASURY_KEY, value }));
}

async function removeTreasuryFile() {
  const db = await openRuoliDatabase();
  await runStoreRequest(db, TREASURY_STORE, "readwrite", (store) => store.delete(TREASURY_KEY));
  return runStoreRequest(db, MATCH_STORE, "readwrite", (store) => store.clear());
}

async function getMatches() {
  const db = await openRuoliDatabase();
  const rows = await runStoreRequest(db, MATCH_STORE, "readonly", (store) => store.getAll());
  return Object.fromEntries(rows.map((row) => [row.pdfId, row]));
}

async function saveMatches(matches, manualSelections = {}) {
  const db = await openRuoliDatabase();
  await runStoreRequest(db, MATCH_STORE, "readwrite", (store) => store.clear());
  for (const [pdfId, match] of Object.entries(matches)) {
    await runStoreRequest(db, MATCH_STORE, "readwrite", (store) => store.put({ pdfId, ...match, manualSospesoId: manualSelections[pdfId] || "" }));
  }
}

async function getArchiveSettings() {
  const db = await openRuoliDatabase();
  const stored = await runStoreRequest(db, SETTINGS_STORE, "readonly", (store) => store.get(SETTINGS_KEY));
  return stored ? stored.value : { ...APP_CONFIG.defaultSettings };
}

async function saveArchiveSettings(settings) {
  const db = await openRuoliDatabase();
  return runStoreRequest(db, SETTINGS_STORE, "readwrite", (store) => store.put({ key: SETTINGS_KEY, value: settings }));
}

async function exportArchive() {
  const [settings, records, treasury, matches] = await Promise.all([getArchiveSettings(), getAllPdfRecords(), getTreasuryFile(), getMatches()]);
  return {
    exported_at: new Date().toISOString(),
    app: "Ruoli PDF -> Excel",
    version: 2,
    settings,
    records,
    treasury,
    matches
  };
}

async function importArchive(payload) {
  const settings = payload.settings || APP_CONFIG.defaultSettings;
  const records = Array.isArray(payload.records) ? payload.records : [];

  await saveArchiveSettings(settings);

  for (const record of records) {
    if (record && record.id) {
      await runStoreRequest(await openRuoliDatabase(), PDF_STORE, "readwrite", (store) => store.put(record));
    }
  }
  if (payload.treasury) await saveTreasuryFile(payload.treasury);
  if (payload.matches && typeof payload.matches === "object") {
    const manual = Object.fromEntries(Object.entries(payload.matches).filter(([, value]) => value.manualSospesoId).map(([id, value]) => [id, value.manualSospesoId]));
    await saveMatches(payload.matches, manual);
  }

  return { imported: records.length, settings };
}

function runStoreRequest(db, storeName, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = operation(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

window.RuoliStorage = {
  getAllPdfRecords,
  savePdfRecord,
  deletePdfRecord,
  clearPdfRecords,
  getTreasuryFile,
  saveTreasuryFile,
  removeTreasuryFile,
  getMatches,
  saveMatches,
  getArchiveSettings,
  saveArchiveSettings,
  exportArchive,
  importArchive
};
