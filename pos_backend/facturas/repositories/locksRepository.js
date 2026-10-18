// ======================================================
// facturas/repositories/locksRepository.js
// ENTERPRISE LOCK ENGINE v3
// SAFE IDEMPOTENCY + AUTO EXPIRE + RACE SAFE
// ======================================================

import db from '../config/db.js'


export async function createLock(
  lockKey,
  owner = 'system',
  ttlSeconds = 30
) {

  const expiresAt = new Date(
    Date.now() + (ttlSeconds * 1000)
  )

  try {

    await db.query(`
      INSERT INTO locks (

        lock_key,
        owner,
        expires_at,
        created_at

      )
      VALUES (?, ?, ?, NOW())
    `, [
      lockKey,
      owner,
      expiresAt
    ])

    return {
      success: true,
      lock_key: lockKey,
      owner,
      expires_at: expiresAt
    }

  } catch (error) {

    if (
      error.message.includes('Duplicate entry')
    ) {

      throw new Error(
        `LOCK_ACTIVE: ${lockKey}`
      )

    }

    throw error
  }
}
// ======================================================
// HELPERS
// ======================================================

function now() {
  return new Date()
}

function normalizeKey(key = '') {
  return String(key)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
}

// ======================================================
// REMOVE EXPIRED LOCK
// ======================================================

async function removeExpiredLock(lockKey) {

  await db.query(
    `
    DELETE FROM locks
    WHERE lock_key = ?
      AND expires_at < NOW()
    `,
    [lockKey]
  )

}

// ======================================================
// ACQUIRE LOCK
// ======================================================

export async function acquireLock({
  key,
  owner = 'system',
  ttlSeconds = 60,
}) {

  if (!key) {
    throw new Error('lock key requerido')
  }

  const lockKey =
    normalizeKey(key)

  const expiresAt =
    new Date(
      Date.now() + ttlSeconds * 1000
    )

  // ====================================================
  // CLEAN EXPIRED PREVIOUS LOCK
  // ====================================================

  await removeExpiredLock(lockKey)

  try {

    await db.query(
      `
      INSERT INTO locks (
        lock_key,
        owner,
        expires_at,
        created_at
      )
      VALUES (?, ?, ?, NOW())
      `,
      [
        lockKey,
        owner,
        expiresAt,
      ]
    )

    return {
      acquired: true,
      lockKey,
      owner,
      expiresAt,
    }

  } catch (error) {

    // ==================================================
    // DUPLICATE LOCK
    // ==================================================

    if (
      error.code === 'ER_DUP_ENTRY'
    ) {

      // ================================================
      // VERIFY IF LOCK IS STILL ACTIVE
      // ================================================

      const status =
        await checkLock(lockKey)

      // ================================================
      // LOCK EXPIRED
      // ================================================

      if (
        status.exists &&
        status.expired
      ) {

        // ==============================================
        // FORCE CLEAN
        // ==============================================

        await releaseLock(lockKey)

        // ==============================================
        // RETRY ONE TIME
        // ==============================================

        return acquireLock({
          key: lockKey,
          owner,
          ttlSeconds,
        })

      }

      return {
        acquired: false,
        lockKey,
        reason: 'LOCK_EXISTS',
      }

    }

    throw error

  }

}

// ======================================================
// CHECK LOCK
// ======================================================

export async function checkLock(key) {

  const lockKey =
    normalizeKey(key)

  const [rows] =
    await db.query(
      `
      SELECT *
      FROM locks
      WHERE lock_key = ?
      LIMIT 1
      `,
      [lockKey]
    )

  const lock =
    rows?.[0]

  if (!lock) {

    return {
      exists: false,
      active: false,
      expired: false,
    }

  }

  const expired =
    new Date(lock.expires_at) < now()

  return {

    exists: true,

    active: !expired,

    expired,

    lock,

  }

}

// ======================================================
// RELEASE LOCK
// ======================================================

export async function releaseLock(key) {

  const lockKey =
    normalizeKey(key)

  await db.query(
    `
    DELETE FROM locks
    WHERE lock_key = ?
    `,
    [lockKey]
  )

  return {
    released: true,
    lockKey,
  }

}

// ======================================================
// CLEAN EXPIRED LOCKS
// ======================================================

export async function cleanExpiredLocks() {

  const [result] =
    await db.query(
      `
      DELETE FROM locks
      WHERE expires_at < NOW()
      `
    )

  return {
    cleaned:
      result?.affectedRows || 0,
  }

}

// ======================================================
// SAFE LOCK WRAPPER
// ======================================================

export async function withLock(
  key,
  fn,
  options = {}
) {

  const ttl =
    options.ttl || 60

  const owner =
    options.owner || 'system'

  const lock =
    await acquireLock({
      key,
      owner,
      ttlSeconds: ttl,
    })

  if (!lock.acquired) {

    throw new Error(
      `LOCK_ACTIVE: ${key}`
    )

  }

  try {

    return await fn()

  } finally {

    try {

      await releaseLock(key)

    } catch (err) {

      console.error(
        '[LOCK RELEASE FAIL]',
        err.message
      )

    }

  }

}

// ======================================================
// IDEMPOTENCY LOCK
// ======================================================

export async function withIdempotencyLock(
  key,
  fn,
  options = {}
) {

  return withLock(
    `idem_${key}`,
    fn,
    options
  )

}

// ======================================================
// FACTURA LOCK
// ======================================================

export async function lockFacturaOperacion(
  connection,
  pedidoId
) {

  const [rows] =
    await connection.query(
      `
      SELECT *
      FROM locks
      WHERE lock_key = ?
      LIMIT 1
      FOR UPDATE
      `,
      [`factura_${pedidoId}`]
    )

  return rows?.[0] || null

}

// ======================================================
// HEALTHCHECK
// ======================================================

export async function locksHealthCheck() {

  try {

    const [rows] =
      await db.query(
        `SELECT 1 AS ok`
      )

    return {
      success: true,
      healthy:
        rows?.[0]?.ok === 1,
    }

  } catch (error) {

    return {
      success: false,
      healthy: false,
      error: error.message,
    }

  }

}

// ======================================================
// EXPORT
// ======================================================

export default {

  acquireLock,
  checkLock,
  releaseLock,
  cleanExpiredLocks,
  withLock,
  withIdempotencyLock,
  lockFacturaOperacion,
  locksHealthCheck,

}