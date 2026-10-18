// facturas/routes/admin.dashboard.routes.js

import express from 'express'

import {
  dashboardFacturacion,
} from '../controllers/dashboardController.js'

const router = express.Router()

router.get(
  '/admin/dashboard/facturacion',
  dashboardFacturacion
)

export default router