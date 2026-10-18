import express from 'express';
import { productService } from '../services/productService.js';
import { jsonSuccess } from '../utils/response.js';
import { inventoryService } from '../../inventario/module/inventoryService.js';

const router = express.Router();

const isInventoryRequest = (query = {}) => {
  const source = String(query.source || query.type || query.mode || query.view || '').trim().toLowerCase();
  if (['inventory', 'inventario', 'stock', 'stock-real', 'real-stock'].includes(source)) {
    return true;
  }

  const perPage = Number(query.perPage || 0);
  return perPage >= 200 && !query.category && !query.lowStockOnly && !query.search;
};

router.get('/', async (req, res) => {
  console.log('[PRODUCTS /] consultando productos con filtros:', req.query);

  const inventoryRequested = isInventoryRequest(req.query);
  const organizationId = Number(req.user?.organizationId || req.query.organizationId || 1);

  const result = inventoryRequested
    ? await inventoryService.list({ ...req.query, organizationId, page: Number(req.query.page || 1), perPage: Number(req.query.perPage || 50) })
    : await productService.list(req.query);

  const sourceName = inventoryRequested ? 'inventario_items' : 'productos';
  const sourceLabel = inventoryRequested ? 'INVENTARIO REAL (compatibilidad frontend)' : 'CATÁLOGO POS (tabla productos)';

  console.log('[PRODUCTS /] fuente:', sourceLabel);
  console.log('[PRODUCTS /] total productos devueltos:', result.total, 'Origen:', sourceName, 'organización:', organizationId);
  console.log('[PRODUCTS /] ¿proviene de inventario?:', inventoryRequested ? 'SI' : 'NO. El inventario real vive en /api/inventario y usa inventario_items filtrado por organización.');
  console.log('[PRODUCTS /] muestra:', result.data.slice(0, 5).map((item) => ({
    id: item.id,
    codigoProd: item.codigoProd || item.sku || item.productId,
    nombreProd: item.nombreProd || item.name,
    stock: item.stock,
    source: sourceName
  })));

  return res.json(jsonSuccess(result.data, {
    total: result.total,
    page: result.page,
    perPage: result.perPage,
    totalPages: result.totalPages,
    source: sourceName,
    sourceLabel
  }));
});

router.get('/search', async (req, res) => {
  console.log('[PRODUCTS /search] búsqueda de productos:', req.query);
  const result = await productService.list(req.query);
  console.log('[PRODUCTS /search] resultados:', result.data.length);
  return res.json(jsonSuccess(result.data, {
    total: result.total,
    page: result.page,
    perPage: result.perPage,
    totalPages: result.totalPages
  }));
});

router.get('/by-code', async (req, res) => {
  const code = String(req.query.code || '').trim();
  console.log('[PRODUCTS /by-code] consultando producto por código:', code);
  const product = await productService.findByCode(code);

  if (!product) {
    console.warn('[PRODUCTS /by-code] producto no encontrado:', code);
    return res.status(404).json({ success: false, message: 'Producto no encontrado' });
  }

  return res.json(jsonSuccess(product));
});

router.get('/category/:categoryId', async (req, res) => {
  const categoryId = req.params.categoryId;
  console.log('[PRODUCTS /category] consultando categoría:', categoryId);
  const filtered = await productService.findByCategory(categoryId);
  console.log('[PRODUCTS /category] productos encontrados:', filtered.length);
  return res.json(jsonSuccess(filtered));
});

router.get('/:id', async (req, res) => {
  const id = req.params.id;
  console.log('[PRODUCTS /:id] consultando producto id:', id);
  const product = await productService.findById(id);
  if (!product) {
    console.warn('[PRODUCTS /:id] producto no encontrado:', id);
    return res.status(404).json({ success: false, message: 'Producto no encontrado' });
  }

  return res.json(jsonSuccess(product));
});

router.put('/:id', async (req, res) => {
  const id = req.params.id;
  console.log('[PRODUCTS /:id PUT] actualizando producto id:', id, 'payload:', req.body);
  let updated;
  try {
    updated = await productService.update(id, req.body || {});
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
  if (!updated) {
    console.warn('[PRODUCTS /:id PUT] no se encontró producto para actualizar:', id);
    return res.status(404).json({ success: false, message: 'Producto no encontrado' });
  }

  console.log('[PRODUCTS /:id PUT] producto actualizado:', updated.id);
  return res.json(jsonSuccess(updated));
});

export default router;
