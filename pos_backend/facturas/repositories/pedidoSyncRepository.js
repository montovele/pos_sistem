// facturas/repositories/pedidoSyncRepository.js
// VERSION ROBUSTA EMPRESARIAL
// IDEMPOTENCIA + AUDITORÍA + RETRIES + TRACKING

import db from '../config/db.js'

// ======================================================
// HELPERS
// ======================================================

function safeJSONParse(
  value,
  fallback = {}
) {
  try {
    if (!value) {
      return fallback
    }

    if (
      typeof value === 'object'
    ) {
      return value
    }

    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function normalizeSync(
  row = {}
) {
  return {
    ...row,

    response:
      safeJSONParse(
        row.response
      ),

    request_data:
      safeJSONParse(
        row.request_data
      ),

    error_data:
      safeJSONParse(
        row.error_data
      ),
  }
}

// ======================================================
// FIND BY PEDIDO + IDEMPOTENCY KEY
// ======================================================

export async function findByPedidoAndKey(
  pedidoId,
  key
) {
  const [rows] = await db.query(
    `
      SELECT *
      FROM pedidos_sync
      WHERE pedido_id = ?
        AND idempotency_key = ?
      ORDER BY id DESC
      LIMIT 1
    `,
    [pedidoId, key]
  )

  if (!rows.length) {
    return null
  }

  return normalizeSync(
    rows[0]
  )
}

// ======================================================
// ALIAS COMPATIBLE
// ======================================================

export async function findSyncByIdempotency(
  pedidoId,
  key
) {
  return await findByPedidoAndKey(
    pedidoId,
    key
  )
}

// ======================================================
// INSERT SYNC
// ======================================================

export async function insertSync(
  dataOrPedidoId,
  key = null,
  status = 'pending'
) {
  // ============================================
  // COMPATIBILIDAD LEGACY
  // insertSync(pedidoId, key, status)
  // ============================================

  let data = {}

  if (
    typeof dataOrPedidoId ===
    'object'
  ) {
    data = dataOrPedidoId
  } else {
    data = {
      pedido_id:
        dataOrPedidoId,

      idempotency_key:
        key,

      status,
    }
  }

  const [result] = await db.query(
    `
      INSERT INTO pedidos_sync (
        pedido_id,
        factura_id,

        idempotency_key,

        status,

        request_data,
        response,
        error_data,

        retries,

        created_at,
        updated_at
      )
      VALUES (
        ?, ?, ?,
        ?, ?, ?, ?,
        ?,
        NOW(),
        NOW()
      )
    `,
    [
      data.pedido_id || null,

      data.factura_id || null,

      data.idempotency_key,

      data.status ||
        'pending',

      JSON.stringify(
        data.request_data || {}
      ),

      JSON.stringify(
        data.response || {}
      ),

      JSON.stringify(
        data.error_data || {}
      ),

      Number(data.retries || 0),
    ]
  )

  return result.insertId
}

// ======================================================
// GET BY ID
// ======================================================

export async function getSyncById(
  id
) {
  const [rows] = await db.query(
    `
      SELECT *
      FROM pedidos_sync
      WHERE id = ?
      LIMIT 1
    `,
    [id]
  )

  if (!rows.length) {
    return null
  }

  return normalizeSync(
    rows[0]
  )
}

// ======================================================
// UPDATE STATUS
// ======================================================

export async function updateStatus(
  id,
  status,
  response = {}
) {
  const current =
    await getSyncById(id)

  if (!current) {
    throw new Error(
      `Sync ${id} no encontrado`
    )
  }

  const mergedResponse = {
    ...(current.response ||
      {}),

    ...response,
  }

  await db.query(
    `
      UPDATE pedidos_sync
      SET
        status = ?,

        response = ?,

        updated_at = NOW()

      WHERE id = ?
    `,
    [
      status,

      JSON.stringify(
        mergedResponse
      ),

      id,
    ]
  )

  return true
}

// ======================================================
// ALIAS MODERNO
// ======================================================

export async function updateSyncStatus(
  id,
  status,
  response = {}
) {
  return await updateStatus(
    id,
    status,
    response
  )
}

// ======================================================
// UPDATE REQUEST DATA
// ======================================================

export async function updateRequestData(
  id,
  requestData = {}
) {
  const current =
    await getSyncById(id)

  if (!current) {
    throw new Error(
      `Sync ${id} no encontrado`
    )
  }

  const merged = {
    ...(current.request_data ||
      {}),

    ...requestData,
  }

  await db.query(
    `
      UPDATE pedidos_sync
      SET
        request_data = ?,

        updated_at = NOW()

      WHERE id = ?
    `,
    [
      JSON.stringify(
        merged
      ),

      id,
    ]
  )

  return true
}

// ======================================================
// UPDATE ERROR
// ======================================================

export async function updateSyncError(
  id,
  error
) {
  const current =
    await getSyncById(id)

  if (!current) {
    throw new Error(
      `Sync ${id} no encontrado`
    )
  }

  const errorData = {
    ...(current.error_data ||
      {}),

    message:
      error?.message ||
      String(error),

    stack:
      error?.stack || null,

    failed_at:
      new Date().toISOString(),
  }

  await db.query(
    `
      UPDATE pedidos_sync
      SET
        status = 'error',

        error_data = ?,

        retries = retries + 1,

        updated_at = NOW()

      WHERE id = ?
    `,
    [
      JSON.stringify(
        errorData
      ),

      id,
    ]
  )

  return true
}

// ======================================================
// LISTAR SYNCS
// ======================================================

export async function listarSyncs({
  limit = 50,
  offset = 0,
  status = null,
} = {}) {
  const conditions = []
  const params = []

  // ============================================
  // FILTROS
  // ============================================

  if (status) {
    conditions.push(
      'ps.status = ?'
    )

    params.push(status)
  }

  const whereClause =
    conditions.length
      ? `WHERE ${conditions.join(
          ' AND '
        )}`
      : ''

  // ============================================
  // QUERY
  // ============================================

  const [rows] = await db.query(
    `
      SELECT
        ps.*,

        f.uuid,
        f.estatus AS factura_status,

        COUNT(*) OVER() AS total_rows

      FROM pedidos_sync ps

      LEFT JOIN facturas f
        ON f.id_factura =
           ps.factura_id

      ${whereClause}

      ORDER BY ps.id DESC

      LIMIT ?
      OFFSET ?
    `,
    [
      ...params,

      Number(limit),

      Number(offset),
    ]
  )

  return rows.map(
    normalizeSync
  )
}

// ======================================================
// PENDIENTES
// ======================================================

export async function getPendingSyncs() {
  const [rows] = await db.query(
    `
      SELECT *
      FROM pedidos_sync
      WHERE status IN (
        'pending',
        'processing',
        'retry'
      )
      ORDER BY id ASC
    `
  )

  return rows.map(
    normalizeSync
  )
}

// ======================================================
// DELETE OLD
// ======================================================

export async function deleteOldSyncs(
  days = 90
) {
  const [result] = await db.query(
    `
      DELETE FROM pedidos_sync
      WHERE created_at <
      DATE_SUB(
        NOW(),
        INTERVAL ? DAY
      )
    `,
    [Number(days)]
  )

  return result.affectedRows
}

// ======================================================
// STATS
// ======================================================

export async function getSyncStats() {
  const [rows] = await db.query(
    `
      SELECT
        COUNT(*) AS total,

        SUM(
          CASE
            WHEN status = 'done'
            THEN 1
            ELSE 0
          END
        ) AS completed,

        SUM(
          CASE
            WHEN status = 'error'
            THEN 1
            ELSE 0
          END
        ) AS errors,

        SUM(
          CASE
            WHEN status IN (
              'pending',
              'processing'
            )
            THEN 1
            ELSE 0
          END
        ) AS pending

      FROM pedidos_sync
    `
  )

  return rows[0]
}