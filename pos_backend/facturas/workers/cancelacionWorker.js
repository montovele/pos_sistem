// facturas/workers/cancelacionWorker.js
// WORKER EMPRESARIAL CANCELACIÓN CFDI
// SAT + PAC + WooCommerce + Auditoría + Retry

import { Worker } from 'bullmq'

import redis from '../config/redis.js'

import {
  getFacturaById,
  updateFacturaStatus,
  saveFacturaArchivos,
} from '../repositories/facturaRepository.js'

import {
  insertLog,
} from '../repositories/logsRepository.js'

import {
  cancelarCFDI,
} from '../services/satService.js'

import {
  syncFacturaWoo,
} from '../services/facturaSyncService.js'

// ======================================================
// CONFIG
// ======================================================

const VALID_MOTIVOS = [
  '01',
  '02',
  '03',
  '04',
]

const CONCURRENCY =
  Number(
    process.env
      .CANCELACION_WORKER_CONCURRENCY
  ) || 3

// ======================================================
// HELPERS
// ======================================================

function parseMeta(
  meta
) {
  try {
    if (!meta) {
      return {}
    }

    if (
      typeof meta ===
      'string'
    ) {
      return JSON.parse(
        meta
      )
    }

    return meta
  } catch {
    return {}
  }
}

function validarMotivo(
  motivo,
  uuid_sustitucion
) {
  if (
    !VALID_MOTIVOS.includes(
      motivo
    )
  ) {
    throw new Error(
      `Motivo SAT inválido: ${motivo}`
    )
  }

  // 01 = comprobante emitido con errores con relación
  if (
    motivo === '01' &&
    !uuid_sustitucion
  ) {
    throw new Error(
      'uuid_sustitucion requerido para motivo 01'
    )
  }
}

// ======================================================
// WORKER
// ======================================================

export const cancelacionWorker =
  new Worker(
    'cancelacion-cfdi',

    async (job) => {
      const startedAt =
        Date.now()

      const {
        factura_id,
        motivo = '02',
        uuid_sustitucion = null,
        force = false,
      } = job.data || {}

      let factura = null

      try {
        // ============================================
        // VALIDACIONES
        // ============================================

        if (!factura_id) {
          throw new Error(
            'factura_id requerido'
          )
        }

        validarMotivo(
          motivo,
          uuid_sustitucion
        )

        // ============================================
        // FACTURA
        // ============================================

        factura =
          await getFacturaById(
            factura_id
          )

        if (!factura) {
          throw new Error(
            `Factura ${factura_id} no encontrada`
          )
        }

        // ============================================
        // VALIDAR UUID
        // ============================================

        if (!factura.uuid) {
          throw new Error(
            'Factura sin UUID timbrado'
          )
        }

        // ============================================
        // VALIDAR ESTATUS
        // ============================================

        if (
          factura.estatus ===
            'cancelada' &&
          !force
        ) {
          return {
            success: true,
            already_cancelled: true,
            factura_id,
            uuid:
              factura.uuid,
          }
        }

        if (
          factura.estatus ===
            'cancelando' &&
          !force
        ) {
          return {
            success: true,
            skipped: true,
            reason:
              'Factura ya en proceso de cancelación',
          }
        }

        // ============================================
        // UPDATE STATUS
        // ============================================

        await updateFacturaStatus(
          factura_id,
          'cancelando'
        )

        // ============================================
        // LOG REQUEST
        // ============================================

        await insertLog({
          factura_id,

          tipo:
            'cancelacion_request',

          request_data: {
            uuid:
              factura.uuid,

            motivo,

            uuid_sustitucion,

            factura_status:
              factura.estatus,
          },
        })

        // ============================================
        // CANCELAR CFDI PAC
        // ============================================

        const response =
          await cancelarCFDI({
            uuid:
              factura.uuid,

            motivo,

            uuid_sustitucion,
          })

        // ============================================
        // VALIDAR RESPUESTA PAC
        // ============================================

        if (
          !response?.success
        ) {
          throw new Error(
            response?.message ||
              'Error cancelando CFDI'
          )
        }

        // ============================================
        // META
        // ============================================

        const currentMeta =
          parseMeta(
            factura.meta
          )

        const newMeta = {
          ...currentMeta,

          cancelacion: {
            cancelled_at:
              new Date().toISOString(),

            motivo,

            uuid_sustitucion,

            response,
          },
        }

        // ============================================
        // SAVE META
        // ============================================

        await saveFacturaArchivos(
          factura_id,
          newMeta
        )

        // ============================================
        // UPDATE STATUS
        // ============================================

        await updateFacturaStatus(
          factura_id,
          'cancelada'
        )

        // ============================================
        // LOG RESPONSE
        // ============================================

        await insertLog({
          factura_id,

          tipo:
            'cancelacion_response',

          response_data: {
            success: true,

            uuid:
              factura.uuid,

            motivo,

            duration_ms:
              Date.now() -
              startedAt,

            response,
          },
        })

        // ============================================
        // WOO SYNC
        // ============================================

        if (
          factura.woo_order_id
        ) {
          try {
            await syncFacturaWoo(
              factura.woo_order_id,
              {
                factura_cancelada:
                  true,

                factura_uuid:
                  factura.uuid,

                factura_status:
                  'cancelada',

                cancelacion_motivo:
                  motivo,

                cancelacion_fecha:
                  new Date().toISOString(),
              }
            )
          } catch (
            wooError
          ) {
            console.error(
              'Woo sync cancelacion error:',
              wooError.message
            )

            await insertLog({
              factura_id,

              tipo:
                'cancelacion_woo_error',

              error:
                wooError.message,
            })
          }
        }

        // ============================================
        // RESPONSE
        // ============================================

        return {
          success: true,

          factura_id,

          uuid:
            factura.uuid,

          status:
            'cancelada',

          duration_ms:
            Date.now() -
            startedAt,
        }
      } catch (error) {
        console.error(
          'cancelacionWorker error:',
          {
            factura_id,
            error:
              error.message,
          }
        )

        // ============================================
        // UPDATE STATUS
        // ============================================

        if (factura_id) {
          try {
            await updateFacturaStatus(
              factura_id,
              'cancelacion_error'
            )
          } catch (
            statusError
          ) {
            console.error(
              'updateFacturaStatus error:',
              statusError.message
            )
          }
        }

        // ============================================
        // LOG ERROR
        // ============================================

        try {
          await insertLog({
            factura_id,

            tipo:
              'cancelacion_error',

            error:
              error.message,

            request_data: {
              motivo,
              uuid_sustitucion,
            },
          })
        } catch (
          logError
        ) {
          console.error(
            'insertLog error:',
            logError.message
          )
        }

        throw error
      }
    },

    {
      connection: redis,

      concurrency:
        CONCURRENCY,

      removeOnComplete: {
        count: 200,
      },

      removeOnFail: {
        count: 500,
      },

      limiter: {
        max:
          Number(
            process.env
              .CANCELACION_RATE_MAX
          ) || 10,

        duration:
          Number(
            process.env
              .CANCELACION_RATE_DURATION
          ) || 1000,
      },
    }
  )

// ======================================================
// EVENTOS
// ======================================================

cancelacionWorker.on(
  'completed',
  (
    job,
    result
  ) => {
    console.log(
      `✅ Cancelación completada`,
      {
        jobId:
          job.id,

        factura_id:
          job.data
            ?.factura_id,

        result,
      }
    )
  }
)

cancelacionWorker.on(
  'failed',
  (
    job,
    error
  ) => {
    console.error(
      `❌ Cancelación fallida`,
      {
        jobId:
          job?.id,

        factura_id:
          job?.data
            ?.factura_id,

        attempts:
          job?.attemptsMade,

        error:
          error.message,
      }
    )
  }
)

cancelacionWorker.on(
  'active',
  (
    job
  ) => {
    console.log(
      `🚀 Cancelación iniciada`,
      {
        jobId:
          job.id,

        factura_id:
          job.data
            ?.factura_id,
      }
    )
  }
)

cancelacionWorker.on(
  'stalled',
  (
    jobId
  ) => {
    console.warn(
      `⚠️ Job stalled`,
      {
        jobId,
      }
    )
  }
)

cancelacionWorker.on(
  'error',
  (
    error
  ) => {
    console.error(
      '❌ Worker Error:',
      error
    )
  }
)

// ======================================================
// SHUTDOWN
// ======================================================

async function gracefulShutdown() {
  console.log(
    '🛑 Cerrando cancelacionWorker...'
  )

  try {
    await cancelacionWorker.close()

    console.log(
      '✅ cancelacionWorker cerrado correctamente'
    )

    process.exit(0)
  } catch (error) {
    console.error(
      '❌ Error cerrando cancelacionWorker:',
      error
    )

    process.exit(1)
  }
}

process.on(
  'SIGINT',
  gracefulShutdown
)

process.on(
  'SIGTERM',
  gracefulShutdown
)