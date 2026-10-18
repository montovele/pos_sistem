// ======================================================
// facturas/services/facturaCancelacionService.js
// SERVICIO EMPRESARIAL DE CANCELACION CFDI
// VERSION ENTERPRISE FINAL
// SAT + WOO + RESILIENCIA + AUDITORIA
// CENTRALIZADO CON facturaStatusService
// ======================================================

import {

  cancelarCFDI,

} from './satService.js'

import {

  syncFacturaWoo,

} from './facturaSyncService.js'

import {

  withTransaction,

} from './transactionService.js'

import {

  executeWithResilience,

  isRetryableError,

} from './resiliencePolicyService.js'

import {

  changeFacturaStatus,

  markFacturaError,

} from './facturaStatusService.js'

import {

  getFacturaById,

  updateFacturaCancelada,

} from '../repositories/facturaRepository.js'

import {

  insertLog,

} from '../repositories/logsRepository.js'

import {

  lockFacturaOperacion,

} from '../repositories/facturaLocksRepository.js'

// ======================================================
// CONFIG
// ======================================================

const MOTIVOS_VALIDOS = [

  '01',
  '02',
  '03',
  '04',

]

// ======================================================
// HELPERS
// ======================================================

function validarMotivo(
  motivo
) {

  if (
    !MOTIVOS_VALIDOS.includes(
      motivo
    )
  ) {

    throw new Error(
      'Motivo SAT inválido'
    )

  }

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

    stack:
      error?.stack || null,

  }

}

// ======================================================

function buildCancelacionResponse(
  factura,
  motivo,
  satResponse = {}
) {

  return {

    success: true,

    factura_id:
      factura.id_factura,

    uuid:
      factura.uuid,

    cancelada: true,

    motivo,

    fecha_cancelacion:
      new Date()
        .toISOString(),

    sat_response:
      satResponse,

  }

}

// ======================================================
// VALIDAR FACTURA
// ======================================================

function validarFacturaCancelable(
  factura
) {

  if (!factura) {

    throw new Error(
      'Factura no encontrada'
    )

  }

  if (!factura.uuid) {

    throw new Error(
      'UUID inválido'
    )

  }

  if (

    factura.estatus ===
    'cancelada'

  ) {

    throw new Error(
      'FACTURA_YA_CANCELADA'
    )

  }

  if (

    factura.estatus ===
    'cancelando'

  ) {

    throw new Error(
      'FACTURA_EN_CANCELACION'
    )

  }

  if (

    factura.estatus !==
    'emitida'

  ) {

    throw new Error(
      'Factura no cancelable'
    )

  }

}

// ======================================================
// RESILIENCE WRAPPER
// ======================================================

async function withRetry(
  fn,
  operation = '',
  metadata = {}
) {

  return executeWithResilience({

    fn,

    service:
      'facturaCancelacionService',

    operation,

    retryDecider:
      isRetryableError,

    metadata,

  })

}

// ======================================================
// SAFE LOG
// ======================================================

async function safeLog(
  data = {}
) {

  try {

    await insertLog(data)

  } catch (error) {

    console.error(
      '❌ safeLog error:',
      error.message
    )

  }

}

// ======================================================
// SAFE WOO SYNC
// ======================================================

async function safeWooCancelSync({

  factura,

  motivo,

}) {

  try {

    const wooOrderId =

      factura.woo_order_id ||

      factura.id_woocommerce ||

      factura.pedido_woo_id

    if (!wooOrderId) {

      return

    }

    // ==============================================
    // STATUS SYNCING
    // ==============================================

    await changeFacturaStatus({

      facturaId:
        factura.id_factura,

      nextStatus:
        'syncing',

      source:
        'facturaCancelacionService',

      metadata: {

        action:
          'woo_cancel_sync_start',

      },

    })

    await syncFacturaWoo(

      wooOrderId,

      {

        uuid:
          factura.uuid,

        factura_cancelada:
          true,

        factura_status:
          'cancelada',

        cancelacion_fecha:
          new Date()
            .toISOString(),

        cancelacion_motivo:
          motivo,

        extra_meta: {

          _factura_cancelada:
            '1',

          _factura_cancelacion_uuid:
            factura.uuid,

          _factura_cancelacion_motivo:
            motivo,

        },

      }

    )

    // ==============================================
    // STATUS RESTORE
    // ==============================================

    await changeFacturaStatus({

      facturaId:
        factura.id_factura,

      nextStatus:
        'cancelada',

      source:
        'facturaCancelacionService',

      metadata: {

        action:
          'woo_cancel_sync_success',

      },

    })

  } catch (error) {

    console.error(
      '❌ safeWooCancelSync:',
      error.message
    )

    try {

      await changeFacturaStatus({

        facturaId:
          factura.id_factura,

        nextStatus:
          'error_sync',

        source:
          'facturaCancelacionService',

        metadata: {

          action:
            'woo_cancel_sync_error',

        },

      })

    } catch (statusError) {

      console.error(
        '❌ status sync error:',
        statusError.message
      )

    }

    await safeLog({

      factura_id:
        factura.id_factura,

      tipo:
        'woo_cancel_sync_error',

      error:
        error.message,

      response_data:
        sanitizeError(
          error
        ),

    })

  }

}

// ======================================================
// MAIN
// ======================================================

export async function cancelarFactura({

  facturaId,

  motivo = '02',

  sustitucion = null,

  usuario = null,

}) {

  let factura = null

  try {

    // ==================================================
    // VALIDACIONES
    // ==================================================

    if (!facturaId) {

      throw new Error(
        'facturaId requerido'
      )

    }

    validarMotivo(
      motivo
    )

    // ==================================================
    // FACTURA
    // ==================================================

    factura =
      await getFacturaById(
        facturaId
      )

    validarFacturaCancelable(
      factura
    )

    // ==================================================
    // LOCK + STATUS
    // ==================================================

    await withTransaction(

      async (connection) => {

        const lockedFactura =

          await lockFacturaOperacion(

            connection,

            factura.id_factura

          )

        if (!lockedFactura) {

          throw new Error(
            'No se pudo bloquear factura'
          )

        }

        if (

          lockedFactura.estatus ===
          'cancelando'

        ) {

          throw new Error(
            'FACTURA_EN_CANCELACION'
          )

        }

        if (

          lockedFactura.estatus ===
          'cancelada'

        ) {

          throw new Error(
            'FACTURA_YA_CANCELADA'
          )

        }

        // ==============================================
        // STATUS CENTRALIZADO
        // ==============================================

        await changeFacturaStatus({

          facturaId:
            factura.id_factura,

          nextStatus:
            'cancelando',

          usuario,

          source:
            'facturaCancelacionService',

          metadata: {

            motivo,
            sustitucion,

          },

          connection,

        })

        // ==============================================
        // LOG
        // ==============================================

        await insertLog({

          factura_id:
            factura.id_factura,

          tipo:
            'cancelacion_iniciada',

          request_data: {

            motivo,

            sustitucion,

            usuario,

          },

        }, connection)

      }

    )

    // ==================================================
    // SAT CANCELACION
    // ==================================================

    const satResponse =
      await withRetry(

        () =>

          cancelarCFDI(

            factura.invoice_id,

            motivo,

            sustitucion

          ),

        'cancelarCFDI',

        {

          factura_id:
            factura.id_factura,

          uuid:
            factura.uuid,

        }

      )

    // ==================================================
    // UPDATE DB
    // ==================================================

    await withTransaction(

      async (connection) => {

        // ==============================================
        // UPDATE FACTURA
        // ==============================================

        await updateFacturaCancelada(

          factura.id_factura,

          {

            estatus:
              'cancelada',

            cancelacion_motivo:
              motivo,

            cancelacion_fecha:
              new Date(),

            cancelacion_sustitucion:
              sustitucion,

            cancelacion_response:
              satResponse,

          },

          connection

        )

        // ==============================================
        // STATUS CENTRALIZADO
        // ==============================================

        await changeFacturaStatus({

          facturaId:
            factura.id_factura,

          nextStatus:
            'cancelada',

          usuario,

          source:
            'facturaCancelacionService',

          metadata: {

            motivo,

            sat:
              true,

          },

          connection,

        })

        // ==============================================
        // LOG SUCCESS
        // ==============================================

        await insertLog({

          factura_id:
            factura.id_factura,

          tipo:
            'cfdi_cancelado',

          response_data: {

            motivo,

            sustitucion,

            satResponse,

          },

        }, connection)

      }

    )

    // ==================================================
    // WOO SYNC
    // ==================================================

    await safeWooCancelSync({

      factura,

      motivo,

    })

    // ==================================================
    // RESPONSE
    // ==================================================

    return buildCancelacionResponse(

      factura,

      motivo,

      satResponse

    )

  } catch (error) {

    console.error(
      '❌ cancelarFactura error:',
      error
    )

    // ==================================================
    // ERROR CENTRALIZADO
    // ==================================================

    if (factura?.id_factura) {

      try {

        await markFacturaError({

          facturaId:
            factura.id_factura,

          error,

          source:
            'facturaCancelacionService',

          usuario,

        })

        await safeLog({

          factura_id:
            factura.id_factura,

          tipo:
            'cancelacion_error',

          error:
            error.message,

          response_data:
            sanitizeError(
              error
            ),

        })

      } catch (logError) {

        console.error(
          '❌ Error logging cancelacion:',
          logError.message
        )

      }

    }

    throw error

  }

}

// ======================================================
// BULK CANCELACION
// ======================================================

export async function cancelarFacturasBulk(
  items = []
) {

  const results = []

  for (const item of items) {

    try {

      const result =
        await cancelarFactura({

          facturaId:
            item.facturaId,

          motivo:
            item.motivo,

          sustitucion:
            item.sustitucion,

          usuario:
            item.usuario,

        })

      results.push({

        success: true,

        facturaId:
          item.facturaId,

        result,

      })

    } catch (error) {

      results.push({

        success: false,

        facturaId:
          item.facturaId,

        error:
          error.message,

      })

    }

  }

  return results

}

// ======================================================
// HEALTH CHECK
// ======================================================

export async function cancelacionHealthCheck() {

  return {

    success: true,

    service:
      'facturaCancelacionService',

    healthy: true,

    timestamp:
      new Date()
        .toISOString(),

  }

}

// ======================================================
// EXPORT DEFAULT
// ======================================================

export default {

  cancelarFactura,

  cancelarFacturasBulk,

  cancelacionHealthCheck,

}