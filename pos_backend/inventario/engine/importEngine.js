import * as XLSX from 'xlsx';

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 10000;

const normalizeHeader = (value = '') => String(value || '')
  .trim()
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '')
  .replace(/^_+|_+$/g, '');

const normalizeValue = (value) => {
  if (value === undefined || value === null || value === '') {
    return '';
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return value;
};

const SUPPORTED_UNITS = new Set([
  'PZA',
  'KG',
  'LT',
  'CAJA',
  'M',
  'ROLLO',
  'L',
  'PAQUETE',
  'ML',
  'PAR'
]);

const UNIT_ALIASES = {
  PZA: 'PZA',
  PIEZA: 'PZA',
  PIEZAS: 'PZA',
  UNIDAD: 'PZA',
  UNIDADES: 'PZA',

  KG: 'KG',
  KILO: 'KG',
  KILOS: 'KG',
  KILOGRAMO: 'KG',
  KILOGRAMOS: 'KG',
  G: 'KG',
  GR: 'KG',
  GRAMO: 'KG',
  GRAMOS: 'KG',

  LT: 'LT',
  LITRO: 'LT',
  LITROS: 'LT',
  L: 'LT',

  CAJA: 'CAJA',
  CAJAS: 'CAJA',

  M: 'M',
  METRO: 'M',
  METROS: 'M',

  ROLLO: 'ROLLO',
  ROLLOS: 'ROLLO',

  PAQUETE: 'PAQUETE',
  PAQUETES: 'PAQUETE',

  PAR: 'PAR',
  PARES: 'PAR',

  ML: 'ML',
  MILILITRO: 'ML',
  MILILITROS: 'ML'
};

const normalizeUnit = (value) => {
  if (value === undefined || value === null || value === '') {
    return 'PZA';
  }

  const normalized = String(value).trim().toUpperCase();
  return UNIT_ALIASES[normalized] || normalized;
};

const isSupportedUnit = (value) => {
  const normalized = normalizeUnit(value);
  return SUPPORTED_UNITS.has(normalized) || SUPPORTED_UNITS.has(String(value || '').trim().toUpperCase());
};

const normalizeRow = (row = {}, index = 0) => {
  const mapped = {};
  const entries = Object.entries(row || {});

  for (const [key, value] of entries) {
    mapped[normalizeHeader(key)] = normalizeValue(value);
  }

  const sku = mapped.sku || mapped.productsku || mapped.codigo || mapped.codigointerno || '';
  const name = mapped.name || mapped.nombre || mapped.producto || '';
  const barcode = mapped.barcode || mapped.codigobarras || '';
  const stock = Number(mapped.stock ?? mapped.stockactual ?? mapped.inventory ?? 0);
  const minStock = Number(mapped.minstock ?? mapped.stockminimo ?? 0);
  const cost = Number(mapped.cost ?? mapped.preciocompra ?? 0);
  const price = Number(mapped.price ?? mapped.precioventa ?? 0);
  const unit = normalizeUnit(mapped.unit || mapped.unidad || mapped.unidadmedida || mapped.unitmeasure || 'PZA');
  const warehouse = mapped.warehouse || mapped.almacen || mapped.ubicacion || 'PRINCIPAL';
  const category = mapped.category || mapped.categoria || mapped.linea || '';
  const supplier = mapped.supplier || mapped.proveedor || '';
  const active = mapped.active !== undefined ? String(mapped.active).toLowerCase() !== 'false' : true;

  const errors = [];

  if (!sku) {
    errors.push('SKU requerido');
  }

  if (!name) {
    errors.push('Nombre requerido');
  }

  if (Number.isNaN(stock)) {
    errors.push('Stock inválido');
  } else if (stock < 0) {
    errors.push('Stock no puede ser negativo');
  }

  if (Number.isNaN(minStock)) {
    errors.push('Stock mínimo inválido');
  } else if (minStock < 0) {
    errors.push('Stock mínimo no puede ser negativo');
  }

  if (Number.isNaN(cost)) {
    errors.push('Costo inválido');
  } else if (cost < 0) {
    errors.push('Costo no puede ser negativo');
  }

  if (Number.isNaN(price)) {
    errors.push('Precio inválido');
  } else if (price < 0) {
    errors.push('Precio no puede ser negativo');
  }

  if (!isSupportedUnit(unit)) {
    errors.push(`Unidad no soportada: ${unit}`);
  }

  return {
    index,
    raw: { ...row },
    sku,
    barcode,
    name,
    stock,
    minStock,
    cost,
    price,
    unit,
    warehouse,
    category,
    supplier,
    active,
    valid: errors.length === 0,
    errors
  };
};

const parseCsvText = (csvText = '') => {
  const records = [];
  let record = [];
  let cell = '';
  let quoted = false;
  const text = String(csvText).replace(/^\uFEFF/, '');

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (character === '"' && quoted && nextCharacter === '"') {
      cell += '"';
      index += 1;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === ',' && !quoted) {
      record.push(cell.trim());
      cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && nextCharacter === '\n') {
        index += 1;
      }
      record.push(cell.trim());
      if (record.some((value) => value !== '')) {
        records.push(record);
      }
      record = [];
      cell = '';
    } else {
      cell += character;
    }
  }

  if (cell !== '' || record.length > 0) {
    record.push(cell.trim());
    if (record.some((value) => value !== '')) {
      records.push(record);
    }
  }

  if (records.length < 2) {
    return [];
  }

  const headers = records[0];
  const rows = [];

  for (let i = 1; i < records.length; i += 1) {
    const cells = records[i];
    const row = {};

    headers.forEach((header, columnIndex) => {
      row[header] = cells[columnIndex]?.trim() ?? '';
    });

    rows.push(row);
  }

  return rows;
};

const parseJsonRows = (payload) => {
  const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
  const rows = Array.isArray(parsed) ? parsed : parsed?.rows;

  if (!Array.isArray(rows)) {
    throw new Error('El JSON debe contener un arreglo de registros');
  }

  if (rows.length > MAX_ROWS) {
    throw new Error(`El archivo supera el máximo de ${MAX_ROWS} filas`);
  }

  return rows;
};

const validateFileMetadata = ({ filename = '', mimetype = '', size = 0 } = {}) => {
  const extension = String(filename).toLowerCase().split('.').pop();
  const allowedExtensions = ['csv', 'json', 'xlsx', 'xls'];
  const allowedMimeTypes = [
    'text/csv',
    'application/json',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/octet-stream'
  ];

  if (!allowedExtensions.includes(extension)) {
    throw new Error('Formato no soportado. Use CSV, JSON o XLSX');
  }

  if (mimetype && !allowedMimeTypes.includes(String(mimetype).toLowerCase())) {
    throw new Error('Tipo MIME no permitido para importación');
  }

  if (Number(size) > MAX_FILE_BYTES) {
    throw new Error('El archivo supera el límite de 10 MB');
  }

  return { extension, maxBytes: MAX_FILE_BYTES, maxRows: MAX_ROWS };
};

const parseXlsxBuffer = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error('El contenido XLSX está vacío o no es válido');
  }

  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error('El archivo supera el límite de 10 MB');
  }

  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    throw new Error('El archivo XLSX no contiene hojas');
  }

  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
    defval: '',
    raw: false
  });

  if (rows.length > MAX_ROWS) {
    throw new Error(`El archivo supera el máximo de ${MAX_ROWS} filas`);
  }

  return rows;
};

const duplicateKeys = (rows) => {
  const counts = new Map();

  rows.forEach((row) => {
    const key = `${row.sku}\u0000${row.warehouse}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  return new Set([...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key));
};

export const inventoryImportEngine = {
  parseCsv(csvText) {
    return parseCsvText(csvText).map((row, index) => normalizeRow(row, index));
  },

  parseJson(payload) {
    return this.normalizeRows(parseJsonRows(payload));
  },

  parseXlsx(buffer) {
    return this.normalizeRows(parseXlsxBuffer(buffer));
  },

  validateFile(metadata) {
    return validateFileMetadata(metadata);
  },

  normalizeRows(rows = []) {
    return rows.map((row, index) => normalizeRow(row, index));
  },

  summarize(rows = []) {
    const validRows = rows.filter((row) => row.valid);
    const invalidRows = rows.filter((row) => !row.valid);
    const duplicates = duplicateKeys(validRows);

    return {
      totalRows: rows.length,
      validRows: validRows.length,
      invalidRows: invalidRows.length,
      duplicates: duplicates.size,
      dryRun: true,
      rows: rows.map((row) => ({
        index: row.index,
        raw: row.raw,
        sku: row.sku,
        status: !row.valid ? 'invalid' : duplicates.has(`${row.sku}\u0000${row.warehouse}`) ? 'duplicate' : 'valid',
        errors: row.errors
      }))
    };
  },

  async importFromCsv(csvText, options = {}) {
    const rows = this.parseCsv(csvText);
    const dryRun = options.dryRun !== false;
    const summary = this.summarize(rows);

    return {
      ...summary,
      dryRun,
      source: 'csv',
      message: dryRun ? 'Importación sin persistencia (modo dry-run)' : 'Importación lista para persistir'
    };
  },

  async importFromJson(payload, options = {}) {
    const rows = this.parseJson(payload);
    const dryRun = options.dryRun !== false;
    const summary = this.summarize(rows);

    return {
      ...summary,
      dryRun,
      source: 'json',
      message: dryRun ? 'Importación sin persistencia (modo dry-run)' : 'Importación lista para persistir'
    };
  }
};