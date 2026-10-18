// facturas/audit/index.js

import { logRequest } from './requests/requestLogger.js'
import { logResponse } from './responses/responseLogger.js'
import { serializePayload } from './payloads/payloadSerializer.js'
import { withRetry } from './retries/retryManager.js'

/**
 * =========================================================
 * AUDIT SYSTEM ENTRYPOINT
 * =========================================================
 */

export const Audit = {
  logRequest,
  logResponse,
  serializePayload,
  withRetry,
}