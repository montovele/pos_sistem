// facturas/routes/admin.facturas.routes.js

import express from 'express'

import {
  generarFactura,
  obtenerFactura,
  descargarPDF,
  descargarXML,
} from '../controllers/facturasAdminController.js'

const router = express.Router()

router.post(
  '/admin/facturas/generar',
  generarFactura
)

router.get(
  '/admin/facturas/:id',
  obtenerFactura
)

router.get(
  '/admin/facturas/:id/pdf',
  descargarPDF
)

router.get(
  '/admin/facturas/:id/xml',
  descargarXML
)

export default router