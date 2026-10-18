import { getPool } from '../config/database.js';
import { products as demoProducts } from '../data/demoData.js';

const normalizeUnit = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'KG' || normalized === 'KILO' || normalized === 'KILOGRAMO' || normalized === 'G' || normalized === 'GR' || normalized === 'GRAMOS' ? 'KG' : 'PZA';
};

const validateSaleByWeight = (payload, unit) => {
  if (payload.saleByWeight !== undefined && typeof payload.saleByWeight !== 'boolean') {
    throw new Error('saleByWeight debe ser booleano');
  }

  if (payload.saleByWeight !== undefined && payload.saleByWeight !== (unit === 'KG')) {
    throw new Error('unit y saleByWeight no son compatibles');
  }
};

const getLegacyWeightSignals = (product = {}) => {
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
    product.esPesable,
    product.isWeighted,
    product.weighable
  ].filter((value) => value !== undefined && value !== null && value !== '').join(' ').toLowerCase();

  const weightSignals = ['kg', 'kilogram', 'kilo', 'gram', 'gr', 'peso', 'vendida por peso', 'venta por peso', 'pesable', 'weight', 'weigh', 'weighted'];
  return weightSignals.some((signal) => candidateText.includes(signal));
};

const normalizeProductUnit = (row = {}) => {
  const rawUnit = String(row.unit || row.unidad || row.unidadVenta || 'PZA').trim().toUpperCase();
  const legacyWeightFlag = Boolean(
    row.saleByWeight ||
    row.ventaPorPeso ||
    row.esPesable ||
    row.isWeighted ||
    row.weighable
  );
  const weightSignals = getLegacyWeightSignals(row);
  const unit = rawUnit === 'KG' || rawUnit === 'G' || rawUnit === 'GR' || rawUnit === 'GRAMOS' || legacyWeightFlag || weightSignals ? 'KG' : 'PZA';

  return {
    unit,
    saleByWeight: unit === 'KG',
    unidadVenta: unit,
    ventaPorPeso: unit === 'KG'
  };
};

const normalizeProduct = (row = {}) => {
  const normalizedUnit = normalizeProductUnit(row);

  return {
    id: Number(row.id ?? row.productId ?? 0),
    codigoProd: row.codigo_prod || row.codigoProd || row.sku || '',
    codigoAltern: row.codigo_altern || row.codigoAltern || '',
    nombreProd: row.nombre_prod || row.nombreProd || row.name || '',
    price: Number(row.price ?? row.precio ?? row.salePrice ?? row.unitPrice ?? 0),
    stock: Number(row.stock ?? row.inventory ?? 0),
    org_id: Number(row.org_id ?? row.orgId ?? 1),
    id_category: Number(row.id_category ?? row.idCategoria ?? row.categoryId ?? 1),
    description: row.description || row.descripcion || '',
    image: row.image || row.img || '',
    category: row.category || row.categoria || '',
    sku: row.sku || row.codigoProd || row.codigo_prod || '',
    cost: Number(row.cost ?? row.costo ?? 0),
    unit: normalizedUnit.unit,
    saleByWeight: normalizedUnit.saleByWeight,
    unidadVenta: normalizedUnit.unidadVenta,
    ventaPorPeso: normalizedUnit.ventaPorPeso,
    lowStockThreshold: Number(row.lowStockThreshold ?? row.stock_min ?? row.minStock ?? 0),
    active: row.active !== undefined ? Boolean(row.active) : true,
    discountRate: Number(row.discountRate ?? row.descuento ?? 0),
    taxRate: Number(row.taxRate ?? row.iva ?? 0.16)
  };
};

const productFields = `id, codigo_prod, codigo_altern, nombre_prod, price, stock, unit, sale_by_weight,
  org_id, id_category, description, image`;

const fromDemoProducts = (query = {}) => {
  const { search, category, lowStockOnly } = query;
  let data = demoProducts.map((item) => normalizeProduct(item));

  if (search) {
    const value = String(search).toLowerCase();
    data = data.filter((item) =>
      String(item.nombreProd || '').toLowerCase().includes(value) ||
      String(item.codigoProd || '').toLowerCase().includes(value) ||
      String(item.category || '').toLowerCase().includes(value)
    );
  }

  if (category) {
    data = data.filter((item) => String(item.id_category) === String(category) || String(item.category).toLowerCase() === String(category).toLowerCase());
  }

  if (lowStockOnly) {
    data = data.filter((item) => Number(item.stock) <= (Number(item.lowStockThreshold) || 0) || Number(item.stock) <= 5);
  }

  return data;
};

export const productService = {
  async list({ search, page = 1, perPage = 50, category, lowStockOnly } = {}) {
    let data = [];

    if (!global.mysqlAvailable) {
      data = fromDemoProducts({ search, category, lowStockOnly });
    } else {
      try {
        const [rows] = await getPool().execute(
          `SELECT ${productFields}
           FROM productos
           WHERE (? IS NULL OR nombre_prod LIKE ? OR codigo_prod LIKE ?)
           ORDER BY id ASC`,
          [search || null, search ? `%${search}%` : '%', search ? `%${search}%` : '%']
        );

        data = rows.map(normalizeProduct);
      } catch (error) {
        console.error('[PRODUCT SERVICE] Error consultando productos desde MySQL:', error.message);
        data = [];
      }
    }

    if (search && global.mysqlAvailable) {
      const value = String(search).toLowerCase();
      data = data.filter(
        (item) =>
          String(item.nombreProd || '').toLowerCase().includes(value) ||
          String(item.codigoProd || '').toLowerCase().includes(value)
      );
    }

    if (category) {
      data = data.filter((item) => String(item.id_category) === String(category));
    }

    if (lowStockOnly) {
      data = data.filter((item) => Number(item.stock) <= (Number(item.lowStockThreshold) || 0) || Number(item.stock) <= 5);
    }

    const pageNumber = Number(page) || 1;
    const perPageNumber = Number(perPage) || 50;
    const startIndex = (pageNumber - 1) * perPageNumber;
    const paginated = data.slice(startIndex, startIndex + perPageNumber);

    return {
      data: paginated,
      total: data.length,
      page: pageNumber,
      perPage: perPageNumber,
      totalPages: Math.max(1, Math.ceil(data.length / perPageNumber))
    };
  },

  async findByCode(code) {
    if (!global.mysqlAvailable) {
      const normalizedCode = String(code || '').trim();
      const product = demoProducts.find((item) => item.codigoProd === normalizedCode || item.codigoAltern === normalizedCode);
      return product ? normalizeProduct(product) : null;
    }

    try {
      const [rows] = await getPool().execute(
        `SELECT ${productFields} FROM productos WHERE codigo_prod = ? OR codigo_altern = ? LIMIT 1`,
        [String(code || '').trim(), String(code || '').trim()]
      );

      return rows[0] ? normalizeProduct(rows[0]) : null;
    } catch (error) {
      console.error('[PRODUCT SERVICE] Error buscando producto por código:', error.message);
      return null;
    }
  },

  async findByCategory(categoryId) {
    if (!global.mysqlAvailable) {
      return fromDemoProducts({ category: categoryId });
    }

    try {
      const [rows] = await getPool().execute(
        `SELECT ${productFields} FROM productos WHERE id_category = ? ORDER BY id ASC`,
        [Number(categoryId)]
      );

      return rows.map(normalizeProduct);
    } catch (error) {
      console.error('[PRODUCT SERVICE] Error buscando productos por categoría:', error.message);
      return [];
    }
  },

  async findById(id) {
    if (!global.mysqlAvailable) {
      const product = demoProducts.find((item) => String(item.id) === String(id));
      return product ? normalizeProduct(product) : null;
    }

    try {
      const [rows] = await getPool().execute(
        `SELECT ${productFields} FROM productos WHERE id = ? LIMIT 1`,
        [Number(id)]
      );

      return rows[0] ? normalizeProduct(rows[0]) : null;
    } catch (error) {
      console.error('[PRODUCT SERVICE] Error buscando producto por id:', error.message);
      return null;
    }
  },

  async update(id, payload) {
    const productId = Number(id);

    if (!global.mysqlAvailable) {
      const productIndex = demoProducts.findIndex((item) => String(item.id) === String(productId));
      if (productIndex < 0) {
        return null;
      }

      const existing = demoProducts[productIndex];
      const nextUnit = normalizeUnit(payload.unit || payload.unidad || payload.unidadVenta || existing.unit || 'PZA');
      const normalizedPayload = {
        ...existing,
        ...payload,
        unit: nextUnit,
        saleByWeight: nextUnit === 'KG',
        unidadVenta: nextUnit,
        ventaPorPeso: nextUnit === 'KG',
        price: Number(payload.price ?? existing.price ?? 0),
        stock: Number(payload.stock ?? existing.stock ?? 0),
        id_category: Number(payload.id_category ?? payload.idCategory ?? existing.id_category ?? 1),
        org_id: Number(payload.org_id ?? existing.org_id ?? 1)
      };

      if (payload.saleByWeight !== undefined && typeof payload.saleByWeight !== 'boolean') {
        throw new Error('saleByWeight debe ser booleano');
      }

      if (payload.saleByWeight !== undefined && payload.saleByWeight !== normalizedPayload.saleByWeight) {
        throw new Error('unit y saleByWeight no son compatibles');
      }

      demoProducts[productIndex] = normalizedPayload;
      return normalizeProduct(demoProducts[productIndex]);
    }

    try {
      const currentProduct = await this.findById(productId);
      const nextUnit = normalizeUnit(payload.unit || payload.unidad || payload.unidadVenta || currentProduct?.unit || 'PZA');
      if (payload.saleByWeight !== undefined && typeof payload.saleByWeight !== 'boolean') {
        throw new Error('saleByWeight debe ser booleano');
      }
      if (payload.saleByWeight !== undefined && payload.saleByWeight !== (nextUnit === 'KG')) {
        throw new Error('unit y saleByWeight no son compatibles');
      }

      const [result] = await getPool().execute(
        `UPDATE productos SET codigo_prod = ?, codigo_altern = ?, nombre_prod = ?, price = ?, stock = ?, unit = ?, sale_by_weight = ?, org_id = ?, id_category = ?, description = ?, image = ? WHERE id = ?`,
        [
          payload.codigoProd || payload.codigo_prod || '',
          payload.codigoAltern || payload.codigo_altern || '',
          payload.nombreProd || payload.nombre_prod || '',
          Number(payload.price ?? 0),
          Number(payload.stock ?? 0),
          nextUnit,
          nextUnit === 'KG' ? 1 : 0,
          Number(payload.org_id ?? 1),
          Number(payload.id_category ?? 1),
          payload.description || '',
          payload.image || '',
          productId
        ]
      );

      if (result.affectedRows > 0) {
        return await this.findById(productId);
      }

      return null;
    } catch (error) {
      console.error('[PRODUCT SERVICE] Error actualizando producto en MySQL:', error.message);
      return null;
    }
  }
};
