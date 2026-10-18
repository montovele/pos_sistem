// facturas/audit/retries/retryManager.js

import { insertLog } from '../../repositories/logsRepository.js'
import { facturaEvents } from '../../events/facturaEvents.js'

/**
 * =========================================================
 * CONFIG RETRIES
 * =========================================================
 */

const DEFAULT_MAX_RETRIES = 3

const RETRYABLE_ERRORS = [
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'FACTURAPI_TIMEOUT',
  'SAT_TEMPORAL_ERROR',
]

/**
 * =========================================================
 * RETRY WRAPPER
 * =========================================================
 */

export async function withRetry({
  factura_id,
  action,
  context = {},
  maxRetries = DEFAULT_MAX_RETRIES,
}) {
  let lastError = null

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      facturaEvents.emit('factura:retry', {
        factura_id,
        retry: attempt,
        maxRetries,
      })

      const result = await action()

      return result
    } catch (error) {
      lastError = error

      await insertLog({
        factura_id,
        tipo: 'retry_error',
        error: error.message,
        meta: {
          attempt,
          context,
        },
      })

      const isRetryable =
        RETRYABLE_ERRORS.some((code) =>
          error.message?.includes(code)
        )

      if (!isRetryable || attempt === maxRetries) {
        facturaEvents.emit('factura:retry_limit', {
          factura_id,
          error: error.message,
        })

        throw error
      }

      await new Promise((r) =>
        setTimeout(r, attempt * 1500)
      )
    }
  }

  throw lastError
}