// facturas/events/wooEvents.js

import EventEmitter from 'events'

/**
 * =========================================================
 * EVENT BUS WOOCOMMERCE INTEGRATION
 * =========================================================
 *
 * Separación total de responsabilidades:
 *
 * - WooCommerce (entrada de pedidos)
 * - Facturación (CFDI)
 * - Sync fiscal (Facturapi)
 * - Auditoría
 * - Reintentos
 * - Colas
 *
 * =========================================================
 */

class WooEventBus extends EventEmitter {}

export const wooEvents =
  new WooEventBus()

/**
 * =========================================================
 * EVENTOS WOOCOMMERCE
 * =========================================================
 *
 * woo:order_received
 * woo:order_validated
 * woo:order_rejected
 * woo:order_sync_started
 * woo:order_sync_success
 * woo:order_sync_error
 * woo:order_invoice_requested
 * woo:order_invoice_generated
 * woo:order_invoice_failed
 *
 * =========================================================
 */

/**
 * =========================================================
 * EVENTOS DE LOGGING
 * =========================================================
 */

wooEvents.on(
  'woo:order_received',
  async (payload) => {
    console.log(
      '[WOO] order_received',
      {
        order_id:
          payload.order_id,

        total:
          payload.total,
      }
    )
  }
)

wooEvents.on(
  'woo:order_validated',
  async (payload) => {
    console.log(
      '[WOO] order_validated',
      {
        order_id:
          payload.order_id,
      }
    )
  }
)

wooEvents.on(
  'woo:order_rejected',
  async (payload) => {
    console.warn(
      '[WOO] order_rejected',
      {
        order_id:
          payload.order_id,

        reason:
          payload.reason,
      }
    )
  }
)

wooEvents.on(
  'woo:order_sync_started',
  async (payload) => {
    console.log(
      '[WOO] order_sync_started',
      {
        order_id:
          payload.order_id,
      }
    )
  }
)

wooEvents.on(
  'woo:order_sync_success',
  async (payload) => {
    console.log(
      '[WOO] order_sync_success',
      {
        order_id:
          payload.order_id,

        factura_id:
          payload.factura_id,
      }
    )
  }
)

wooEvents.on(
  'woo:order_sync_error',
  async (payload) => {
    console.error(
      '[WOO] order_sync_error',
      {
        order_id:
          payload.order_id,

        error:
          payload.error,
      }
    )
  }
)

wooEvents.on(
  'woo:order_invoice_generated',
  async (payload) => {
    console.log(
      '[WOO] invoice_generated',
      {
        order_id:
          payload.order_id,

        uuid:
          payload.uuid,
      }
    )
  }
)

wooEvents.on(
  'woo:order_invoice_failed',
  async (payload) => {
    console.error(
      '[WOO] invoice_failed',
      {
        order_id:
          payload.order_id,

        error:
          payload.error,
      }
    )
  }
)

/**
 * =========================================================
 * HELPERS
 * =========================================================
 */

export function emitWooOrderReceived(
  payload
) {
  wooEvents.emit(
    'woo:order_received',
    payload
  )
}

export function emitWooOrderValidated(
  payload
) {
  wooEvents.emit(
    'woo:order_validated',
    payload
  )
}

export function emitWooOrderRejected(
  payload
) {
  wooEvents.emit(
    'woo:order_rejected',
    payload
  )
}

export function emitWooSyncStarted(
  payload
) {
  wooEvents.emit(
    'woo:order_sync_started',
    payload
  )
}

export function emitWooSyncSuccess(
  payload
) {
  wooEvents.emit(
    'woo:order_sync_success',
    payload
  )
}

export function emitWooSyncError(
  payload
) {
  wooEvents.emit(
    'woo:order_sync_error',
    payload
  )
}