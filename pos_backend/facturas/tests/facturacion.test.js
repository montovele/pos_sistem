// ======================================================
// tests/facturacion.test.js
// ENTERPRISE CFDI TEST SUITE FINAL
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

// ======================================================
// TEST DATA
// ======================================================

const testPayload = {

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
// TEST SAT HEALTH
// ======================================================

async function testSATHealth() {

  console.log(
    '\n🧠 TEST 1 - SAT HEALTH'
  )

  const result =
    await satHealthCheck()

  console.dir(result, {
    depth: null,
  })

}

// ======================================================
// TEST TIMBRADO
// ======================================================

async function testTimbrado() {

  console.log(
    '\n🔥 TEST 2 - TIMBRADO'
  )

  const started =
    Date.now()

  const result =
    await procesarFacturacion(
      testPayload
    )

  console.dir(result, {
    depth: null,
  })

  console.log(
    `\n⏱️ Tiempo: ${
      Date.now() - started
    }ms`
  )

  if (!result?.success) {

    throw new Error(
      'Timbrado falló'
    )

  }

  return result

}

// ======================================================
// TEST IDEMPOTENCY
// ======================================================

async function testIdempotency() {

  console.log(
    '\n🛡️ TEST 3 - IDEMPOTENCY'
  )

  const results =
    await Promise.allSettled([

      procesarFacturacion(
        testPayload
      ),

      procesarFacturacion(
        testPayload
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

  // ==================================================
  // VALIDACIÓN ENTERPRISE
  // ==================================================

  if (fulfilled.length !== 1) {

    throw new Error(
      'Idempotency rota: múltiples timbrados'
    )

  }

  if (rejected.length !== 1) {

    throw new Error(
      'Idempotency inválida'
    )

  }

  const reason =
    rejected[0]?.reason?.message || ''

  if (
    !reason.includes('LOCK_ACTIVE')
  ) {

    throw new Error(
      'Lock inválido'
    )

  }

  console.log(
    '\n✅ IDEMPOTENCY OK'
  )

}

// ======================================================
// TEST RECOVERY
// ======================================================

async function testRecovery() {

  console.log(
    '\n🔁 TEST 4 - RECOVERY'
  )

  try {

    await recoverFactura(999999)

  } catch (error) {

    console.log(
      '\n✅ RECOVERY CONTROLADO'
    )

    console.log(error.message)

  }

}

// ======================================================
// TEST CANCELACION
// ======================================================

async function testCancel(
  factura
) {

  console.log(
    '\n❌ TEST 5 - CANCELACION'
  )

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

}

// ======================================================
// RUN
// ======================================================

async function run() {

  try {

    console.log(
      '\n🚀 INICIANDO TEST SUITE CFDI ENTERPRISE\n'
    )

    // ==========================================
    // HEALTH
    // ==========================================

    await testSATHealth()

    // ==========================================
    // TIMBRADO
    // ==========================================

    const factura =
      await testTimbrado()

    // ==========================================
    // IDEMPOTENCY
    // ==========================================

    await testIdempotency()

    // ==========================================
    // RECOVERY
    // ==========================================

    await testRecovery()

    // ==========================================
    // CANCELACION
    // ==========================================

    /*
    await testCancel(factura)
    */

    console.log(
      '\n🎉 TEST SUITE COMPLETADO\n'
    )

  } catch (error) {

    console.error(
      '\n❌ ERROR TEST SUITE\n'
    )

    console.error({

      message:
        error?.message,

      stack:
        error?.stack,

    })

  }

}

run()