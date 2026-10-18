// facturas/utils/mapProductosSAT.js
// VERSION EMPRESARIAL AVANZADA
// CFDI 4.0 + FACTURAPI + VALIDACIONES SAT + SOPORTE VARIABLES

import {
  calcularImporte,
  calcularIVAImporte,
  roundSAT,
} from './calcularIVA.js'

// ======================================================
// CONSTANTES
// ======================================================

const DEFAULT_PRODUCT_KEY =
  process.env
    .SAT_DEFAULT_PRODUCT_KEY ||
  '01010101'

const DEFAULT_UNIT_KEY =
  process.env
    .SAT_DEFAULT_UNIT_KEY ||
  'H87'

const DEFAULT_UNIT_NAME =
  process.env
    .SAT_DEFAULT_UNIT_NAME ||
  'Pieza'

const DEFAULT_TAX_RATE =
  Number(
    process.env
      .DEFAULT_IVA_RATE || 0.16
  )

const MAX_DESCRIPTION_LENGTH =
  1000

// ======================================================
// MAIN
// ======================================================

export function mapProductosSAT(
  items = []
) {
  if (
    !Array.isArray(items)
  ) {
    throw new Error(
      'items debe ser un arreglo'
    )
  }

  return items
    .filter(Boolean)
    .map((item, index) =>
      normalizarProductoSAT(
        item,
        index
      )
    )
}

// ======================================================
// NORMALIZAR PRODUCTO
// ======================================================

function normalizarProductoSAT(
  item,
  index
) {
  validarItem(item, index)

  // ====================================================
  // DATOS BASE
  // ====================================================

  const cantidad =
    roundSAT(
      safeNumber(
        item.cantidad,
        1
      )
    )

  const precioUnitario =
    roundSAT(
      safeNumber(
        item.precio_unitario,
        item.price
      )
    )

  const descuento =
    roundSAT(
      safeNumber(
        item.descuento,
        0
      )
    )

  const ivaRate =
    obtenerTasaIVA(item)

  const subtotal =
    calcularImporte(
      cantidad,
      precioUnitario
    )

  const subtotalConDescuento =
    roundSAT(
      Math.max(
        subtotal - descuento,
        0
      )
    )

  const iva =
    calcularIVAImporte(
      subtotalConDescuento,
      ivaRate
    )

  const total =
    roundSAT(
      subtotalConDescuento +
        iva
    )

  const descripcion =
    obtenerDescripcion(item)

  const taxes =
    generarImpuestos(
      ivaRate
    )

  // ====================================================
  // RESPONSE CFDI
  // ====================================================

  return {
    // ================================================
    // DATOS INTERNOS
    // ================================================

    sku:
      cleanString(
        item.sku
      ) || null,

    descripcion,

    cantidad,

    valor_unitario:
      precioUnitario,

    descuento,

    subtotal:
      subtotalConDescuento,

    importe:
      subtotalConDescuento,

    impuestos: iva,

    iva,

    total,

    iva_rate:
      ivaRate,

    moneda:
      cleanString(
        item.moneda
      ) || 'MXN',

    // ================================================
    // FACTURAPI
    // ================================================

    quantity:
      cantidad,

    product: {
      description:
        descripcion,

      product_key:
        normalizarClaveSAT(
          item.clave_sat,
          DEFAULT_PRODUCT_KEY
        ),

      unit_key:
        normalizarClaveSAT(
          item.clave_unidad,
          DEFAULT_UNIT_KEY
        ),

      unit_name:
        cleanString(
          item.unidad_nombre
        ) ||
        DEFAULT_UNIT_NAME,

      price:
        precioUnitario,

      sku:
        cleanString(
          item.sku
        ),

      taxes,
    },

    // ================================================
    // CFDI EXTENDIDO
    // ================================================

    taxes,

    taxability:
      taxes.length > 0
        ? 'taxable'
        : 'none',

    // ================================================
    // METADATA
    // ================================================

    metadata: {
      producto_id:
        item.producto_id ||
        item.id ||
        null,

      variante_id:
        item.variante_id ||
        null,

      proveedor_id:
        item.proveedor_id ||
        null,

      categoria_id:
        item.categoria_id ||
        null,

      tipo_producto:
        item.tipo_producto ||
        'simple',

      raw_data: {
        original_sku:
          item.sku ||
          null,
      },
    },

    // ================================================
    // RAW
    // ================================================

    raw: item,
  }
}

// ======================================================
// IMPUESTOS
// ======================================================

function generarImpuestos(
  rate
) {
  const parsedRate =
    safeNumber(
      rate,
      0
    )

  if (parsedRate <= 0) {
    return []
  }

  return [
    {
      type: 'IVA',

      rate:
        roundSAT(
          parsedRate
        ),
    },
  ]
}

// ======================================================
// IVA
// ======================================================

function obtenerTasaIVA(item) {

  console.log('🔍 OBTENER IVA',item)

  console.log('item.iva_rate', item.iva_rate)

  console.log('item.tasa_iva', item.tasa_iva)

  console.log('item.tax_rate', item.tax_rate)

  console.log('item.impuesto_rate', item.impuesto_rate)

  console.log('DEFAULT_TAX_RATE', DEFAULT_TAX_RATE)

  const tasa =
    item.iva_rate ??
    item.tasa_iva ??
    item.tax_rate ??
    item.impuesto_rate ??
    DEFAULT_TAX_RATE

  console.log('✅ IVA SELECCIONADO', tasa)

  return roundSAT(
    safeNumber(
      tasa,
      DEFAULT_TAX_RATE
    )
  )
}

// ======================================================
// DESCRIPCIÓN
// ======================================================

function obtenerDescripcion(
  item
) {
  const descripcion =
    cleanString(
      item.producto_nombre
    ) ||
    cleanString(
      item.nombre
    ) ||
    cleanString(
      item.description
    ) ||
    cleanString(
      item.descripcion
    ) ||
    'Producto'

  return descripcion.slice(
    0,
    MAX_DESCRIPTION_LENGTH
  )
}

// ======================================================
// VALIDACIONES
// ======================================================

function validarItem(
  item,
  index
) {
  if (!item) {
    throw new Error(
      `Item inválido en índice ${index}`
    )
  }

  const cantidad =
    safeNumber(
      item.cantidad,
      0
    )

  if (cantidad <= 0) {
    throw new Error(
      `Cantidad inválida en índice ${index}`
    )
  }

  const precio =
    safeNumber(
      item.precio_unitario,
      item.price
    )

  if (precio < 0) {
    throw new Error(
      `Precio inválido en índice ${index}`
    )
  }

  const descripcion =
    obtenerDescripcion(
      item
    )

  if (!descripcion) {
    throw new Error(
      `Descripción requerida en índice ${index}`
    )
  }
}

// ======================================================
// HELPERS
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

function cleanString(
  value
) {
  if (
    value === null ||
    value === undefined
  ) {
    return ''
  }

  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
}

function normalizarClaveSAT(
  value,
  fallback
) {
  const cleaned =
    cleanString(value)

  if (!cleaned) {
    return fallback
  }

  return cleaned
}

// ======================================================
// TOTALES GLOBALES CFDI
// ======================================================

export function calcularTotalesSAT(
  conceptos = []
) {
  const subtotal =
    roundSAT(
      conceptos.reduce(
        (acc, item) =>
          acc +
          safeNumber(
            item.subtotal
          ),
        0
      )
    )

  const descuento =
    roundSAT(
      conceptos.reduce(
        (acc, item) =>
          acc +
          safeNumber(
            item.descuento
          ),
        0
      )
    )

  const iva =
    roundSAT(
      conceptos.reduce(
        (acc, item) =>
          acc +
          safeNumber(
            item.iva
          ),
        0
      )
    )

  const total =
    roundSAT(
      subtotal + iva
    )

  return {
    subtotal,
    descuento,
    iva,
    total,
  }
}