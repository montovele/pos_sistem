// facturas/queues/helpers.js
// CENTRALIZA TODOS LOS JOBS (ANTES DUPLICADOS)

import {
  facturacionQueue,
  syncCFDIQueue,
  cancelacionQueue,
  deadLetterQueue,
} from './index.js'

import { retryPolicies } from './policies.js'

// ======================================================
// FACTURACIÓN JOB
// ======================================================

export async function addFacturaJob(payload) {
  return facturacionQueue.add('emitir-factura', payload, {
    ...retryPolicies.cfdi,
    priority: 2,
    jobId: `factura-${payload.pedido_id}-${Date.now()}`,
  })
}

// ======================================================
// SYNC JOB
// ======================================================

export async function addSyncJob(payload) {
  return syncCFDIQueue.add('sync-cfdi', payload, {
    ...retryPolicies.woo,
    priority: 2,
    jobId: `sync-${payload.factura_id}-${Date.now()}`,
  })
}

// ======================================================
// CANCELACIÓN JOB
// ======================================================

export async function addCancelacionJob(payload) {
  return cancelacionQueue.add('cancelar-cfdi', payload, {
    ...retryPolicies.sat,
    priority: 1,
    jobId: `cancel-${payload.factura_id}-${Date.now()}`,
  })
}

// ======================================================
// DLQ FALLBACK
// ======================================================

export async function sendToDLQ(queue, data, error) {
  return deadLetterQueue.add('failed-job', {
    queue: queue.name,
    data,
    error: error.message,
    timestamp: new Date().toISOString(),
  })
}