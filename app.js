pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js";

const elements = {
  enteInput: document.querySelector("#enteInput"),
  annoInput: document.querySelector("#annoInput"),
  operatoreInput: document.querySelector("#operatoreInput"),
  saveSettingsButton: document.querySelector("#saveSettingsButton"),
  pdfInput: document.querySelector("#pdfInput"),
  treasuryInput: document.querySelector("#treasuryInput"),
  treasurySummary: document.querySelector("#treasurySummary"),
  treasuryErrors: document.querySelector("#treasuryErrors"),
  treasuryPickerText: document.querySelector("#treasuryPickerText"),
  removeTreasuryButton: document.querySelector("#removeTreasuryButton"),
  analyzeButton: document.querySelector("#analyzeButton"),
  status: document.querySelector("#status"),
  rawText: document.querySelector("#rawText"),
  archiveTableBody: document.querySelector("#archiveTable tbody"),
  archiveHelp: document.querySelector("#archiveHelp"),
  exportArchiveButton: document.querySelector("#exportArchiveButton"),
  importArchiveInput: document.querySelector("#importArchiveInput"),
  clearArchiveButton: document.querySelector("#clearArchiveButton"),
  prospettiTable: document.querySelector("#prospettiTable"),
  imuTable: document.querySelector("#imuTable"),
  multeTable: document.querySelector("#multeTable"),
  reversaliTable: document.querySelector("#reversaliTable"),
  annualTable: document.querySelector("#annualTable"),
  controlsSummary: document.querySelector("#controlsSummary"),
  copyImuButton: document.querySelector("#copyImuButton"),
  copyMulteButton: document.querySelector("#copyMulteButton"),
  copyReversaliButton: document.querySelector("#copyReversaliButton"),
  downloadButton: document.querySelector("#downloadButton"),
  downloadAnnualButton: document.querySelector("#downloadAnnualButton")
};

const appState = {
  settings: { ...APP_CONFIG.defaultSettings },
  records: [],
  selectedIds: new Set(),
  selectedFiles: [],
  treasury: null,
  matches: {},
  manualSelections: {},
  workbookData: buildWorkbookData([])
};
let matchSaveQueue = Promise.resolve();

document.addEventListener("DOMContentLoaded", initApp);
elements.saveSettingsButton.addEventListener("click", handleSaveSettings);
elements.pdfInput.addEventListener("change", handleFileSelection);
elements.treasuryInput.addEventListener("change", handleTreasuryImport);
elements.removeTreasuryButton.addEventListener("click", handleRemoveTreasury);
elements.analyzeButton.addEventListener("click", handleAnalyzePdf);
elements.exportArchiveButton.addEventListener("click", handleExportArchive);
elements.importArchiveInput.addEventListener("change", handleImportArchive);
elements.clearArchiveButton.addEventListener("click", handleClearArchive);
elements.copyImuButton.addEventListener("click", () => copyPreview(appState.workbookData.imuRows, APP_CONFIG.imuRifiutiColumns));
elements.copyMulteButton.addEventListener("click", () => copyPreview(appState.workbookData.multeRows, APP_CONFIG.multeColumns));
elements.copyReversaliButton.addEventListener("click", () => copyPreview(appState.workbookData.reversaliRows, [
  "Tipo",
  "Voce",
  "Capitolo",
  "Accertamento",
  "Codici articolo",
  "Prospetti per ruolo inclusi",
  "Totale",
  "Note"
]));
elements.downloadButton.addEventListener("click", handleDownloadExcel);
elements.downloadAnnualButton.addEventListener("click", () => {
  exportAnnualWorkbook(appState.workbookData, readSettingsForm());
  setStatus("Riepilogo annuale generato.");
});

async function initApp() {
  try {
    appState.settings = await RuoliStorage.getArchiveSettings();
    appState.records = await RuoliStorage.getAllPdfRecords();
    appState.treasury = await RuoliStorage.getTreasuryFile();
    const storedMatches = await RuoliStorage.getMatches();
    appState.manualSelections = Object.fromEntries(Object.entries(storedMatches).filter(([, value]) => value.manualSospesoId).map(([id, value]) => [id, value.manualSospesoId]));
    appState.selectedIds = new Set(appState.records.map((record) => record.id));
    fillSettingsForm();
    renderAll();
    setStatus("Archivio locale pronto.");
  } catch (error) {
    console.error(error);
    setStatus("Non riesco ad aprire l'archivio locale del browser.", true);
  }
}

async function handleTreasuryImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
    const matrix = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { header: 1, raw: true, defval: "" });
    appState.treasury = RuoliSuspesi.parseTreasuryRows(matrix, file.name);
    appState.manualSelections = {};
    await RuoliStorage.saveTreasuryFile(appState.treasury);
    renderAll();
    setStatus(`File sospesi importato: ${file.name}.`);
  } catch (error) {
    console.error(error);
    setStatus(`File sospesi non valido: ${error.message}`, true);
  } finally { event.target.value = ""; }
}

async function handleRemoveTreasury() {
  await RuoliStorage.removeTreasuryFile();
  appState.treasury = null;
  appState.matches = {};
  appState.manualSelections = {};
  renderAll();
  setStatus("File sospesi rimosso.");
}

function fillSettingsForm() {
  elements.enteInput.value = appState.settings.ente || "";
  elements.annoInput.value = appState.settings.annoGestione || new Date().getFullYear();
  elements.operatoreInput.value = appState.settings.operatore || "";
}

async function handleSaveSettings() {
  appState.settings = readSettingsForm();
  await RuoliStorage.saveArchiveSettings(appState.settings);
  renderAll();
  setStatus("Configurazione archivio salvata.");
}

function readSettingsForm() {
  return {
    ente: elements.enteInput.value.trim(),
    annoGestione: Number(elements.annoInput.value) || new Date().getFullYear(),
    operatore: elements.operatoreInput.value.trim()
  };
}

function handleFileSelection(event) {
  appState.selectedFiles = [...event.target.files].filter((file) => file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf"));
  elements.analyzeButton.disabled = appState.selectedFiles.length === 0;
  setStatus(appState.selectedFiles.length
    ? `${appState.selectedFiles.length} PDF selezionato/i. Premi "Analizza PDF".`
    : "Nessun PDF selezionato.");
}

async function handleAnalyzePdf() {
  if (!appState.selectedFiles.length) {
    return;
  }

  elements.analyzeButton.disabled = true;
  let savedCount = 0;
  let duplicateCount = 0;

  for (const file of appState.selectedFiles) {
    try {
      setStatus(`Lettura di ${file.name}...`);
      const pages = await extractTextFromPdf(file);
      elements.rawText.value = pages.map((page) => `--- Pagina ${page.pageNumber} ---\n${page.text}`).join("\n\n");

      const parsedRecord = parsePdfText(pages, file.name);
      parsedRecord.rows = enrichRows(parsedRecord.rows);
      parsedRecord.total_riversato = roundCurrency(parsedRecord.rows.reduce((sum, row) => sum + row.riversato, 0));
      parsedRecord.row_count = parsedRecord.rows.length;
      parsedRecord.prospetti = [...new Set(parsedRecord.rows.map((row) => row.prospetto_per_ruolo).filter(Boolean))];
      parsedRecord.status = parsedRecord.rows.length ? "OK" : "NESSUNA RIGA";

      const result = await RuoliStorage.savePdfRecord(parsedRecord);
      if (result.duplicate) {
        duplicateCount += 1;
      } else {
        savedCount += 1;
        appState.selectedIds.add(parsedRecord.id);
      }
    } catch (error) {
      console.error(error);
      setStatus(`Errore nella lettura di ${file.name}. Verifica che sia un PDF testuale.`, true);
    }
  }

  appState.records = await RuoliStorage.getAllPdfRecords();
  elements.pdfInput.value = "";
  appState.selectedFiles = [];
  renderAll();
  elements.analyzeButton.disabled = true;
  setStatus(`Analisi completata. Salvati: ${savedCount}. Duplicati ignorati: ${duplicateCount}.`);
}

async function extractTextFromPdf(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    setStatus(`Estrazione testo da ${file.name}: pagina ${pageNumber} di ${pdf.numPages}...`);
    const page = await pdf.getPage(pageNumber);
    const textContent = await page.getTextContent();
    pages.push({ pageNumber, text: textItemsToLines(textContent.items) });
  }

  return pages;
}

function textItemsToLines(items) {
  const rows = [];
  const tolerance = 3;

  for (const item of items) {
    const y = item.transform[5];
    const x = item.transform[4];
    let row = rows.find((candidate) => Math.abs(candidate.y - y) <= tolerance);

    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }

    row.items.push({ x, text: item.str });
  }

  return rows
    .sort((a, b) => b.y - a.y)
    .map((row) => row.items
      .sort((a, b) => a.x - b.x)
      .map((item) => item.text)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim())
    .filter(Boolean)
    .join("\n");
}

function renderAll() {
  appState.matches = RuoliSuspesi.calculateMatches(appState.records, appState.treasury?.rows || [], appState.manualSelections);
  const matchesToSave = structuredClone(appState.matches);
  const manualToSave = { ...appState.manualSelections };
  matchSaveQueue = matchSaveQueue.then(() => RuoliStorage.saveMatches(matchesToSave, manualToSave)).catch(console.error);
  appState.records.forEach((record) => { record.match = appState.matches[record.id] || { status: "NON_TROVATA", numero_sospeso: "" }; });
  const selectedRecords = appState.records.filter((record) => appState.selectedIds.has(record.id));
  appState.workbookData = buildWorkbookData(selectedRecords, appState.treasury?.rows || []);

  renderTreasurySummary();
  renderArchiveTable();
  renderTable(elements.prospettiTable, appState.workbookData.prospettiRows, ["Prospetto per ruolo", "Totale", "Numero righe", "Stato"]);
  renderTable(elements.imuTable, appState.workbookData.imuRows, APP_CONFIG.imuRifiutiColumns);
  renderTable(elements.multeTable, appState.workbookData.multeRows, APP_CONFIG.multeColumns);
  renderTable(elements.reversaliTable, appState.workbookData.reversaliRows, ["Tipo", "Voce", "Capitolo", "Accertamento", "Codici articolo", "Prospetti per ruolo inclusi", "Totale", "Note"]);
  renderTable(elements.annualTable, appState.workbookData.annualRows, ANNUAL_COLUMNS);
  renderControls();
  setExportButtons(selectedRecords.length > 0);
}

function renderTreasurySummary() {
  const file = appState.treasury;
  elements.removeTreasuryButton.disabled = !file;
  elements.treasuryPickerText.textContent = file ? "Sostituisci file" : "Scegli file";
  elements.treasurySummary.textContent = file
    ? `${file.fileName} — righe valide: ${file.rows.length}; scartate: ${file.discarded.length}; duplicati: ${file.duplicates.length}.`
    : "Nessun file sospesi importato.";
  elements.treasuryErrors.textContent = file?.discarded.length
    ? `Righe ignorate: ${file.discarded.map((row) => row.rowNumber).join(", ")}.` : "";
}

function renderArchiveTable() {
  elements.archiveTableBody.innerHTML = "";

  for (const record of appState.records) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><input type="checkbox" ${appState.selectedIds.has(record.id) ? "checked" : ""} aria-label="Includi ${escapeHtml(record.source_file_name)}"></td>
      <td>${escapeHtml(record.source_file_name)}</td>
      <td>${escapeHtml(record.data_riversamento || "")}</td>
      <td>${record.prospetti?.length || 0}</td>
      <td>${record.row_count || 0}</td>
      <td>${formatCurrency(record.total_riversato || 0)}</td>
      <td class="sospeso-cell"></td>
      <td>${escapeHtml(record.match?.reused ? `${record.match.status} - RIUTILIZZATO` : record.match?.status || "NON_TROVATA")}</td>
      <td>${escapeHtml(record.status || "")}</td>
      <td><button type="button" class="link-button">Elimina</button></td>
    `;

    const matchCell = row.querySelector(".sospeso-cell");
    const select = document.createElement("select");
    select.setAttribute("aria-label", `Numero sospeso per ${record.source_file_name}`);
    select.innerHTML = `<option value="">${record.match?.numero_sospeso ? escapeHtml(record.match.numero_sospeso) : "Seleziona..."}</option>`;
    const claimedElsewhere = new Set(Object.entries(appState.matches).filter(([id, value]) => id !== record.id && value.sospesoId).map(([, value]) => value.sospesoId));
    for (const item of appState.treasury?.rows || []) {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.numero_sospeso} — ${item.data_effettuazione} — ${formatCurrency(item.importo_centesimi / 100)}`;
      option.disabled = claimedElsewhere.has(item.id) && appState.manualSelections[record.id] !== item.id;
      option.selected = appState.manualSelections[record.id] === item.id;
      select.appendChild(option);
    }
    select.addEventListener("change", () => {
      if (select.value) appState.manualSelections[record.id] = select.value; else delete appState.manualSelections[record.id];
      renderAll();
    });
    matchCell.appendChild(select);

    row.querySelector("input").addEventListener("change", (event) => {
      if (event.target.checked) {
        appState.selectedIds.add(record.id);
      } else {
        appState.selectedIds.delete(record.id);
      }
      renderAll();
    });

    row.querySelector("button").addEventListener("click", async () => {
      await RuoliStorage.deletePdfRecord(record.id);
      appState.selectedIds.delete(record.id);
      appState.records = await RuoliStorage.getAllPdfRecords();
      renderAll();
      setStatus(`PDF eliminato dall'archivio: ${record.source_file_name}`);
    });

    elements.archiveTableBody.appendChild(row);
  }

  elements.archiveHelp.textContent = appState.records.length
    ? `${appState.records.length} PDF in archivio. ${appState.selectedIds.size} incluso/i nell'anteprima.`
    : "Archivio vuoto.";
}

function renderTable(table, rows, columns) {
  const thead = table.querySelector("thead");
  const tbody = table.querySelector("tbody");
  thead.innerHTML = "";
  tbody.innerHTML = "";

  const headerRow = document.createElement("tr");
  for (const column of columns) {
    const th = document.createElement("th");
    th.textContent = column;
    headerRow.appendChild(th);
  }
  thead.appendChild(headerRow);

  const visibleRows = rows.slice(0, 200);
  for (const row of visibleRows) {
    const tr = document.createElement("tr");
    for (const column of columns) {
      const td = document.createElement("td");
      const value = row[column] ?? "";
      td.textContent = typeof value === "number" ? formatCurrency(value) : value;
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.colSpan = columns.length;
    td.textContent = "Nessun dato da mostrare.";
    td.className = "empty-cell";
    tr.appendChild(td);
    tbody.appendChild(tr);
  }
}

function renderControls() {
  elements.controlsSummary.innerHTML = "";

  const controls = appState.workbookData.controls;
  const cards = [
    ["Esito", controls.status],
    ["Totale dettaglio", formatCurrency(controls.totalDetail)],
    ["Totale IMU - RIFIUTI", formatCurrency(controls.totalImu)],
    ["Totale MULTE", formatCurrency(controls.totalMulte)],
    ["Differenza", formatCurrency(controls.difference)],
    ["Codici non mappati", controls.unmappedCodes.length ? controls.unmappedCodes.join(", ") : "Nessuno"]
    , ["PDF abbinati", `${controls.matched}/${appState.workbookData.records.length}`]
    , ["Manuali / non trovati / ambigui", `${controls.manual} / ${controls.missing} / ${controls.ambiguous}`]
    , ["Sospesi riutilizzati", controls.reused]
    , ["Sospesi non utilizzati", controls.unused]
    , ["Totale annuale", formatCurrency(controls.annualTotal)]
    , ["Differenza annuale/PDF", formatCurrency(controls.annualDifference)]
  ];

  for (const [label, value] of cards) {
    const card = document.createElement("div");
    card.className = `check-card ${label === "Esito" ? statusClass(controls.status) : ""}`;
    card.innerHTML = `<span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>`;
    elements.controlsSummary.appendChild(card);
  }
}

function setExportButtons(enabled) {
  elements.copyImuButton.disabled = !enabled || appState.workbookData.imuRows.length === 0;
  elements.copyMulteButton.disabled = !enabled || appState.workbookData.multeRows.length === 0;
  elements.copyReversaliButton.disabled = !enabled || appState.workbookData.reversaliRows.length === 0;
  elements.downloadButton.disabled = !enabled || !appState.workbookData.controls.exportAllowed;
  elements.downloadAnnualButton.disabled = !enabled || !appState.workbookData.controls.exportAllowed;
}

async function handleExportArchive() {
  const payload = await RuoliStorage.exportArchive();
  downloadJsonFile(payload, `archivio_ruoli_${new Date().toISOString().slice(0, 10)}.json`);
  setStatus("Archivio esportato in JSON.");
}

async function handleImportArchive(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  try {
    const payload = JSON.parse(await file.text());
    const result = await RuoliStorage.importArchive(payload);
    appState.settings = result.settings;
    appState.records = await RuoliStorage.getAllPdfRecords();
    appState.treasury = await RuoliStorage.getTreasuryFile();
    const matches = await RuoliStorage.getMatches();
    appState.manualSelections = Object.fromEntries(Object.entries(matches).filter(([, value]) => value.manualSospesoId).map(([id, value]) => [id, value.manualSospesoId]));
    appState.selectedIds = new Set(appState.records.map((record) => record.id));
    fillSettingsForm();
    renderAll();
    setStatus(`Archivio importato. Record PDF letti: ${result.imported}.`);
  } catch (error) {
    console.error(error);
    setStatus("JSON non valido o non compatibile.", true);
  } finally {
    event.target.value = "";
  }
}

async function handleClearArchive() {
  if (!confirm("Vuoi svuotare l'archivio locale dei PDF? L'operazione non elimina eventuali JSON gia esportati.")) {
    return;
  }

  await RuoliStorage.clearPdfRecords();
  appState.records = [];
  appState.selectedIds.clear();
  renderAll();
  setStatus("Archivio PDF svuotato.");
}

async function copyPreview(rows, columns) {
  await copyObjectsForExcel(rows, columns);
  setStatus("Tabella copiata. Puoi incollarla in Excel.");
}

function handleDownloadExcel() {
  exportWorkbook(appState.workbookData, readSettingsForm());
  setStatus("Excel completo generato.");
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle("error", isError);
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function statusClass(status) {
  if (status === "OK") {
    return "ok";
  }

  if (status === "DA VERIFICARE") {
    return "warning";
  }

  return "error";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
