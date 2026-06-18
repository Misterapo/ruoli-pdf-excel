const DB_NAME = "ruoli_pdf_excel";
const DB_VERSION = 1;
const PDF_STORE = "pdfs";
const SETTINGS_STORE = "settings";
const SETTINGS_KEY = "archive";

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
  const [settings, records] = await Promise.all([getArchiveSettings(), getAllPdfRecords()]);
  return {
    exported_at: new Date().toISOString(),
    app: "Ruoli PDF -> Excel",
    version: 1,
    settings,
    records
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
  getArchiveSettings,
  saveArchiveSettings,
  exportArchive,
  importArchive
};
