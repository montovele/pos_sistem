// facturas/routes/admin.pedidos.routes.js

import express from 'express'


import {

  obtenerConfiguracionFiscal,

  crearConfiguracionFiscal,

  actualizarConfiguracionFiscal

} from '../controllers/fiscal.controller.js'

import {
  obtenerPedido,
  previewFactura,
} from '../controllers/pedidosController.js'

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
import {
  generarFactura,
  obtenerFactura,
  listarFacturas,
  descargarPDF,
  descargarXML,
} from '../controllers/facturasAdminController.js'

import {
  dashboardFacturacion,
  ventasFacturacion
} from '../controllers/dashboardController.js'

import {
listarFacturar
} from '../controllers/facturacionOrdenesController.js'

import {
  listarClientes,
  obtenerCliente,
  crearCliente,
  actualizarCliente,
} from '../controllers/clientesFiscalesController.js'

import {
  cancelarFacturaController,
} from '../controllers/cancelacionController.js'

import requireRole from '../../middleware/requireRole.js';

const router = express.Router()

router.get(
  '/admin/pedidos/:id',
  requireRole('admin', 'editor', 'proveedor'),
  obtenerPedido
)

router.get(
  '/admin/pedidos/:id/preview',
requireRole('admin', 'editor', 'proveedor'),
  previewFactura
)

// ======================================================
// LISTAR FOLIOS
// ======================================================

router.get(
  '/admin/folios',
  requireRole('admin', 'editor', 'proveedor'),
  listarFolios
)

// ======================================================
// OBTENER FOLIO
// ======================================================

router.get(
  '/admin/folios/:id',
  requireRole('admin', 'editor', 'proveedor'),
  obtenerFolio
)

// ======================================================
// CREAR FOLIO
// ======================================================

router.post(
  '/admin/folios',
  requireRole('admin', 'editor', 'proveedor'),
  crearFolio
)

// ======================================================
// ACTUALIZAR FOLIO
// ======================================================

router.put(
  '/admin/folios/:id',
  requireRole('admin', 'editor', 'proveedor'),
  actualizarFolio
)

// ======================================================
// RESET FOLIO
// ======================================================

router.post(
  '/admin/folios/:id/reset',
requireRole('admin', 'editor', 'proveedor'),
  resetFolio
)

// ======================================================
// PREVIEW SIGUIENTE FOLIO
// ======================================================

router.post(
  '/admin/folios/next',
  requireRole('admin', 'editor', 'proveedor'),
  obtenerSiguienteFolio
)

router.post(
  '/admin/facturas/generar',
requireRole('admin', 'editor', 'proveedor'),
  generarFactura
)
router.get(
  '/admin/facturas',
requireRole('admin', 'editor', 'proveedor'),
  listarFacturas
)
router.get(
  '/admin/facturas/:id',
requireRole('admin', 'editor', 'proveedor'),
  obtenerFactura
)

router.get(
  '/admin/facturas/:id/pdf',
requireRole('admin', 'editor', 'proveedor'),
  descargarPDF
)

router.get(
  '/admin/facturas/:id/xml',
  requireRole('admin', 'editor', 'proveedor'),
  descargarXML
)
router.get(
  '/admin/dashboard/facturacion',
  requireRole('admin', 'editor', 'proveedor'),
  dashboardFacturacion
)
router.get(
  '/admin/dashboard/facturacion/ventas',
  requireRole('admin', 'editor', 'proveedor'),
  ventasFacturacion
)
router.get(
  '/admin/clientes-fiscales',
  requireRole('admin', 'editor', 'proveedor'),
  listarClientes
)

router.get(
  '/admin/clientes-fiscales/:rfc',
  requireRole('admin', 'editor', 'proveedor'),
  obtenerCliente
)

router.post(
  '/admin/clientesFiscales',
  requireRole('admin', 'editor', 'proveedor'),
  crearCliente
)

router.put(
  '/admin/clientes-fiscales/:id',
  requireRole('admin', 'editor', 'proveedor'),
  actualizarCliente
)

router.post(
  '/admin/facturas/:id/cancelar',
  requireRole('admin', 'editor', 'proveedor'),
  cancelarFacturaController
)
//Ordenes sin facutrar
router.get(
'/ordenes/sin-facturar',
  requireRole('admin', 'editor', 'proveedor'),
listarFacturar
)

// ======================================================
// CONFIGURACIÓN FISCAL
// ======================================================

// Obtener configuración

router.get(

  '/configuracion',

  requireRole([
    'admin'
  ]),

  obtenerConfiguracionFiscal

)

// Crear configuración

router.post(

  '/configuracion',

  requireRole([
    'admin'
  ]),

  crearConfiguracionFiscal

)

// Actualizar configuración

router.put(

  '/configuracion',

  requireRole([
    'admin'
  ]),

  actualizarConfiguracionFiscal

)

export default router