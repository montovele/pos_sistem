// ======================================================
// facturas/services/satService.js
// ENTERPRISE PAC LAYER FINAL
// FACTURAPI CFDI 4.0 SAFE
// ======================================================

import crypto from 'crypto'

import facturapi from '../config/facturapi.js'

import {

  executeWithResilience,
  isRetryableError,

} from './resiliencePolicyService.js'

import {

  insertLog,

} from '../repositories/logsRepository.js'

import {

  mapConceptosToFacturapi,

} from '../mappers/facturapiMapper.js'

// ======================================================
// IMPORT CORRECTO
// ======================================================

import {
  obtenerSiguienteFolio
} from '../repositories/foliosRepository.js'

// ======================================================
// CONFIG
// ======================================================

const SYSTEM = 'satService'
const PAC = 'FACTURAPI'

// ======================================================
// HELPERS
// ======================================================

function normalize(value = '') {

  return String(value || '')
    .trim()

}

// ======================================================

function upper(value = '') {

  return normalize(value)
    .toUpperCase()

}

// ======================================================

function safeJSON(data = {}) {

  try {

    return JSON.parse(
      JSON.stringify(data)
    )

  } catch {

    return {}

  }

}

// ======================================================
// SAFE LOG
// ======================================================

async function log(data = {}) {

  try {

    await insertLog({

      ...safeJSON(data),

      source: SYSTEM,

    })

  } catch (e) {

    console.error(
      'SAT LOG ERROR:',
      e.message
    )

  }

}

// ======================================================
// RESILIENCE WRAPPER
// ======================================================

async function withSAT(
  fn,
  operation,
  metadata = {}
) {

  return executeWithResilience({

    fn,

    service: SYSTEM,

    operation,

    retryDecider:
      isRetryableError,

    metadata,

  })

}

// ======================================================
// BUILD EXTERNAL ID
// ======================================================

function buildExternalId(
  payload = {}
) {

  return normalize(

    payload.external_id ||

    payload.metadata?.trace_id ||

    crypto.randomUUID()

  )

}

// ======================================================
// CUSTOMER SEARCH
// ======================================================

export async function buscarClientePAC(
  taxId
) {

  const rfc =
    upper(taxId)

  const response =
    await withSAT(

      () =>
        facturapi.customers.list({
          q: rfc
        }),

      'buscarClientePAC',

      {
        tax_id: rfc
      }

    )

  return (

    response?.data?.find(

      c =>
        upper(c.tax_id) === rfc

    ) ||

    null

  )

}

// ======================================================
// CUSTOMER UPDATE
// ======================================================
export async function actualizarClientePAC(
  customerId,
  data = {}
) {

  const payload = {

    legal_name:
      normalize(data.legal_name),

    email:
      normalize(data.email),

    tax_system:
      normalize(data.tax_system),

    address: {
      zip:
        normalize(
          data.address?.zip ??
          data.zip
        )
    }

  }

  return withSAT(

    () =>
      facturapi.customers.update(
        customerId,
        payload
      ),

    'actualizarClientePAC'

  )

}
// ======================================================
// CUSTOMER CREATE
// ======================================================

export async function crearClientePAC(
data = {}
) {

const zip =

normalize(

data?.address?.zip ??

data?.zip ??

''

)

const payload = {

legal_name:

normalize(
data.legal_name
),

tax_id:

upper(
data.tax_id
),

email:

normalize(
data.email
),

tax_system:

normalize(
data.tax_system
) ||

'616',

address: {

zip

}

}

console.group(
'crearClientePAC'
)

console.log(
'INPUT',
data
)

console.log(
'PAYLOAD',
payload
)

console.groupEnd()

if(
!payload.address.zip
){

throw new Error(
'Código postal requerido para PAC'
)

}

return withSAT(

()=>

facturapi.customers.create(
payload
),

'crearClientePAC',

{

tax_id:
payload.tax_id,

zip:
payload.address.zip

}

)

}

// ======================================================
// UPSERT CUSTOMER
// ======================================================

export async function obtenerOCrearClientePAC(
  data = {}
) {

  const existing =
    await buscarClientePAC(
      data.tax_id
    )

  if (existing) {

    return actualizarClientePAC(
      existing.id,
      data
    )

  }

  return crearClientePAC(data)

}

// ======================================================
// STREAM TO BUFFER
// ======================================================

async function streamToBuffer(
  stream
) {

  // ==========================================
  // BUFFER DIRECTO
  // ==========================================

  if (
    Buffer.isBuffer(stream)
  ) {

    return stream

  }

  // ==========================================
  // NULL
  // ==========================================

  if (!stream) {

    return Buffer.from([])

  }

  // ==========================================
  // STREAM
  // ==========================================

  const chunks = []

  for await (const chunk of stream) {

    chunks.push(chunk)

  }

  return Buffer.concat(chunks)

}
// ======================================================
// EMITIR CFDI (CORREGIDO)
// ======================================================

export async function emitirCFDI(payload = {}) {
  try {

    // ==================================================
    // EXTERNAL ID
    // ==================================================

    const externalId = buildExternalId(payload)

    // ==================================================
    // LOG START
    // ==================================================

    await log({
      tipo: 'sat_emitir_start',
      request_data: {
        externalId,
        pedido_id: payload.pedido_id || null,
      },
    })

    // ==================================================
    // CUSTOMER
    // ==================================================

    const customer = await obtenerOCrearClientePAC({
      legal_name: payload.customer?.legal_name,
      tax_id: payload.customer?.tax_id,
      email: payload.customer?.email,
      tax_system: payload.customer?.tax_system,
      zip: payload.customer?.address?.zip,
    })

    if (!customer?.id) {
      throw new Error('Cliente PAC inválido')
    }

    // ==================================================
    // ITEMS
    // ==================================================

  const conceptos =
  payload.items?.length
    ? payload.items
    : payload.conceptos || []

const items =
  mapConceptosToFacturapi(conceptos)

    if (!items.length) {
      throw new Error('No hay conceptos para facturar')
    }

    console.log('\n🔥 ITEMS FACTURAPI:\n')
    console.dir(items, { depth: null })

    // ==================================================
    // 🔥 FOLIO OFICIAL (FUENTE DE VERDAD)
    // ==================================================

    if (!payload.proveedor_id) {
      throw new Error('proveedor_id requerido para folio')
    }

    const folioData = await obtenerSiguienteFolio(
      payload.proveedor_id,
      payload.pedido_id || 0,
      payload.prefijo || 'FAC'
    )
console.log(
  '🔥 FOLIO_DATA  --satService linea 492',
  JSON.stringify(
    folioData,
    null,
    2
  )
)
    // ==================================================
    // PAYLOAD FACTURAPI (CORREGIDO)
    // ==================================================

    const invoicePayload = {
      customer: customer.id,
      items,

      currency: normalize(payload.currency) || 'MXN',
      payment_form: normalize(payload.payment_form) || '03',
      payment_method: upper(payload.payment_method) || 'PUE',
      use: upper(payload.use || payload.use_cfdi) || 'G03',

      external_id: externalId,

      // ==================================================
      // 🔥 FOLIO CONTROLADO POR TU SISTEMA
      // ==================================================
      series: folioData.prefijo,
      folio_number: folioData.folio,
    }

    console.log('\n📤 FACTURAPI PAYLOAD:\n')
    console.dir(invoicePayload, { depth: null })

    // ==================================================
    // CREATE CFDI
    // ==================================================

    const invoice = await withSAT(
      () => facturapi.invoices.create(invoicePayload),
      'emitirCFDI',
      { externalId }
    )

    if (!invoice?.id) {
      throw new Error('CFDI no generado')
    }

    // ==================================================
    // DOWNLOAD FILES
    // ==================================================

    const [pdf, xml] = await Promise.all([
      facturapi.invoices.downloadPdf(invoice.id),
      facturapi.invoices.downloadXml(invoice.id),
    ])

    // ==================================================
    // LOG SUCCESS
    // ==================================================

    await log({
      tipo: 'sat_emitir_success',
      response_data: {
        uuid: invoice.uuid,
        invoiceId: invoice.id,
        folio: folioData.numeroFactura,
      },
    })

    // ==================================================
    // RESPONSE
    // ==================================================

    return {
      success: true,

      invoiceId: invoice.id,
      uuid: invoice.uuid,

      // 🔥 IMPORTANTE: folio real del sistema
      folio: folioData.numeroFactura,

      total: invoice.total,
      subtotal: invoice.subtotal,
      currency: invoice.currency,
      status: invoice.status,
      verification_url: invoice.verification_url,

      pdfBuffer: await streamToBuffer(pdf),
      xmlBuffer: await streamToBuffer(xml),
    }

  } catch (error) {

    console.error('\n❌ SAT SERVICE ERROR:\n')
    console.dir({
      message: error.message,
      response: error?.response?.data,
    }, { depth: null })

    await log({
      tipo: 'sat_emitir_error',
      error: error.message,
    })

    throw error
  }
}

// ======================================================
// CANCELAR CFDI
// ======================================================

export async function cancelarCFDI(
  invoiceId,
  motive = '02'
) {

  return withSAT(

    () =>
      facturapi.invoices.cancel(
        invoiceId,
        {
          motive
        }
      ),

    'cancelarCFDI',

    {
      invoiceId,
      motive,
    }

  )

}

// ======================================================
// HEALTH CHECK
// ======================================================

export async function satHealthCheck() {

  try {

    await facturapi.invoices.list({
      limit: 1
    })

    return {

      success: true,

      healthy: true,

      provider: PAC,

    }

  } catch (e) {

    return {

      success: false,

      healthy: false,

      error: e.message,

    }

  }

}

// ======================================================
// EXPORT
// ======================================================

export default {

  emitirCFDI,

  cancelarCFDI,

  buscarClientePAC,

  crearClientePAC,

  obtenerOCrearClientePAC,

  satHealthCheck,

}
