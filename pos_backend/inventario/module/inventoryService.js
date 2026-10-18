import { inventoryRepository } from './inventoryRepository.js';

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

const defaultInventory = [
  {
    id: 1,
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
  }
];
const demoMovements = [];

export const inventoryService = {
  async list(filters = {}) {
    if (global.mysqlAvailable) {
      return inventoryRepository.list(filters);
    }

    const search = String(filters.search || '').trim().toLowerCase();
    const source = Array.isArray(filters.items) ? filters.items : defaultInventory;

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

    return defaultInventory.find((item) => String(item.sku).toLowerCase() === String(sku || '').trim().toLowerCase()) || null;
  },

  async create(payload = {}, organizationId = 1) {
    if (global.mysqlAvailable) {
      return inventoryRepository.create(payload, organizationId);
    }

    const unit = normalizeUnit(payload.unit || payload.unidad || payload.unidadMedida || payload.unitMeasure || 'PZA');
    if (!isSupportedUnit(unit)) {
      throw new Error(`Unidad no soportada: ${payload.unit || payload.unidad || payload.unidadMedida || payload.unitMeasure || 'PZA'}`);
    }

    const item = {
      id: Date.now(),
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

    defaultInventory.push(item);
    return item;
  },

  async update(id, payload = {}, organizationId = 1) {
    if (global.mysqlAvailable) {
      return inventoryRepository.update(id, payload, organizationId);
    }

    const index = defaultInventory.findIndex((item) => String(item.id) === String(id));

    if (index === -1) {
      return null;
    }

    const nextUnit = normalizeUnit(payload.unit || payload.unidad || payload.unidadMedida || payload.unitMeasure || defaultInventory[index].unit || 'PZA');
    if (!isSupportedUnit(nextUnit)) {
      throw new Error(`Unidad no soportada: ${payload.unit || payload.unidad || payload.unidadMedida || payload.unitMeasure || defaultInventory[index].unit || 'PZA'}`);
    }

    defaultInventory[index] = {
      ...defaultInventory[index],
      ...payload,
      id: Number(id),
      stock: Number(payload.stock ?? defaultInventory[index].stock ?? 0),
      minStock: Number(payload.minStock ?? defaultInventory[index].minStock ?? 0),
      cost: Number(payload.cost ?? defaultInventory[index].cost ?? 0),
      price: Number(payload.price ?? defaultInventory[index].price ?? 0),
      unit: nextUnit,
      warehouse: payload.warehouse || defaultInventory[index].warehouse || 'PRINCIPAL'
    };

    return defaultInventory[index];
  },

  async lowStock({ organizationId = 1 } = {}) {
    if (global.mysqlAvailable) {
      return inventoryRepository.lowStock({ organizationId });
    }

    return defaultInventory.filter((item) => Number(item.stock) <= Number(item.minStock || 0));
  },

  async getAdminSummary(filters = {}) {
    if (global.mysqlAvailable) {
      return inventoryRepository.getAdminSummary(filters);
    }

    const items = defaultInventory.filter((item) => !filters.warehouse || item.warehouse === filters.warehouse);
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

    return defaultInventory
      .filter((item) => (!filters.warehouse || item.warehouse === filters.warehouse) && Number(item.stock) <= Number(item.minStock || 0))
      .slice(0, Math.min(500, Number(filters.limit) || 100))
      .map((item) => ({ ...item, shortage: Number(item.minStock || 0) - Number(item.stock || 0) }));
  },

  async createMovement(payload = {}, context = {}) {
    if (global.mysqlAvailable) {
      return inventoryRepository.createMovement({ ...payload, user: context.user, organizationId: context.organizationId });
    }

    const item = defaultInventory.find((entry) => entry.sku === payload.sku && entry.warehouse === (payload.warehouse || 'PRINCIPAL'));
    if (!item) throw new Error('Artículo no encontrado');
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
    const movement = { id: Date.now(), sku: item.sku, warehouse: item.warehouse, movementType: payload.movementType, quantity, stockBefore, stockAfter, reason: payload.reason || '', userId: context.user?.id || null, username: context.user?.username || null };
    demoMovements.push(movement);
    return movement;
  },

  async listMovements(filters = {}) {
    if (global.mysqlAvailable) {
      return inventoryRepository.listMovements(filters);
    }
    const filtered = demoMovements.filter((movement) => (!filters.sku || movement.sku === filters.sku) && (!filters.warehouse || movement.warehouse === filters.warehouse));
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
      imported.push(await this.create(row));
    }

    return {
      dryRun,
      total: rows.length,
      imported,
      message: 'Inventario importado correctamente'
    };
  }
};