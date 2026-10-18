// facturas/queues/queueFactory.js
// FACTORY CENTRAL DE COLAS BULLMQ (HARDENED)

import { Queue } from 'bullmq'
import redis from '../config/redis.js'

// ======================================================
// CONFIG BASE
// ======================================================

const defaultOptions = {
  connection: redis,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: {
      count: 100,
    },
    removeOnFail: {
      count: 500,
    },
  },
}

// ======================================================
// FACTORY
// ======================================================

export function createQueue(name, options = {}) {
  return new Queue(name, {
    ...defaultOptions,
    ...options,
  })
}