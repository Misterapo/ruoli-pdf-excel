function exportWorkbook(workbookData, settings) {
  const workbook = XLSX.utils.book_new();

  appendObjectSheet(workbook, "IMU - RIFIUTI", workbookData.imuRows, APP_CONFIG.imuRifiutiColumns, {
    totalColumns: APP_CONFIG.imuRifiutiAccountingColumns
  });
  appendObjectSheet(workbook, "MULTE", workbookData.multeRows, APP_CONFIG.multeColumns, {
    totalColumns: APP_CONFIG.multeAccountingColumns
  });
  appendObjectSheet(workbook, "Dettaglio PDF", detailRowsForExport(workbookData.detailRows), APP_CONFIG.detailColumns.map((column) => column.label));
  appendObjectSheet(workbook, "Riepilogo reversali", workbookData.reversaliRows, [
    "Tipo",
    "Voce",
    "Capitolo",
    "Accertamento",
    "Codici articolo",
    "Prospetti per ruolo inclusi",
    "Totale",
    "Note"
  ]);
  appendObjectSheet(workbook, "Controlli", workbookData.controls.summary, ["Controllo", "Valore", "Note"]);

  XLSX.writeFile(workbook, buildExportFileName(workbookData.records, settings));
}

function appendObjectSheet(workbook, sheetName, rows, columns, options = {}) {
  const header = columns;
  const body = rows.map((row) => header.map((column) => row[column] ?? ""));
  const totalRow = buildTotalRow(header, rows, options.totalColumns || []);
  const data = totalRow ? [header, ...body, [], totalRow] : [header, ...body];
  const worksheet = XLSX.utils.aoa_to_sheet(data);

  worksheet["!cols"] = header.map((column) => ({ wch: estimateColumnWidth(column, rows) }));
  worksheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(0, data.length - 1), c: header.length - 1 } }) };

  styleHeader(worksheet, header.length);
  formatNumericCells(worksheet, data, header);
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
}

function detailRowsForExport(rows) {
  return rows.map((row) => {
    const result = {};
    for (const column of APP_CONFIG.detailColumns) {
      result[column.label] = row[column.key] ?? "";
    }
    return result;
  });
}

function buildTotalRow(columns, rows, totalColumns) {
  if (!totalColumns.length || !rows.length) {
    return null;
  }

  return columns.map((column, index) => {
    if (index === 0) {
      return "TOTALE";
    }

    if (totalColumns.includes(column) || column === "TOTALI") {
      return roundCurrency(rows.reduce((sum, row) => sum + (Number(row[column]) || 0), 0));
    }

    return "";
  });
}

function styleHeader(worksheet, columnCount) {
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    const address = XLSX.utils.encode_cell({ r: 0, c: columnIndex });
    if (worksheet[address]) {
      worksheet[address].s = {
        font: { bold: true, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: "1F4E78" } }
      };
    }
  }
}

function formatNumericCells(worksheet, data, header) {
  const moneyColumns = new Set([
    ...APP_CONFIG.imuRifiutiAccountingColumns,
    ...APP_CONFIG.multeAccountingColumns,
    "IMPORTO PROV.",
    "TOTALI",
    "Riscosso",
    "Compenso totale",
    "Compenso quota recupero",
    "IVA",
    "Mora",
    "Anticipi",
    "Recuperi",
    "Altro",
    "Riversato",
    "Totale",
    "Valore"
  ]);

  for (let rowIndex = 1; rowIndex < data.length; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < header.length; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
      const cell = worksheet[address];
      const columnName = header[columnIndex];

      if (!cell || !moneyColumns.has(columnName) || typeof cell.v !== "number") {
        continue;
      }

      cell.t = "n";
      cell.z = "#,##0.00";
    }
  }
}

function estimateColumnWidth(column, rows) {
  const sampleWidth = rows.reduce((max, row) => Math.max(max, String(row[column] ?? "").length), String(column).length);
  return Math.min(Math.max(sampleWidth + 2, 12), 42);
}

function buildExportFileName(records, settings) {
  const year = settings?.annoGestione || new Date().getFullYear();
  const dates = [...new Set(records.map((record) => toIsoDate(record.data_riversamento)).filter(Boolean))];

  if (dates.length === 1) {
    return `RUOLI_${dates[0]}.xlsx`;
  }

  if (dates.length > 1) {
    return `RUOLI_${year}_periodo.xlsx`;
  }

  return `RUOLI_${year}.xlsx`;
}

function toIsoDate(italianDate) {
  const match = String(italianDate ?? "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : "";
}

async function copyObjectsForExcel(rows, columns) {
  const lines = [
    columns.join("\t"),
    ...rows.map((row) => columns.map((column) => sanitizeCell(row[column])).join("\t"))
  ];

  await navigator.clipboard.writeText(lines.join("\n"));
}

function downloadJsonFile(payload, fileName) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function sanitizeCell(value) {
  return String(value ?? "").replace(/\r?\n/g, " ").trim();
}

window.exportWorkbook = exportWorkbook;
window.copyObjectsForExcel = copyObjectsForExcel;
window.downloadJsonFile = downloadJsonFile;
window.buildExportFileName = buildExportFileName;
