import express from 'express';
import requireAuth from '../../src/middleware/auth.js';
import { inventoryService } from './inventoryService.js';
import { inventoryImportEngine } from '../engine/importEngine.js';

const router = express.Router();
const requireAdmin = (req, res, next) => {
  if (String(req.user?.role || '').toLowerCase() !== 'admin') {
    return res.status(403).json({ success: false, message: 'Se requiere rol de administrador' });
  }
  return next();
};

const getOrganizationId = (req) => req.user?.organizationId || req.user?.organizacionId || 1;

const executeImport = async (rows, source, dryRun, context = {}) => {
  const summary = inventoryImportEngine.summarize(rows);
  const acceptedRows = rows.filter((row, index) => summary.rows[index].status === 'valid');
  const persistence = await inventoryService.importRows(acceptedRows, {
    dryRun,
    source,
    filename: context.filename,
    user: context.user,
    organizationId: context.organizationId,
    summary
  });

  return {
    ...summary,
    dryRun,
    source,
    imported: persistence.imported,
    importedRows: acceptedRows.length,
    auditId: persistence.auditId || null,
    message: dryRun ? 'Importación sin persistencia (modo dry-run)' : 'Inventario importado correctamente'
  };
};

router.use(requireAuth);

router.get('/', async (req, res) => {
  const organizationId = getOrganizationId(req);
  const result = await inventoryService.list({ ...req.query, organizationId });
  console.log('[INVENTARIO /] fuente: INVENTARIO REAL (inventario_items)');
  console.log('[INVENTARIO /] organización:', organizationId, 'totalItems:', result.total, 'origen:', 'inventario_items');
  return res.json({ success: true, data: result.data, meta: {
    total: result.total,
    page: result.page,
    perPage: result.perPage,
    totalPages: result.totalPages
  }});
});

router.get('/stock-bajo', async (req, res) => {
  const data = await inventoryService.lowStock({ organizationId: getOrganizationId(req) });
  return res.json({ success: true, data });
});

router.get('/importaciones', requireAdmin, async (req, res) => {
  const result = await inventoryService.listImportAudits({ ...req.query, organizationId: getOrganizationId(req) });
  return res.json({ success: true, data: result.data, meta: {
    total: result.total,
    page: result.page,
    perPage: result.perPage,
    totalPages: result.totalPages
  }});
});

router.get('/reportes/resumen', requireAdmin, async (req, res) => {
  try {
    const data = await inventoryService.getAdminSummary({ ...req.query, organizationId: getOrganizationId(req) });
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'No fue posible generar el resumen de inventario' });
  }
});

router.get('/reportes/bajo-stock', requireAdmin, async (req, res) => {
  try {
    const data = await inventoryService.getLowStockReport({ ...req.query, organizationId: getOrganizationId(req) });
    return res.json({ success: true, data, meta: { total: data.length } });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'No fue posible generar el reporte de bajo stock' });
  }
});

router.get('/reportes/importaciones/:id', requireAdmin, async (req, res) => {
  try {
    const data = await inventoryService.getImportAudit(req.params.id, getOrganizationId(req));
    if (!data) {
      return res.status(404).json({ success: false, message: 'Importación no encontrada' });
    }
    return res.json({ success: true, data });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/movimientos', requireAdmin, async (req, res) => {
  const result = await inventoryService.listMovements({ ...req.query, organizationId: getOrganizationId(req) });
  return res.json({ success: true, data: result.data, meta: {
    total: result.total,
    page: result.page,
    perPage: result.perPage,
    totalPages: result.totalPages
  }});
});

router.post('/movimientos', requireAdmin, async (req, res) => {
  try {
    const movement = await inventoryService.createMovement(req.body || {}, {
      user: req.user,
      organizationId: getOrganizationId(req)
    });
    return res.status(201).json({ success: true, data: movement });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/:sku', async (req, res) => {
  const item = await inventoryService.findBySku(req.params.sku, 'PRINCIPAL', getOrganizationId(req));

  if (!item) {
    return res.status(404).json({ success: false, message: 'Artículo no encontrado' });
  }

  return res.json({ success: true, data: item });
});

router.post('/', requireAdmin, async (req, res) => {
  const item = await inventoryService.create(req.body || {}, getOrganizationId(req));
  return res.status(201).json({ success: true, data: item });
});

router.post('/import/csv', requireAdmin, async (req, res) => {
  const payload = req.body || {};
  const csvText = payload.csv || payload.content || '';

  if (!csvText) {
    return res.status(400).json({ success: false, message: 'CSV vacío o no enviado' });
  }

  try {
    inventoryImportEngine.validateFile({
      filename: payload.filename || 'inventario.csv',
      mimetype: payload.mimetype || 'text/csv',
      size: Buffer.byteLength(String(csvText), 'utf8')
    });
    const dryRun = payload.dryRun !== false;
    const result = await executeImport(inventoryImportEngine.parseCsv(csvText), 'csv', dryRun, {
      filename: payload.filename,
      user: req.user,
      organizationId: getOrganizationId(req)
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/import/json', requireAdmin, async (req, res) => {
  const payload = req.body || {};
  const source = payload.rows || payload.data || payload;

  try {
    inventoryImportEngine.validateFile({
      filename: payload.filename || 'inventario.json',
      mimetype: payload.mimetype || 'application/json',
      size: Buffer.byteLength(JSON.stringify(source), 'utf8')
    });
    const dryRun = payload.dryRun !== false;
    const result = await executeImport(inventoryImportEngine.parseJson(source), 'json', dryRun, {
      filename: payload.filename,
      user: req.user,
      organizationId: getOrganizationId(req)
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/import/xlsx', requireAdmin, async (req, res) => {
  const payload = req.body || {};
  const encoded = payload.content || payload.file || '';

  try {
    const buffer = Buffer.from(String(encoded), 'base64');
    inventoryImportEngine.validateFile({
      filename: payload.filename || 'inventario.xlsx',
      mimetype: payload.mimetype || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: buffer.length
    });
    const dryRun = payload.dryRun !== false;
    const result = await executeImport(inventoryImportEngine.parseXlsx(buffer), 'xlsx', dryRun, {
      filename: payload.filename,
      user: req.user,
      organizationId: getOrganizationId(req)
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  const item = await inventoryService.update(req.params.id, req.body || {}, getOrganizationId(req));

  if (!item) {
    return res.status(404).json({ success: false, message: 'Artículo no encontrado' });
  }

  return res.json({ success: true, data: item });
});

export { router as inventoryRoutes };