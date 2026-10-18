// ======================================================
// facturas/services/cfdiOrchestratorService.js
// ORQUESTADOR CENTRAL CFDI 4.0 ENTERPRISE
// SAT + DB + STORAGE + LOCKS + LOGS + IDEMPOTENCY
// VERSION DEADLOCK SAFE + POST COMMIT LOGGING
// ======================================================

import { emitirCFDI } from './satService.js'

import {
  withTransaction,
} from './transactionService.js'

import storageService from './storageService.js'

import {
  withIdempotencyLock,
} from '../repositories/locksRepository.js'

import {
  insertLog,
} from '../repositories/logsRepository.js'

import {
  insertFactura,
  updateFacturaTimbrada,
  updateFacturaError,
} from '../repositories/facturaRepository.js'

// ======================================================
// SYSTEM
// ======================================================

const SYSTEM =
  'cfdiOrchestrator'

// ======================================================
// SAFE ASYNC LOG
// IMPORTANT:
// - NEVER BLOCK FLOW
// - NEVER THROW
// - NEVER USE TX CONNECTION
// ======================================================

async function logSafe(
  payload = {}
) {

  try {

    await insertLog({
      ...payload,
      source: SYSTEM,
    })

  } catch (err) {

    console.error(
      '[LOG FAIL]',
      err.message
    )

  }

}

// ======================================================
// NON BLOCKING POST COMMIT LOG
// ======================================================

function dispatchLog(
  payload = {}
) {

  setImmediate(async () => {

    await logSafe(payload)

  })

}

// ======================================================
// LOCK KEY BUILDER
// ======================================================

function buildLockKey(
  payload = {}
) {

  return `cfdi_${
    payload.pedido_id ||
    payload.woo_order_id ||
    'unknown'
  }`

}

// ======================================================
// VALIDATE CFDI RESPONSE
// ======================================================

function validateCFDI(
  cfdi = {}
) {

  if (
    !cfdi?.invoiceId
  ) {

    throw new Error(
      'invoiceId requerido desde PAC'
    )

  }

  if (
    !cfdi?.uuid
  ) {

    throw new Error(
      'uuid requerido desde PAC'
    )

  }

}
// ======================================================
// MAIN ORCHESTRATION
// CFDI ORCHESTRATOR (MULTI TENANT SAFE)
// ======================================================

export async function emitirCFDIOrquestado(
  payload = {}
) {

  // ====================================================
  // NORMALIZAR CONTEXTO
  // ====================================================

  const proveedor_id =
    Number(
      payload?.proveedor_id
    ) || null

  if (!proveedor_id) {

    throw new Error(
      'proveedor_id requerido'
    )

  }

  payload = {

    ...payload,

    proveedor_id,

    metadata: {

      ...(payload.metadata || {}),

      proveedor_id,

    }

  }

  const lockKey =
    buildLockKey(payload)

  // ====================================================
  // PRE LOG
  // ====================================================

  dispatchLog({

    tipo:
      'cfdi_orchestrator_start',

    proveedor_id,

    request_data:
      payload,

    woo_order_id:
      payload.woo_order_id,

    meta: {

      pedido_id:
        payload.pedido_id,

      proveedor_id,

    },

  })

  return withIdempotencyLock(

    lockKey,

    async () => {

      let txResult = null

      try {

        txResult =
          await withTransaction(

            async (
              connection
            ) => {

              // ========================================
              // CFDI
              // ========================================

              const cfdi =
                await emitirCFDI({

                  ...payload,

                  proveedor_id,

                })

              validateCFDI(
                cfdi
              )

              // ========================================
              // STORAGE
              // ========================================

              const storage =
                await storageService
                  .saveCFDIFiles({

                    uuid:
                      cfdi.uuid,

                    pdfBuffer:
                      cfdi.pdfBuffer,

                    xmlBuffer:
                      cfdi.xmlBuffer,

                    serie:
                      cfdi.serie ||
                      'CFDI',

                    proveedor_id,

                  })

              // ========================================
              // INSERT FACTURA
              // ========================================

              const facturaId =
                await insertFactura(

                  {

                    proveedor_id,

                    pedido_id:
                      payload.pedido_id,

                    woo_order_id:
                      payload.woo_order_id,

                    cliente_fiscal_id:
                      payload.cliente_fiscal_id,

                    uuid:
                      cfdi.uuid,

                    invoice_id:
                      cfdi.invoiceId,

                    subtotal:
                      cfdi.subtotal || 0,

                    iva:
                      cfdi.iva || 0,

                    total:
                      cfdi.total || 0,

                    moneda:
                      cfdi.currency ||
                      'MXN',

                    proveedor_pac:
                      'FACTURAPI',

                    uso_cfdi:
                      payload.use_cfdi,

                    metodo_pago:
                      payload.payment_method,

                    forma_pago:
                      payload.payment_form,

                    request_data: {

                      ...payload,

                      proveedor_id,

                    },

                    response_data:
                      cfdi,

                    idempotency_key:
                      lockKey,

                    estatus:
                      'emitida',

                  },

                  connection

                )

              // ========================================
              // UPDATE FACTURA
              // ========================================

              await updateFacturaTimbrada(

                facturaId,

                {

                  proveedor_id,

                  uuid:
                    cfdi.uuid,

                  xml_path:
                    storage?.xml
                      ?.relativePath,

                  pdf_path:
                    storage?.pdf
                      ?.relativePath,

                  xml_url:
                    storage?.xml
                      ?.publicUrl,

                  pdf_url:
                    storage?.pdf
                      ?.publicUrl,

                  verification_url:
                    cfdi
                      .verification_url,

                  response_data:
                    cfdi,

                },

                connection

              )

              return {

                facturaId,

                cfdi,

                storage,

                proveedor_id,

              }

            }

          )

        // ==========================================
        // SUCCESS LOG
        // ==========================================

        dispatchLog({

          tipo:
            'cfdi_orchestrator_success',

          proveedor_id,

          factura_id:
            txResult.facturaId,

          woo_order_id:
            payload.woo_order_id,

          uuid:
            txResult.cfdi.uuid,

          meta: {

            pedido_id:
              payload.pedido_id,

            proveedor_id,

            total:
              txResult.cfdi.total,

          },

        })

        return {

          success: true,

          proveedor_id,

          factura_id:
            txResult.facturaId,

          uuid:
            txResult.cfdi.uuid,

          invoiceId:
            txResult.cfdi.invoiceId,

          total:
            txResult.cfdi.total,

          storage:
            txResult.storage,

        }

      } catch (error) {

        try {

          if (
            payload.factura_id
          ) {

            await withTransaction(

              async (
                connection
              ) => {

                await updateFacturaError(

                  payload.factura_id,

                  error.message,

                  connection

                )

              }

            )

          }

        } catch (dbErr) {

          console.error(
            '[UPDATE ERROR]',
            dbErr
          )

        }

        dispatchLog({

          tipo:
            'cfdi_orchestrator_error',

          proveedor_id,

          factura_id:
            payload.factura_id,

          woo_order_id:
            payload.woo_order_id,

          error:
            error.message,

          request_data:
            payload,

          meta: {

            pedido_id:
              payload.pedido_id,

              proveedor_id,

            stack:
              error.stack,

          },

        })

        throw error

      }

    }

  )

}

// ======================================================
// CANCEL CFDI
// ======================================================

export async function cancelarCFDIOrquestado({

  invoiceId,
  facturaId,
  motivo = '02',

}) {

  // ====================================================
  // START LOG
  // ====================================================

  dispatchLog({

    tipo:
      'cfdi_cancel_start',

    factura_id:
      facturaId,

    meta: {
      motivo,
      invoiceId,
    },

  })

  try {

    // ==================================================
    // TX
    // ==================================================

    await withTransaction(
      async (connection) => {

        // FUTURE PAC CANCEL

        await updateFacturaError(

          facturaId,

          `Cancelado: ${motivo}`,

          connection

        )

      }
    )

    // ==================================================
    // SUCCESS LOG
    // ==================================================

    dispatchLog({

      tipo:
        'cfdi_cancel_success',

      factura_id:
        facturaId,

      meta: {
        motivo,
        invoiceId,
      },

    })

    return {

      success: true,

      cancelled: true,

      facturaId,

    }

  } catch (error) {

    // ==================================================
    // ERROR LOG
    // ==================================================

    dispatchLog({

      tipo:
        'cfdi_cancel_error',

      factura_id:
        facturaId,

      level:
        'error',

      error:
        error.message,

      meta: {
        motivo,
        invoiceId,
      },

    })

    throw error

  }

}

// ======================================================
// HEALTH CHECK
// ======================================================

export async function cfdiOrchestratorHealth() {

  try {

    dispatchLog({

      tipo:
        'cfdi_orchestrator_health',

    })

    return {

      success: true,

      healthy: true,

      system: SYSTEM,

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

  emitirCFDIOrquestado,
  cancelarCFDIOrquestado,
  cfdiOrchestratorHealth,

}