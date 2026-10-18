// ======================================================
// facturas/services/facturaStatusService.js
// SERVICIO CENTRALIZADO DE ESTADOS CFDI
// VERSION ENTERPRISE FINAL
// STATE MACHINE + AUDITORIA + TRANSICIONES
// COMPATIBLE CON:
// - facturaOrchestratorService
// - facturaRecoveryService
// - facturaCancelacionService
// - facturaSyncService
// ======================================================

import {

  updateFacturaStatus,
  updateFacturaError,
  getFacturaById,

} from '../repositories/facturaRepository.js'

import {

  insertLog,

} from '../repositories/logsRepository.js'

import {

  withTransaction,

} from './transactionService.js'

import {

  executeWithResilience,
  isRetryableError,

} from './resiliencePolicyService.js'

// ======================================================
// STATUS FLOW MACHINE
// ======================================================

const STATUS_FLOW = {

  borrador: [

    'procesando',
    'cancelada',

  ],

  procesando: [

    'timbrando',
    'error',
    'cancelada',

  ],

  timbrando: [

    'emitida',
    'error',
    'recuperando',

  ],

  emitida: [

    'cancelando',
    'cancelada',
    'syncing',
    'error_sync',

  ],

  syncing: [

    'emitida',
    'error_sync',

  ],

  recuperando: [

    'emitida',
    'error',

  ],

  cancelando: [

    'cancelada',
    'error_cancelacion',

  ],

  cancelada: [],

  error: [

    'recuperando',

  ],

  error_sync: [

    'syncing',
    'emitida',

  ],

  error_cancelacion: [

    'cancelando',

  ],

}

// ======================================================
// HELPERS
// ======================================================

function sanitizeError(error) {

  return {

    message:
      error?.message ||
      'Error desconocido',

    code:
      error?.code || null,

    status:
      error?.status || null,

    stack:
      error?.stack || null,

  }

}

// ======================================================

function validateTransition(
  currentStatus,
  nextStatus
) {

  const allowedTransitions =
    STATUS_FLOW[currentStatus] || []

  if (
    !allowedTransitions.includes(
      nextStatus
    )
  ) {

    throw new Error(

      `TRANSICION_INVALIDA: ${currentStatus} -> ${nextStatus}`

    )

  }

}

// ======================================================

async function safeLog(
  data = {}
) {

  try {

    await insertLog(data)

  } catch (error) {

    console.error(
      '❌ facturaStatusService safeLog:',
      error.message
    )

  }

}

// ======================================================
// RESILIENCE WRAPPER
// ======================================================

async function withRetry(
  fn,
  operation = '',
  metadata = {}
) {

  return executeWithResilience({

    fn,

    service:
      'facturaStatusService',

    operation,

    retryDecider:
      isRetryableError,

    metadata,

  })

}

// ======================================================
// INTERNAL EXECUTOR
// ======================================================

async function executeStatusUpdate({

  facturaId,

  nextStatus,

  usuario = null,

  source = 'system',

  metadata = {},

  connection = null,

}) {

  const executor = async (conn) => {

    const factura =
      await getFacturaById(
        facturaId,
        conn
      )

    if (!factura) {

      throw new Error(
        'Factura no encontrada'
      )

    }

    const currentStatus =
      factura.estatus

    // ==================================================
    // IGNORAR SI YA ESTA EN EL MISMO STATUS
    // ==================================================

    if (
      currentStatus ===
      nextStatus
    ) {

      return {

        success: true,

        skipped: true,

        current_status:
          currentStatus,

      }

    }

    // ==================================================
    // VALIDAR TRANSICION
    // ==================================================

    validateTransition(
      currentStatus,
      nextStatus
    )

    // ==================================================
    // UPDATE STATUS
    // ==================================================

// transición interna
if (nextStatus === 'cancelando') {

  await updateFacturaStatus(
    facturaId,
    'cancelando', // opcional o no persistir
    conn
  )

  return
}

    // ==================================================
    // AUDITORIA
    // ==================================================

    await safeLog({

      factura_id:
        facturaId,

      tipo:
        'factura_status_changed',

      request_data: {

        previous_status:
          currentStatus,

        next_status:
          nextStatus,

        usuario,

        source,

        metadata,

      },

    })

    return {

      success: true,

      factura_id:
        facturaId,

      previous_status:
        currentStatus,

      next_status:
        nextStatus,

    }

  }

  if (connection) {

    return executor(connection)

  }

  return withTransaction(
    executor
  )

}

// ======================================================
// MAIN STATUS UPDATE
// ======================================================

export async function changeFacturaStatus({

  facturaId,

  nextStatus,

  usuario = null,

  source = 'system',

  metadata = {},

  connection = null,

}) {

  if (!facturaId) {

    throw new Error(
      'facturaId requerido'
    )

  }

  if (!nextStatus) {

    throw new Error(
      'nextStatus requerido'
    )

  }

  return withRetry(

    () => executeStatusUpdate({

      facturaId,
      nextStatus,
      usuario,
      source,
      metadata,
      connection,

    }),

    'changeFacturaStatus',

    {

      factura_id:
        facturaId,

      next_status:
        nextStatus,

      source,

    }

  )

}

// ======================================================
// MARK ERROR
// ======================================================

export async function markFacturaError({

  facturaId,

  error,

  source = 'system',

  usuario = null,

  connection = null,

}) {

  if (!facturaId) {

    throw new Error(
      'facturaId requerido'
    )

  }

  const executor = async (conn) => {

    const factura =
      await getFacturaById(
        facturaId,
        conn
      )

    if (!factura) {

      throw new Error(
        'Factura no encontrada'
      )

    }

    // ==================================================
    // UPDATE ERROR
    // ==================================================

    await updateFacturaError(

      facturaId,

      error?.message ||
      'Error desconocido',

      conn

    )

    // ==================================================
    // UPDATE STATUS
    // ==================================================

    await updateFacturaStatus(

      facturaId,

      'error',

      conn

    )

    // ==================================================
    // LOG
    // ==================================================

    await safeLog({

      factura_id:
        facturaId,

      tipo:
        'factura_error',

      error:
        error?.message,

      response_data: {

        source,

        usuario,

        error:
          sanitizeError(
            error
          ),

      },

    })

    return {

      success: true,

      factura_id:
        facturaId,

      status:
        'error',

    }

  }

  const operation = () => {

    if (connection) {
      return executor(connection)
    }

    return withTransaction(
      executor
    )

  }

  return withRetry(

    operation,

    'markFacturaError',

    {

      factura_id:
        facturaId,

      source,

    }

  )

}

// ======================================================
// FORCE STATUS
// ======================================================

export async function forceFacturaStatus({

  facturaId,

  status,

  reason = '',

  usuario = null,

  source = 'system',

}) {

  if (!facturaId) {

    throw new Error(
      'facturaId requerido'
    )

  }

  if (!status) {

    throw new Error(
      'status requerido'
    )

  }

  return withRetry(

    () => withTransaction(

      async (connection) => {

        const factura =
          await getFacturaById(
            facturaId,
            connection
          )

        if (!factura) {

          throw new Error(
            'Factura no encontrada'
          )

        }

        const previousStatus =
          factura.estatus

        // ==============================================
        // UPDATE STATUS
        // ==============================================

        await updateFacturaStatus(

          facturaId,

          status,

          connection

        )

        // ==============================================
        // LOG
        // ==============================================

        await safeLog({

          factura_id:
            facturaId,

          tipo:
            'factura_status_forced',

          request_data: {

            previous_status:
              previousStatus,

            forced_status:
              status,

            reason,

            usuario,

            source,

          },

        })

        return {

          success: true,

          factura_id:
            facturaId,

          previous_status:
            previousStatus,

          forced_status:
            status,

        }

      }

    ),

    'forceFacturaStatus',

    {

      factura_id:
        facturaId,

      forced_status:
        status,

      source,

    }

  )

}

// ======================================================
// VALIDATE STATUS
// ======================================================

export function isValidFacturaTransition({

  currentStatus,

  nextStatus,

}) {

  try {

    validateTransition(

      currentStatus,

      nextStatus

    )

    return true

  } catch {

    return false

  }

}

// ======================================================
// GET AVAILABLE TRANSITIONS
// ======================================================

export function getAvailableTransitions(
  currentStatus
) {

  return (

    STATUS_FLOW[
      currentStatus
    ] || []

  )

}

// ======================================================
// GET STATUS FLOW
// ======================================================

export function getFacturaStatusFlow() {

  return STATUS_FLOW

}

// ======================================================
// HEALTH CHECK
// ======================================================

export async function facturaStatusHealthCheck() {

  return {

    success: true,

    healthy: true,

    service:
      'facturaStatusService',

    transitions:
      Object.keys(
        STATUS_FLOW
      ).length,

    timestamp:
      new Date()
        .toISOString(),

  }

}

// ======================================================
// EXPORT DEFAULT
// ======================================================

export default {

  changeFacturaStatus,

  markFacturaError,

  forceFacturaStatus,

  isValidFacturaTransition,

  getAvailableTransitions,

  getFacturaStatusFlow,

  facturaStatusHealthCheck,

}