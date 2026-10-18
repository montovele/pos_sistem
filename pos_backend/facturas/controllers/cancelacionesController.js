// facturas/controllers/cancelacionesController.js

import {
  getFacturaById,
} from '../repositories/facturaRepository.js'

import {
  cancelarFactura,
} from '../services/facturaCancelacionService.js'

export async function cancelarFacturaController(
  req,
  res,
  next
) {
  try {
    const factura =
      await getFacturaById(
        req.params.id
      )

    if (!factura) {
      return res.status(404).json({
        error:
          'Factura no encontrada',
      })
    }

    const response =
      await cancelarFactura(
        factura
      )

    return res.json({
      success: true,
      response,
    })
  } catch (error) {
    next(error)
  }
}