// facturas/routes/admin.cancelaciones.routes.js

import express from 'express'

import {
  cancelarFacturaController,
} from '../controllers/cancelacionController.js'

const router = express.Router()

router.post(
  '/admin/facturas/:id/cancelar',
  cancelarFacturaController
)

export default router