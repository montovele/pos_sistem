// facturas/audit/payloads/payloadSerializer.js

/**
 * =========================================================
 * NORMALIZACIÓN DE PAYLOADS
 * =========================================================
 * Evita guardar datos sensibles innecesarios o duplicados
 * =========================================================
 */

export function serializePayload(payload) {
  if (!payload) return null

  return {
    pedido_id: payload.pedido_id,
    woo_order_id: payload.woo_order_id,
    cliente: payload.cliente
      ? {
          id: payload.cliente.id,
          email: payload.cliente.email,
        }
      : null,

    datos_fiscales: payload.datos_fiscales
      ? {
          rfc: payload.datos_fiscales.rfc,
          razon_social:
            payload.datos_fiscales.razon_social,
          cp: payload.datos_fiscales.cp,
        }
      : null,

    productos: (payload.productos || []).map(
      (p) => ({
        sku: p.sku,
        cantidad: p.cantidad,
        descripcion: p.descripcion,
        precio_unitario: p.precio_unitario,
      })
    ),

    total: payload.total,
    subtotal: payload.subtotal,
    moneda: payload.moneda,
  }
}