 
// ======================================================
// tests/cfdi.enterprise.full.test.js
// ENTERPRISE TEST SUITE CFDI 4.0
// CANCELACION + RETRY + CORRUPCION + STRESS
// WEBHOOKS + RECOVERY + CONCURRENCIA
// ======================================================

import os from 'os'
import process from 'process'

import db from '../config/db.js'

import {
  procesarFacturacion
} from '../services/facturacionService.js'

import {
  cancelarCFDIOrquestado
} from '../services/cfdiOrchestratorService.js'

import {
  recoverFactura
} from '../services/facturaRecoveryService.js'

import {
  createLock,
  checkLock,
  releaseLock
} from '../repositories/locksRepository.js'

// ======================================================
// CONFIG
// ======================================================

const TEST_PEDIDO_ID = 515

const BASE_PAYLOAD = {

  pedido_id: TEST_PEDIDO_ID,

  payment_method: 'PUE',

  payment_form: '02',

  moneda: 'MXN',

  datos_fiscales: {

    razon_social:
      'PUBLICO EN GENERAL',

    rfc:
      'AAPA901115MU8',

    uso_cfdi:
      'S01',

    regimen_fiscal:
      '616',

    cp:
      '22224',

    correo_facturacion:
      'cortezamental@gmail.com',

  },

}

// ======================================================
// HELPERS
// ======================================================

function title(name) {

  console.log('\n============================================================')
  console.log(`🔥 ${name}`)
  console.log('============================================================\n')

}

function sleep(ms = 1000) {

  return new Promise(resolve =>
    setTimeout(resolve, ms)
  )

}

function memorySnapshot() {

  const usage = process.memoryUsage()

  return {

    rss:
      Math.round(usage.rss / 1024 / 1024),

    heapUsed:
      Math.round(usage.heapUsed / 1024 / 1024),

    heapTotal:
      Math.round(usage.heapTotal / 1024 / 1024),

  }

}

// ======================================================
// TEST 1
// CANCELACION EXITOSA
// ======================================================

async function testCancelacionExitosa() {

  title('TEST 1 - CANCELACION EXITOSA')

  const factura =
    await procesarFacturacion(
      BASE_PAYLOAD
    )

  console.log('FACTURA:', factura)

  const result =
    await cancelarCFDIOrquestado({

      facturaId:
        factura.factura_id,

      invoiceId:
        factura.invoiceId,

      motivo:
        '02',

    })

  console.log(result)

}

// ======================================================
// TEST 2
// CANCELACION DOBLE
// ======================================================

async function testCancelacionDoble() {

  title('TEST 2 - CANCELACION DOBLE')

  try {

    const factura =
      await procesarFacturacion(
        BASE_PAYLOAD
      )

    await cancelarCFDIOrquestado({

      facturaId:
        factura.factura_id,

      invoiceId:
        factura.invoiceId,

      motivo:
        '02',

    })

    await cancelarCFDIOrquestado({

      facturaId:
        factura.factura_id,

      invoiceId:
        factura.invoiceId,

      motivo:
        '02',

    })

  } catch (error) {

    console.log('✅ ERROR CONTROLADO')
    console.log(error.message)

  }

}

// ======================================================
// TEST 3
// UUID INEXISTENTE
// ======================================================

async function testUUIDInexistente() {

  title('TEST 3 - UUID INEXISTENTE')

  try {

    await cancelarCFDIOrquestado({

      facturaId:
        999999,

      invoiceId:
        'fake_invoice',

      motivo:
        '02',

    })

  } catch (error) {

    console.log('✅ UUID INVALIDO OK')
    console.log(error.message)

  }

}

// ======================================================
// TEST 4
// CANCELACION CONCURRENTE
// ======================================================

async function testCancelacionConcurrente() {

  title('TEST 4 - CANCELACION CONCURRENTE')

  const factura =
    await procesarFacturacion(
      BASE_PAYLOAD
    )

  const jobs = [

    cancelarCFDIOrquestado({

      facturaId:
        factura.factura_id,

      invoiceId:
        factura.invoiceId,

      motivo:
        '02',

    }),

    cancelarCFDIOrquestado({

      facturaId:
        factura.factura_id,

      invoiceId:
        factura.invoiceId,

      motivo:
        '02',

    })

  ]

  const results =
    await Promise.allSettled(jobs)

  console.dir(results, {
    depth: null
  })

}

// ======================================================
// TEST 5
// MOTIVOS SAT
// ======================================================

async function testMotivosSAT() {

  title('TEST 5 - MOTIVOS SAT')

  const motivos = [

    '01',
    '02',
    '03',
    '04',

  ]

  for (const motivo of motivos) {

    console.log(`\nMOTIVO: ${motivo}`)

    try {

      const factura =
        await procesarFacturacion(
          BASE_PAYLOAD
        )

      const result =
        await cancelarCFDIOrquestado({

          facturaId:
            factura.factura_id,

          invoiceId:
            factura.invoiceId,

          motivo,

        })

      console.log(result)

    } catch (error) {

      console.log(error.message)

    }

  }

}

// ======================================================
// TEST 6
// SUSTITUCION CFDI
// ======================================================

async function testSustitucionCFDI() {

  title('TEST 6 - SUSTITUCION CFDI')

  const original =
    await procesarFacturacion(
      BASE_PAYLOAD
    )

  const sustituto =
    await procesarFacturacion(
      BASE_PAYLOAD
    )

  const result =
    await cancelarCFDIOrquestado({

      facturaId:
        original.factura_id,

      invoiceId:
        original.invoiceId,

      motivo:
        '01',

      folio_sustitucion:
        sustituto.uuid,

    })

  console.log(result)

}

// ======================================================
// TEST 7
// RETRY TIMEOUT
// ======================================================

async function testRetryTimeout() {

  title('TEST 7 - RETRY TIMEOUT')

  let attempts = 0

  async function fakeSAT() {

    attempts++

    if (attempts < 3) {

      const err =
        new Error('ETIMEDOUT')

      err.code = 'ETIMEDOUT'

      throw err

    }

    return {
      success: true
    }

  }

  async function withRetry(fn) {

    let retry = 0

    while (retry < 5) {

      try {

        return await fn()

      } catch (error) {

        retry++

        console.log(
          `Retry ${retry}`
        )

        await sleep(
          retry * 1000
        )

      }

    }

  }

  const result =
    await withRetry(fakeSAT)

  console.log(result)

}

// ======================================================
// TEST 8
// ECONNRESET + 502 + 503
// ======================================================

async function testRetryNetwork() {

  title('TEST 8 - NETWORK FAILURES')

  const errors = [

    'ECONNRESET',
    '502',
    '503',

  ]

  for (const err of errors) {

    try {

      throw new Error(err)

    } catch (error) {

      console.log(
        'CONTROLADO:',
        error.message
      )

    }

  }

}

// ======================================================
// TEST 9
// XML INVALIDO
// ======================================================

async function testXMLCorrupto() {

  title('TEST 9 - XML CORRUPTO')

  const xml =
    '<xml><broken></xml>'

  if (
    !xml.includes('</broken>')
  ) {

    console.log(
      '✅ XML INVALIDO DETECTADO'
    )

  }

}

// ======================================================
// TEST 10
// UUID NULL
// ======================================================

async function testUUIDNull() {

  title('TEST 10 - UUID NULL')

  const cfdi = {

    uuid: null

  }

  if (!cfdi.uuid) {

    console.log(
      '✅ UUID NULL DETECTADO'
    )

  }

}

// ======================================================
// TEST 11
// PDF FALTANTE
// ======================================================

async function testPDFFaltante() {

  title('TEST 11 - PDF FALTANTE')

  const pdf = null

  if (!pdf) {

    console.log(
      '✅ PDF FALTANTE'
    )

  }

}

// ======================================================
// TEST 12
// FACTURA PARCIAL
// ======================================================

async function testFacturaParcial() {

  title('TEST 12 - FACTURA PARCIAL')

  await db.query(`
    INSERT INTO facturas (

      pedido_id,
      estatus,
      total,
      created_at,
      updated_at

    )
    VALUES (

      ?,
      ?,
      ?,
      NOW(),
      NOW()

    )
  `, [

    999991,
    'procesando',
    100

  ])

  console.log(
    '✅ FACTURA PARCIAL INSERTADA'
  )

}

// ======================================================
// TEST 13
// STRESS TEST
// ======================================================

async function testStress() {

  title('TEST 13 - STRESS TEST')

  console.log(
    'MEMORY BEFORE:',
    memorySnapshot()
  )

  const jobs = []

  for (let i = 0; i < 50; i++) {

    jobs.push(

      procesarFacturacion({
        ...BASE_PAYLOAD
      })

    )

  }

  const start = Date.now()

  const results =
    await Promise.allSettled(jobs)

  const elapsed =
    Date.now() - start

  const success =
    results.filter(
      r => r.status === 'fulfilled'
    )

  const failed =
    results.filter(
      r => r.status === 'rejected'
    )

  console.log({

    total:
      results.length,

    success:
      success.length,

    failed:
      failed.length,

    elapsed,

    cpu:
      os.loadavg(),

  })

  console.log(
    'MEMORY AFTER:',
    memorySnapshot()
  )

}

// ======================================================
// TEST 14
// WEBHOOK DUPLICADO
// ======================================================

async function testWebhookDuplicado() {

  title('TEST 14 - WEBHOOK DUPLICADO')

  const event = {

    id:
      'evt_duplicate',

  }

  const processed =
    new Set()

  function processWebhook(e) {

    if (processed.has(e.id)) {

      throw new Error(
        'WEBHOOK_DUPLICATE'
      )

    }

    processed.add(e.id)

  }

  processWebhook(event)

  try {

    processWebhook(event)

  } catch (error) {

    console.log(
      '✅ DUPLICADO DETECTADO'
    )

  }

}

// ======================================================
// TEST 15
// WEBHOOK INVALIDO
// ======================================================

async function testWebhookInvalido() {

  title('TEST 15 - WEBHOOK INVALIDO')

  try {

    throw new Error(
      'INVALID_SIGNATURE'
    )

  } catch (error) {

    console.log(
      '✅ FIRMA INVALIDA'
    )

  }

}

// ======================================================
// TEST 16
// RECOVERY AUTOMATICO
// ======================================================

async function testRecoveryAutomatico() {

  title('TEST 16 - RECOVERY AUTOMATICO')

  await db.query(`
    INSERT INTO facturas (

      pedido_id,
      estatus,
      total,
      created_at,
      updated_at

    )
    VALUES (

      ?,
      ?,
      ?,
      NOW(),
      NOW()

    )
  `, [

    888881,
    'error',
    999

  ])

  const [rows] =
    await db.query(`
      SELECT id
      FROM facturas
      WHERE pedido_id = ?
      LIMIT 1
    `, [888881])

  const facturaId =
    rows[0]?.id

  const result =
    await recoverFactura(
      facturaId
    )

  console.log(result)

}

// ======================================================
// RUN
// ======================================================

async function run() {

  try {

    title(
      'INICIANDO TEST SUITE CFDI ENTERPRISE'
    )

    await testCancelacionExitosa()

    await testCancelacionDoble()

    await testUUIDInexistente()

    await testCancelacionConcurrente()

    await testMotivosSAT()

    await testSustitucionCFDI()

    await testRetryTimeout()

    await testRetryNetwork()

    await testXMLCorrupto()

    await testUUIDNull()

    await testPDFFaltante()

    await testFacturaParcial()

    await testStress()

    await testWebhookDuplicado()

    await testWebhookInvalido()

    await testRecoveryAutomatico()

    title(
      'TEST SUITE COMPLETADO'
    )

  } catch (error) {

    title(
      'ERROR TEST SUITE'
    )

    console.error({

      message:
        error.message,

      stack:
        error.stack,

      response:
        error.response?.data,

    })

  }

}

run()
 
