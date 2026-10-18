 // ======================================================
// facturas/services/transactionService.js
// ENTERPRISE TRANSACTION CORE ENGINE v2
// CFDI + SAT + LOCK SAFE + RESILIENCE READY
// ======================================================

import db from '../config/db.js'

// ======================================================
// CONFIG
// ======================================================

const RETRIES =
  Number(process.env.DB_TRANSACTION_RETRIES) || 3

const BASE_DELAY =
  Number(process.env.DB_TRANSACTION_DELAY) || 800

// ======================================================
// UTIL: DELAY
// ======================================================

const delay = (ms) =>
  new Promise((r) => setTimeout(r, ms))

// ======================================================
// RETRYABLE ERRORS
// ======================================================

const RETRY_CODES = new Set([
  'ER_LOCK_DEADLOCK',
  'ER_LOCK_WAIT_TIMEOUT',
  'ER_QUERY_INTERRUPTED',
  'PROTOCOL_CONNECTION_LOST',
  'ECONNRESET',
  'ETIMEDOUT',
  'EPIPE',
])

function isRetryable(err) {
  return err && RETRY_CODES.has(err.code)
}

// ======================================================
// CONNECTION FACTORY
// ======================================================

async function createConnection() {
  const conn = await db.getConnection()
  await conn.beginTransaction()
  return conn
}

// ======================================================
// SAFE COMMIT / ROLLBACK
// ======================================================

async function commit(conn) {
  try {
    await conn.commit()
  } finally {
    conn.release()
  }
}

async function rollback(conn) {
  try {
    await conn.rollback()
  } finally {
    conn.release()
  }
}

// ======================================================
// CORE TRANSACTION ENGINE
// ======================================================

export async function withTransaction(fn, options = {}) {
  const maxRetries = options.retries ?? RETRIES

  let attempt = 0
  let lastError = null

  while (attempt < maxRetries) {
    let conn = null

    try {
      attempt++

      conn = await createConnection()

      const result = await fn(conn, {
        attempt,
        isRetry: attempt > 1,
      })

      await commit(conn)

      return result
    } catch (err) {
      lastError = err

      if (conn) {
        await rollback(conn)
      }

      console.error(
        `[TX ${attempt}/${maxRetries}]`,
        err.code,
        err.message
      )

      if (!isRetryable(err)) {
        break
      }

      if (attempt >= maxRetries) {
        break
      }

      await delay(BASE_DELAY * attempt)
    }
  }

  throw lastError
}

// ======================================================
// SAFE UNIT OF WORK (CFDI STYLE)
// ======================================================

export async function atomicOperation(fn, options = {}) {
  return withTransaction(async (conn, ctx) => {
    return fn(conn, ctx)
  }, options)
}

// ======================================================
// QUERY WRAPPERS
// ======================================================

export async function query(conn, sql, params = []) {
  if (!conn) throw new Error('Connection requerida')
  const [rows] = await conn.query(sql, params)
  return rows
}

export async function insert(conn, sql, params = []) {
  if (!conn) throw new Error('Connection requerida')
  const [res] = await conn.query(sql, params)
  return res.insertId
}

export async function update(conn, sql, params = []) {
  if (!conn) throw new Error('Connection requerida')
  const [res] = await conn.query(sql, params)

  return {
    affected: res.affectedRows || 0,
    changed: res.changedRows || 0,
  }
}

// ======================================================
// GET EXECUTOR (LEGACY COMPAT)
// ======================================================

export function getExecutor(conn = null) {
  return conn || db
}

// ======================================================
// LOCK-SAFE TRANSACTION (CFDI READY)
// ======================================================

export async function safeTransaction(fn, options = {}) {
  return withTransaction(fn, options)
}

// ======================================================
// HEALTH CHECK
// ======================================================

export async function transactionHealthCheck() {
  let conn

  try {
    conn = await createConnection()

    const [rows] = await conn.query('SELECT 1 AS ok')

    await commit(conn)

    return {
      success: true,
      healthy: rows?.[0]?.ok === 1,
    }
  } catch (err) {
    if (conn) await rollback(conn)

    return {
      success: false,
      healthy: false,
      error: err.message,
    }
  }
}