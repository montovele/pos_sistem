// facturas/routes/admin.clientes.routes.js

import express from 'express'

import {
  listarClientes,
  obtenerCliente,
  crearCliente,
  actualizarCliente,
} from '../controllers/clientesFiscalesController.js'

const router = express.Router()

router.get(
  '/admin/clientes-fiscales',
  listarClientes
)

router.get(
  '/admin/clientes-fiscales/:rfc',
  obtenerCliente
)

router.post(
  '/admin/clientes-fiscales',
  crearCliente
)

router.put(
  '/admin/clientes-fiscales/:id',
  actualizarCliente
)

export default router