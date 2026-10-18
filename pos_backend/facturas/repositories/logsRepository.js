// ======================================================
// facturas/repositories/logsRepository.js
// ENTERPRISE LOG REPOSITORY FINAL
// DEADLOCK SAFE + JSON SAFE + TX SAFE
// ======================================================

import db from '../config/db.js'

// ======================================================
// CONFIG
// ======================================================

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 500

const VALID_LEVELS = [
  'info',
  'warning',
  'error',
  'critical',
]

const DEADLOCK_ERRORS = [
  'ER_LOCK_WAIT_TIMEOUT',
  'ER_LOCK_DEADLOCK',
]

// ======================================================
// EXECUTOR
// ======================================================

function getExecutor(connection = null) {

  return connection || db

}

// ======================================================
// HELPERS
// ======================================================

function sleep(ms = 100) {

  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })

}

// ======================================================

function safeNumber(
  value,
  fallback = 0
) {

  const parsed = Number(value)

  return Number.isFinite(parsed)
    ? parsed
    : fallback

}

// ======================================================

function normalizeLimit(
  limit = DEFAULT_LIMIT
) {

  const parsed =
    safeNumber(limit, DEFAULT_LIMIT)

  return Math.min(
    Math.max(parsed, 1),
    MAX_LIMIT
  )

}

// ======================================================

function normalizeOffset(
  offset = 0
) {

  return Math.max(
    safeNumber(offset, 0),
    0
  )

}

// ======================================================

function sanitizeString(
  value = ''
) {

  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')

}

// ======================================================

function normalizeLevel(
  level = 'info'
) {

  const normalized =
    sanitizeString(level)
      .toLowerCase()

  return VALID_LEVELS.includes(normalized)
    ? normalized
    : 'info'

}

// ======================================================

function safeJSONStringify(data) {

  try {

    const seen = new WeakSet()

    return JSON.stringify(
      data,
      (key, value) => {

        if (
          typeof value === 'object' &&
          value !== null
        ) {

          if (seen.has(value)) {
            return '[Circular]'
          }

          seen.add(value)

        }

        if (
          typeof value === 'bigint'
        ) {

          return value.toString()

        }

        return value

      }
    )

  } catch (error) {

    return JSON.stringify({
      serialization_error:
        error.message
    })

  }

}

// ======================================================

function truncate(
  value,
  max = 10000
) {

  if (
    value === undefined ||
    value === null
  ) {

    return null

  }

  const stringValue =
    typeof value === 'string'
      ? value
      : safeJSONStringify(value)

  if (
    stringValue.length <= max
  ) {

    return stringValue

  }

  return (
    stringValue.slice(0, max) +
    '...[TRUNCATED]'
  )

}

// ======================================================

function parseJSON(
  value,
  fallback = null
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

// ======================================================

function normalizeLog(
  row = {}
) {

  return {

    ...row,

    level:
      normalizeLevel(row.level),

    request_data:
      parseJSON(
        row.request_data,
        null
      ),

    response_data:
      parseJSON(
        row.response_data,
        null
      ),

    meta:
      parseJSON(
        row.meta,
        {}
      ),

    created_at:
      row.created_at
        ? new Date(row.created_at)
        : null,

    updated_at:
      row.updated_at
        ? new Date(row.updated_at)
        : null,

  }

}

// ======================================================
// DEADLOCK SAFE EXECUTE
// ======================================================

async function execute(
  query,
  params = [],
  connection = null,
  retries = 3
) {

  const executor =
    getExecutor(connection)

  let attempt = 0

  while (attempt <= retries) {

    try {

      const [rows] =
        await executor.query(
          query,
          params
        )

      return rows

    } catch (error) {

      const isDeadlock =
        DEADLOCK_ERRORS.includes(
          error.code
        )

      if (
        isDeadlock &&
        attempt < retries
      ) {

        console.warn(
          `⚠️ Retry DB (${attempt + 1})`
        )

        await sleep(
          150 * (attempt + 1)
        )

        attempt++

        continue

      }

      console.error(
        'DB ERROR:',
        {
          sql: query,
          params,
          error: error.message,
          code: error.code,
        }
      )

      throw error

    }

  }

}

// ======================================================
// INSERT LOG
// ======================================================

export async function insertLog(
  {
    factura_id = null,
    tipo = null,
    level = 'info',
    request_data = null,
    response_data = null,
    error = null,
    meta = {},
    source = 'facturacion-service',
    user_id = null,
    woo_order_id = null,
    uuid = null,
    correlation_id = null,
    ip_address = null,
    user_agent = null,
  } = {},
  connection = null
) {

  try {

    if (!tipo) {

      throw new Error(
        'tipo requerido'
      )

    }

    const payload = [

      factura_id,

      sanitizeString(tipo),

      normalizeLevel(level),

      truncate(
        request_data,
        50000
      ),

      truncate(
        response_data,
        50000
      ),

      truncate(
        error,
        15000
      ),

      truncate(
        meta,
        30000
      ),

      sanitizeString(source),

      user_id,

      woo_order_id,

      uuid,

      correlation_id,

      ip_address,

      truncate(
        user_agent,
        1000
      ),

    ]

    // ==================================================
    // CRITICAL FIX:
    // USE ACTIVE TX CONNECTION
    // ==================================================

    const result =
      await execute(
        `
        INSERT INTO logs_facturacion (

          factura_id,
          tipo,
          level,
          request_data,
          response_data,
          error,
          meta,
          source,
          user_id,
          woo_order_id,
          uuid,
          correlation_id,
          ip_address,
          user_agent,
          created_at,
          updated_at

        )
        VALUES (

          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,
          ?,

          NOW(),
          NOW()

        )
        `,
        payload,
        connection
      )

    return {

      success: true,

      inserted: true,

      log_id:
        result.insertId,

    }

  } catch (err) {

    console.error(
      '[LOG FAIL]',
      err.message
    )

    return {

      success: false,

      inserted: false,

      error: err.message,

    }

  }

}

// ======================================================
// GET LOG BY ID
// ======================================================

export async function getLogById(
  logId,
  connection = null
) {

  if (!logId) {

    throw new Error(
      'logId requerido'
    )

  }

  const rows =
    await execute(
      `
      SELECT *
      FROM logs_facturacion
      WHERE id_log = ?
      LIMIT 1
      `,
      [logId],
      connection
    )

  return rows?.length
    ? normalizeLog(rows[0])
    : null

}

// ======================================================
// GET LOGS FACTURA
// ======================================================

export async function getLogsFactura(
  facturaId,
  options = {},
  connection = null
) {

  if (!facturaId) {

    throw new Error(
      'facturaId requerido'
    )

  }

  const limit =
    normalizeLimit(
      options.limit
    )

  const rows =
    await execute(
      `
      SELECT *
      FROM logs_facturacion
      WHERE factura_id = ?
      ORDER BY id_log DESC
      LIMIT ?
      `,
      [
        facturaId,
        limit,
      ],
      connection
    )

  return rows.map(
    normalizeLog
  )

}

// ======================================================
// HEALTH CHECK
// ======================================================

export async function logsRepositoryHealthCheck() {

  try {

    const rows =
      await execute(`
        SELECT 1 AS ok
      `)

    return {

      success: true,

      healthy:
        rows?.[0]?.ok === 1,

    }

  } catch (error) {

    return {

      success: false,

      healthy: false,

      error:
        error.message,

    }

  }

}

// ======================================================
// EXPORT DEFAULT
// ======================================================

export default {

  insertLog,
  getLogById,
  getLogsFactura,
  logsRepositoryHealthCheck,

}