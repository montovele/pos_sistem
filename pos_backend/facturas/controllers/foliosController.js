// ======================================================
// facturas/controllers/foliosController.js
// CONTROLLER FOLIOS FACTURAS (OPTIMIZADO)
// ======================================================

import {
  listFolios,
  createFolioConfig,
  updateFolio,
  resetFolio as resetFolioRepository,
  obtenerSiguienteFolio as obtenerSiguienteFolioRepository,
  getFolioById // 👈 NUEVO (recomendado en repository)
} from '../repositories/foliosRepository.js'

// ======================================================
// HELPERS
// ======================================================

function getProveedorId(req) {
  const id = Number(req.session?.user?.proveedor_id)

  return Number.isInteger(id) && id > 0
    ? id
    : null
}

// ======================================================
// LISTAR FOLIOS
// ======================================================

export async function listarFolios(req, res, next) {
  try {
    const proveedorId = getProveedorId(req)

    if (!proveedorId) {
      return res.status(401).json({
        success: false,
        message: 'Proveedor no identificado'
      })
    }

    const rows = await listFolios(proveedorId)

    return res.json({
      success: true,
      data: rows
    })

  } catch (error) {
    next(error)
  }
}

// ======================================================
// OBTENER FOLIO (OPTIMIZADO)
// ======================================================

export async function obtenerFolio(req, res, next) {
  try {
    const proveedorId = getProveedorId(req)
    const { id } = req.params

    if (!proveedorId) {
      return res.status(401).json({
        success: false,
        message: 'Proveedor no identificado'
      })
    }

    const folio = await getFolioById(Number(id), proveedorId)

    if (!folio) {
      return res.status(404).json({
        success: false,
        message: 'Folio no encontrado'
      })
    }

    return res.json({
      success: true,
      data: folio
    })

  } catch (error) {
    next(error)
  }
}

// ======================================================
// CREAR FOLIO
// ======================================================

export async function crearFolio(req, res, next) {
  try {
    const proveedorId = getProveedorId(req)

    if (!proveedorId) {
      return res.status(401).json({
        success: false,
        message: 'Proveedor no identificado'
      })
    }

    const {
      pedido_id = 0,
      prefijo = 'F',
      folio_actual = 0,
      anio,
      mes
    } = req.body

    // Validaciones básicas
    if (mes && (mes < 1 || mes > 12)) {
      return res.status(400).json({
        success: false,
        message: 'Mes inválido'
      })
    }

    if (folio_actual < 0) {
      return res.status(400).json({
        success: false,
        message: 'Folio actual inválido'
      })
    }

    const result = await createFolioConfig({
      proveedor_id: proveedorId,
      pedido_id,
      prefijo,
      folio_actual,
      anio,
      mes
    })

    return res.status(201).json({
      success: true,
      data: {
        id_folio: result.insertId
      }
    })

  } catch (error) {
    next(error)
  }
}

// ======================================================
// ACTUALIZAR FOLIO (SEGURIDAD MEJORADA)
// ======================================================

export async function actualizarFolio(req, res, next) {
  try {
    const proveedorId = getProveedorId(req)
    const { id } = req.params

    if (!proveedorId) {
      return res.status(401).json({
        success: false,
        message: 'Proveedor no identificado'
      })
    }

    const folio = await getFolioById(Number(id), proveedorId)

    if (!folio) {
      return res.status(404).json({
        success: false,
        message: 'Folio no encontrado'
      })
    }

    const {
      pedido_id,
      prefijo,
      folio_actual
    } = req.body

    await updateFolio(
      Number(id),
      proveedorId,
      {
        pedido_id,
        prefijo,
        folio_actual
      }
    )

    return res.json({
      success: true,
      data: {
        message: 'Folio actualizado correctamente'
      }
    })

  } catch (error) {
    next(error)
  }
}

// ======================================================
// RESET FOLIO (SIMPLIFICADO)
// ======================================================

export async function resetFolio(req, res, next) {
  try {
    const proveedorId = getProveedorId(req)
    const { id } = req.params

    if (!proveedorId) {
      return res.status(401).json({
        success: false,
        message: 'Proveedor no identificado'
      })
    }

    const folio = await getFolioById(Number(id), proveedorId)

    if (!folio) {
      return res.status(404).json({
        success: false,
        message: 'Folio no encontrado'
      })
    }

    await resetFolioRepository(Number(id), proveedorId)

    return res.json({
      success: true,
      data: {
        message: 'Folio reiniciado correctamente'
      }
    })

  } catch (error) {
    next(error)
  }
}
// ======================================================
// OBTENER SIGUIENTE FOLIO (ROBUSTO + TRANSACTION SAFE)
// ======================================================

export async function obtenerSiguienteFolio(req, res, next) {
  try {

    const proveedorId = getProveedorId(req)

    if (!proveedorId) {
      return res.status(401).json({
        success: false,
        message: 'Proveedor no identificado'
      })
    }

    // ==================================================
    // PAYLOAD
    // ==================================================

    let {
      pedido_id = null,
      prefijo = 'F'
    } = req.body || {}

    // ==================================================
    // NORMALIZACIÓN
    // ==================================================

    prefijo = String(prefijo || 'F')
      .trim()
      .toUpperCase()

    const parsedPedidoId =
      pedido_id === undefined ||
      pedido_id === null ||
      pedido_id === ''
        ? null
        : Number(pedido_id)

    // ==================================================
    // VALIDACIÓN (ROBUSTA)
    // ==================================================

    if (parsedPedidoId !== null && Number.isNaN(parsedPedidoId)) {
      return res.status(400).json({
        success: false,
        message: 'pedido_id inválido'
      })
    }

    // ==================================================
    // EXECUTE
    // ==================================================

    const resultado =
      await obtenerSiguienteFolioRepository(
        proveedorId,
        parsedPedidoId,
        prefijo
      )

    if (!resultado) {
      return res.status(500).json({
        success: false,
        message: 'No fue posible generar el folio'
      })
    }

    // ==================================================
    // RESPONSE NORMALIZADA
    // ==================================================

    return res.json({
      success: true,
      data: {
        proveedor_id: resultado.proveedor_id,
        pedido_id: resultado.pedido_id,
        prefijo: resultado.prefijo,
        folio: resultado.folio,
        numero_factura: resultado.numeroFactura,
        transaction_id: resultado.transaction_id
      }
    })

  } catch (error) {
    next(error)
  }
}