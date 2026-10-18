// ======================================================
// tests/facturacion.enterprise.test.js
// ENTERPRISE CFDI TEST SUITE
// CANCELACION + RECOVERY + CONCURRENCIA + LOCKS
// COMMERCESYNCSUITE
// ======================================================

import {
  procesarFacturacion,
} from '../services/facturacionService.js'

import {
  recoverFactura,
} from '../services/facturaRecoveryService.js'

import {
  cancelarCFDIOrquestado,
} from '../services/cfdiOrchestratorService.js'

import {
  satHealthCheck,
} from '../services/satService.js'

import {
  acquireLock,
  checkLock,
  releaseLock,
  cleanExpiredLocks,
} from '../repositories/locksRepository.js'

import db from '../config/db.js'

// ======================================================
// HELPERS
// ======================================================

function sleep(ms = 1000) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

function print(title, data = null) {

  console.log(`\n${'='.repeat(60)}`)
  console.log(`🔥 ${title}`)
  console.log(`${'='.repeat(60)}\n`)

  if (data) {
    console.dir(data, {
      depth: null,
      colors: true,
    })
  }

}

// ======================================================
// TEST DATA
// ======================================================

const TEST_PAYLOAD = {

  pedido_id: 516,

  payment_method: 'PUE',

  payment_form: '03',

  moneda: 'MXN',

  datos_fiscales: {

    razon_social:
      'PUBLICO EN GENERAL',

    rfc:
      'XAXX010101000',

    uso_cfdi:
      'S01',

    regimen_fiscal:
      '616',

    cp:
      '64000',

    correo_facturacion:
      'test@example.com',

  },

}

// ======================================================
// TEST 1
// SAT HEALTH
// ======================================================

async function testSATHealth() {

  print('TEST 1 - SAT HEALTH')

  const result =
    await satHealthCheck()

  console.dir(result, {
    depth: null,
  })

}

// ======================================================
// TEST 2
// CFDI EMISION
// ======================================================

async function testCFDIEmit() {

  print('TEST 2 - CFDI EMISION')

  const startedAt =
    Date.now()

  const result =
    await procesarFacturacion(
      TEST_PAYLOAD
    )

  const execution =
    Date.now() - startedAt

  console.log(
    `\n⏱️ Tiempo: ${execution}ms`
  )

  console.dir(result, {
    depth: null,
  })

  if (!result?.success) {

    throw new Error(
      'CFDI no emitido'
    )

  }

  return result

}

// ======================================================
// TEST 3
// IDEMPOTENCY
// ======================================================

async function testIdempotency() {

  print(
    'TEST 3 - IDEMPOTENCY'
  )

  const results =
    await Promise.allSettled([

      procesarFacturacion(
        TEST_PAYLOAD
      ),

      procesarFacturacion(
        TEST_PAYLOAD
      ),

    ])

  console.dir(results, {
    depth: null,
  })

  const fulfilled =
    results.filter(
      r => r.status === 'fulfilled'
    )

  const rejected =
    results.filter(
      r => r.status === 'rejected'
    )

  if (
    fulfilled.length !== 1
  ) {

    throw new Error(
      'Idempotency rota'
    )

  }

  if (
    rejected.length !== 1
  ) {

    throw new Error(
      'Lock no protegido'
    )

  }

  console.log(
    '\n✅ IDEMPOTENCY OK'
  )

}

// ======================================================
// TEST 4
// LOCK EXPIRATION
// ======================================================

async function testLockExpiration() {

  print(
    'TEST 4 - LOCK EXPIRATION'
  )

  await acquireLock({

    key: 'test_expiration',

    owner: 'test-suite',

    ttlSeconds: 2,

  })

  console.log(
    '🔒 Lock creado'
  )

  await sleep(3000)

  const lock =
    await checkLock(
      'test_expiration'
    )

  console.dir(lock, {
    depth: null,
  })

  if (lock.active) {

    throw new Error(
      'Lock expirado sigue activo'
    )

  }

  await cleanExpiredLocks()

  console.log(
    '\n✅ LOCK EXPIRATION OK'
  )

}

// ======================================================
// TEST 5
// RECOVERY CONTROLADO
// ======================================================

async function testRecoveryControl() {

  print(
    'TEST 5 - RECOVERY CONTROL'
  )

  try {

    await recoverFactura(
      999999999
    )

  } catch (error) {

    console.log(
      '\n✅ RECOVERY CONTROLADO'
    )

    console.log(
      error.message
    )

  }

}

// ======================================================
// TEST 6
// RECOVERY REAL
// ======================================================

async function testRecoveryReal() {

  print(
    'TEST 6 - RECOVERY REAL'
  )

  // ==========================================
  // INSERT FACTURA CORRUPTA
  // ==========================================

  const [result] =
    await db.query(
      `
      INSERT INTO facturas (

        pedido_id,
        estatus,
        total,
        moneda,
        created_at,
        updated_at

      )
      VALUES (

        ?,
        ?,
        ?,
        ?,
        NOW(),
        NOW()

      )
      `,
      [
        99991,
        'error',
        100,
        'MXN',
      ]
    )

  const facturaId =
    result.insertId

  console.log(
    '\n🧪 Factura corrupta:',
    facturaId
  )

  try {

    const recovery =
      await recoverFactura(
        facturaId
      )

    console.dir(recovery, {
      depth: null,
    })

  } catch (error) {

    console.log(
      '\n⚠️ RECOVERY FAIL CONTROLADO'
    )

    console.log(
      error.message
    )

  }

}

// ======================================================
// TEST 7
// CANCELACION CFDI
// ======================================================

async function testCancelCFDI(
  factura
) {

  print(
    'TEST 7 - CANCELACION CFDI'
  )

  if (!factura?.invoice_id) {

    console.log(
      '⚠️ invoice_id no disponible'
    )

    return

  }

  const result =
    await cancelarCFDIOrquestado({

      facturaId:
        factura.factura_id,

      invoiceId:
        factura.invoice_id,

      motivo: '02',

    })

  console.dir(result, {
    depth: null,
  })

  console.log(
    '\n✅ CANCELACION OK'
  )

}

// ======================================================
// TEST 8
// CONCURRENCIA MASIVA
// ======================================================

async function testMassiveConcurrency() {

  print(
    'TEST 8 - CONCURRENCIA MASIVA'
  )

  const jobs =
    Array.from({
      length: 10
    }).map(() => {

      return procesarFacturacion({
        ...TEST_PAYLOAD,
      })

    })

  const results =
    await Promise.allSettled(
      jobs
    )

  const fulfilled =
    results.filter(
      r => r.status === 'fulfilled'
    )

  const rejected =
    results.filter(
      r => r.status === 'rejected'
    )

  console.log(
    '\n✅ Fulfilled:',
    fulfilled.length
  )

  console.log(
    '❌ Rejected:',
    rejected.length
  )

  console.dir(results, {
    depth: 2,
  })

}

// ======================================================
// TEST 9
// LOCK CLEANUP
// ======================================================

async function testLockCleanup() {

  print(
    'TEST 9 - LOCK CLEANUP'
  )

  const result =
    await cleanExpiredLocks()

  console.dir(result, {
    depth: null,
  })

}

// ======================================================
// RUN
// ======================================================

async function run() {

  try {

    print(
      'INICIANDO TEST SUITE CFDI ENTERPRISE'
    )

    // ==========================================
    // SAT
    // ==========================================

    await testSATHealth()

    // ==========================================
    // EMITIR CFDI
    // ==========================================

    const factura =
      await testCFDIEmit()

    // ==========================================
    // IDEMPOTENCY
    // ==========================================

    await testIdempotency()

    // ==========================================
    // LOCKS
    // ==========================================

    await testLockExpiration()

    // ==========================================
    // RECOVERY CONTROL
    // ==========================================

    await testRecoveryControl()

    // ==========================================
    // RECOVERY REAL
    // ==========================================

    await testRecoveryReal()

    // ==========================================
    // CANCELACION
    // ==========================================

    await testCancelCFDI(
      factura
    )

    // ==========================================
    // CONCURRENCIA
    // ==========================================

    await testMassiveConcurrency()

    // ==========================================
    // CLEANUP
    // ==========================================

    await testLockCleanup()

    // ==========================================

    print(
      'TEST SUITE COMPLETADO'
    )

  } catch (error) {

    print(
      'ERROR TEST SUITE'
    )

    console.error({

      message:
        error?.message,

      stack:
        error?.stack,

      response:
        error?.response?.data,

    })

  } finally {

    try {

      await releaseLock(
        'test_expiration'
      )

    } catch {}

    process.exit(0)

  }

}

// ======================================================
// START
// ======================================================

run()