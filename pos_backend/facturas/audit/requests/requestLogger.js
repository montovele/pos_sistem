// facturas/audit/requests/requestLogger.js

import { insertLog } from '../../repositories/logsRepository.js'

/**
 * =========================================================
 * LOG REQUEST CFDI / SAT / WOO
 * =========================================================
 */

export async function logRequest({
  factura_id,
  type,
  url,
  payload,
}) {
  return insertLog({
    factura_id,
    tipo: 'request',
    meta: {
      type,
      url,
      payload,
      timestamp: new Date(),
    },
  })
}