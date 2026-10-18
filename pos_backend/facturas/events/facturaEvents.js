// facturas/events/facturaEvents.js

import EventEmitter from 'events'

/**
 * =========================================================
 * EVENT BUS FACTURACIÓN
 * =========================================================
 *
 * Arquitectura desacoplada:
 *
 * ✅ WooCommerce
 * ✅ Auditoría
 * ✅ Notificaciones
 * ✅ Logs
 * ✅ Retry system
 * ✅ Webhooks
 * ✅ Métricas
 * ✅ Workers
 * ✅ Queues
 *
 * =========================================================
 */

class FacturaEventBus extends EventEmitter {}

export const facturaEvents =
  new FacturaEventBus()

/**
 * =========================================================
 * EVENTOS DISPONIBLES
 * =========================================================
 *
 * factura:created
 * factura:timbrando
 * factura:emitida
 * factura:error
 * factura:cancelada
 * factura:cancelacion_error
 * factura:xml_saved
 * factura:pdf_saved
 * factura:sync_started
 * factura:sync_success
 * factura:sync_error
 * factura:retry
 * factura:retry_limit
 * factura:queued
 * factura:processing
 * factura:completed
 *
 * =========================================================
 */

/**
 * =========================================================
 * LOGGER GLOBAL
 * =========================================================
 */

facturaEvents.on(
  'factura:created',
  async (payload) => {
    console.log(
      '[EVENT] factura:created',
      {
        factura_id:
          payload.factura_id,

        pedido_id:
          payload.pedido_id,
      }
    )
  }
)

facturaEvents.on(
  'factura:timbrando',
  async (payload) => {
    console.log(
      '[EVENT] factura:timbrando',
      {
        factura_id:
          payload.factura_id,

        pedido_id:
          payload.pedido_id,
      }
    )
  }
)

facturaEvents.on(
  'factura:emitida',
  async (payload) => {
    console.log(
      '[EVENT] factura:emitida',
      {
        factura_id:
          payload.factura_id,

        uuid:
          payload.uuid,
      }
    )
  }
)

facturaEvents.on(
  'factura:error',
  async (payload) => {
    console.error(
      '[EVENT] factura:error',
      {
        factura_id:
          payload.factura_id,

        error:
          payload.error,
      }
    )
  }
)

facturaEvents.on(
  'factura:cancelada',
  async (payload) => {
    console.log(
      '[EVENT] factura:cancelada',
      {
        factura_id:
          payload.factura_id,

        uuid:
          payload.uuid,
      }
    )
  }
)

facturaEvents.on(
  'factura:cancelacion_error',
  async (payload) => {
    console.error(
      '[EVENT] factura:cancelacion_error',
      {
        factura_id:
          payload.factura_id,

        error:
          payload.error,
      }
    )
  }
)

facturaEvents.on(
  'factura:retry',
  async (payload) => {
    console.warn(
      '[EVENT] factura:retry',
      {
        factura_id:
          payload.factura_id,

        retry:
          payload.retry,

        maxRetries:
          payload.maxRetries,
      }
    )
  }
)

facturaEvents.on(
  'factura:retry_limit',
  async (payload) => {
    console.error(
      '[EVENT] factura:retry_limit',
      {
        factura_id:
          payload.factura_id,
      }
    )
  }
)

facturaEvents.on(
  'factura:sync_started',
  async (payload) => {
    console.log(
      '[EVENT] factura:sync_started',
      {
        woo_order_id:
          payload.woo_order_id,
      }
    )
  }
)

facturaEvents.on(
  'factura:sync_success',
  async (payload) => {
    console.log(
      '[EVENT] factura:sync_success',
      {
        woo_order_id:
          payload.woo_order_id,

        uuid:
          payload.uuid,
      }
    )
  }
)

facturaEvents.on(
  'factura:sync_error',
  async (payload) => {
    console.error(
      '[EVENT] factura:sync_error',
      {
        woo_order_id:
          payload.woo_order_id,

        error:
          payload.error,
      }
    )
  }
)

facturaEvents.on(
  'factura:queued',
  async (payload) => {
    console.log(
      '[QUEUE] factura:queued',
      {
        pedido_id:
          payload.pedido_id,
      }
    )
  }
)

facturaEvents.on(
  'factura:processing',
  async (payload) => {
    console.log(
      '[QUEUE] factura:processing',
      {
        pedido_id:
          payload.pedido_id,
      }
    )
  }
)

facturaEvents.on(
  'factura:completed',
  async (payload) => {
    console.log(
      '[QUEUE] factura:completed',
      {
        pedido_id:
          payload.pedido_id,

        factura_id:
          payload.factura_id,
      }
    )
  }
)

/**
 * =========================================================
 * HELPERS
 * =========================================================
 */

export function emitFacturaCreated(
  payload
) {
  facturaEvents.emit(
    'factura:created',
    payload
  )
}

export function emitFacturaEmitida(
  payload
) {
  facturaEvents.emit(
    'factura:emitida',
    payload
  )
}

export function emitFacturaError(
  payload
) {
  facturaEvents.emit(
    'factura:error',
    payload
  )
}

export function emitFacturaCancelada(
  payload
) {
  facturaEvents.emit(
    'factura:cancelada',
    payload
  )
}

export function emitFacturaSyncSuccess(
  payload
) {
  facturaEvents.emit(
    'factura:sync_success',
    payload
  )
}