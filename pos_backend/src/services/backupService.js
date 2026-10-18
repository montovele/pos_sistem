import XLSX from 'xlsx';
import { getPool } from '../config/database.js';
import { organizations, employees, products, transactions } from '../data/demoData.js';

const SUPPORTED_FORMATS = new Set(['json', 'csv', 'xlsx']);
const backups = new Map();
let nextBackupId = 1;

const serviceError = (message, status) => Object.assign(new Error(message), { status });
const getOrganizationId = (user = {}) => {
  const id = Number(user.organizationId);
  if (!Number.isInteger(id) || id < 1) throw serviceError('La organización del usuario no es válida', 401);
  return id;
};
const normalizeFormat = (format) => {
  const value = String(format || 'json').trim().toLowerCase();
  if (!SUPPORTED_FORMATS.has(value)) throw serviceError('Formato no válido. Usa json, csv o xlsx', 400);
  return value;
};
const clone = (value) => JSON.parse(JSON.stringify(value));
const withoutSecrets = (user) => {
  const safe = { ...user };
  delete safe.password;
  return safe;
};
const toRows = (section, values) => values.map((value) => ({ section, record: JSON.stringify(value) }));

const getDemoSnapshot = (organizationId) => ({
  organizationSettings: [{ organizationId, generatedAt: new Date().toISOString() }],
  organizations: organizations.filter((item) => Number(item.id) === organizationId).map(clone),
  users: employees.filter((item) => Number(item.organizationId) === organizationId).map(withoutSecrets).map(clone),
  products: products.filter((item) => Number(item.org_id ?? item.organizationId ?? 1) === organizationId).map(clone),
  inventory: [],
  transactions: transactions.filter((item) => Number(item.organizationId ?? 1) === organizationId).map(clone),
  facturas: [],
  cashSessions: [],
  cashHistory: []
});

const getMysqlRows = async (organizationId, table, columns) => {
  const [rows] = await getPool().execute(
    `SELECT ${columns} FROM ${table} WHERE organization_id = ?`,
    [organizationId]
  );
  return rows;
};

const getMysqlSnapshot = async (organizationId) => {
  const [organizationRows] = await getPool().execute(
    'SELECT id, nombre_org, ruc, direccion, telefono, correo, activo, created_at, updated_at FROM organizaciones WHERE id = ? LIMIT 1',
    [organizationId]
  );
  const users = await getMysqlRows(organizationId, 'usuarios', 'id, username, nombre, apellido, email, numero_empleado, organization_id, role, activo, created_at');
  const productRows = await getPool().execute('SELECT id, codigo_prod, codigo_altern, nombre_prod, price, stock, unit, sale_by_weight, org_id, id_category, description, image, created_at FROM productos WHERE org_id = ?', [organizationId]);
  const inventory = await getMysqlRows(organizationId, 'inventario_items', 'id, organization_id, product_id, sku, barcode, name, category, unit, stock, min_stock, cost, price, supplier, warehouse, active, created_at, updated_at');
  const transactionRows = await getMysqlRows(organizationId, 'transacciones', 'id, organization_id, codigo_transaccion, codigo_ticket, fecha_trans, items, subtotal, discount, total, nombre_cajero, numero_empleado, status, payment_method, cash_session_id, created_at');
  const imports = await getMysqlRows(organizationId, 'inventario_importaciones', 'id, organization_id, source, filename, dry_run, status, total_rows, valid_rows, invalid_rows, duplicate_rows, imported_rows, user_id, username, created_at');
  return {
    organizationSettings: [{ organizationId, generatedAt: new Date().toISOString() }],
    organizations: organizationRows,
    users: users.map(withoutSecrets),
    products: productRows[0],
    inventory,
    transactions: transactionRows,
    facturas: [],
    cashSessions: [],
    cashHistory: [],
    importAudits: imports
  };
};

const snapshotFor = async (organizationId) => global.mysqlAvailable ? getMysqlSnapshot(organizationId) : getDemoSnapshot(organizationId);

const serializeJson = (snapshot) => Buffer.from(JSON.stringify(snapshot, null, 2), 'utf8');
const serializeCsv = (snapshot) => Buffer.from([
  'section,record',
  ...Object.entries(snapshot).flatMap(([section, values]) => toRows(section, Array.isArray(values) ? values : [values])).map(({ section, record }) => `${JSON.stringify(section)},${JSON.stringify(record)}`)
].join('\n'), 'utf8');
const serializeXlsx = (snapshot) => {
  const workbook = XLSX.utils.book_new();
  for (const [section, values] of Object.entries(snapshot)) {
    const rows = Array.isArray(values) ? values : [values];
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ message: 'Sin registros' }]);
    XLSX.utils.book_append_sheet(workbook, sheet, section.slice(0, 31));
  }
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
};
const serialize = (snapshot, format) => format === 'csv' ? serializeCsv(snapshot) : format === 'xlsx' ? serializeXlsx(snapshot) : serializeJson(snapshot);
const contentType = (format) => format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : format === 'csv' ? 'text/csv; charset=utf-8' : 'application/json; charset=utf-8';

const metadata = (backup) => ({ id: backup.id, organizationId: backup.organizationId, format: backup.format, size: backup.content.length, createdAt: backup.createdAt });

const restoreDemo = (snapshot, organizationId) => {
  const organization = snapshot.organizations?.[0];
  if (organization) {
    const index = organizations.findIndex((item) => Number(item.id) === organizationId);
    if (index >= 0) organizations[index] = { ...organizations[index], ...organization };
  }

  const restoredProducts = (snapshot.products || []).filter((item) => Number(item.org_id ?? item.organizationId ?? 1) === organizationId);
  for (const restored of restoredProducts) {
    const index = products.findIndex((item) => Number(item.id) === Number(restored.id) && Number(item.org_id ?? 1) === organizationId);
    if (index >= 0) products[index] = { ...products[index], ...restored, org_id: organizationId };
    else products.push({ ...restored, org_id: organizationId });
  }

  const restoredTransactions = (snapshot.transactions || []).filter((item) => Number(item.organizationId ?? item.organization_id ?? 1) === organizationId).map((item) => ({ ...item, organizationId }));
  for (const restored of restoredTransactions) {
    const index = transactions.findIndex((item) => item.codigoTransaccion === restored.codigoTransaccion || item.codigo_transaccion === restored.codigo_transaccion);
    if (index >= 0) transactions[index] = { ...transactions[index], ...restored };
    else transactions.push(restored);
  }
};

export const backupService = {
  async create(format = 'json', user = {}) {
    const organizationId = getOrganizationId(user);
    const normalizedFormat = normalizeFormat(format);
    const snapshot = await snapshotFor(organizationId);
    const content = serialize(snapshot, normalizedFormat);
    const backup = { id: nextBackupId++, organizationId, format: normalizedFormat, createdAt: new Date().toISOString(), content, snapshot };
    backups.set(backup.id, backup);
    return metadata(backup);
  },

  list(user = {}) {
    const organizationId = getOrganizationId(user);
    return [...backups.values()].filter((backup) => backup.organizationId === organizationId).sort((a, b) => b.id - a.id).map(metadata);
  },

  download(id, format, user = {}) {
    const organizationId = getOrganizationId(user);
    const backup = backups.get(Number(id));
    if (!backup || backup.organizationId !== organizationId) throw serviceError('Respaldo no encontrado', 404);
    const normalizedFormat = normalizeFormat(format || backup.format);
    return {
      ...metadata(backup),
      format: normalizedFormat,
      content: serialize(backup.snapshot, normalizedFormat),
      contentType: contentType(normalizedFormat),
      filename: `respaldo-${backup.id}-${organizationId}.${normalizedFormat}`
    };
  },

  async restore(id, user = {}) {
    const organizationId = getOrganizationId(user);
    const backup = backups.get(Number(id));
    if (!backup || backup.organizationId !== organizationId) throw serviceError('Respaldo no encontrado', 404);
    if (global.mysqlAvailable) throw serviceError('La restauración MySQL requiere el adaptador de producción', 501);
    restoreDemo(backup.snapshot, organizationId);
    return { ...metadata(backup), restoredAt: new Date().toISOString(), restored: true };
  }
};
