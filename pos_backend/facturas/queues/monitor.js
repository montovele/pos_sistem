// facturas/queues/monitor.js

import {
  facturacionQueue,
  syncCFDIQueue,
  cancelacionQueue,
  deadLetterQueue,
} from './index.js'

export async function logQueueStats() {
  const queues = [
    facturacionQueue,
    syncCFDIQueue,
    cancelacionQueue,
    deadLetterQueue,
  ]

  const stats = await Promise.all(
    queues.map(async (q) => ({
      queue: q.name,
      waiting: await q.getWaitingCount(),
      active: await q.getActiveCount(),
      failed: await q.getFailedCount(),
      completed: await q.getCompletedCount(),
      delayed: await q.getDelayedCount(),
    }))
  )

  console.table(stats)
  return stats
}