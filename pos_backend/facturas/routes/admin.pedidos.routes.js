// facturas/routes/admin.pedidos.routes.js

import express from 'express'

import {
  obtenerPedido,
  previewFactura,
} from '../controllers/pedidosController.js'

const router = express.Router()

router.get(
  '/admin/pedidos/:id',
  obtenerPedido
)

router.get(
  '/admin/pedidos/:id/preview',
  previewFactura
)

export default router