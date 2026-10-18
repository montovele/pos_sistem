// ======================================================
// facturas/services/resiliencePolicyService.js
// RESILIENCE POLICY SERVICE ENTERPRISE FINAL
// RETRIES + CIRCUIT BREAKER + TIMEOUT + BACKOFF
// CENTRAL RESILIENCE LAYER FOR COMMERCESYNCSUITE
// ======================================================

// ======================================================
// CONFIG
// ======================================================

const DEFAULT_MAX_RETRIES =
  Number(
    process.env.RESILIENCE_MAX_RETRIES
  ) || 3

const DEFAULT_BASE_DELAY =
  Number(
    process.env.RESILIENCE_BASE_DELAY
  ) || 1000

const DEFAULT_TIMEOUT =
  Number(
    process.env.RESILIENCE_TIMEOUT
  ) || 30000

const DEFAULT_BACKOFF_MULTIPLIER =
  Number(
    process.env.RESILIENCE_BACKOFF
  ) || 2

const CIRCUIT_BREAKER_THRESHOLD =
  Number(
    process.env.RESILIENCE_CB_THRESHOLD
  ) || 5

const CIRCUIT_BREAKER_RESET_TIME =
  Number(
    process.env.RESILIENCE_CB_RESET
  ) || 60000

// ======================================================
// CIRCUIT BREAKER MEMORY
// ======================================================

const circuitMemory =
  new Map()

// ======================================================
// HELPERS
// ======================================================

function delay(ms = 1000) {

  return new Promise(
    resolve =>
      setTimeout(resolve, ms)
  )

}

// ======================================================

function now() {

  return Date.now()

}

// ======================================================

function sanitizeMetadata(
  metadata = {}
) {

  try {

    return JSON.parse(
      JSON.stringify(metadata)
    )

  } catch {

    return {}

  }

}

// ======================================================

function buildKey(
  service = '',
  operation = ''
) {

  return `${service}:${operation}`

}

// ======================================================

function getCircuitState(
  key
) {

  if (!circuitMemory.has(key)) {

    circuitMemory.set(key, {

      failures: 0,

      openedAt: null,

      state: 'CLOSED',

    })

  }

  return circuitMemory.get(key)

}

// ======================================================

function openCircuit(
  key
) {

  const state =
    getCircuitState(key)

  state.state = 'OPEN'

  state.openedAt = now()

}

// ======================================================

function closeCircuit(
  key
) {

  const state =
    getCircuitState(key)

  state.state = 'CLOSED'

  state.failures = 0

  state.openedAt = null

}

// ======================================================

function registerFailure(
  key
) {

  const state =
    getCircuitState(key)

  state.failures += 1

  if (
    state.failures >=
    CIRCUIT_BREAKER_THRESHOLD
  ) {

    openCircuit(key)

  }

}

// ======================================================

function canExecute(
  key
) {

  const state =
    getCircuitState(key)

  if (
    state.state === 'CLOSED'
  ) {

    return true

  }

  if (
    state.state === 'OPEN'
  ) {

    const elapsed =
      now() - (
        state.openedAt || 0
      )

    if (
      elapsed >=
      CIRCUIT_BREAKER_RESET_TIME
    ) {

      state.state =
        'HALF_OPEN'

      return true

    }

    return false

  }

  return true

}

// ======================================================
// RETRYABLE DETECTOR
// ======================================================

export function isRetryableError(
  error
) {

  const status =

    error?.status ||

    error?.response?.status

  const code =
    error?.code

  return [

    408,
    409,
    425,
    429,
    500,
    502,
    503,
    504,

  ].includes(status) ||

  [

    'ECONNRESET',
    'ETIMEDOUT',
    'ECONNREFUSED',
    'EPIPE',
    'PROTOCOL_CONNECTION_LOST',

  ].includes(code)

}

// ======================================================
// TIMEOUT WRAPPER
// ======================================================

async function withTimeout(
  promise,
  timeout
) {

  let timeoutId = null

  const timeoutPromise =
    new Promise(

      (_, reject) => {

        timeoutId =
          setTimeout(

            () => {

              const error =
                new Error(
                  'Operation timeout'
                )

              error.code =
                'TIMEOUT'

              reject(error)

            },

            timeout

          )

      }

    )

  try {

    return await Promise.race([

      promise,
      timeoutPromise,

    ])

  } finally {

    clearTimeout(timeoutId)

  }

}

// ======================================================
// BUILD ERROR
// ======================================================

export function buildResilienceError(
  error,
  metadata = {}
) {

  const customError =
    new Error(

      error?.message ||
      'Resilience execution failed'

    )

  customError.code =

    error?.code ||
    'RESILIENCE_ERROR'

  customError.status =

    error?.status ||

    error?.response?.status ||

    500

  customError.details =

    error?.details ||

    error?.response?.data ||

    null

  customError.metadata =
    sanitizeMetadata(
      metadata
    )

  customError.original =
    error

  return customError

}

// ======================================================
// EXECUTE WITH RESILIENCE
// ======================================================

export async function executeWithResilience({

  fn,

  service = 'unknown',

  operation = 'unknown',

  retryDecider =
    isRetryableError,

  retries =
    DEFAULT_MAX_RETRIES,

  baseDelay =
    DEFAULT_BASE_DELAY,

  timeout =
    DEFAULT_TIMEOUT,

  backoffMultiplier =
    DEFAULT_BACKOFF_MULTIPLIER,

  metadata = {},

}) {

  if (
    typeof fn !== 'function'
  ) {

    throw new Error(
      'fn debe ser una función'
    )

  }

  const key =
    buildKey(
      service,
      operation
    )

  if (!canExecute(key)) {

    const error =
      new Error(

        `Circuit breaker OPEN (${key})`

      )

    error.code =
      'CIRCUIT_OPEN'

    throw buildResilienceError(
      error,
      metadata
    )

  }

  let lastError = null

  for (
    let attempt = 1;
    attempt <= retries;
    attempt++
  ) {

    try {

      const response =
        await withTimeout(

          Promise.resolve(
            fn()
          ),

          timeout

        )

      closeCircuit(key)

      return response

    } catch (error) {

      lastError = error

      registerFailure(key)

      const retryable =
        retryDecider(error)

      if (

        !retryable ||

        attempt >= retries

      ) {

        throw buildResilienceError(

          error,

          {

            ...metadata,

            service,
            operation,
            retries,
            attempt,

          }

        )

      }

      const waitTime =

        baseDelay *

        Math.pow(

          backoffMultiplier,

          attempt - 1

        )

      console.error(

        `⚠️ Retry ${attempt}/${retries} (${service}:${operation}) -> ${error.message}`

      )

      await delay(waitTime)

    }

  }

  throw buildResilienceError(

    lastError,

    {

      ...metadata,

      service,
      operation,

    }

  )

}

// ======================================================
// CIRCUIT STATUS
// ======================================================

export function getCircuitBreakerStatus() {

  const response = {}

  for (const [key, value] of circuitMemory.entries()) {

    response[key] = {

      state:
        value.state,

      failures:
        value.failures,

      openedAt:
        value.openedAt,

    }

  }

  return response

}

// ======================================================
// RESET CIRCUITS
// ======================================================

export function resetCircuitBreaker(
  key = null
) {

  if (!key) {

    circuitMemory.clear()

    return {
      success: true,
      reset_all: true,
    }

  }

  closeCircuit(key)

  return {
    success: true,
    key,
    reset: true,
  }

}

// ======================================================
// HEALTH CHECK
// ======================================================

export async function resilienceHealthCheck() {

  return {

    success: true,

    healthy: true,

    service:
      'resiliencePolicyService',

    circuits:
      getCircuitBreakerStatus(),

    timestamp:
      new Date()
        .toISOString(),

  }

}

// ======================================================
// EXPORT DEFAULT
// ======================================================

export default {

  executeWithResilience,

  isRetryableError,

  buildResilienceError,

  getCircuitBreakerStatus,

  resetCircuitBreaker,

  resilienceHealthCheck,

}