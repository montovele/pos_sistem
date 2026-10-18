import { products, transactions, addTransaction } from '../data/demoData.js';
import { getPool } from '../config/database.js';
import { cajaService } from './cajaService.js';
import { inventoryService } from '../../inventario/module/inventoryService.js';

const normalizeTransaction = (row) => ({
  id: row.id,
  codigoTransaccion: row.codigo_transaccion || row.codigoTransaccion || '',
  codigoTicket: row.codigo_ticket || row.codigoTicket || '',
  fechaDeTrans: row.fecha_trans ? new Date(row.fecha_trans).toISOString() : (row.fechaDeTrans || new Date().toISOString()),
  items: typeof row.items === 'string' ? JSON.parse(row.items || '[]') : (row.items || []),
  subtotal: Number(row.subtotal ?? row.subTotal ?? 0),
  discount: Number(row.discount ?? row.descuento ?? 0),
  total: Number(row.total ?? 0),
  nombreCajero: row.nombre_cajero || row.nombreCajero || 'Sistema',
  numeroEmpleado: Number(row.numero_empleado ?? row.numeroEmpleado ?? 1),
  organizationId: Number(row.organization_id ?? row.organizationId ?? 1),
  status: row.status || 'completed',
  timestamp: Number(row.timestamp ?? new Date(row.fecha_trans || Date.now()).getTime()),
  paymentMethod: row.payment_method || row.paymentMethod || 'cash',
  clientTransactionId: row.client_transaction_id || row.clientTransactionId || null,
  deviceId: row.device_id || row.deviceId || null
});

const getItemQuantity = (item = {}) => {
  const quantity = Number(item.quantity ?? item.qty ?? item.cantidad ?? 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
};

const normalizeSaleUnit = (value) => {
  const unit = String(value || '').trim().toUpperCase();
  return unit === 'KG' || unit === 'KILO' || unit === 'KILOGRAMO' || unit === 'G' || unit === 'GR' || unit === 'GRAMOS' ? 'KG' : 'PZA';
};

const getLegacyWeightSignals = (product = {}, item = {}) => {
  const candidateText = [
    product.nombreProd,
    product.name,
    product.nombre_prod,
    product.descripcion,
    product.description,
    product.unit,
    product.unidad,
    product.unidadVenta,
    product.saleByWeight,
    product.ventaPorPeso,
    item.nombreProd,
    item.name,
    item.nombre_prod,
    item.descripcion,
    item.description,
    item.unit,
    item.unidad,
    item.unidadVenta,
    item.saleByWeight,
    item.ventaPorPeso
  ].filter((value) => value !== undefined && value !== null && value !== '').join(' ').toLowerCase();

  const weightSignals = ['kg', 'kilogram', 'kilo', 'gram', 'gr', 'peso', 'vendida por peso', 'venta por peso', 'weight', 'weigh', 'pesable'];
  return weightSignals.some((signal) => candidateText.includes(signal));
};

const normalizeLegacyProductUnit = (product = {}, item = {}) => {
  const rawUnit = String(product?.unit || product?.unidad || product?.unidadVenta || item?.unit || item?.unidad || item?.unidadVenta || 'PZA').trim().toUpperCase();
  const legacyWeightFlag = Boolean(
    product?.saleByWeight ||
    product?.ventaPorPeso ||
    item?.saleByWeight ||
    item?.ventaPorPeso ||
    product?.esPesable ||
    item?.esPesable ||
    product?.isWeighted ||
    item?.isWeighted ||
    product?.weighable ||
    item?.weighable
  );

  const hasWeightSignals = getLegacyWeightSignals(product, item);
  const isWeightProduct = rawUnit === 'KG' || rawUnit === 'G' || rawUnit === 'GR' || rawUnit === 'GRAMOS' || legacyWeightFlag || hasWeightSignals;

  return isWeightProduct ? 'KG' : 'PZA';
};

const getSaleQuantity = (item, unit) => {
  const grams = Number(item.weightGrams ?? item.grams ?? item.pesoGramos ?? item.weight_g ?? item.gramos ?? 0);
  if (unit === 'KG' && Number.isFinite(grams) && grams > 0) {
    return grams / 1000;
  }

  return Number(item.quantity ?? item.qty ?? item.cantidad ?? 0);
};

const validateSaleQuantity = (quantity, unit) => {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw Object.assign(new Error(`Un producto ${unit} requiere una cantidad positiva`), { status: 400 });
  }

  if (unit === 'PZA' && !Number.isInteger(quantity)) {
    throw Object.assign(new Error('Un producto PZA requiere una cantidad entera'), { status: 400 });
  }
};

const normalizeProductIdentifier = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  const stringValue = String(value).trim();
  if (!stringValue) {
    return null;
  }

  const numeric = Number(stringValue);
  return Number.isFinite(numeric) && String(numeric) === stringValue ? numeric : stringValue;
};

const getProductReference = (item = {}) => {
  const product = item.product || {};
  const idCandidates = [
    item.productId,
    item.product_id,
    item.productoId,
    item.producto_id,
    item.id,
    product.id,
    product.productId,
    product.product_id,
    product.productoId,
    product.producto_id
  ];
  const codeCandidates = [
    item.codigoProd,
    item.codigo_prod,
    item.codigoAltern,
    item.codigo_altern,
    item.codigoProducto,
    item.codigo,
    item.sku,
    item.barcode,
    product.codigoProd,
    product.codigo_prod,
    product.codigoAltern,
    product.codigo_altern,
    product.codigoProducto,
    product.codigo,
    product.sku,
    product.barcode,
    item.nombreProd,
    product.nombreProd,
    item.name,
    product.name
  ];

  const id = idCandidates.map(normalizeProductIdentifier).find((candidate) => candidate !== null && candidate !== undefined && candidate !== '');
  const code = codeCandidates.map((candidate) => {
    if (candidate === null || candidate === undefined || candidate === '') return null;
    return String(candidate).trim();
  }).find((candidate) => candidate && candidate !== '');

  return {
    id: id ?? null,
    code: code ?? null,
    name: item.nombreProd ?? item.nombre_prod ?? product.nombreProd ?? product.nombre_prod ?? item.name ?? product.name ?? ''
  };
};

const debugTransactionItem = (label, item = {}) => {
  console.log(`[TRANSACTION DEBUG] ${label}:`, {
    rawItem: item,
    normalized: getProductReference(item),
    quantity: getItemQuantity(item),
    stockCandidate: item.stock ?? item.inventory ?? null
  });
};

const calculateLineTotals = (item = {}) => {
  const quantity = Number(item.quantity);
  const unitPrice = Number(item.price ?? item.precio ?? item.unitPrice ?? item.salePrice ?? 0);
  const discountRate = Number(item.discountRate ?? item.discount ?? item.descuento ?? 0);
  const subtotal = quantity * unitPrice;
  const discountAmount = subtotal * (discountRate / 100);

  return {
    quantity,
    unitPrice,
    subtotal,
    discount: discountAmount,
    total: subtotal - discountAmount
  };
};

const getProductForSale = async (item = {}, organizationId = 1) => {
  const reference = getProductReference(item);
  if (!reference.id && !reference.code) return null;

  if (global.mysqlAvailable) {
    const [inventoryRows] = await getPool().execute(
      `SELECT id AS inventoryItemId, product_id AS id, sku AS codigo_prod, barcode,
        name AS nombre_prod, price, stock, unit, warehouse
       FROM inventario_items
       WHERE organization_id = ? AND active = 1
         AND ((? > 0 AND (product_id = ? OR id = ?))
           OR (? != '' AND (sku = ? OR barcode = ?)))
       ORDER BY CASE WHEN (? != '' AND (sku = ? OR barcode = ?)) THEN 0 ELSE 1 END, id DESC
       LIMIT 1`,
      [
        organizationId,
        Number(reference.id) || 0,
        Number(reference.id) || 0,
        Number(reference.id) || 0,
        reference.code || '', reference.code || '', reference.code || '',
        reference.code || '', reference.code || '', reference.code || ''
      ]
    );
    if (inventoryRows[0]) return { ...inventoryRows[0], inventoryOnly: true };

    const [rows] = await getPool().execute(
      'SELECT id, codigo_prod, codigo_altern, nombre_prod, price, stock, unit, sale_by_weight FROM productos WHERE org_id = ? AND ((? IS NOT NULL AND id = ?) OR codigo_prod = ? OR codigo_altern = ?) LIMIT 1',
      [organizationId, reference.id !== null ? Number(reference.id) : null, reference.id !== null ? Number(reference.id) : null, reference.code || '', reference.code || '']
    );
    return rows[0] || null;
  }

  const inventoryItem = await inventoryService.findBySku(reference.code, 'PRINCIPAL', organizationId);
  if (inventoryItem) {
    return {
      id: inventoryItem.productId,
      inventoryItemId: inventoryItem.id,
      codigo_prod: inventoryItem.sku,
      nombre_prod: inventoryItem.name,
      price: inventoryItem.price,
      stock: inventoryItem.stock,
      unit: inventoryItem.unit,
      warehouse: inventoryItem.warehouse,
      inventoryOnly: true
    };
  }

  const catalogProduct = products.find((product) => (
    Number(product.org_id ?? product.organizationId ?? 1) === Number(organizationId) && ((reference.id !== null && String(product.id) === String(reference.id)) ||
    (reference.code && [product.codigoProd, product.codigo_prod, product.codigoAltern, product.codigo_altern]
      .some((code) => String(code || '').toLowerCase() === String(reference.code).toLowerCase())))
  ));
  return catalogProduct || null;
};

const getInventoryStockForProduct = async (product = {}, item = {}, organizationId = 1) => {
  const sku = String(product?.codigo_prod || product?.codigoProd || item?.sku || item?.codigoProd || item?.barcode || '').trim();
  const productId = Number(product?.id ?? item?.productId ?? item?.product_id ?? 0);

  if (global.mysqlAvailable) {
    if (Number(product?.inventoryItemId) > 0) {
      const [inventoryRows] = await getPool().execute(
        'SELECT stock FROM inventario_items WHERE id = ? AND organization_id = ? AND active = 1 LIMIT 1',
        [Number(product.inventoryItemId), organizationId]
      );
      if (inventoryRows[0]) return Number(inventoryRows[0].stock || 0);
    }

    const [rows] = await getPool().execute(
      'SELECT stock FROM inventario_items WHERE organization_id = ? AND ((? > 0 AND product_id = ?) OR (? != "" AND sku = ?)) ORDER BY id DESC LIMIT 1',
      [organizationId, productId, productId, sku, sku]
    );

    if (rows[0]) {
      return Number(rows[0].stock || 0);
    }
  }

  if (sku) {
    const inventoryItem = await inventoryService.findBySku(sku, 'PRINCIPAL', organizationId);
    if (inventoryItem) {
      return Number(inventoryItem.stock || 0);
    }
  }

  return Number(product.stock ?? item.stock ?? item.inventory ?? 0);
};

const normalizeSaleItems = async (items, organizationId = 1) => {
  const normalized = [];
  const remainingStock = new Map();

  for (const item of items) {
    const product = await getProductForSale(item, organizationId);
    if (!product) {
      throw Object.assign(new Error('Producto no encontrado'), { status: 400 });
    }

    const settledUnit = normalizeLegacyProductUnit(product, item);
    const unit = normalizeSaleUnit(item.unit || item.unidad || item.unidadVenta || product.unit || product.unidad || settledUnit);
    const normalizedUnit = unit === 'KG' || settledUnit === 'KG' ? 'KG' : 'PZA';
    const quantity = getSaleQuantity(item, normalizedUnit);
    validateSaleQuantity(quantity, normalizedUnit);

    const stock = await getInventoryStockForProduct(product, item, organizationId);
    const stockKey = String(product.id ?? product.codigo_prod ?? product.codigoProd);
    const availableStock = remainingStock.has(stockKey) ? remainingStock.get(stockKey) : stock;
    if (quantity > availableStock) {
      throw Object.assign(new Error(`Stock insuficiente para ${product.nombre_prod || product.nombreProd || item.nombreProd || 'el producto'}`), { status: 409 });
    }
    remainingStock.set(stockKey, Number((availableStock - quantity).toFixed(3)));

    normalized.push({
      ...item,
      productId: product.id ?? item.productId ?? item.product_id,
      inventoryItemId: product.inventoryItemId ?? item.inventoryItemId,
      codigoProd: product.codigo_prod || product.codigoProd || item.codigoProd,
      nombreProd: product.nombre_prod || product.nombreProd || item.nombreProd,
      price: Number(product.price ?? item.price ?? 0),
      quantity: normalizedUnit === 'KG' ? Number(quantity.toFixed(3)) : quantity,
      unit: normalizedUnit,
      saleByWeight: normalizedUnit === 'KG'
    });
  }

  return normalized;
};

const calculateTransactionTotals = (items = [], globalDiscount = 0) => {
  const normalizedItems = Array.isArray(items) ? items : [];
  const subtotal = normalizedItems.reduce((sum, item) => sum + calculateLineTotals(item).subtotal, 0);
  const discount = normalizedItems.reduce((sum, item) => sum + calculateLineTotals(item).discount, 0);
  const discountFromBase = subtotal * (Number(globalDiscount || 0) / 100);

  return {
    subtotal: Number(subtotal.toFixed(2)),
    discount: Number((discount + discountFromBase).toFixed(2)),
    total: Number((subtotal - discount - discountFromBase).toFixed(2)),
    items: normalizedItems.map((item) => {
      const line = calculateLineTotals(item);
      return {
        ...item,
        quantity: getItemQuantity(item),
        unitPrice: Number(item.price ?? item.precio ?? item.unitPrice ?? item.salePrice ?? 0),
        subtotal: Number(line.subtotal.toFixed(2)),
        discount: Number(line.discount.toFixed(2)),
        total: Number(line.total.toFixed(2))
      };
    })
  };
};

const updateInventoryForTransactionItems = async (items = [], organizationId = 1) => {
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  for (const item of items) {
    const quantity = getItemQuantity(item);
    const productReference = getProductReference(item);
    const { id, code } = productReference;

    console.log('[TRANSACTION SERVICE] Actualizando inventario para item:', {
      item,
      productReference,
      quantity,
      mysqlAvailable: global.mysqlAvailable
    });

    if (!id && !code) {
      console.warn('[TRANSACTION SERVICE] No se pudo identificar producto para restar stock. Item:', item);
      continue;
    }

    if (global.mysqlAvailable) {
      try {
        const [rows] = await getPool().execute(
          'SELECT id, codigo_prod, stock FROM productos WHERE org_id = ? AND ((? IS NOT NULL AND id = ?) OR codigo_prod = ? OR codigo_altern = ?) LIMIT 1',
          [organizationId, id !== null && id !== undefined ? Number(id) : null, id !== null && id !== undefined ? Number(id) : null, code || '', code || '']
        );

        const productRow = rows[0];
        const [inventoryRows] = await getPool().execute(
          `SELECT id, stock FROM inventario_items
           WHERE organization_id = ? AND active = 1
             AND ((? > 0 AND id = ?) OR (? > 0 AND product_id = ?) OR (? != '' AND (sku = ? OR barcode = ?)))
           ORDER BY CASE WHEN (? > 0 AND id = ?) THEN 0 WHEN (? != '' AND (sku = ? OR barcode = ?)) THEN 1 ELSE 2 END, id DESC
           LIMIT 1`,
          [
            organizationId,
            Number(item.inventoryItemId || 0), Number(item.inventoryItemId || 0),
            Number(id || productRow?.id || 0), Number(id || productRow?.id || 0),
            code || '', code || '', code || '',
            Number(item.inventoryItemId || 0), Number(item.inventoryItemId || 0),
            code || '', code || '', code || ''
          ]
        );

        const inventoryRow = inventoryRows[0];
        if (!inventoryRow && !productRow) {
          console.warn('[TRANSACTION SERVICE] Producto no encontrado en MySQL para restar stock:', { id, code });
          continue;
        }
        const currentStock = inventoryRow ? Number(inventoryRow.stock || 0) : Number(productRow.stock || 0);
        if (quantity > currentStock) {
          throw Object.assign(new Error('Stock insuficiente para completar la venta'), { status: 409 });
        }
        const nextStock = Number((currentStock - quantity).toFixed(3));
        console.log('[TRANSACTION SERVICE] Stock MySQL antes/después:', { productId: productRow?.id || id, source: inventoryRow ? 'inventario_items' : 'productos', currentStock, quantity, nextStock });

        if (inventoryRow) {
          await getPool().execute(
            'UPDATE inventario_items SET stock = ? WHERE id = ? AND organization_id = ?',
            [nextStock, inventoryRow.id, organizationId]
          );
        }

        if (productRow) {
          await getPool().execute(
            'UPDATE productos SET stock = ? WHERE id = ? AND org_id = ?',
            [nextStock, productRow.id, organizationId]
          );
        }
      } catch (error) {
        console.error('[TRANSACTION SERVICE] Error actualizando inventario MySQL:', error.message);
      }
      continue;
    }

    const inventoryItem = await inventoryService.findBySku(code, 'PRINCIPAL', organizationId);
    if (inventoryItem) {
      const inventoryStockBefore = Number(inventoryItem.stock || 0);
      if (quantity > inventoryStockBefore) {
        throw Object.assign(new Error('Stock insuficiente para completar la venta'), { status: 409 });
      }

      await inventoryService.createMovement({
        sku: inventoryItem.sku,
        warehouse: inventoryItem.warehouse,
        movementType: 'EXIT',
        quantity,
        reason: 'Venta POS'
      }, { organizationId });

      const productIndex = products.findIndex((product) => (
        Number(product.org_id ?? product.organizationId ?? 1) === Number(organizationId) &&
        (String(product.id) === String(id) || String(product.codigoProd || '').toLowerCase() === String(code || '').toLowerCase())
      ));
      if (productIndex >= 0) {
        products[productIndex].stock = Number((inventoryStockBefore - quantity).toFixed(3));
      }
      continue;
    }

    const productIndex = products.findIndex((product) => {
      const matchesOrg = Number(product.org_id ?? product.organizationId ?? 1) === Number(organizationId);
      const matchesId = id !== null && id !== undefined && String(product.id) === String(id);
      const matchesCode = code && String(product.codigoProd || '').toLowerCase() === String(code).toLowerCase();
      return matchesOrg && (matchesId || matchesCode);
    });

    if (productIndex >= 0) {
      const currentStock = Number(products[productIndex].stock || 0);
      if (quantity > currentStock) {
        throw Object.assign(new Error('Stock insuficiente para completar la venta'), { status: 409 });
      }
      const nextStock = Number((currentStock - quantity).toFixed(3));
      console.log('[TRANSACTION SERVICE] Stock demo antes/después:', {
        productId: products[productIndex].id,
        codigoProd: products[productIndex].codigoProd,
        currentStock,
        quantity,
        nextStock
      });
      products[productIndex].stock = nextStock;
    } else {
      console.warn('[TRANSACTION SERVICE] Producto no encontrado en demo data para restar stock:', { id, code });
    }
  }
};

const isAdmin = (user = {}) => String(user.role || '').toLowerCase() === 'admin';
const getEmployeeNumber = (user = {}) => {
  const employeeNumber = Number(user.numeroEmpleado);
  return Number.isFinite(employeeNumber) && employeeNumber > 0 ? employeeNumber : null;
};
const getDateFilter = (value, endOfDay = false) => {
  if (!value) return null;
  const dateValue = String(value);
  const date = new Date(endOfDay && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)
    ? `${dateValue}T23:59:59.999`
    : dateValue);
  return Number.isNaN(date.getTime()) ? null : date;
};
const canAccessTransaction = (transaction, user = {}) => (
  isAdmin(user) || Number(transaction.numeroEmpleado) === getEmployeeNumber(user)
);
const getOfflineIdentity = (payload = {}) => {
  const clientTransactionId = String(payload.clientTransactionId || '').trim();
  const deviceId = String(payload.deviceId || '').trim();
  if (!clientTransactionId || !deviceId) {
    throw Object.assign(new Error('clientTransactionId y deviceId son obligatorios para sincronizar'), { status: 400 });
  }
  return { clientTransactionId, deviceId };
};

export const transactionService = {
  async list({ startDate, endDate } = {}, user = {}) {
    let data = [...transactions];
    const admin = isAdmin(user);
    const numeroEmpleado = getEmployeeNumber(user);
    const organizationId = Number(user.organizationId || 1);

    if (global.mysqlAvailable) {
      try {
        const [columns] = await getPool().execute('SHOW COLUMNS FROM transacciones');
        const hasSubtotal = columns.some((column) => column.Field === 'subtotal');
        const hasDiscount = columns.some((column) => column.Field === 'discount');
        const hasOrganizationId = columns.some((column) => column.Field === 'organization_id');

        const selectFields = [
          'id',
          'codigo_transaccion',
          'codigo_ticket',
          'fecha_trans',
          'items',
          ...(hasSubtotal ? ['subtotal'] : []),
          ...(hasDiscount ? ['discount'] : []),
          'total',
          'client_transaction_id',
          'device_id',
          'nombre_cajero',
          'numero_empleado',
          ...(hasOrganizationId ? ['organization_id'] : []),
          'status',
          'payment_method'
        ].join(', ');

        const start = getDateFilter(startDate);
        const end = getDateFilter(endDate, true);
        let query = `SELECT ${selectFields}
           FROM transacciones
           WHERE organization_id = ?
             AND (? IS NULL OR fecha_trans >= ?)
             AND (? IS NULL OR fecha_trans <= ?)`;
        const params = [organizationId, start, start, end, end];

        if (!admin) {
          query += ' AND numero_empleado = ?';
          params.push(numeroEmpleado);
        }

        query += ' ORDER BY fecha_trans DESC';

        const [rows] = await getPool().execute(
          query,
          params
        );

        if (rows.length) {
          data = rows.map(normalizeTransaction);
        }
      } catch (error) {
        console.error('[TRANSACTION SERVICE] Error consultando transacciones en MySQL:', error.message);
      }
    }

    data = data.filter((item) => Number(item.organizationId ?? 1) === organizationId);

    if (startDate || endDate) {
      data = data.filter((item) => {
        const itemDate = new Date(item.fechaDeTrans || item.timestamp || Date.now());
        const start = getDateFilter(startDate);
        const end = getDateFilter(endDate, true);

        if (start && itemDate < start) return false;
        if (end && itemDate > end) return false;
        return true;
      });
    }

    if (!admin) {
      data = data.filter((item) => canAccessTransaction(item, user));
    }

    return data;
  },

  async create(payload = {}, user = {}) {
    const cashSession = await cajaService.getOpenSession(user);
    if (!cashSession) {
      throw Object.assign(new Error('No existe una caja abierta para registrar la venta'), { status: 409 });
    }

    const requestedItems = Array.isArray(payload.items) ? payload.items : [];
    if (requestedItems.length === 0) {
      throw Object.assign(new Error('La venta debe contener al menos un producto'), { status: 400 });
    }

    const organizationId = Number(user.organizationId || 1);
    const normalizedItems = await normalizeSaleItems(requestedItems, organizationId);
    console.log('[TRANSACTION SERVICE] Payload recibido para creación:', JSON.stringify({
      items: normalizedItems,
      discount: payload.discount,
      descuento: payload.descuento,
      paymentMethod: payload.paymentMethod,
      user
    }, null, 2));

    normalizedItems.forEach((item, index) => debugTransactionItem(`Item ${index + 1}`, item));

    const baseDiscount = Number(payload.discount || payload.discountPercent || payload.descuento || 0);
    const totals = calculateTransactionTotals(normalizedItems, baseDiscount);

    const transaction = {
      codigoTransaccion: `TX-${Date.now()}`,
      codigoTicket: `TICKET-${Date.now()}`,
      fechaDeTrans: new Date().toISOString(),
      items: totals.items,
      subtotal: totals.subtotal,
      discount: totals.discount,
      total: totals.total,
      nombreCajero: user.nombreEmpleado || 'Sistema',
      numeroEmpleado: Number(user.numeroEmpleado || 0),
      organizationId,
      status: 'completed',
      timestamp: Date.now(),
      paymentMethod: payload.paymentMethod || 'cash',
      cashSessionId: cashSession.id,
      customer: payload.customer || null,
      factura: payload.factura || null,
      discountPercent: baseDiscount
    };

    if (payload.clientTransactionId && payload.deviceId) {
      transaction.clientTransactionId = String(payload.clientTransactionId);
      transaction.deviceId = String(payload.deviceId);
      transaction.createdAt = payload.createdAt || transaction.fechaDeTrans;
    }

    if (global.mysqlAvailable) {
      try {
        await getPool().execute(
          `INSERT INTO transacciones (organization_id, client_transaction_id, device_id, codigo_transaccion, codigo_ticket, fecha_trans, items, subtotal, discount, total, nombre_cajero, numero_empleado, status, payment_method, cash_session_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            organizationId,
            transaction.clientTransactionId || null,
            transaction.deviceId || null,
            transaction.codigoTransaccion,
            transaction.codigoTicket,
            new Date(transaction.fechaDeTrans),
            JSON.stringify(transaction.items),
            Number(transaction.subtotal),
            Number(transaction.discount),
            Number(transaction.total),
            transaction.nombreCajero,
            Number(transaction.numeroEmpleado),
            transaction.status,
            transaction.paymentMethod,
            transaction.cashSessionId
          ]
        );
        console.log('[TRANSACTION SERVICE] Transacción guardada en MySQL:', {
          codigoTransaccion: transaction.codigoTransaccion,
          subtotal: transaction.subtotal,
          discount: transaction.discount,
          total: transaction.total
        });
      } catch (error) {
        console.error('[TRANSACTION SERVICE] Error guardando transacción en MySQL:', error.message);
        throw Object.assign(new Error(`No se pudo guardar la venta en la base de datos: ${error.message}`), {
          status: 500,
          cause: error
        });
      }
    }

    await updateInventoryForTransactionItems(transaction.items, organizationId);
    if (!global.mysqlAvailable) {
      cashSession.transactions = [...(cashSession.transactions || []), transaction];
    }
    addTransaction({ ...transaction, organizationId });
    return transaction;
  },

  async sync(payload = {}, user = {}) {
    const { clientTransactionId, deviceId } = getOfflineIdentity(payload);
    const organizationId = Number(user.organizationId || 1);
    const existing = (await this.list({}, { ...user, organizationId }))
      .find((item) => item.clientTransactionId === clientTransactionId && item.deviceId === deviceId);
    if (existing) return { transaction: existing, idempotent: true };

    const transaction = await this.create({ ...payload, clientTransactionId, deviceId }, user);
    return { transaction, idempotent: false };
  },

  async findById(id, user = {}) {
    const admin = isAdmin(user);
    const numeroEmpleado = getEmployeeNumber(user);
    const organizationId = Number(user.organizationId || 1);
    if (global.mysqlAvailable) {
      try {
        const ownerClause = admin ? '' : ' AND numero_empleado = ?';
        const params = [organizationId, String(id), String(id)];
        if (!admin) params.push(numeroEmpleado);
        const [rows] = await getPool().execute(
          `SELECT id, codigo_transaccion, codigo_ticket, fecha_trans, items, subtotal, discount, total, client_transaction_id, device_id, nombre_cajero, numero_empleado, organization_id, status, payment_method
           FROM transacciones
           WHERE organization_id = ? AND (codigo_transaccion = ? OR codigo_ticket = ?)${ownerClause}
           LIMIT 1`,
          params
        );

        if (rows[0]) {
          return normalizeTransaction(rows[0]);
        }
      } catch (error) {
        console.error('[TRANSACTION SERVICE] Error buscando transacción en MySQL:', error.message);
      }
    }

    return transactions.find(
      (item) => Number(item.organizationId ?? 1) === organizationId && (item.codigoTransaccion === id || item.codigoTicket === id) && canAccessTransaction(item, user)
    ) || null;
  },

  async confirm(id, user = {}) {
    const transaction = await this.findById(id, user);
    if (!transaction) return null;

    if (global.mysqlAvailable) {
      try {
        await getPool().execute(
          'UPDATE transacciones SET status = ? WHERE organization_id = ? AND (codigo_transaccion = ? OR codigo_ticket = ?)',
          ['completed', Number(user.organizationId || 1), String(id), String(id)]
        );
      } catch (error) {
        console.error('[TRANSACTION SERVICE] Error confirmando transacción en MySQL:', error.message);
      }
    }

    transaction.status = 'completed';
    return transaction;
  },

  async cancel(id, user = {}) {
    const transaction = await this.findById(id, user);
    if (!transaction) return null;

    if (global.mysqlAvailable) {
      try {
        await getPool().execute(
          'UPDATE transacciones SET status = ? WHERE organization_id = ? AND (codigo_transaccion = ? OR codigo_ticket = ?)',
          ['cancelled', Number(user.organizationId || 1), String(id), String(id)]
        );
      } catch (error) {
        console.error('[TRANSACTION SERVICE] Error cancelando transacción en MySQL:', error.message);
      }
    }

    transaction.status = 'cancelled';
    return { ok: true, id };
  },

  async reports({ startDate, endDate } = {}, user = {}) {
    const rows = await this.list({ startDate, endDate }, user);
    const data = Array.isArray(rows) ? rows : [];
    const totalSales = data.reduce((sum, item) => sum + Number(item.total || 0), 0);
    const totalDiscounts = data.reduce((sum, item) => sum + Number(item.discount || 0), 0);
    const totalItems = data.reduce((sum, item) => sum + (Array.isArray(item.items) ? item.items.length : 0), 0);

    return {
      totalSales,
      totalItems,
      totalDiscounts,
      averageTicket: data.length ? totalSales / data.length : 0,
      transactions: data,
      topProducts: products.slice(0, 3)
    };
  }
};
