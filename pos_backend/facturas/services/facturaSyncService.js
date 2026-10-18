// ======================================================
// facturas/services/facturaSyncService.js
// VERSION ENTERPRISE ROBUSTA FINAL
// WOO SYNC + IDEMPOTENCY + AUDITORIA
// RESILIENCIA CENTRALIZADA
// STATUS MACHINE INTEGRATION
// COMPATIBLE CON:
// - facturaOrchestratorService
// - facturaRecoveryService
// - facturaCancelacionService
// - facturaStatusService
// ======================================================

import WooCommerceRestApiModule
  from '@woocommerce/woocommerce-rest-api'

import {
  insertLog,
} from '../repositories/logsRepository.js'

import {
  executeWithResilience,
  isRetryableError,
} from './resiliencePolicyService.js'

import {

  changeFacturaStatus,
  markFacturaError,

} from './facturaStatusService.js'

// ======================================================
// API MODULE
// ======================================================

const WooCommerceRestApi =
  WooCommerceRestApiModule.default ||
  WooCommerceRestApiModule

// ======================================================
// CONFIG
// ======================================================

const REQUEST_TIMEOUT =
  Number(
    process.env.WOO_TIMEOUT
  ) || 30000

// ======================================================
// VALIDAR CONFIG
// ======================================================

function validarConfiguracionWoo() {

  const required = [

    'WOO_API_URL',
    'WOO_KEY',
    'WOO_SECRET',

  ]

  for (const env of required) {

    if (!process.env[env]) {

      throw new Error(
        `Variable ${env} requerida`
      )

    }

  }

}

// ======================================================
// API INSTANCE
// ======================================================

const api =
  new WooCommerceRestApi({

    url:
      process.env.WOO_API_URL,

    consumerKey:
      process.env.WOO_KEY,

    consumerSecret:
      process.env.WOO_SECRET,

    version: 'wc/v3',

    queryStringAuth: true,

    timeout:
      REQUEST_TIMEOUT,

  })

// ======================================================
// HELPERS
// ======================================================

function sanitizeValue(
  value
) {

  if (
    value === undefined ||
    value === null
  ) {

    return ''

  }

  if (
    typeof value ===
    'object'
  ) {

    return JSON.stringify(
      value
    )

  }

  return String(value)

}

// ======================================================

function sanitizeError(
  error
) {

  return {

    message:
      error?.message ||
      'Error desconocido',

    code:
      error?.code || null,

    status:
      error?.status || null,

    details:
      error?.details || null,

    stack:
      error?.stack || null,

  }

}

// ======================================================

function normalizeWooOrderId(
  wooOrderId
) {

  const parsed =
    Number(wooOrderId)

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {

    throw new Error(
      'wooOrderId inválido'
    )

  }

  return parsed

}

// ======================================================

function buildWooError(
  error,
  context = ''
) {

  const message =

    error?.response?.data?.message ||

    error?.response?.data?.code ||

    error?.message ||

    'WooCommerce error'

  const customError =
    new Error(

      context
        ? `[${context}] ${message}`
        : message

    )

  customError.status =

    error?.response?.status ||

    error?.status ||

    500

  customError.details =

    error?.response?.data ||

    error?.details ||

    null

  customError.original =
    error

  customError.code =

    error?.code ||

    error?.response?.data?.code ||

    'WOO_ERROR'

  return customError

}

// ======================================================
// RETRY EXECUTOR
// ======================================================

async function withRetry(
  fn,
  context = '',
  metadata = {}
) {

  return executeWithResilience({

    fn,

    service:
      'facturaSyncService',

    operation:
      context,

    retryDecider:
      isRetryableError,

    metadata,

  })

}

// ======================================================
// META BUILDER
// ======================================================

function buildMetaData(
  data = {}
) {

  const meta = []

  const add = (
    key,
    value
  ) => {

    if (

      value === undefined ||

      value === null ||

      value === ''

    ) {

      return

    }

    meta.push({

      key,

      value:
        sanitizeValue(
          value
        ),

    })

  }

  // ==================================================
  // CFDI
  // ==================================================

  add(
    '_factura_uuid',
    data.uuid
  )

  add(
    '_factura_status',
    data.factura_status ||
    'emitida'
  )

  add(
    '_factura_pdf',
    data.pdf_url
  )

  add(
    '_factura_xml',
    data.xml_url
  )

  add(
    '_factura_pdf_custom',
    data.pdf_custom_url
  )

  add(
    '_factura_sat_pdf',
    data.sat_pdf_url
  )

  add(
    '_factura_verification_url',
    data.verification_url
  )

  add(
    '_factura_serie',
    data.serie
  )

  add(
    '_factura_folio',
    data.folio
  )

  add(
    '_factura_numero',
    data.numero_factura
  )

  add(
    '_factura_fecha_timbrado',
    data.fecha_timbrado
  )

  add(
    '_factura_total',
    data.total
  )

  add(
    '_factura_subtotal',
    data.subtotal
  )

  add(
    '_factura_iva',
    data.iva
  )

  // ==================================================
  // CANCELACION
  // ==================================================

  add(
    '_factura_cancelada',
    data.factura_cancelada
  )

  add(
    '_factura_cancelacion_fecha',
    data.cancelacion_fecha
  )

  add(
    '_factura_cancelacion_motivo',
    data.cancelacion_motivo
  )

  // ==================================================
  // EXTRA META
  // ==================================================

  if (

    data.extra_meta &&

    typeof data.extra_meta ===
      'object'

  ) {

    Object.entries(
      data.extra_meta
    ).forEach(

      ([key, value]) => {

        add(
          key,
          value
        )

      }

    )

  }

  return meta

}

// ======================================================
// GET ORDER
// ======================================================

export async function getWooOrder(
  wooOrderId
) {

  try {

    validarConfiguracionWoo()

    const id =
      normalizeWooOrderId(
        wooOrderId
      )

    const response =
      await withRetry(

        () =>
          api.get(
            `orders/${id}`
          ),

        'getWooOrder',

        {
          woo_order_id: id,
        }

      )

    return response.data

  } catch (error) {

    throw buildWooError(
      error,
      'getWooOrder'
    )

  }

}

// ======================================================
// VERIFY ORDER EXISTS
// ======================================================

async function verifyWooOrderExists(
  wooOrderId
) {

  const order =
    await getWooOrder(
      wooOrderId
    )

  if (!order?.id) {

    throw new Error(
      'Orden WooCommerce no encontrada'
    )

  }

  return order

}

// ======================================================
// IDEMPOTENCY CHECK
// ======================================================

function alreadySynced(
  order = {},
  uuid
) {

  if (!uuid) {
    return false
  }

  const meta =
    order.meta_data || []

  const existing =
    meta.find(

      item =>
        item.key ===
        '_factura_uuid'

    )

  return (
    existing?.value ===
    String(uuid)
  )

}

// ======================================================
// MAIN SYNC
// ======================================================

export async function syncFacturaWoo(
  wooOrderId,
  data = {}
) {

  let facturaId =

    data.factura_id ||

    data.id_factura ||

    null

  try {

    validarConfiguracionWoo()

    const normalizedId =
      normalizeWooOrderId(
        wooOrderId
      )

    // ==================================================
    // STATUS -> syncing
    // ==================================================

    if (
      facturaId
    ) {

      await changeFacturaStatus({

        facturaId,

        nextStatus:
          'syncing',

        source:
          'facturaSyncService',

        metadata: {

          woo_order_id:
            normalizedId,

        },

      })

    }

    // ==================================================
    // VERIFY ORDER
    // ==================================================

    const order =
      await verifyWooOrderExists(
        normalizedId
      )

    // ==================================================
    // IDEMPOTENCY
    // ==================================================

    if (

      alreadySynced(
        order,
        data.uuid
      )

    ) {

      // ================================================
      // RETURN STATUS
      // ================================================

      if (
        facturaId
      ) {

        await changeFacturaStatus({

          facturaId,

          nextStatus:
            'emitida',

          source:
            'facturaSyncService',

          metadata: {

            duplicated:
              true,

          },

        })

      }

      return {

        success: true,

        duplicated: true,

        woo_order_id:
          normalizedId,

        uuid:
          data.uuid,

      }

    }

    // ==================================================
    // BUILD META
    // ==================================================

    const metaData =
      buildMetaData(
        data
      )

    if (
      !metaData.length
    ) {

      throw new Error(
        'No hay metadata para sincronizar'
      )

    }

    // ==================================================
    // PAYLOAD
    // ==================================================

    const payload = {

      meta_data:
        metaData,

    }

    // ==================================================
    // REQUEST
    // ==================================================

    const response =
      await withRetry(

        () =>
          api.put(
            `orders/${normalizedId}`,
            payload
          ),

        'syncFacturaWoo',

        {

          woo_order_id:
            normalizedId,

          uuid:
            data.uuid,

          factura_id:
            facturaId,

        }

      )

    // ==================================================
    // STATUS -> emitida
    // ==================================================

    if (
      facturaId
    ) {

      await changeFacturaStatus({

        facturaId,

        nextStatus:
          'emitida',

        source:
          'facturaSyncService',

        metadata: {

          woo_order_id:
            normalizedId,

          synced:
            true,

        },

      })

    }

    // ==================================================
    // LOG SUCCESS
    // ==================================================

    await safeLog({

      factura_id:
        facturaId,

      tipo:
        'woo_sync_success',

      request_data: {

        woo_order_id:
          normalizedId,

        payload,

      },

      response_data: {

        uuid:
          data.uuid,

        status:
          response?.status,

      },

    })

    // ==================================================
    // RESPONSE
    // ==================================================

    return {

      success: true,

      synced: true,

      woo_order_id:
        normalizedId,

      uuid:
        data.uuid,

      meta_synced:
        metaData.length,

      response:
        response.data,

    }

  } catch (error) {

    // ==================================================
    // STATUS ERROR
    // ==================================================

    if (
      facturaId
    ) {

      try {

        await markFacturaError({

          facturaId,

          error,

          source:
            'facturaSyncService',

        })

      } catch (
        statusError
      ) {

        console.error(
          '❌ markFacturaError:',
          statusError.message
        )

      }

    }

    // ==================================================
    // LOG ERROR
    // ==================================================

    await safeLog({

      factura_id:
        facturaId,

      tipo:
        'woo_sync_error',

      error:
        error.message,

      request_data: {

        wooOrderId,

        data,

      },

      response_data:
        sanitizeError(
          error
        ),

    })

    console.error(
      '❌ syncFacturaWoo error:',
      error
    )

    throw buildWooError(
      error,
      'syncFacturaWoo'
    )

  }

}

// ======================================================
// BULK SYNC
// ======================================================

export async function syncFacturasWooBulk(
  items = []
) {

  const results = []

  for (const item of items) {

    try {

      const result =
        await syncFacturaWoo(

          item.wooOrderId,

          item.data

        )

      results.push({

        success: true,

        wooOrderId:
          item.wooOrderId,

        result,

      })

    } catch (error) {

      results.push({

        success: false,

        wooOrderId:
          item.wooOrderId,

        error:
          error.message,

      })

    }

  }

  return results

}

// ======================================================
// SAFE LOG
// ======================================================

async function safeLog(
  data = {}
) {

  try {

    if (
      typeof insertLog !==
      'function'
    ) {

      return

    }

    await insertLog(data)

  } catch (error) {

    console.error(
      '❌ safeLog error:',
      error.message
    )

  }

}

// ======================================================
// HEALTH CHECK
// ======================================================

export async function wooHealthCheck() {

  try {

    validarConfiguracionWoo()

    const response =
      await withRetry(

        () =>
          api.get(
            'system_status'
          ),

        'wooHealthCheck'

      )

    return {

      success: true,

      healthy: true,

      provider:
        'WooCommerce',

      connected:
        !!response?.data,

    }

  } catch (error) {

    return {

      success: false,

      healthy: false,

      provider:
        'WooCommerce',

      error:
        error.message,

    }

  }

}

// ======================================================
// EXPORT DEFAULT
// ======================================================

export default {

  getWooOrder,

  syncFacturaWoo,

  syncFacturasWooBulk,

  wooHealthCheck,

}