const IMU_RIFIUTI_ACCOUNTING_COLUMNS = [
  "ACQUA",
  "INTROITI E RIMB. DIVERSI RUOLI",
  "ACQUEDOTTO SPESE NOTIFICA",
  "RUOLO IMU 2013-2014",
  "RUOLO IMU 2014-2015",
  "IMU PREGRESSA",
  "IMU SANZ/INTERESSI",
  "IMU SPESE NOTIFICA",
  "IRPEF",
  "TARES/TARSU/TARI PREGRESSA",
  "TARI/TARSU/TARES SANZ/INTERESSI",
  "TARI SPESE NOTIFICA"
];

const MULTE_ACCOUNTING_COLUMNS = [
  "MULTE PREGRESSE",
  "MULTE SANZ/INTERESSI PREGRESSI",
  "MULTE SPESE NOTIFICA PREGRESSE"
];

const MAIN_PREFIX_COLUMNS = [
  "NUMERO PROVV",
  "DATA CARICO",
  "IMPORTO PROV.",
  "PROSPETTO PER RUOLO",
  "ANNO RIFERIMENTO",
  "NOME"
];

const IMU_RIFIUTI_COLUMNS = [
  ...MAIN_PREFIX_COLUMNS,
  ...IMU_RIFIUTI_ACCOUNTING_COLUMNS,
  "TOTALI",
  "NOTE"
];

const MULTE_COLUMNS = [
  ...MAIN_PREFIX_COLUMNS,
  ...MULTE_ACCOUNTING_COLUMNS,
  "TOTALI",
  "NOTE"
];

const DETAIL_COLUMNS = [
  { key: "source_file_name", label: "File origine" },
  { key: "data_riversamento", label: "Data riversamento" },
  { key: "ente_impositore", label: "Ente impositore" },
  { key: "prospetto_per_ruolo", label: "Prospetto per ruolo" },
  { key: "anno_ruolo", label: "Anno ruolo" },
  { key: "numero_ruolo", label: "Numero ruolo" },
  { key: "codice_fiscale", label: "Codice fiscale" },
  { key: "denominazione", label: "Denominazione" },
  { key: "identificativo_partita_ente", label: "Identificativo partita ente" },
  { key: "identificativo_cartella", label: "Identificativo cartella" },
  { key: "data_registrazione", label: "Data registrazione" },
  { key: "articolo", label: "Articolo" },
  { key: "articolo_normalizzato", label: "Articolo normalizzato" },
  { key: "anno_riferimento", label: "Anno riferimento" },
  { key: "tipo_imposta", label: "Tipo imposta" },
  { key: "riscosso", label: "Riscosso" },
  { key: "compenso_totale", label: "Compenso totale" },
  { key: "compenso_quota_recupero", label: "Compenso quota recupero" },
  { key: "iva", label: "IVA" },
  { key: "mora", label: "Mora" },
  { key: "anticipi", label: "Anticipi" },
  { key: "recuperi", label: "Recuperi" },
  { key: "altro", label: "Altro" },
  { key: "riversato", label: "Riversato" },
  { key: "categoria_destinazione", label: "Categoria destinazione" },
  { key: "colonna_destinazione", label: "Colonna destinazione" },
  { key: "pagina_pdf", label: "Pagina PDF" },
  { key: "note", label: "Note" }
];

const ARTICLE_MAPPINGS = [
  {
    tipo: "IMU - RIFIUTI",
    voce: "ACQUA",
    codici: ["9000", "9170", "9175"],
    capitolo: "3116099",
    accertamento: "4838/2025"
  },
  {
    tipo: "IMU - RIFIUTI",
    voce: "INTROITI E RIMB. DIVERSI RUOLI",
    codici: ["1C27", "9001", "9102", "9105", "9305", "9850"],
    capitolo: "3505099",
    accertamento: "4839/2025"
  },
  {
    tipo: "IMU - RIFIUTI",
    voce: "ACQUEDOTTO SPESE NOTIFICA",
    codici: ["1S15"],
    capitolo: "3517099",
    accertamento: "4840/2025"
  },
  {
    tipo: "IMU - RIFIUTI",
    voce: "IMU PREGRESSA",
    codici: ["2R60"],
    capitolo: "1109001",
    accertamento: "4841/2025",
    nota: "Default prima versione; i ruoli accertati possono spostare la voce in una fase successiva."
  },
  {
    tipo: "IMU - RIFIUTI",
    voce: "IMU SANZ/INTERESSI",
    codici: ["2R62", "2R61", "2S76"],
    capitolo: "3505099",
    accertamento: "4842/2025"
  },
  {
    tipo: "IMU - RIFIUTI",
    voce: "IMU SPESE NOTIFICA",
    codici: ["2R63"],
    capitolo: "3517099",
    accertamento: "4843/2025"
  },
  {
    tipo: "IMU - RIFIUTI",
    voce: "IRPEF",
    codici: ["9361", "9362", "9363"],
    capitolo: "3505099",
    accertamento: "4844/2025"
  },
  {
    tipo: "IMU - RIFIUTI",
    voce: "TARES/TARSU/TARI PREGRESSA",
    codici: ["2R28", "2Y54", "0434", "434", "2S79"],
    capitolo: "01206099",
    accertamento: "4845/2025"
  },
  {
    tipo: "IMU - RIFIUTI",
    voce: "TARI/TARSU/TARES SANZ/INTERESSI",
    codici: ["2Y98", "2R51", "2Y99", "0424", "424", "1C39", "2R95", "2S74"],
    capitolo: "3505099",
    accertamento: "4846/2025"
  },
  {
    tipo: "IMU - RIFIUTI",
    voce: "TARI SPESE NOTIFICA",
    codici: ["2Z01", "2SZ01"],
    capitolo: "3517099",
    accertamento: "4847/2025"
  },
  {
    tipo: "MULTE",
    voce: "MULTE PREGRESSE",
    codici: ["5242"],
    capitolo: "3111099",
    accertamento: "4850/2025"
  },
  {
    tipo: "MULTE",
    voce: "MULTE SANZ/INTERESSI PREGRESSI",
    codici: ["5243", "1C34"],
    capitolo: "3505099",
    accertamento: "4851/2025"
  },
  {
    tipo: "MULTE",
    voce: "MULTE SPESE NOTIFICA PREGRESSE",
    codici: ["5354"],
    capitolo: "3517099",
    accertamento: "4852/2025"
  }
];

const RUOLI_ACCERTATI = [
  {
    tipo: "IMU",
    prospetto_per_ruolo: "2021 / 1745",
    accertamento: "1680/2021",
    colonna_destinazione: "RUOLO IMU 2013-2014",
    attivo: false
  },
  {
    tipo: "IMU",
    prospetto_per_ruolo: "2022 / 1230",
    accertamento: "1230/2022",
    colonna_destinazione: "RUOLO IMU 2014-2015",
    attivo: false
  }
];

const DEFAULT_SETTINGS = {
  ente: "",
  annoGestione: new Date().getFullYear(),
  operatore: ""
};

window.APP_CONFIG = {
  defaultSettings: DEFAULT_SETTINGS,
  articleMappings: ARTICLE_MAPPINGS,
  ruoliAccertati: RUOLI_ACCERTATI,
  imuRifiutiColumns: IMU_RIFIUTI_COLUMNS,
  multeColumns: MULTE_COLUMNS,
  imuRifiutiAccountingColumns: IMU_RIFIUTI_ACCOUNTING_COLUMNS,
  multeAccountingColumns: MULTE_ACCOUNTING_COLUMNS,
  detailColumns: DETAIL_COLUMNS
};
