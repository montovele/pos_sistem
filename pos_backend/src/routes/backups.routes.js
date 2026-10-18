import express from 'express';
import requireAuth from '../middleware/auth.js';
import { backupService } from '../services/backupService.js';
import { jsonSuccess } from '../utils/response.js';

const router = express.Router();
const requireAdmin = (req, res, next) => {
  if (String(req.user?.role || '').toLowerCase() !== 'admin') {
    return res.status(403).json({ success: false, message: 'Solo un administrador puede gestionar respaldos' });
  }
  return next();
};

const handleError = (res, error) => res.status(error.status || 500).json({ success: false, message: error.message || 'Error gestionando el respaldo' });

router.use(requireAuth, requireAdmin);

router.post('/', async (req, res) => {
  try {
    const backup = await backupService.create(req.body?.format, req.user);
    return res.status(201).json(jsonSuccess(backup));
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/', (req, res) => {
  try {
    return res.json(jsonSuccess(backupService.list(req.user)));
  } catch (error) {
    return handleError(res, error);
  }
});

router.get('/:id/download', (req, res) => {
  try {
    const backup = backupService.download(req.params.id, req.query.format, req.user);
    res.setHeader('Content-Type', backup.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${backup.filename}"`);
    return res.send(backup.content);
  } catch (error) {
    return handleError(res, error);
  }
});

router.post('/:id/restore', async (req, res) => {
  try {
    const restored = await backupService.restore(req.params.id, req.user);
    return res.json(jsonSuccess(restored));
  } catch (error) {
    return handleError(res, error);
  }
});

export default router;
