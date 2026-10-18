// facturas/workers/syncWorker.js
// WORKER ROBUSTO DE SINCRONIZACIÓN CFDI
// WooCommerce + Retry + Auditoría + Control de Estado

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
  syncFacturaWoo,
} from '../services/facturaSyncService.js'

// ======================================================
// CONFIG
// ======================================================

const WORKER_CONCURRENCY =
  Number(
    process.env
      .SYNC_WORKER_CONCURRENCY
  ) || 5

const REMOVE_ON_COMPLETE =
  Number(
    process.env
      .SYNC_REMOVE_COMPLETE
  ) || 200

const REMOVE_ON_FAIL =
  Number(
    process.env
      .SYNC_REMOVE_FAIL
  ) || 500

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
  } catch (error) {
    console.error(
      'parseMeta error:',
      error.message
    )

    return {}
  }
}

function validarArchivos(
  meta = {}
) {
  return Boolean(
    meta.pdf_url &&
    meta.xml_url
  )
}

// ======================================================
// WORKER
// ======================================================

export const syncWorker =
  new Worker(
    'sync-cfdi',

    async (job) => {
      const startedAt =
        Date.now()

      const {
        factura_id,
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
        // VALIDAR WOO ORDER
        // ============================================

        if (
          !factura.woo_order_id
        ) {
          throw new Error(
            'Factura sin woo_order_id'
          )
        }

        // ============================================
        // VALIDAR ESTADO
        // ============================================

        if (
          factura.estatus ===
            'syncing' &&
          !force
        ) {
          return {
            success: true,
            skipped: true,
            reason:
              'Factura ya sincronizando',
          }
        }

        // ============================================
        // META
        // ============================================

        const meta =
          parseMeta(
            factura.meta
          )

        if (
          !validarArchivos(
            meta
          )
        ) {
          throw new Error(
            'Factura sin archivos sincronizables'
          )
        }

        // ============================================
        // UPDATE STATUS
        // ============================================

        await updateFacturaStatus(
          factura_id,
          'syncing'
        )

        // ============================================
        // LOG REQUEST
        // ============================================

        await insertLog({
          factura_id,

          tipo:
            'sync_request',

          request_data: {
            woo_order_id:
              factura.woo_order_id,

            uuid:
              factura.uuid,

            meta,
          },
        })

        // ============================================
        // PAYLOAD WOO
        // ============================================

        const syncPayload = {
          uuid:
            factura.uuid,

          factura_id,

          factura_status:
            factura.estatus,

          pdf_url:
            meta.pdf_url,

          xml_url:
            meta.xml_url,

          sat_pdf_url:
            meta.sat_pdf_url,

          verification_url:
            meta.verification_url,

          numero_factura:
            factura.numero_factura,

          serie:
            factura.serie,

          folio:
            factura.folio,
        }

        // ============================================
        // SYNC WOO
        // ============================================

        const syncResponse =
          await syncFacturaWoo(
            factura.woo_order_id,
            syncPayload
          )

        // ============================================
        // UPDATE META
        // ============================================

        await saveFacturaArchivos(
          factura_id,
          {
            ...meta,

            woo_synced:
              true,

            woo_synced_at:
              new Date().toISOString(),

            woo_response:
              syncResponse,
          }
        )

        // ============================================
        // UPDATE STATUS
        // ============================================

        await updateFacturaStatus(
          factura_id,
          'emitida'
        )

        // ============================================
        // LOG RESPONSE
        // ============================================

        await insertLog({
          factura_id,

          tipo:
            'sync_response',

          response_data: {
            synced: true,

            woo_order_id:
              factura.woo_order_id,

            duration_ms:
              Date.now() -
              startedAt,

            response:
              syncResponse,
          },
        })

        // ============================================
        // RESPONSE
        // ============================================

        return {
          success: true,

          factura_id,

          woo_order_id:
            factura.woo_order_id,

          synced: true,

          duration_ms:
            Date.now() -
            startedAt,
        }
      } catch (error) {
        console.error(
          'syncWorker error:',
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
              'sync_error'
            )
          } catch (
            updateError
          ) {
            console.error(
              'updateFacturaStatus error:',
              updateError.message
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
              'sync_error',

            error:
              error.message,

            request_data: {
              factura_id,
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
        WORKER_CONCURRENCY,

      removeOnComplete: {
        count:
          REMOVE_ON_COMPLETE,
      },

      removeOnFail: {
        count:
          REMOVE_ON_FAIL,
      },

      limiter: {
        max:
          Number(
            process.env
              .SYNC_RATE_MAX
          ) || 20,

        duration:
          Number(
            process.env
              .SYNC_RATE_DURATION
          ) || 1000,
      },
    }
  )

// ======================================================
// EVENTOS
// ======================================================

syncWorker.on(
  'completed',
  (
    job,
    result
  ) => {
    console.log(
      `✅ Sync completado`,
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

syncWorker.on(
  'failed',
  (
    job,
    error
  ) => {
    console.error(
      `❌ Sync fallido`,
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

syncWorker.on(
  'active',
  (
    job
  ) => {
    console.log(
      `🚀 Sync iniciado`,
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

syncWorker.on(
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

syncWorker.on(
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
    '🛑 Cerrando syncWorker...'
  )

  try {
    await syncWorker.close()

    console.log(
      '✅ syncWorker cerrado correctamente'
    )

    process.exit(0)
  } catch (error) {
    console.error(
      '❌ Error cerrando syncWorker:',
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