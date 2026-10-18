// ======================================================
// facturas/config/facturapi.js
// FACTURAPI CLIENT ENTERPRISE HARDENED
// FINAL VERSION
// CFDI 4.0 + RETRY + TIMEOUT + PAYLOAD SAFE
// ======================================================

import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'

import FacturapiModule from 'facturapi'

import {

  mapConceptosToFacturapi,
  mapCustomerToFacturapi,

} from '../mappers/facturapiMapper.js'

// ======================================================
// __dirname ESM
// ======================================================

const __filename =
  fileURLToPath(import.meta.url)

const __dirname =
  path.dirname(__filename)

// ======================================================
// LOAD ENV
// ======================================================

dotenv.config({

  path: path.resolve(
    __dirname,
    '../../.env'
  ),

})

// ======================================================
// RESOLVE SDK EXPORT
// ======================================================

const Facturapi =

  FacturapiModule?.default ||

  FacturapiModule

// ======================================================
// ENV VALIDATION
// ======================================================

const FACTURAPI_KEY =
  process.env.FACTURAPI_KEY

if (
  !FACTURAPI_KEY ||
  !String(FACTURAPI_KEY).trim()
) {

  throw new Error(
    'FACTURAPI_KEY no configurada'
  )

}

// ======================================================
// SAFE LOG
// ======================================================

if (
  process.env.NODE_ENV !==
  'production'
) {

  console.log(

    '✅ FACTURAPI INITIALIZED:',

    FACTURAPI_KEY.slice(0, 12) + '...'

  )

}

// ======================================================
// CLIENT
// ======================================================

const client =
  new Facturapi(
    FACTURAPI_KEY
  )

// ======================================================
// RETRYABLE ERRORS
// ======================================================

function isRetryableError(
  error
) {

  const status =

    error?.response?.status ||

    error?.status

  return [

    408,
    429,
    500,
    502,
    503,
    504,

  ].includes(status)

}

// ======================================================
// RETRY
// ======================================================

async function retry(
  fn,
  options = {}
) {

  const {

    retries = 3,
    delay = 1000,
    factor = 2,
    label = 'FACTURAPI',

  } = options

  let attempt = 0
  let lastError

  while (attempt < retries) {

    try {

      return await fn(
        attempt + 1
      )

    } catch (error) {

      lastError = error
      attempt++

      console.error(

        `❌ [${label}] intento ${attempt}/${retries}`,

        {

          message:
            error?.message,

          status:
            error?.response?.status,

          details:
            error?.response?.data,

        }

      )

      if (
        !isRetryableError(error)
      ) {

        break

      }

      if (
        attempt >= retries
      ) {

        break

      }

      const waitTime =

        delay *

        Math.pow(
          factor,
          attempt - 1
        )

      await new Promise(
        resolve =>
          setTimeout(
            resolve,
            waitTime
          )
      )

    }

  }

  throw lastError

}

// ======================================================
// TIMEOUT
// ======================================================

async function withTimeout(

  promise,
  timeout = 20000,
  label = 'FACTURAPI_TIMEOUT'

) {

  let timeoutId

  const timeoutPromise =
    new Promise((_, reject) => {

      timeoutId =
        setTimeout(() => {

          reject(

            new Error(
              `[${label}] timeout ${timeout}ms`
            )

          )

        }, timeout)

    })

  try {

    return await Promise.race([

      promise,
      timeoutPromise,

    ])

  } finally {

    clearTimeout(timeoutId)

  }

}

// ======================================================
// SANITIZE RESPONSE
// ======================================================

function sanitizeInvoiceResponse(
  invoice = {}
) {

  return {

    id:
      invoice.id,

    uuid:
      invoice.uuid,

    folio:
      invoice.folio_number,

    series:
      invoice.series,

    status:
      invoice.status,

    total:
      invoice.total,

    subtotal:
      invoice.subtotal,

    currency:
      invoice.currency,

    verification_url:
      invoice.verification_url,

  }

}

// ======================================================
// FACTURAPI ENTERPRISE
// ======================================================

const facturapi = {

  // ====================================================
  // RAW
  // ====================================================

  raw:
    client,

  customers:
    client.customers,

  invoices:
    client.invoices,

  products:
    client.products,

  organizations:
    client.organizations,

  // ====================================================
  // SAFE
  // ====================================================

  async safe(
    fn,
    label = 'FACTURAPI_SAFE',
    options = {}
  ) {

    return retry(

      () => withTimeout(

        Promise.resolve(
          fn()
        ),

        options.timeout ||
        20000,

        label

      ),

      {

        retries:
          options.retries || 3,

        delay:
          options.delay || 1000,

        factor:
          options.factor || 2,

        label,

      }

    )

  },

  // ====================================================
  // REQUEST
  // ====================================================

  async request(
    fn,
    label = 'FACTURAPI_REQUEST'
  ) {

    return this.safe(
      fn,
      label
    )

  },

  // ====================================================
  // CREATE CFDI
  // ====================================================

  async createInvoice({

    clienteFiscal,
    conceptos,

    serie = 'A',

    folio = null,

    payment_form = '03',

    payment_method = 'PUE',

    currency = 'MXN',

    use = 'G03',

    metadata = {},

  }) {

    const payload = {

      customer:
        mapCustomerToFacturapi(
          clienteFiscal
        ),

      items:
        mapConceptosToFacturapi(
          conceptos
        ),

      payment_form,

      payment_method,

      currency,

      use,

      series:
        serie,

      folio_number:
        folio,

      metadata,

    }

    try {

      this.log(
        'CREATE_INVOICE_PAYLOAD',
        payload
      )

      const invoice =
        await this.request(

          () =>
            this.invoices.create(
              payload
            ),

          'FACTURAPI_CREATE_INVOICE'

        )

      return {

        success: true,

        data:
          invoice,

        sanitized:
          sanitizeInvoiceResponse(
            invoice
          ),

      }

    } catch (error) {

      console.error(
        '❌ FACTURAPI CREATE ERROR',
        {

          message:
            error?.message,

          status:
            error?.response?.status,

          data:
            error?.response?.data,

        }
      )

      throw new Error(

        error?.response?.data?.message ||

        error?.message ||

        'Error creando CFDI'

      )

    }

  },

  // ====================================================
  // LOGGER
  // ====================================================

  log(
    type,
    data = {}
  ) {

    if (
      process.env.NODE_ENV ===
      'production'
    ) {

      return

    }

    console.log({

      source:
        'FACTURAPI',

      type,

      timestamp:
        new Date()
          .toISOString(),

      data,

    })

  },

  // ====================================================
  // HEALTH CHECK
  // ====================================================

  async healthCheck() {

    try {

      await this.request(

        () =>
          this.customers.list({
            limit: 1,
          }),

        'FACTURAPI_HEALTH'

      )

      return {

        success: true,
        healthy: true,
        provider: 'FACTURAPI',

      }

    } catch (error) {

      return {

        success: false,
        healthy: false,

        error:
          error?.message,

      }

    }

  },

}

// ======================================================
// EXPORT
// ======================================================

export default facturapi
