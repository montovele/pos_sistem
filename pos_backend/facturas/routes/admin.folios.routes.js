// facturas/routes/admin.folios.routes.js

import express from 'express'

import {
  listarFolios,
  obtenerFolio,
  crearFolio,
  actualizarFolio,
  resetFolio,
  obtenerSiguienteFolio,
} from '../controllers/foliosController.js'

import verifyToken from '../middlewares/auth.js'

import validateRequest from '../middlewares/validateRequest.js'

const router = express.Router()

// ======================================================
// LISTAR FOLIOS
// ======================================================

router.get(
  '/admin/folios',
  verifyToken,
  listarFolios
)

// ======================================================
// OBTENER FOLIO
// ======================================================

router.get(
  '/admin/folios/:id',
  verifyToken,
  obtenerFolio
)

// ======================================================
// CREAR FOLIO
// ======================================================

router.post(
  '/admin/folios',
  verifyToken,
  validateRequest,
  crearFolio
)

// ======================================================
// ACTUALIZAR FOLIO
// ======================================================

router.put(
  '/admin/folios/:id',
  verifyToken,
  validateRequest,
  actualizarFolio
)

// ======================================================
// RESET FOLIO
// ======================================================

router.post(
  '/admin/folios/:id/reset',
  verifyToken,
  resetFolio
)

// ======================================================
// PREVIEW SIGUIENTE FOLIO
// ======================================================

router.get(
  '/admin/folios/:id/next',
  verifyToken,
  obtenerSiguienteFolio
)

export default router