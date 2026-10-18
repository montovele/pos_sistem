// facturas/workers/facturaWorker.js
// WORKER EMPRESARIAL ROBUSTO
// CFDI 4.0 + Retry + Auditoría + Control de Fallos

import { Worker } from 'bullmq'

import redis from '../config/redis.js'

import {
  procesarFacturacion,
} from '../services/facturacionService.js'

import {
  insertLog,
} from '../repositories/logsRepository.js'

// ======================================================
// CONFIG
// ======================================================

const WORKER_CONCURRENCY =
  Number(
    process.env
      .FACTURA_WORKER_CONCURRENCY
  ) || 5

const REMOVE_ON_COMPLETE =
  Number(
    process.env
      .FACTURA_REMOVE_COMPLETE
  ) || 200

const REMOVE_ON_FAIL =
  Number(
    process.env
      .FACTURA_REMOVE_FAIL
  ) || 500

// ======================================================
// WORKER
// ======================================================

export const facturaWorker =
  new Worker(
    'facturacion',

    async (job) => {
      const startedAt =
        Date.now()

      const {
        pedido_id,
      } = job.data || {}

      try {
        console.log(
          `🧾 Procesando factura`,
          {
            jobId:
              job.id,

            pedido_id,
          }
        )

        // ============================================
        // VALIDAR PAYLOAD
        // ============================================

        if (!pedido_id) {
          throw new Error(
            'pedido_id requerido'
          )
        }

        // ============================================
        // PROCESAR FACTURACIÓN
        // ============================================

        const result =
          await procesarFacturacion(
            job.data
          )

        // ============================================
        // LOG SUCCESS
        // ============================================

        try {
          await insertLog({
            factura_id:
              result?.factura_id ||
              null,

            tipo:
              'worker_success',

            request_data: {
              job_id:
                job.id,

              pedido_id,

              duration_ms:
                Date.now() -
                startedAt,
            },

            response_data:
              result,
          })
        } catch (
          logError
        ) {
          console.error(
            'Error log worker success:',
            logError.message
          )
        }

        // ============================================
        // RESULT
        // ============================================

        return {
          success: true,

          job_id:
            job.id,

          pedido_id,

          factura_id:
            result?.factura_id,

          uuid:
            result?.uuid,

          duplicate:
            result?.duplicate ||
            false,

          duration_ms:
            Date.now() -
            startedAt,
        }
      } catch (error) {
        console.error(
          `❌ Error procesando factura`,
          {
            jobId:
              job.id,

            pedido_id,

            error:
              error.message,
          }
        )

        // ============================================
        // LOG ERROR
        // ============================================

        try {
          await insertLog({
            factura_id:
              null,

            tipo:
              'worker_error',

            request_data: {
              job_id:
                job.id,

              pedido_id,
            },

            error:
              error.message,
          })
        } catch (
          logError
        ) {
          console.error(
            'Error log worker error:',
            logError.message
          )
        }

        // ============================================
        // RETRY CONTROL
        // ============================================

        if (
          job.attemptsMade >=
          (
            job.opts
              ?.attempts || 1
          ) - 1
        ) {
          console.error(
            `❌ Job agotó retries`,
            {
              jobId:
                job.id,

              pedido_id,
            }
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
              .FACTURA_WORKER_RATE_MAX
          ) || 20,

        duration:
          Number(
            process.env
              .FACTURA_WORKER_RATE_DURATION
          ) || 1000,
      },
    }
  )

// ======================================================
// EVENTOS
// ======================================================

facturaWorker.on(
  'completed',
  async (
    job,
    result
  ) => {
    console.log(
      `✅ Facturación completada`,
      {
        jobId:
          job.id,

        pedido_id:
          job.data
            ?.pedido_id,

        factura_id:
          result?.factura_id,

        uuid:
          result?.uuid,
      }
    )
  }
)

facturaWorker.on(
  'failed',
  async (
    job,
    error
  ) => {
    console.error(
      `❌ Facturación fallida`,
      {
        jobId:
          job?.id,

        pedido_id:
          job?.data
            ?.pedido_id,

        attempts:
          job?.attemptsMade,

        error:
          error.message,
      }
    )
  }
)

facturaWorker.on(
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

facturaWorker.on(
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

facturaWorker.on(
  'active',
  (
    job
  ) => {
    console.log(
      `🚀 Job activo`,
      {
        jobId:
          job.id,

        pedido_id:
          job.data
            ?.pedido_id,
      }
    )
  }
)

// ======================================================
// SHUTDOWN GRACEFUL
// ======================================================

async function gracefulShutdown() {
  console.log(
    '🛑 Cerrando facturaWorker...'
  )

  try {
    await facturaWorker.close()

    console.log(
      '✅ facturaWorker cerrado correctamente'
    )

    process.exit(0)
  } catch (error) {
    console.error(
      '❌ Error cerrando facturaWorker:',
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