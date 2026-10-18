// ======================================================
// 📁 facturas/services/dashboardService.js
// ======================================================

import db from '../config/db.js'

// ======================================================
// CONSTANTS
// ======================================================

const MODULE = '[dashboardService]'

// ======================================================
// HELPERS
// ======================================================

function log(message, payload = null) {
  console.log(MODULE, message, payload || '')
}

function logError(message, error = null) {
  console.error(MODULE, message, error || '')
}

function toNumber(value) {
  return Number(value || 0)
}

function sanitizeLimit(
  limit,
  fallback = 10,
  max = 100
) {
  const parsed = parseInt(limit, 10)

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return fallback
  }

  return Math.min(parsed, max)
}

function sanitizeYear(year) {
  const parsed = parseInt(year, 10)

  if (
    !Number.isInteger(parsed) ||
    parsed < 2020 ||
    parsed > 2100
  ) {
    return new Date().getFullYear()
  }

  return parsed
}

// ======================================================
// SAFE QUERY
// ======================================================

async function safeQuery(
  sql,
  params = [],
  context = 'query'
) {
  try {

    return await db.query(
      sql,
      params
    )

  } catch (error) {

    logError(
      `DB ERROR: ${context}`,
      {
        message: error.message,
        sqlMessage: error.sqlMessage,
        params,
      }
    )

    throw error

  }
}

// ======================================================
// DASHBOARD
// ======================================================

export async function getDashboardFacturacion(
  proveedorId
) {

  if (!proveedorId) {

    throw new Error(
      'proveedor_id requerido'
    )

  }

  const [

    metricas,
    estatus,
    ventasMensuales,
    recientes,
    errores,
    topClientes,
    realtime,
    resumenDiario,

  ] = await Promise.all([

    getMetricasGenerales(
      proveedorId
    ),

    getFacturasPorEstatus(
      proveedorId
    ),

    getVentasMensuales(
      undefined,
      proveedorId
    ),

    getFacturasRecientes(
      10,
      proveedorId
    ),

    getErroresFacturacion(
      10,
      proveedorId
    ),

    getTopClientesFacturacion(
      5,
      proveedorId
    ),

    getRealtimeMetrics(
      proveedorId
    ),

    getResumenDiario(
      proveedorId
    ),

  ])

  return {

    metricas,

    estatus,

    ventasMensuales,

    recientes,

    errores,

    topClientes,

    realtime,

    resumenDiario,

  }

}

// ======================================================
// MÉTRICAS
// ======================================================

export async function getMetricasGenerales(
  proveedorId
) {

  const [[totales]] =
    await safeQuery(

      `
      SELECT

        COUNT(*) AS total_facturas,

        SUM(
          CASE
            WHEN estatus = 'emitida'
            THEN total
            ELSE 0
          END
        ) AS total_facturado,

        SUM(
          estatus = 'emitida'
        ) AS emitidas,

        SUM(
          estatus = 'cancelada'
        ) AS canceladas,

        SUM(
          estatus = 'error'
        ) AS errores

      FROM facturas

      WHERE proveedor_id = ?
      `,

      [proveedorId],

      'metricas_generales'

    )

  const [[hoy]] =
    await safeQuery(

      `
      SELECT

        COUNT(*) AS facturas_hoy,

        SUM(total) AS total_hoy

      FROM facturas

      WHERE proveedor_id = ?

        AND DATE(fecha_emision) = CURDATE()
      `,

      [proveedorId],

      'metricas_hoy'

    )

  return {

    total_facturas:
      toNumber(
        totales.total_facturas
      ),

    total_facturado:
      toNumber(
        totales.total_facturado
      ),

    emitidas:
      toNumber(
        totales.emitidas
      ),

    canceladas:
      toNumber(
        totales.canceladas
      ),

    errores:
      toNumber(
        totales.errores
      ),

    facturas_hoy:
      toNumber(
        hoy.facturas_hoy
      ),

    total_hoy:
      toNumber(
        hoy.total_hoy
      ),

  }

}

// ======================================================
// FACTURAS RECIENTES
// ======================================================
export async function getFacturasRecientes(
  limit = 10,
  proveedorId
) {

  const safeLimit = sanitizeLimit(limit)

  const [rows] = await safeQuery(
    `
    SELECT

      f.id_factura,
      f.uuid,
      f.numero_factura,
      f.total,
      f.moneda,

      f.estatus,

      f.fecha_emision,
      f.fecha_timbrado,
      f.created_at,

      f.error_message,
      f.estado_proceso,

      f.proveedor_pac,

      f.response_data,

      f.verification_url,

      f.subtotal,
      f.iva,
      f.descuento,

      cf.razon_social,
      cf.rfc

    FROM facturas f

    LEFT JOIN clientes_fiscales cf
      ON cf.id_cliente_fiscal = f.cliente_fiscal_id

    WHERE f.proveedor_id = ?

    ORDER BY f.id_factura DESC

    LIMIT ${safeLimit}
    `,
    [proveedorId],
    'facturas_recientes'
  )

  return rows || []
}

// ======================================================
// ESTATUS
// ======================================================

export async function getFacturasPorEstatus(
  proveedorId
) {

  const [rows] =
    await safeQuery(

      `
      SELECT

        estatus,

        COUNT(*) AS total

      FROM facturas

      WHERE proveedor_id = ?

      GROUP BY estatus
      `,

      [proveedorId],

      'facturas_por_estatus'

    )

  return rows.map(row => ({

    estatus:
      row.estatus,

    total:
      toNumber(
        row.total
      ),

  }))

}

// ======================================================
// VENTAS MENSUALES
// ======================================================
export async function getVentasMensuales(
  anio,
  proveedorId
) {

  const safeYear = sanitizeYear(anio)

  const [rows] = await safeQuery(
    `
SELECT
    MONTH(fecha_timbrado) AS mes,

    SUM(
        CASE
            WHEN estatus = 'emitida'
            THEN total
            ELSE 0
        END
    ) AS total_emitido,

    COUNT(
        CASE
            WHEN estatus = 'emitida'
            THEN 1
        END
    ) AS facturas_emitidas,

    COUNT(
        CASE
            WHEN estatus = 'cancelada'
            THEN 1
        END
    ) AS facturas_canceladas

FROM facturas

WHERE proveedor_id = ?
  AND YEAR(fecha_timbrado) = ?

GROUP BY mes;
    `,
    [
      proveedorId,
      safeYear,
    ],
    'ventas_mensuales'
  )

  return rows || []
}

// ======================================================
// TOP CLIENTES
// ======================================================

export async function getTopClientesFacturacion(
  limit = 10,
  proveedorId
) {

  const safeLimit =
    sanitizeLimit(limit)

  const [rows] =
    await safeQuery(

      `
      SELECT

        cf.id_cliente_fiscal,

        cf.razon_social,

        cf.rfc,

        COUNT(*) AS total_facturas,

        SUM(f.total) AS total_facturado

      FROM facturas f

      INNER JOIN clientes_fiscales cf

        ON cf.id_cliente_fiscal =
           f.cliente_fiscal_id

      WHERE f.proveedor_id = ?

      GROUP BY cf.id_cliente_fiscal

      ORDER BY total_facturado DESC

      LIMIT ${safeLimit}
      `,

      [proveedorId],

      'top_clientes'

    )

  return rows || []

}

// ======================================================
// ERRORES
// ======================================================

export async function getErroresFacturacion(
  limit = 10,
  proveedorId
) {

  const safeLimit =
    sanitizeLimit(limit)

  const [rows] =
    await safeQuery(

      `
      SELECT

        fl.id_log,

        fl.factura_id,

        fl.tipo,

        fl.level,

        fl.error,

        fl.created_at,

        f.uuid,

        f.numero_factura

      FROM logs_facturacion fl

      INNER JOIN facturas f

        ON f.id_factura =
           fl.factura_id

      WHERE f.proveedor_id = ?

        AND (
          fl.level IN (
            'error',
            'critical'
          )

          OR

          fl.tipo LIKE '%error%'
        )

      ORDER BY fl.id_log DESC

      LIMIT ${safeLimit}
      `,

      [proveedorId],

      'errores_facturacion'

    )

  return rows || []

}

// ======================================================
// REALTIME
// ======================================================

export async function getRealtimeMetrics(
  proveedorId
) {

  const [[rows]] =
    await safeQuery(

      `
      SELECT

        SUM(
          estatus = 'pendiente'
        ) AS pendientes,

        SUM(
          estatus = 'emitida'
        ) AS emitidas,

        SUM(
          estatus = 'cancelada'
        ) AS canceladas,

        SUM(
          estatus = 'error'
        ) AS errores

      FROM facturas

      WHERE proveedor_id = ?
      `,

      [proveedorId],

      'realtime_metrics'

    )

  return {

    pendientes:
      toNumber(
        rows.pendientes
      ),

    emitidas:
      toNumber(
        rows.emitidas
      ),

    canceladas:
      toNumber(
        rows.canceladas
      ),

    errores:
      toNumber(
        rows.errores
      ),

  }

}

// ======================================================
// RESUMEN DIARIO
// ======================================================

export async function getResumenDiario(
  proveedorId
) {

  const [rows] =
    await safeQuery(

      `
      SELECT

        DATE(fecha_emision) AS fecha,

        COUNT(*) AS total_facturas,

        SUM(total) AS total_facturado

      FROM facturas

      WHERE proveedor_id = ?

        AND fecha_emision >=
            DATE_SUB(
              NOW(),
              INTERVAL 30 DAY
            )

      GROUP BY fecha

      ORDER BY fecha
      `,

      [proveedorId],

      'resumen_diario'

    )

  return rows || []

}
