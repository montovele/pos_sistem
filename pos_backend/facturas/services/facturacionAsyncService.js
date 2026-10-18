// facturas/services/facturacionAsyncService.js

import {
  addFacturaJob,
} from '../queues/facturaQueue.js'

export async function facturarAsync(
  payload
) {
  const job =
    await addFacturaJob(payload)

  return {
    success: true,

    queued: true,

    job_id: job.id,
  }
}