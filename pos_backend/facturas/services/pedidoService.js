// ======================================================
// facturas/services/pedidoService.js
// VERSION EMPRESARIAL ROBUSTA FINAL
// CFDI 4.0 + VALIDACIONES + NORMALIZACION + SAT READY
// ======================================================

import {
  getOrdenCompleta,
} from '../repositories/ordenRepository.js'

import {
  mapProductosSAT,
} from '../utils/mapProductosSAT.js'

import {
  calcularSubtotal,
  calcularIVA,
  calcularTotal,
} from '../utils/calcularIVA.js'

// ======================================================
// CONFIG
// ======================================================

const ALLOWED_ORDER_STATUS = [
  'processing',
  'completed',
  'pagado',
  'paid',
]

// ======================================================
// OBTENER PEDIDO FACTURABLE
// ======================================================
function extraerIVAFrontend(payload) {

  const conceptos = payload?.conceptos || []

  return conceptos.map((c) => {

    const tasa =
      c?.impuestos?.traslados?.[0]?.tasa_cuota ??
      c?.impuestos?.[0]?.tasa_cuota ??
      null

    return {
      clave_producto: c.clave_producto,
      iva_rate: tasa,
      tasa_iva: tasa,
      tax_rate: tasa,
      impuesto_rate: tasa
    }
  })
}
function obtenerTasaIVA(item) {

  const tasa =
    item.iva_rate ??
    item.tasa_iva ??
    item.tax_rate ??
    item.impuesto_rate ??
    item?.impuestos?.traslados?.[0]?.tasa_cuota ??
    item?.impuestos?.[0]?.tasa_cuota ??
    DEFAULT_TAX_RATE

  return roundSAT(
    safeNumber(tasa, DEFAULT_TAX_RATE)
  )
}
export async function obtenerPedidoFacturable(
  pedidoId,
  payload
) {

  try {

    // ==================================================
    // VALIDACION
    // ==================================================

    validateRequired(pedidoId, 'pedidoId')

    // ==================================================
    // PEDIDO
    // ==================================================

    const pedido =
      await getOrdenCompleta(pedidoId)

    if (!pedido) {
      throw new Error('Pedido no encontrado')
    }

    console.log('pedido getOrdenCompleta', pedido)
    console.log('pedido payload frontend', payload)

    validarPedidoFacturable(pedido)

    // ==================================================
    // ITEMS
    // ==================================================

    if (
      !Array.isArray(pedido.items) ||
      !pedido.items.length
    ) {
      throw new Error('Pedido sin productos')
    }

    console.log('pedido.items RAW', pedido.items)

    const items = normalizarItems(pedido.items)

    console.log('items BD normalizados', items)

    // ==================================================
    // 🔥 IVA FRONTEND
    // ==================================================

    const ivaFrontend = extraerIVAFrontend(payload)

    // ==================================================
    // 🔥 FUSION BD + FRONTEND
    // ==================================================

    const itemsEnriquecidos = items.map((item, index) => {

      const ivaData = ivaFrontend[index] || {}

      return {
        ...item,

        iva_rate:
          ivaData.iva_rate ??
          item.iva_rate ??
          item.tax_rate ??
          item.tasa_iva ??
          item.impuesto_rate ??
          DEFAULT_TAX_RATE,

        tasa_iva:
          ivaData.iva_rate ??
          item.tasa_iva ??
          DEFAULT_TAX_RATE,

        tax_rate:
          ivaData.iva_rate ??
          item.tax_rate ??
          DEFAULT_TAX_RATE,

        impuesto_rate:
          ivaData.iva_rate ??
          item.impuesto_rate ??
          DEFAULT_TAX_RATE,
      }
    })

    // ==================================================
    // CFDI CONCEPTOS
    // ==================================================

    const conceptos =
      mapProductosSAT(itemsEnriquecidos)

    if (!Array.isArray(conceptos) || !conceptos.length) {
      throw new Error('No se pudieron generar conceptos CFDI')
    }

    // ==================================================
    // VALIDAR SAT
    // ==================================================

    validarConceptosSAT(conceptos)

    // ==================================================
    // TOTALES
    // ==================================================
// ==================================================
// TOTALES
// ==================================================

const subtotal =
  roundMoney(
    safeNumber(
      pedido.subtotal ??
      payload?.subtotal,
      0
    )
  )

const iva =
  roundMoney(
    safeNumber(
      pedido.finalIVA ??
      pedido.iva ??
      payload?.iva,
      0
    )
  )

const total =
  roundMoney(
    safeNumber(
      payload?.total ??
      (subtotal + iva),
      0
    )
  )

console.log('💰 TOTALES FINALES', {
  subtotal,
  iva,
  total
})

validarTotales({
  subtotal,
  iva,
  total
})

    // ==================================================
    // RESPONSE
    // ==================================================

   return {

  ...pedido,

  pedido_id: pedido.id,

  woo_order_id: pedido.id_woocommerce,

  items: itemsEnriquecidos,

  conceptos,

  subtotal,

  iva,

  total,

  moneda: normalizeCurrency(
    pedido.moneda
  ),

  cliente_email:
    normalizeString(
      pedido.cliente_email ||
      pedido.email
    ).toLowerCase(),

  cliente_nombre:
    normalizeString(
      pedido.cliente_nombre ||
      pedido.nombre_cliente
    ),

  metadata: {

    facturable: true,

    source: 'pedidoService',

    generated_at:
      new Date().toISOString()

  }

}

  } catch (error) {

    console.error('obtenerPedidoFacturable error:', error)

    throw buildPedidoError(
      error,
      'obtenerPedidoFacturable'
    )
  }
}

// ======================================================
// RECONSTRUIR PEDIDO CFDI
// ======================================================

export async function reconstruirPedidoParaCFDI(
  pedidoId
) {

  try {

    const pedido =
      await obtenerPedidoFacturable(
        pedidoId
      )

    return {

      pedido_id:
        pedido.id,

      woo_order_id:
        pedido.id_woocommerce,

      conceptos:
        pedido.conceptos,

      subtotal:
        pedido.subtotal,

      iva:
        pedido.iva,

      total:
        pedido.total,

      moneda:
        pedido.moneda,

      cliente_email:
        pedido.cliente_email,

      metadata:
        pedido.metadata,

    }

  } catch (error) {

    console.error(
      'reconstruirPedidoParaCFDI error:',
      error
    )

    throw buildPedidoError(
      error,
      'reconstruirPedidoParaCFDI'
    )

  }

}

// ======================================================
// VALIDAR PEDIDO FACTURABLE
// ======================================================

function validarPedidoFacturable(
  pedido = {}
) {

  // ==============================================
  // STATUS
  // ==============================================

const status =
  String(

    pedido.estado_woo ||

    pedido.estado_local ||

    pedido.status ||

    pedido.estado ||

    ''

  )
  .trim()
  .toLowerCase()

  if (
    !ALLOWED_ORDER_STATUS.includes(
      status
    )
  ) {

    throw new Error(
      `Pedido no facturable (${status})`
    )

  }

  // ==============================================
  // CANCELADO
  // ==============================================

  if (
    pedido.cancelado === 1 ||
    pedido.cancelado === true
  ) {

    throw new Error(
      'Pedido cancelado'
    )

  }

  // ==============================================
  // TOTAL
  // ==============================================

  const total =
    safeNumber(
      pedido.total
    )

  if (total <= 0) {

    throw new Error(
      'Pedido con total inválido'
    )

  }

}

// ======================================================
// VALIDAR CONCEPTOS SAT
// ======================================================

function validarConceptosSAT(
  conceptos = []
) {

  conceptos.forEach(
    (concepto, index) => {

      const idx =
        index + 1

      if (
        !concepto.descripcion &&
        !concepto.product?.description
      ) {

        throw new Error(
          `Descripción SAT requerida en concepto ${idx}`
        )

      }

      const productKey =
        concepto.product_key ||
        concepto.product?.product_key

      if (!productKey) {

        throw new Error(
          `Clave SAT requerida en concepto ${idx}`
        )

      }

      const unitKey =
        concepto.unit_key ||
        concepto.product?.unit_key

      if (!unitKey) {

        throw new Error(
          `Clave unidad SAT requerida en concepto ${idx}`
        )

      }

    }
  )

}

// ======================================================
// VALIDAR TOTALES
// ======================================================

function validarTotales({
  subtotal = 0,
  iva = 0,
  total = 0,
}) {

  subtotal =
    roundMoney(
      subtotal
    )

  iva =
    roundMoney(
      iva
    )

  total =
    roundMoney(
      total
    )

  if (subtotal <= 0) {

    throw new Error(
      'Subtotal inválido'
    )

  }

  if (iva < 0) {

    throw new Error(
      'IVA inválido'
    )

  }

  if (total <= 0) {

    throw new Error(
      'Total inválido'
    )

  }

}

// ======================================================
// NORMALIZAR ITEMS
// ======================================================

function normalizarItems(
  items = []
) {

  return items.map(
    (item, index) => {

      const cantidad =
        safeNumber(
          item.cantidad,
          1
        )

      const precio =
        safeNumber(

          item.precio_unitario ||
          item.precio ||
          item.price

        )

      if (cantidad <= 0) {

        throw new Error(
          `Cantidad inválida en item ${index + 1}`
        )

      }

      if (precio < 0) {

        throw new Error(
          `Precio inválido en item ${index + 1}`
        )

      }

      const subtotal =
        roundMoney(
          cantidad * precio
        )

      const iva =
        roundMoney(
          subtotal * 0.16
        )

      return {

        ...item,

        cantidad,

        quantity:
          cantidad,

        precio_unitario:
          precio,

        subtotal,

        importe:
          subtotal,

        iva,

        impuestos:
          iva,

        producto_nombre:
          normalizeString(

            item.producto_nombre ||
            item.nombre ||
            item.name ||
            'Producto'

          ),

        descripcion:
          normalizeString(

            item.descripcion ||
            item.producto_nombre ||
            item.nombre ||
            item.name ||
            'Producto'

          ),

        sku:
          normalizeString(
            item.sku
          ),

        clave_sat:

          item.clave_sat ||

          item.product_key ||

          '01010101',

        clave_unidad:

          item.clave_unidad ||

          item.unit_key ||

          'H87',

      }

    }
  )

}

// ======================================================
// HELPERS
// ======================================================

function validateRequired(
  value,
  field
) {

  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {

    throw new Error(
      `${field} requerido`
    )

  }

}

// ======================================================

function safeNumber(
  value,
  fallback = 0
) {

  const parsed =
    Number(value)

  return Number.isFinite(
    parsed
  )
    ? parsed
    : fallback

}

// ======================================================

function roundMoney(
  value
) {

  return Number(
    safeNumber(value)
      .toFixed(2)
  )

}

// ======================================================

function normalizeString(
  value = ''
) {

  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')

}

// ======================================================

function normalizeCurrency(
  currency = 'MXN'
) {

  return String(currency || 'MXN')
    .trim()
    .toUpperCase()

}

// ======================================================

function buildPedidoError(
  error,
  context = ''
) {

  const formatted =
    context
      ? `[${context}] ${error.message}`
      : error.message

  const customError =
    new Error(formatted)

  customError.original =
    error

  customError.stack =
    error.stack

  return customError

}