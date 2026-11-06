import { inventoryRepository } from './inventoryRepository.js';
import { products as demoProducts } from '../../src/data/demoData.js';

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

const defaultInventory = new Map([[1, [{
  id: 1,
  organizationId: 1,
  productId: null,
  sku: 'SKU-001',
  name: 'Producto demo',
  category: 'Bebidas',
  unit: 'PZA',
  stock: 25,
  minStock: 5,
  cost: 18.5,
  price: 29.99,
  warehouse: 'PRINCIPAL',
  active: true
}]]]);
const demoMovements = new Map();

const normalizeOrganizationId = (value = 1) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new Error('La organización debe ser un entero positivo');
  }
  return id;
};

const getDemoInventory = (value = 1, create = false) => {
  const tenantId = normalizeOrganizationId(value);
  if (!defaultInventory.has(tenantId) && create) {
    defaultInventory.set(tenantId, []);
  }
  return defaultInventory.get(tenantId) || [];
};

const getDemoMovements = (value = 1, create = false) => {
  const tenantId = normalizeOrganizationId(value);
  if (!demoMovements.has(tenantId) && create) {
    demoMovements.set(tenantId, []);
  }
  return demoMovements.get(tenantId) || [];
};

const resolveDemoProductId = ({ productId, sku, organizationId, resolveBySku = true }) => {
  const tenantId = normalizeOrganizationId(organizationId);
  if (productId !== null && productId !== undefined && productId !== '') {
    const id = Number(productId);
    const product = demoProducts.find((item) => Number(item.id) === id && Number(item.org_id ?? item.organizationId ?? 1) === tenantId);
    if (!Number.isInteger(id) || id < 1 || !product) {
      throw Object.assign(new Error('El producto indicado no pertenece a la organización actual'), { status: 400 });
    }
    return id;
  }
  if (!resolveBySku) return null;

  const normalizedSku = String(sku || '').trim().toLowerCase();
  const product = demoProducts.find((item) => (
    Number(item.org_id ?? item.organizationId ?? 1) === tenantId &&
    [item.sku, item.codigoProd, item.codigoAltern].some((code) => String(code || '').trim().toLowerCase() === normalizedSku)
  ));
  return product ? Number(product.id) : null;
};

export const inventoryService = {
  async list(filters = {}) {
    if (global.mysqlAvailable) {
      return inventoryRepository.list(filters);
    }

    const search = String(filters.search || '').trim().toLowerCase();
    const organizationId = normalizeOrganizationId(filters.organizationId);
    const source = Array.isArray(filters.items)
      ? filters.items.filter((item) => Number(item.organizationId) === organizationId)
      : getDemoInventory(organizationId);

    let data = source;

    if (search) {
      data = data.filter((item) => {
        const hayCoincidencia = [item.sku, item.name, item.category, item.warehouse]
          .join(' ')
          .toLowerCase()
          .includes(search);
        return hayCoincidencia;
      });
    }

    return {
      data,
      total: data.length,
      page: Number(filters.page || 1),
      perPage: Number(filters.perPage || 20),
      totalPages: Math.max(1, Math.ceil(data.length / (Number(filters.perPage) || 20)))
    };
  },

  async findBySku(sku, warehouse = 'PRINCIPAL', organizationId = 1) {
    if (global.mysqlAvailable) {
      return inventoryRepository.findBySku(sku, warehouse, organizationId);
    }

    const tenantId = normalizeOrganizationId(organizationId);
    return getDemoInventory(tenantId).find((item) => (
      String(item.sku).toLowerCase() === String(sku || '').trim().toLowerCase() &&
      String(item.warehouse || 'PRINCIPAL') === String(warehouse || 'PRINCIPAL')
    )) || null;
  },

  async findById(id, organizationId = 1) {
    if (global.mysqlAvailable) {
      return inventoryRepository.findById(id, organizationId);
    }

    const tenantId = normalizeOrganizationId(organizationId);
    return getDemoInventory(tenantId).find((item) => String(item.id) === String(id)) || null;
  },

  async create(payload = {}, organizationId = 1) {
    if (global.mysqlAvailable) {
      return inventoryRepository.create(payload, organizationId);
    }

    const tenantId = normalizeOrganizationId(organizationId);
    const unit = normalizeUnit(payload.unit || payload.unidad || payload.unidadMedida || payload.unitMeasure || 'PZA');
    if (!isSupportedUnit(unit)) {
      throw new Error(`Unidad no soportada: ${payload.unit || payload.unidad || payload.unidadMedida || payload.unitMeasure || 'PZA'}`);
    }

    const productId = resolveDemoProductId({ productId: payload.productId, sku: payload.sku, organizationId: tenantId });
    const item = {
      id: Date.now(),
      organizationId: tenantId,
      productId,
      sku: payload.sku || `SKU-${Date.now()}`,
      barcode: payload.barcode || '',
      name: payload.name || 'Nuevo producto',
      category: payload.category || '',
      unit,
      stock: Number(payload.stock || 0),
      minStock: Number(payload.minStock || 0),
      cost: Number(payload.cost || 0),
      price: Number(payload.price || 0),
      supplier: payload.supplier || '',
      warehouse: payload.warehouse || 'PRINCIPAL',
      active: payload.active !== false
    };

    getDemoInventory(tenantId, true).push(item);
    return item;
  },

  async update(id, payload = {}, organizationId = 1) {
    if (global.mysqlAvailable) {
      return inventoryRepository.update(id, payload, organizationId);
    }

    const tenantId = normalizeOrganizationId(organizationId);
    const inventory = getDemoInventory(tenantId);
    const index = inventory.findIndex((item) => String(item.id) === String(id));

    if (index === -1) {
      return null;
    }

    const current = inventory[index];
    const nextUnit = normalizeUnit(payload.unit || payload.unidad || payload.unidadMedida || payload.unitMeasure || current.unit || 'PZA');
    if (!isSupportedUnit(nextUnit)) {
      throw new Error(`Unidad no soportada: ${payload.unit || payload.unidad || payload.unidadMedida || payload.unitMeasure || current.unit || 'PZA'}`);
    }

    const hasProductId = Object.prototype.hasOwnProperty.call(payload, 'productId');
    const productId = hasProductId
      ? resolveDemoProductId({ productId: payload.productId, sku: payload.sku ?? current.sku, organizationId: tenantId, resolveBySku: false })
      : current.productId ?? resolveDemoProductId({ sku: payload.sku ?? current.sku, organizationId: tenantId });
    inventory[index] = {
      ...current,
      ...payload,
      id: Number(id),
      organizationId: tenantId,
      productId,
      stock: Number(payload.stock ?? current.stock ?? 0),
      minStock: Number(payload.minStock ?? current.minStock ?? 0),
      cost: Number(payload.cost ?? current.cost ?? 0),
      price: Number(payload.price ?? current.price ?? 0),
      unit: nextUnit,
      warehouse: payload.warehouse || current.warehouse || 'PRINCIPAL'
    };

    return inventory[index];
  },

  async lowStock({ organizationId = 1 } = {}) {
    if (global.mysqlAvailable) {
      return inventoryRepository.lowStock({ organizationId });
    }

    return getDemoInventory(organizationId).filter((item) => Number(item.stock) <= Number(item.minStock || 0));
  },

  async getAdminSummary(filters = {}) {
    if (global.mysqlAvailable) {
      return inventoryRepository.getAdminSummary(filters);
    }

    const items = getDemoInventory(filters.organizationId).filter((item) => !filters.warehouse || item.warehouse === filters.warehouse);
    const byWarehouse = new Map();
    const byCategory = new Map();

    for (const item of items) {
      const warehouse = item.warehouse || 'PRINCIPAL';
      const category = item.category || 'SIN CATEGORIA';
      const warehouseData = byWarehouse.get(warehouse) || { warehouse, items: 0, units: 0, inventoryCost: 0 };
      const categoryData = byCategory.get(category) || { category, items: 0, units: 0 };
      warehouseData.items += 1;
      warehouseData.units += Number(item.stock || 0);
      warehouseData.inventoryCost += Number(item.stock || 0) * Number(item.cost || 0);
      categoryData.items += 1;
      categoryData.units += Number(item.stock || 0);
      byWarehouse.set(warehouse, warehouseData);
      byCategory.set(category, categoryData);
    }

    return {
      totalItems: items.length,
      totalUnits: items.reduce((total, item) => total + Number(item.stock || 0), 0),
      inventoryCost: items.reduce((total, item) => total + Number(item.stock || 0) * Number(item.cost || 0), 0),
      inventoryValue: items.reduce((total, item) => total + Number(item.stock || 0) * Number(item.price || 0), 0),
      lowStockItems: items.filter((item) => Number(item.stock) <= Number(item.minStock || 0)).length,
      activeItems: items.filter((item) => item.active !== false).length,
      inactiveItems: items.filter((item) => item.active === false).length,
      byWarehouse: [...byWarehouse.values()],
      byCategory: [...byCategory.values()].sort((left, right) => right.units - left.units)
    };
  },

  async getLowStockReport(filters = {}) {
    if (global.mysqlAvailable) {
      return inventoryRepository.getLowStockReport(filters);
    }

    return getDemoInventory(filters.organizationId)
      .filter((item) => (!filters.warehouse || item.warehouse === filters.warehouse) && Number(item.stock) <= Number(item.minStock || 0))
      .slice(0, Math.min(500, Number(filters.limit) || 100))
      .map((item) => ({ ...item, shortage: Number(item.minStock || 0) - Number(item.stock || 0) }));
  },

  async createMovement(payload = {}, context = {}) {
    if (global.mysqlAvailable) {
      return inventoryRepository.createMovement({ ...payload, user: context.user, organizationId: context.organizationId });
    }

    const tenantId = normalizeOrganizationId(context.organizationId);
    const item = getDemoInventory(tenantId).find((entry) => entry.sku === payload.sku && entry.warehouse === (payload.warehouse || 'PRINCIPAL'));
    if (!item) throw new Error('Artículo no encontrado');
    const productId = resolveDemoProductId({
      productId: payload.productId,
      sku: payload.sku,
      organizationId: tenantId
    });
    const quantity = Number(payload.quantity);
    const stockBefore = Number(item.stock);
    const stockAfter = payload.movementType === 'EXIT'
      ? stockBefore - quantity
      : payload.movementType === 'ENTRY'
        ? stockBefore + quantity
        : quantity;
    if (!['ENTRY', 'EXIT', 'ADJUSTMENT'].includes(payload.movementType) || !Number.isFinite(quantity) || quantity <= 0 || stockAfter < 0) {
      throw new Error('Movimiento o cantidad inválida');
    }
    item.stock = stockAfter;
    item.productId = productId ?? item.productId ?? null;
    const movement = { id: Date.now(), sku: item.sku, warehouse: item.warehouse, movementType: payload.movementType, quantity, stockBefore, stockAfter, reason: payload.reason || '', userId: context.user?.id || null, username: context.user?.username || null };
    getDemoMovements(tenantId, true).push({ ...movement, organizationId: tenantId });
    return movement;
  },

  async listMovements(filters = {}) {
    if (global.mysqlAvailable) {
      return inventoryRepository.listMovements(filters);
    }
    const filtered = getDemoMovements(filters.organizationId).filter((movement) => (!filters.sku || movement.sku === filters.sku) && (!filters.warehouse || movement.warehouse === filters.warehouse));
    return { data: filtered, total: filtered.length, page: 1, perPage: filtered.length || 50, totalPages: 1 };
  },

  async listImportAudits(filters = {}) {
    if (global.mysqlAvailable) {
      return inventoryRepository.listImportAudits(filters);
    }

    return { data: [], total: 0, page: Number(filters.page || 1), perPage: Number(filters.perPage || 20), totalPages: 1 };
  },

  async getImportAudit(id, organizationId = 1) {
    if (global.mysqlAvailable) {
      return inventoryRepository.getImportAudit(id, organizationId);
    }

    return null;
  },

  async importRows(rows = [], options = {}) {
    const dryRun = options.dryRun !== false;

    if (global.mysqlAvailable) {
      return inventoryRepository.importRows(rows, options);
    }

    if (dryRun) {
      return {
        dryRun: true,
        total: rows.length,
        imported: [],
        message: 'Previsualización de importación aplicada'
      };
    }

    const imported = [];
    for (const row of rows) {
      imported.push(await this.create(row, options.organizationId ?? 1));
    }

    return {
      dryRun,
      total: rows.length,
      imported,
      message: 'Inventario importado correctamente'
    };
  }
};