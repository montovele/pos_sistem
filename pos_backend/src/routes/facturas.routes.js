import express from 'express';
import requireAuth from '../middleware/auth.js';
import { jsonSuccess } from '../utils/response.js';
import { transactionService } from '../services/transactionService.js';

const router = express.Router();

const buildFacturaPreview = (payload = {}) => {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const subtotal = items.reduce((sum, item) => sum + Number(item.subtotal ?? item.total ?? ((Number(item.price ?? item.precio ?? 0) * Number(item.quantity ?? item.qty ?? item.cantidad ?? 1)))), 0);
  const discount = items.reduce((sum, item) => sum + Number(item.discount ?? 0), 0);
  const total = Math.max(subtotal - discount, 0);

  return {
    id: payload.id || `FAC-${Date.now()}`,
    folio: payload.folio || `F-${Date.now()}`,
    status: payload.status || 'draft',
    cliente: payload.cliente || { nombre: 'Consumidor final', rfc: 'XAXX010101000' },
    items,
    subtotal: Number(subtotal.toFixed(2)),
    descuento: Number(discount.toFixed(2)),
    total: Number(total.toFixed(2)),
    fecha: new Date().toISOString(),
    paymentMethod: payload.paymentMethod || 'cash',
    tipo: payload.tipo || 'ingreso',
    serie: payload.serie || 'A',
    metodoPago: payload.metodoPago || 'PUE'
  };
};

router.get('/', requireAuth, async (req, res) => {
  const data = await transactionService.list({}, req.user);
  return res.json(jsonSuccess(data, {
    total: data.length,
    type: 'facturas'
  }));
});

router.post('/preview', requireAuth, (req, res) => {
  const preview = buildFacturaPreview(req.body || {});
  return res.json(jsonSuccess(preview));
});

router.post('/generate', requireAuth, async (req, res) => {
  const payload = req.body || {};
  let transaction;
  try {
    transaction = await transactionService.create({
      ...payload,
      items: Array.isArray(payload.items) ? payload.items : [],
      total: payload.total,
      paymentMethod: payload.paymentMethod || 'cash',
      discount: payload.discount || payload.descuento || 0
    }, req.user || {});
  } catch (error) {
    return res.status(error.status || 500).json({ success: false, message: error.message });
  }

  const factura = buildFacturaPreview({
    ...payload,
    id: transaction.codigoTransaccion,
    folio: transaction.codigoTicket,
    status: 'issued',
    items: transaction.items,
    paymentMethod: transaction.paymentMethod,
    subtotal: Number(transaction.subtotal ?? transaction.total),
    descuento: Number(transaction.discount ?? 0),
    total: Number(transaction.total ?? 0)
  });

  return res.status(201).json(jsonSuccess({
    factura,
    transaction
  }));
});

router.get('/:id', requireAuth, async (req, res) => {
  const transaction = await transactionService.findById(req.params.id);
  if (!transaction) {
    return res.status(404).json({ success: false, message: 'Factura no encontrada' });
  }

  const factura = buildFacturaPreview({
    id: transaction.codigoTransaccion,
    folio: transaction.codigoTicket,
    status: transaction.status,
    items: transaction.items,
    cliente: { nombre: 'Consumidor final', rfc: 'XAXX010101000' },
    subtotal: Number(transaction.subtotal ?? transaction.total),
    descuento: Number(transaction.discount ?? 0),
    total: Number(transaction.total ?? 0),
    paymentMethod: transaction.paymentMethod
  });

  return res.json(jsonSuccess(factura));
});

export default router;
