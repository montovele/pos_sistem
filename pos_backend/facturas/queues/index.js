// facturas/queues/index.js
// REGISTRO ÚNICO LIMPIO

import { createQueue } from './queueFactory.js'

// ======================================================
// COLAS PRINCIPALES
// ======================================================

export const facturacionQueue =
  createQueue('facturacion')

export const syncCFDIQueue =
  createQueue('sync-cfdi')

export const cancelacionQueue =
  createQueue('cancelacion-cfdi')

// ======================================================
// DLQ
// ======================================================

export const deadLetterQueue =
  createQueue('dlq-cfdi')