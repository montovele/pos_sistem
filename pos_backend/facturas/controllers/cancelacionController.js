//facturas/controllers/cancelacionController.js

import {
  cancelarFactura,
} from '../services/facturaCancelacionService.js'

export async function cancelarFacturaController(req, res, next) {
  try {
    const { id } = req.params
    const { motivo, uuid_sustitucion } = req.body

    if (!id) {
      return res.status(400).json({
        error: 'id requerido',
      })
    }

    const response = await cancelarFactura({
      facturaId: id, // ✅ CORRECTO
      motivo,
      sustitucion: uuid_sustitucion, // opcional pero consistente
    })

    return res.json({
      success: true,
      data: response,
    })

  } catch (error) {
    next(error)
  }
}