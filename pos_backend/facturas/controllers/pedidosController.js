// facturas/controllers/pedidosController.js

import {
  obtenerPedidoFacturable,
  reconstruirPedidoParaCFDI,
} from '../services/pedidoService.js'

// ======================================================
// OBTENER PEDIDO FACTURABLE
// ======================================================

export async function obtenerPedido(req, res, next) {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID requerido',
      })
    }

    const pedido = await obtenerPedidoFacturable(id)

    return res.json({
      success: true,
      data: pedido,
    })
  } catch (error) {
    next(error)
  }
}

// ======================================================
// PREVIEW CFDI
// ======================================================

export async function previewFactura(req, res, next) {
  try {
    const { id } = req.params

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'ID requerido',
      })
    }

    const preview = await reconstruirPedidoParaCFDI(id)

    return res.json({
      success: true,
      data: preview,
    })
  } catch (error) {
    next(error)
  }
}