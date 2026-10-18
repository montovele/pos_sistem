import { getPool } from '../../src/config/database.js';

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

const assertSupportedUnit = (value) => {
  const normalized = normalizeUnit(value);
  if (!SUPPORTED_UNITS.has(normalized) && !SUPPORTED_UNITS.has(String(value || '').trim().toUpperCase())) {
    throw new Error(`Unidad no soportada: ${value}`);
  }
  return normalized;
};

const inventoryFields = `
  id, organization_id AS organizationId, product_id AS productId, sku, barcode, name, category, unit, stock, min_stock AS minStock,
  cost, price, supplier, warehouse, active
`;

const mapRow = (row) => ({
  ...row,
  id: Number(row.id),
  productId: row.productId !== null && row.productId !== undefined ? Number(row.productId) : null,
  stock: Number(row.stock),
  minStock: Number(row.minStock),
  cost: Number(row.cost),
  price: Number(row.price),
  active: Boolean(row.active)
});

const resolveProductId = async ({ sku, productId, organization }, connection = getPool()) => {
  if (productId !== null && productId !== undefined && productId !== '') {
    return Number(productId);
  }

  const normalizedSku = String(sku || '').trim();
  if (!normalizedSku) {
    return null;
  }

  const tenantId = organizationId(organization);
  const [rows] = await connection.execute(
    'SELECT id FROM productos WHERE org_id = ? AND (codigo_prod = ? OR codigo_altern = ?) LIMIT 1',
    [tenantId, normalizedSku, normalizedSku]
  );

  return rows[0] ? Number(rows[0].id) : null;
};

const numericId = (value) => {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) {
    throw new Error('El id de inventario debe ser un entero positivo');
  }
  return id;
};

const organizationId = (value) => {
  const id = Number(value || 1);
  if (!Number.isInteger(id) || id < 1) {
    throw new Error('La organización debe ser un entero positivo');
  }
  return id;
};

export const inventoryRepository = {
  async list({ search = '', page = 1, perPage = 20, organizationId: organization } = {}) {
    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedPerPage = Math.min(100, Math.max(1, Number(perPage) || 20));
    const offset = (normalizedPage - 1) * normalizedPerPage;
    const term = String(search || '').trim();
    const like = `%${term}%`;
    const tenantId = organizationId(organization);
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT ${inventoryFields} FROM inventario_items
       WHERE organization_id = ? AND (? = '' OR sku LIKE ? OR name LIKE ? OR category LIKE ? OR warehouse LIKE ?)
       ORDER BY id ASC LIMIT ? OFFSET ?`,
      [tenantId, term, like, like, like, like, normalizedPerPage, offset]
    );
    const [countRows] = await pool.execute(
      `SELECT COUNT(*) AS total FROM inventario_items
       WHERE organization_id = ? AND (? = '' OR sku LIKE ? OR name LIKE ? OR category LIKE ? OR warehouse LIKE ?)`,
      [tenantId, term, like, like, like, like]
    );
    const total = Number(countRows[0]?.total || 0);

    return {
      data: rows.map(mapRow),
      total,
      page: normalizedPage,
      perPage: normalizedPerPage,
      totalPages: Math.max(1, Math.ceil(total / normalizedPerPage))
    };
  },

  async findBySku(sku, warehouse = 'PRINCIPAL', organization) {
    const tenantId = organizationId(organization);
    const [rows] = await getPool().execute(
      `SELECT ${inventoryFields} FROM inventario_items WHERE organization_id = ? AND sku = ? AND warehouse = ? LIMIT 1`,
      [tenantId, String(sku || '').trim(), String(warehouse || 'PRINCIPAL').trim()]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async create(payload, organization) {
    const tenantId = organizationId(organization);
    const pool = getPool();
    const unit = assertSupportedUnit(payload.unit || payload.unidad || payload.unidadMedida || payload.unitMeasure || 'PZA');
    const productId = await resolveProductId({ sku: payload.sku, productId: payload.productId, organization: tenantId }, pool);
    const [result] = await pool.execute(
      `INSERT INTO inventario_items
        (organization_id, product_id, sku, barcode, name, category, unit, stock, min_stock, cost, price, supplier, warehouse, active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tenantId,
        productId,
        payload.sku,
        payload.barcode || null,
        payload.name,
        payload.category || null,
        unit,
        Number(payload.stock || 0),
        Number(payload.minStock || 0),
        Number(payload.cost || 0),
        Number(payload.price || 0),
        payload.supplier || null,
        payload.warehouse || 'PRINCIPAL',
        payload.active === false ? 0 : 1
      ]
    );
    return this.findById(result.insertId, tenantId);
  },

  async findById(id, organization) {
    const tenantId = organizationId(organization);
    const [rows] = await getPool().execute(
      `SELECT ${inventoryFields} FROM inventario_items WHERE id = ? AND organization_id = ? LIMIT 1`,
      [numericId(id), tenantId]
    );
    return rows[0] ? mapRow(rows[0]) : null;
  },

  async update(id, payload = {}, organization) {
    const inventoryId = numericId(id);
    const tenantId = organizationId(organization);
    const current = await this.findById(inventoryId, tenantId);
    if (!current) return null;

    const next = { ...current, ...payload };
    const nextUnit = assertSupportedUnit(next.unit || next.unidad || next.unidadMedida || next.unitMeasure || current.unit || 'PZA');
    const productId = await resolveProductId({ sku: next.sku, productId: payload.productId ?? current.productId, organization: tenantId }, getPool());
    await getPool().execute(
      `UPDATE inventario_items SET
        product_id = ?, sku = ?, barcode = ?, name = ?, category = ?, unit = ?, stock = ?, min_stock = ?,
        cost = ?, price = ?, supplier = ?, warehouse = ?, active = ?
      WHERE id = ? AND organization_id = ?`,
      [
        productId,
        next.sku,
        next.barcode || null,
        next.name,
        next.category || null,
        nextUnit,
        Number(next.stock || 0),
        Number(next.minStock || 0),
        Number(next.cost || 0),
        Number(next.price || 0),
        next.supplier || null,
        next.warehouse || 'PRINCIPAL',
        next.active === false ? 0 : 1,
        inventoryId,
        tenantId
      ]
    );
    return this.findById(inventoryId, tenantId);
  },

  async lowStock({ organizationId: organization } = {}) {
    const tenantId = organizationId(organization);
    const [rows] = await getPool().execute(
      `SELECT ${inventoryFields} FROM inventario_items WHERE organization_id = ? AND stock <= min_stock ORDER BY stock ASC`,
      [tenantId]
    );
    return rows.map(mapRow);
  },

  async getAdminSummary({ warehouse = '', organizationId: organization } = {}) {
    const normalizedWarehouse = String(warehouse || '').trim();
    const tenantId = organizationId(organization);
    const [summaryRows] = await getPool().execute(
      `SELECT
        COUNT(*) AS totalItems,
        COALESCE(SUM(stock), 0) AS totalUnits,
        COALESCE(SUM(stock * cost), 0) AS inventoryCost,
        COALESCE(SUM(stock * price), 0) AS inventoryValue,
        COALESCE(SUM(CASE WHEN stock <= min_stock THEN 1 ELSE 0 END), 0) AS lowStockItems,
        COALESCE(SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END), 0) AS activeItems,
        COALESCE(SUM(CASE WHEN active = 0 THEN 1 ELSE 0 END), 0) AS inactiveItems
       FROM inventario_items
      WHERE organization_id = ? AND (? = '' OR warehouse = ?)`,
          [tenantId, normalizedWarehouse, normalizedWarehouse]
    );
    const [warehouseRows] = await getPool().execute(
      `SELECT warehouse, COUNT(*) AS items, COALESCE(SUM(stock), 0) AS units,
        COALESCE(SUM(stock * cost), 0) AS inventoryCost
       FROM inventario_items
      WHERE organization_id = ? AND (? = '' OR warehouse = ?)
       GROUP BY warehouse ORDER BY warehouse ASC`,
          [tenantId, normalizedWarehouse, normalizedWarehouse]
    );
    const [categoryRows] = await getPool().execute(
      `SELECT COALESCE(category, 'SIN CATEGORIA') AS category, COUNT(*) AS items,
        COALESCE(SUM(stock), 0) AS units
       FROM inventario_items
      WHERE organization_id = ? AND (? = '' OR warehouse = ?)
       GROUP BY category ORDER BY units DESC`,
          [tenantId, normalizedWarehouse, normalizedWarehouse]
    );
    const summary = summaryRows[0] || {};

    return {
      totalItems: Number(summary.totalItems || 0),
      totalUnits: Number(summary.totalUnits || 0),
      inventoryCost: Number(summary.inventoryCost || 0),
      inventoryValue: Number(summary.inventoryValue || 0),
      lowStockItems: Number(summary.lowStockItems || 0),
      activeItems: Number(summary.activeItems || 0),
      inactiveItems: Number(summary.inactiveItems || 0),
      byWarehouse: warehouseRows.map((row) => ({
        warehouse: row.warehouse,
        items: Number(row.items),
        units: Number(row.units),
        inventoryCost: Number(row.inventoryCost)
      })),
      byCategory: categoryRows.map((row) => ({
        category: row.category,
        items: Number(row.items),
        units: Number(row.units)
      }))
    };
  },

  async getLowStockReport({ warehouse = '', limit = 100, organizationId: organization } = {}) {
    const normalizedLimit = Math.min(500, Math.max(1, Number(limit) || 100));
    const normalizedWarehouse = String(warehouse || '').trim();
    const tenantId = organizationId(organization);
    const [rows] = await getPool().execute(
      `SELECT ${inventoryFields}, (min_stock - stock) AS shortage
       FROM inventario_items
      WHERE organization_id = ? AND stock <= min_stock AND (? = '' OR warehouse = ?)
       ORDER BY shortage DESC, stock ASC LIMIT ?`,
          [tenantId, normalizedWarehouse, normalizedWarehouse, normalizedLimit]
    );
    return rows.map((row) => ({ ...mapRow(row), shortage: Number(row.shortage || 0) }));
  },

  async createMovement({ sku, warehouse = 'PRINCIPAL', movementType, quantity, reason, referenceType, referenceId, user, organizationId: organization, productId } = {}) {
    const tenantId = organizationId(organization);
    const numericQuantity = Number(quantity);
    if (!['ENTRY', 'EXIT', 'ADJUSTMENT'].includes(movementType) || !Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      throw new Error('Movimiento o cantidad inválida');
    }

    const connection = await getPool().getConnection();
    try {
      await connection.beginTransaction();
      const resolvedProductId = await resolveProductId({ sku, productId, organization: tenantId }, connection);
      const [itemRows] = await connection.execute(
        'SELECT id, product_id, stock FROM inventario_items WHERE organization_id = ? AND sku = ? AND warehouse = ? FOR UPDATE',
        [tenantId, sku, warehouse]
      );
      const item = itemRows[0];
      if (!item) throw new Error('Artículo no encontrado');

      const stockBefore = Number(item.stock);
      const stockAfter = movementType === 'EXIT'
        ? stockBefore - numericQuantity
        : movementType === 'ENTRY' ? stockBefore + numericQuantity : numericQuantity;
      if (stockAfter < 0) throw new Error('El movimiento dejaría stock negativo');

      await connection.execute(
        'UPDATE inventario_items SET stock = ?, product_id = COALESCE(product_id, ?) WHERE id = ? AND organization_id = ?',
        [stockAfter, resolvedProductId, item.id, tenantId]
      );
      const [result] = await connection.execute(
        `INSERT INTO inventario_movimientos
          (organization_id, product_id, inventario_item_id, sku, warehouse, movement_type, quantity, stock_before, stock_after, reason, reference_type, reference_id, user_id, username)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)` ,
        [tenantId, resolvedProductId || item.product_id || null, item.id, sku, warehouse, movementType, numericQuantity, stockBefore, stockAfter, reason || null, referenceType || null, referenceId || null, user?.id || null, user?.username || null]
      );
      await connection.commit();
      return { id: Number(result.insertId), sku, warehouse, movementType, quantity: numericQuantity, stockBefore, stockAfter };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  },

  async listMovements({ sku = '', warehouse = '', page = 1, perPage = 50, organizationId: organization } = {}) {
    const tenantId = organizationId(organization);
    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedPerPage = Math.min(100, Math.max(1, Number(perPage) || 50));
    const offset = (normalizedPage - 1) * normalizedPerPage;
    const [rows] = await getPool().execute(
      `SELECT id, sku, warehouse, movement_type AS movementType, quantity, stock_before AS stockBefore,
        stock_after AS stockAfter, reason, reference_type AS referenceType, reference_id AS referenceId,
        user_id AS userId, username, created_at AS createdAt
       FROM inventario_movimientos
       WHERE organization_id = ? AND (? = '' OR sku = ?) AND (? = '' OR warehouse = ?)
       ORDER BY id DESC LIMIT ? OFFSET ?`,
      [tenantId, sku, sku, warehouse, warehouse, normalizedPerPage, offset]
    );
    const [countRows] = await getPool().execute(
      "SELECT COUNT(*) AS total FROM inventario_movimientos WHERE organization_id = ? AND (? = '' OR sku = ?) AND (? = '' OR warehouse = ?)",
      [tenantId, sku, sku, warehouse, warehouse]
    );
    const total = Number(countRows[0]?.total || 0);
    return { data: rows, total, page: normalizedPage, perPage: normalizedPerPage, totalPages: Math.max(1, Math.ceil(total / normalizedPerPage)) };
  },

  async listImportAudits({ page = 1, perPage = 20, organizationId: organization } = {}) {
    const normalizedPage = Math.max(1, Number(page) || 1);
    const normalizedPerPage = Math.min(100, Math.max(1, Number(perPage) || 20));
    const offset = (normalizedPage - 1) * normalizedPerPage;
    const tenantId = organizationId(organization);
    const [rows] = await getPool().execute(
      `SELECT id, source, filename, dry_run AS dryRun, status, total_rows AS totalRows,
        valid_rows AS validRows, invalid_rows AS invalidRows, duplicate_rows AS duplicates,
        imported_rows AS importedRows, user_id AS userId, username, created_at AS createdAt
      FROM inventario_importaciones WHERE organization_id = ? ORDER BY id DESC LIMIT ? OFFSET ?`,
          [tenantId, normalizedPerPage, offset]
    );
    const [countRows] = await getPool().execute('SELECT COUNT(*) AS total FROM inventario_importaciones WHERE organization_id = ?', [tenantId]);
    const total = Number(countRows[0]?.total || 0);

    return {
      data: rows.map((row) => ({ ...row, id: Number(row.id), dryRun: Boolean(row.dryRun) })),
      total,
      page: normalizedPage,
      perPage: normalizedPerPage,
      totalPages: Math.max(1, Math.ceil(total / normalizedPerPage))
    };
  },

  async getImportAudit(id, organization) {
    const importId = numericId(id);
    const tenantId = organizationId(organization);
    const [auditRows] = await getPool().execute(
      `SELECT id, source, filename, dry_run AS dryRun, status, total_rows AS totalRows,
        valid_rows AS validRows, invalid_rows AS invalidRows, duplicate_rows AS duplicates,
        imported_rows AS importedRows, user_id AS userId, username, created_at AS createdAt
      FROM inventario_importaciones WHERE id = ? AND organization_id = ? LIMIT 1`,
          [importId, tenantId]
    );
    if (!auditRows[0]) return null;

    const [rowDetails] = await getPool().execute(
      `SELECT row_index AS rowIndex, sku, status, errors, raw_data AS rawData
       FROM inventario_importacion_filas WHERE importacion_id = ? ORDER BY row_index ASC`,
      [importId]
    );

    return {
      ...auditRows[0],
      id: Number(auditRows[0].id),
      dryRun: Boolean(auditRows[0].dryRun),
      rows: rowDetails.map((row) => ({
        ...row,
        errors: typeof row.errors === 'string' ? JSON.parse(row.errors) : row.errors || [],
        rawData: typeof row.rawData === 'string' ? JSON.parse(row.rawData) : row.rawData || {}
      }))
    };
  },

  async importRows(rows, { dryRun = true, source, filename, user, summary, organizationId: organization } = {}) {
    const tenantId = organizationId(organization);
    const pool = getPool();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();
      const [auditResult] = await connection.execute(
        `INSERT INTO inventario_importaciones
          (organization_id, source, filename, dry_run, status, total_rows, valid_rows, invalid_rows, duplicate_rows, imported_rows, user_id, username)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tenantId,
          source,
          filename || null,
          dryRun ? 1 : 0,
          'completed',
          summary.totalRows,
          summary.validRows,
          summary.invalidRows,
          summary.duplicates,
          dryRun ? 0 : rows.length,
          user?.id || null,
          user?.username || null
        ]
      );

      for (const row of summary.rows) {
        await connection.execute(
          `INSERT INTO inventario_importacion_filas (importacion_id, row_index, sku, status, errors, raw_data)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            auditResult.insertId,
            row.index,
            row.sku || null,
            row.status,
            JSON.stringify(row.errors || []),
            JSON.stringify(row.raw || {})
          ]
        );
      }

      if (!dryRun) {
        for (const row of rows) {
          const [productRows] = await connection.execute(
            'SELECT id FROM productos WHERE org_id = ? AND (codigo_prod = ? OR codigo_altern = ?) LIMIT 1',
            [tenantId, row.sku, row.sku]
          );
          let productId = productRows[0] ? Number(productRows[0].id) : null;

          if (productId) {
            await connection.execute(
              'UPDATE productos SET nombre_prod = ?, price = ?, stock = ?, unit = ?, sale_by_weight = ? WHERE id = ? AND org_id = ?',
              [row.name, row.price, row.stock, row.unit, row.unit === 'KG' ? 1 : 0, productId, tenantId]
            );
          } else {
            const [productResult] = await connection.execute(
              `INSERT INTO productos (org_id, codigo_prod, nombre_prod, price, stock, unit, sale_by_weight)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [tenantId, row.sku, row.name, row.price, row.stock, row.unit, row.unit === 'KG' ? 1 : 0]
            );
            productId = Number(productResult.insertId);
          }

          const [previousRows] = await connection.execute(
            'SELECT id, stock FROM inventario_items WHERE organization_id = ? AND sku = ? AND warehouse = ? LIMIT 1',
            [tenantId, row.sku, row.warehouse]
          );
          const previousStock = Number(previousRows[0]?.stock || 0);
          await connection.execute(
            `INSERT INTO inventario_items
              (organization_id, product_id, sku, name, category, unit, stock, min_stock, cost, price, warehouse, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
              product_id = VALUES(product_id), name = VALUES(name), category = VALUES(category), unit = VALUES(unit), stock = VALUES(stock),
              min_stock = VALUES(min_stock), cost = VALUES(cost), price = VALUES(price), active = VALUES(active)`,
            [
              tenantId,
              productId,
              row.sku,
              row.name,
              row.category || null,
              row.unit,
              row.stock,
              row.minStock,
              row.cost,
              row.price,
              row.warehouse,
              row.active ? 1 : 0
            ]
          );
          const [itemRows] = await connection.execute(
            'SELECT id FROM inventario_items WHERE organization_id = ? AND sku = ? AND warehouse = ? LIMIT 1',
            [tenantId, row.sku, row.warehouse]
          );
          await connection.execute(
            `INSERT INTO inventario_movimientos
              (organization_id, inventario_item_id, sku, warehouse, movement_type, quantity, stock_before, stock_after, reason, reference_type, reference_id, user_id, username)
             VALUES (?, ?, ?, ?, 'IMPORT', ?, ?, ?, ?, 'IMPORTACION', ?, ?, ?)`,
            [
              tenantId,
              itemRows[0]?.id || null,
              row.sku,
              row.warehouse,
              Number(row.stock) - previousStock,
              previousStock,
              row.stock,
              'Importación de inventario',
              auditResult.insertId,
              user?.id || null,
              user?.username || null
            ]
          );
        }
      }

      await connection.commit();
      return {
        auditId: Number(auditResult.insertId),
        importedRows: dryRun ? 0 : rows.length,
        imported: dryRun ? [] : rows
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
};