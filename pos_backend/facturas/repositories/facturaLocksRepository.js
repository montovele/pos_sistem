// ======================================================
// facturas/repositories/facturaLocksRepository.js
// REPOSITORY EMPRESARIAL ROBUSTO
// LOCKS CFDI + CONCURRENCIA + SAFE TRANSACTIONS
// ======================================================

import db from '../config/db.js'

// ======================================================
// HELPERS
// ======================================================

function getExecutor(connection = null) {
  return connection || db
}

// ======================================================

function normalizePedidoId(
  pedidoId
) {

  const parsed =
    Number(pedidoId)

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {

    throw new Error(
      'pedidoId inválido'
    )

  }

  return parsed

}

// ======================================================

function normalizeFacturaId(
  facturaId
) {

  const parsed =
    Number(facturaId)

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {

    throw new Error(
      'facturaId inválido'
    )

  }

  return parsed

}

// ======================================================

function normalizeStatus(
  status
) {

  return String(
    status || ''
  )
    .trim()
    .toLowerCase()

}

// ======================================================

function buildLockResponse(
  row = null
) {

  if (!row) {
    return null
  }

  return {

    id_factura:
      row.id_factura,

    pedido_id:
      row.pedido_id,

    uuid:
      row.uuid,

    estatus:
      row.estatus,

    numero_factura:
      row.numero_factura,

    serie:
      row.serie,

    folio:
      row.folio,

    created_at:
      row.created_at,

    updated_at:
      row.updated_at,

  }

}
// ======================================================
// LOCK FACTURA OPERACION (CORREGIDO)
// ======================================================

export async function lockFacturaOperacion(
  connection,
  facturaId
) {

  if (!facturaId) {
    throw new Error('facturaId requerido')
  }

  const sql = `
    SELECT
      id_factura,
      pedido_id,
      cliente_fiscal_id,
      uuid,
      estatus,
      numero_factura,
      folio_id,
      proveedor_id,
      created_at,
      updated_at,
      meta
    FROM facturas
    WHERE id_factura = ?
    FOR UPDATE
  `

  const [rows] =
    await connection.query(sql, [facturaId])

  const factura = rows?.[0]

  if (!factura) {
    return null
  }

  return {
    locked: true,
    factura,
  }
}

// ======================================================
// LOCK FACTURA BY ID
// ======================================================

export async function lockFacturaById(
  connection,
  facturaId
) {

  const executor =
    getExecutor(connection)

  const normalizedFacturaId =
    normalizeFacturaId(
      facturaId
    )

  const query = `
    SELECT
      id_factura,
      pedido_id,
      uuid,
      estatus,
      numero_factura,
      serie,
      folio,
      created_at,
      updated_at
    FROM facturas
    WHERE id_factura = ?
    LIMIT 1
    FOR UPDATE
  `

  const [rows] =
    await executor.query(
      query,
      [normalizedFacturaId]
    )

  return buildLockResponse(
    rows?.[0]
  )

}

// ======================================================
// VERIFY ACTIVE LOCK
// ======================================================

export async function hasFacturaActiva(
  pedidoId,
  connection = null
) {

  const executor =
    getExecutor(connection)

  const normalizedPedidoId =
    normalizePedidoId(
      pedidoId
    )

  const query = `
    SELECT
      id_factura,
      estatus
    FROM facturas
    WHERE pedido_id = ?
      AND estatus IN (
        'procesando',
        'timbrando',
        'emitida'
      )
    LIMIT 1
  `

  const [rows] =
    await executor.query(
      query,
      [normalizedPedidoId]
    )

  return !!rows?.length

}

// ======================================================
// VERIFY FACTURA EMITIDA
// ======================================================

export async function hasFacturaEmitida(
  pedidoId,
  connection = null
) {

  const executor =
    getExecutor(connection)

  const normalizedPedidoId =
    normalizePedidoId(
      pedidoId
    )

  const query = `
    SELECT
      id_factura,
      uuid,
      estatus
    FROM facturas
    WHERE pedido_id = ?
      AND estatus = 'emitida'
    LIMIT 1
  `

  const [rows] =
    await executor.query(
      query,
      [normalizedPedidoId]
    )

  return buildLockResponse(
    rows?.[0]
  )

}

// ======================================================
// VERIFY FACTURA PROCESSING
// ======================================================

export async function hasFacturaProcesando(
  pedidoId,
  connection = null
) {

  const executor =
    getExecutor(connection)

  const normalizedPedidoId =
    normalizePedidoId(
      pedidoId
    )

  const query = `
    SELECT
      id_factura,
      estatus
    FROM facturas
    WHERE pedido_id = ?
      AND estatus IN (
        'procesando',
        'timbrando'
      )
    LIMIT 1
  `

  const [rows] =
    await executor.query(
      query,
      [normalizedPedidoId]
    )

  return buildLockResponse(
    rows?.[0]
  )

}

// ======================================================
// VALIDAR ESTATUS FACTURA
// ======================================================

export function validarEstadoFactura(
  factura,
  estadosPermitidos = []
) {

  if (!factura) {

    throw new Error(
      'Factura no encontrada'
    )

  }

  const currentStatus =
    normalizeStatus(
      factura.estatus
    )

  const allowed =
    estadosPermitidos.map(
      normalizeStatus
    )

  if (
    !allowed.includes(
      currentStatus
    )
  ) {

    throw new Error(
      `Estado inválido: ${currentStatus}`
    )

  }

  return true

}

// ======================================================
// LOCK HEALTH CHECK
// ======================================================

export async function facturaLockHealthCheck() {

  try {

    const query = `
      SELECT 1 AS ok
    `

    const [rows] =
      await db.query(query)

    return {

      success: true,

      healthy:
        rows?.[0]?.ok === 1,

    }

  } catch (error) {

    console.error(
      '❌ facturaLockHealthCheck error:',
      error
    )

    return {

      success: false,

      healthy: false,

      error:
        error.message,

    }

  }

}