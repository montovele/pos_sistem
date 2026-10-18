import express from 'express';
import requireAuth from '../middleware/auth.js';
import { transactionService } from '../services/transactionService.js';
import { jsonSuccess } from '../utils/response.js';

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  console.log('[TRANSACTIONS /] consultando transacciones con filtros y usuario:', req.query, req.user.username);
  const data = await transactionService.list(req.query, req.user);
  console.log('[TRANSACTIONS /] total encontrados:', data.length);
  return res.json(jsonSuccess(data));
});

router.post('/', requireAuth, async (req, res) => {
  console.log('[TRANSACTIONS / POST] creando transacción:', req.body);
  try {
    const transaction = await transactionService.create(req.body || {}, req.user || {});
    console.log('[TRANSACTIONS / POST] transacción creada:', transaction.codigoTransaccion, transaction.total);
    return res.status(201).json(jsonSuccess(transaction));
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

router.post('/sync', requireAuth, async (req, res) => {
  try {
    const result = await transactionService.sync(req.body || {}, req.user || {});
    return res.status(result.idempotent ? 200 : 201).json(jsonSuccess({
      ...result.transaction,
      idempotent: result.idempotent
    }));
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }
});

router.get('/:id', requireAuth, async (req, res) => {
  const id = req.params.id;
  console.log('[TRANSACTIONS /:id] consultando transacción:', id);
  const transaction = await transactionService.findById(id, req.user);
  if (!transaction) {
    console.warn('[TRANSACTIONS /:id] transacción no encontrada:', id);
    return res.status(404).json({ success: false, message: 'Transacción no encontrada' });
  }

  return res.json(jsonSuccess(transaction));
});

router.post('/:id/confirm', requireAuth, async (req, res) => {
  const id = req.params.id;
  console.log('[TRANSACTIONS /:id/confirm] confirmando transacción:', id);
  const transaction = await transactionService.confirm(id, req.user);
  if (!transaction) {
    console.warn('[TRANSACTIONS /:id/confirm] no encontrado:', id);
    return res.status(404).json({ success: false, message: 'Transacción no encontrada' });
  }

  console.log('[TRANSACTIONS /:id/confirm] transacción confirmada:', transaction.codigoTransaccion);
  return res.json(jsonSuccess(transaction));
});

router.post('/:id/cancel', requireAuth, async (req, res) => {
  const id = req.params.id;
  console.log('[TRANSACTIONS /:id/cancel] cancelando transacción:', id);
  const result = await transactionService.cancel(id, req.user);
  if (!result) {
    console.warn('[TRANSACTIONS /:id/cancel] no encontrado:', id);
    return res.status(404).json({ success: false, message: 'Transacción no encontrada' });
  }

  console.log('[TRANSACTIONS /:id/cancel] transacción cancelada:', id);
  return res.json(jsonSuccess(result));
});

export default router;
