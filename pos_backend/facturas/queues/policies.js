// facturas/queues/policies.js
// POLÍTICAS DE RETRY INTELIGENTE

export const retryPolicies = {
  cfdi: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
  },

  sat: {
    attempts: 7,
    backoff: {
      type: 'exponential',
      delay: 3000,
    },
  },

  woo: {
    attempts: 3,
    backoff: {
      type: 'fixed',
      delay: 2000,
    },
  },

  critical: {
    attempts: 10,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
  },
}