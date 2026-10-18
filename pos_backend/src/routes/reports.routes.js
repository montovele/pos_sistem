import express from 'express';
import requireAuth from '../middleware/auth.js';
import { reportService } from '../services/reportService.js';
import { jsonSuccess } from '../utils/response.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  console.log('[REPORTS /] generando reporte con filtros:', req.query);
  const report = await reportService.list(req.query, req.user);
  console.log('[REPORTS /] ventas totales:', report.totalSales, 'transacciones:', report.transactions.length);
  return res.json(jsonSuccess(report));
});

export default router;
