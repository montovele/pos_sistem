// ======================================================
// facturas/controllers/dashboardController.js
// ======================================================

import {
  getDashboardFacturacion,
  getMetricasGenerales,
  getFacturasRecientes,
  getFacturasPorEstatus,
  getVentasMensuales,
  getTopClientesFacturacion,
  getErroresFacturacion,
} from '../services/dashboardService.js'

// ======================================================
// HELPERS
// ======================================================

function getProveedor(req) {
  const proveedor_id = req.session?.user?.proveedor_id

  if (!proveedor_id) {
    const error = new Error('Proveedor no identificado')
    error.status = 401
    throw error
  }

  return proveedor_id
}

// ======================================================
// DASHBOARD FACTURACIÓN
// ======================================================

export async function dashboardFacturacion(req, res) {
  try {
    const proveedor_id = getProveedor(req)

    const dashboard = await getDashboardFacturacion(proveedor_id)
console.log('dashboardFacturacion',dashboard)
    return res.json({
      success: true,
      data: dashboard,
    })

  } catch (error) {
    console.error('dashboardFacturacion error:', error)

    return res.status(error.status || 500).json({
      success: false,
      message: 'Error obteniendo dashboard de facturación',
      error: error.message,
    })
  }
}

// ======================================================
// MÉTRICAS GENERALES
// ======================================================

export async function metricasGenerales(req, res) {
  try {
    const proveedor_id = getProveedor(req)

    const metricas = await getMetricasGenerales(proveedor_id)

    return res.json({
      success: true,
      data: metricas,
    })

  } catch (error) {
    console.error('metricasGenerales error:', error)

    return res.status(error.status || 500).json({
      success: false,
      message: 'Error obteniendo métricas generales',
      error: error.message,
    })
  }
}

// ======================================================
// FACTURAS RECIENTES
// ======================================================

export async function facturasRecientes(req, res) {
  try {
    const proveedor_id = getProveedor(req)

    const limit = Number(req.query.limit || 10)

    const facturas = await getFacturasRecientes(
      proveedor_id,
      limit
    )

    return res.json({
      success: true,
      data: facturas,
    })

  } catch (error) {
    console.error('facturasRecientes error:', error)

    return res.status(error.status || 500).json({
      success: false,
      message: 'Error obteniendo facturas recientes',
      error: error.message,
    })
  }
}

// ======================================================
// FACTURAS POR ESTATUS
// ======================================================

export async function facturasPorEstatus(req, res) {
  try {
    const proveedor_id = getProveedor(req)

    const data = await getFacturasPorEstatus(proveedor_id)

    return res.json({
      success: true,
      data,
    })

  } catch (error) {
    console.error('facturasPorEstatus error:', error)

    return res.status(error.status || 500).json({
      success: false,
      message: 'Error obteniendo estatus CFDI',
      error: error.message,
    })
  }
}

// ======================================================
// VENTAS MENSUALES
// ======================================================

export async function ventasMensuales(req, res) {
  try {
    const proveedor_id = getProveedor(req)

    const anio = Number(req.query.anio || new Date().getFullYear())

    const ventas = await getVentasMensuales(
      proveedor_id,
      anio
    )

    return res.json({
      success: true,
      data: ventas,
    })

  } catch (error) {
    console.error('ventasMensuales error:', error)

    return res.status(error.status || 500).json({
      success: false,
      message: 'Error obteniendo ventas mensuales',
      error: error.message,
    })
  }
}

// ======================================================
// TOP CLIENTES
// ======================================================

export async function topClientesFacturacion(req, res) {
  try {
    const proveedor_id = getProveedor(req)

    const limit = Number(req.query.limit || 10)

    const clientes = await getTopClientesFacturacion(
      proveedor_id,
      limit
    )

    return res.json({
      success: true,
      data: clientes,
    })

  } catch (error) {
    console.error('topClientesFacturacion error:', error)

    return res.status(error.status || 500).json({
      success: false,
      message: 'Error obteniendo top clientes',
      error: error.message,
    })
  }
}

// ======================================================
// ERRORES FACTURACIÓN
// ======================================================

export async function erroresFacturacion(req, res) {
  try {
    const proveedor_id = getProveedor(req)

    const limit = Number(req.query.limit || 20)

    const errores = await getErroresFacturacion(
      proveedor_id,
      limit
    )

    return res.json({
      success: true,
      data: errores,
    })

  } catch (error) {
    console.error('erroresFacturacion error:', error)

    return res.status(error.status || 500).json({
      success: false,
      message: 'Error obteniendo errores CFDI',
      error: error.message,
    })
  }
}
// ======================================================
// GET /admin/dashboard/facturacion/ventas
// ======================================================

export async function ventasFacturacion(req, res) {
  try {
    const proveedorId = req.user?.proveedor_id

    // ==================================================
    // VALIDAR PROVEEDOR
    // ==================================================

    if (!proveedorId) {
      return res.status(401).json({
        success: false,
        message: 'Proveedor no autenticado o inválido',
      })
    }

    // ==================================================
    // NORMALIZAR AÑO
    // ==================================================

    const anio = Number(req.query.anio) || new Date().getFullYear()

    if (Number.isNaN(anio)) {
      return res.status(400).json({
        success: false,
        message: 'El parámetro anio es inválido',
      })
    }

    console.log('[ventasFacturacion] REQUEST:', {
      proveedorId,
      anio,
    })

    // ==================================================
    // SERVICE
    // ==================================================

    const data = await getVentasMensuales(anio, proveedorId)

    // ==================================================
    // NORMALIZAR RESPONSE
    // ==================================================

    return res.status(200).json({
      success: true,
      data: data || [],
      meta: {
        proveedorId,
        anio,
      },
    })

  } catch (error) {
    console.error('[ventasFacturacion] ERROR:', {
      message: error.message,
      stack: error.stack,
    })

    return res.status(500).json({
      success: false,
      message: 'Error al obtener ventas mensuales',
      error: process.env.NODE_ENV === 'development'
        ? error.message
        : undefined,
    })
  }
}