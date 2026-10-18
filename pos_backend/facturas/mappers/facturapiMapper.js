// ======================================================
// facturas/mappers/facturapiMapper.js
// FACTURAPI SAFE MAPPER FINAL STABLE
// ======================================================

// ======================================================
// SAFE STRING
// ======================================================

function safeString(
  value,
  fallback = ''
) {

  if (
    value === undefined ||
    value === null
  ) {

    return fallback

  }

  return String(value)
    .trim()

}

// ======================================================
// SAFE MONEY
// ======================================================
function safeMoney(
  value,
  fallback = 0.01
) {

  // ==========================================
  // NULL / UNDEFINED
  // ==========================================

  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {

    return fallback

  }

  // ==========================================
  // NORMALIZAR
  // ==========================================

  const normalized =
    String(value)
      .replace(/[^0-9.-]/g, '')
      .trim()

  const parsed =
    Number(normalized)

  // ==========================================
  // INVALID
  // ==========================================

  if (
    !Number.isFinite(parsed)
  ) {

    return fallback

  }

  // ==========================================
  // SAT NO ACEPTA <= 0
  // ==========================================

  if (parsed <= 0) {

    return fallback

  }

  // ==========================================
  // FACTURAPI SAFE DECIMALS
  // ==========================================

  return Number(
    parsed.toFixed(2)
  )

}

// ======================================================
// SAFE QUANTITY
// ======================================================

function safeQuantity(
  value,
  fallback = 1
) {

  const parsed =
    Number(value)

  if (
    !Number.isFinite(parsed)
  ) {

    return fallback

  }

  if (parsed <= 0) {

    return fallback

  }

  return parsed

}
// ======================================================
// FACTURAPI CLEAN MAPPER
// FRONTEND PRICE = SOURCE OF TRUTH
// ======================================================
// ======================================================
// MAP CONCEPTOS FACTURAPI (DEBUG + SAFE + SAT FIX)
// ======================================================
function normalizeRate(rate) {

  if (rate === null || rate === undefined) return null

  let numeric = Number(rate)

  if (!Number.isFinite(numeric)) return null

  // ===============================
  // CASO 1: porcentaje SAT (8, 16)
  // ===============================
  if (numeric > 1) {
    numeric = numeric / 100
  }

  // ===============================
  // CASO 2: CORRUPCIÓN DETECTADA
  // (0.0008 → probablemente 0.08)
  // ===============================
  if (numeric > 0 && numeric < 0.01) {

    console.warn('[TAX CORRUPTED DETECTED]', {
      original: rate,
      numeric
    })

    // 🔥 RECUPERACIÓN INTELIGENTE
    numeric = numeric * 100
  }

  // ===============================
  // VALIDACIÓN FINAL
  // ===============================
  const validRates = [0, 0.04, 0.08, 0.16]

  const matched = validRates.find(
    r => Math.abs(r - numeric) < 0.0001
  )

  console.log('[TAX NORMALIZE]', {
    original: rate,
    normalized: numeric,
    matched
  })

  return matched ?? null
}
export function mapConceptosToFacturapi(conceptos = []) {

  console.log('🚀 FACTURAPI MAPPER START', {
    total_conceptos: conceptos?.length || 0
  })
  

  if (!Array.isArray(conceptos)) {
    console.warn('⚠️ Conceptos inválidos:', conceptos)
    return []
  }

  return conceptos.map((concepto, index) => {
console.log(
  '🔍 CONCEPTO RAW COMPLETO',
  JSON.stringify(concepto, null, 2)
)

console.log(
  '🔍 concepto.impuestos',
  concepto.impuestos
)

console.log(
  '🔍 concepto.product?.taxes',
  concepto.product?.taxes
)
    console.group(`📦 ITEM ${index}`)

    // ==================================================
    // QUANTITY
    // ==================================================
    const quantity = safeQuantity(
      concepto.quantity ??
      concepto.cantidad ??
      1
    )

    // ==================================================
    // PRICE (SOURCE OF TRUTH)
    // ==================================================
    const price = safeMoney(
      concepto.valor_unitario ??
      concepto.precio_unitario ??
      concepto.product?.price ??
      concepto.price ??
      concepto.raw?.precio_unitario ??
      0.01
    )

    // ==================================================
    // DESCRIPTION
    // ==================================================
    const description =
      safeString(concepto.product?.description) ||
      safeString(concepto.producto_nombre) ||
      safeString(concepto.descripcion) ||
      safeString(concepto.nombre) ||
      safeString(concepto.sku) ||
      'Producto'

    // ==================================================
    // SAT KEYS
    // ==================================================
    const productKey =
      safeString(
        concepto.product?.product_key ??
        concepto.product_key ??
        concepto.clave_producto ??
        concepto.clave_sat
      ) || '01010101'

    const unitKey =
      safeString(
        concepto.product?.unit_key ??
        concepto.unit_key ??
        concepto.clave_unidad
      ) || 'H87'

    // ==================================================
    // TAXES FIXED (CRITICAL PART)
    // ==================================================

let rawTaxes = []

// ==================================================
// 1. FRONTEND (CFDI real)
// ==================================================
if (Array.isArray(concepto.impuestos) && concepto.impuestos.length) {

  rawTaxes = concepto.impuestos

}

// ==================================================
// 2. BD / NORMALIZADO SAT (CRÍTICO)
// ==================================================
else if (Array.isArray(concepto.raw?.impuestos) && concepto.raw.impuestos.length) {

  rawTaxes = concepto.raw.impuestos

}

// ==================================================
// 3. TRASLADOS (FACTURACIÓN REAL)
// ==================================================
else if (Array.isArray(concepto.traslados) && concepto.traslados.length) {

  rawTaxes = concepto.traslados

}

// ==================================================
// 4. PRODUCT TAXES
// ==================================================
else if (Array.isArray(concepto.product?.taxes) && concepto.product.taxes.length) {

  rawTaxes = concepto.product.taxes

}

// ==================================================
// 5. IVA RATE DIRECTO (fallback correcto)
// ==================================================
else if (concepto.iva_rate !== undefined || concepto.tasa_iva !== undefined) {

  const rate =
    concepto.tasa_iva ??
    concepto.iva_rate ??
    concepto.tax_rate ??
    concepto.impuesto_rate

  rawTaxes = [
    {
      type: 'IVA',
      rate
    }
  ]
}

// ==================================================
// 6. FALLBACK FINAL
// ==================================================
else {

  console.warn('⚠️ SIN IMPUESTOS → fallback 16%')

  rawTaxes = [
    {
      type: 'IVA',
      rate: 0.16
    }
  ]
}

// ==================================================
// PRIORIDAD 1
// taxes generado por frontend
// ==================================================

if (
  Array.isArray(concepto.taxes) &&
  concepto.taxes.length
) {

  rawTaxes = concepto.taxes

}

// ==================================================
// PRIORIDAD 2
// taxes generado por product
// ==================================================

else if (
  Array.isArray(concepto.product?.taxes) &&
  concepto.product.taxes.length
) {

  rawTaxes = concepto.product.taxes

}

// ==================================================
// PRIORIDAD 3
// iva_rate calculado
// ==================================================

else if (
  Number.isFinite(
    Number(concepto.iva_rate)
  )
) {

  rawTaxes = [
    {
      type: 'IVA',
      rate: Number(
        concepto.iva_rate
      )
    }
  ]

}

// ==================================================
// FALLBACK
// ==================================================

else {

  console.warn(
    '⚠️ IVA no encontrado → fallback 16%'
  )

  rawTaxes = [
    {
      type: 'IVA',
      rate: 0.16
    }
  ]

}

    const taxes = rawTaxes
      .map(tax => {

        const rate = normalizeRate(
          tax.rate ??
          tax.tasa_cuota ??
          tax.rate_value
        )

        if (rate === null) {
          console.warn('❌ TAX INVALIDO IGNORADO', tax)
          return null
        }

        return {
          type: 'IVA',
          rate
        }
      })
      .filter(Boolean)

    // ==================================================
    // CRITICAL FALLBACK (EVITA IVA = 0)
    // ==================================================
    if (taxes.length === 0) {
      console.warn('⚠️ SIN IMPUESTOS → aplicando IVA default 16%')

      taxes.push({
        type: 'IVA',
        rate: 0.16
      })
    }

    // ==================================================
    // DEBUG FINAL ITEM
    // ==================================================
    console.log('💰 FACTURAPI ITEM FINAL', {
      quantity,
      price,
      description,
      productKey,
      unitKey,
      taxes
    })

    console.groupEnd()

    return {

      quantity,

      product: {

        description,

        product_key: productKey,

        unit_key: unitKey,

        tax_included: false,

        price,

        taxes,

      }

    }
  })
}



// ======================================================
// MAP CUSTOMER
// ======================================================

export function mapCustomerToFacturapi(
  clienteFiscal = {}
) {

  return {

    legal_name:

      safeString(
        clienteFiscal.razon_social
      ),

    email:

      safeString(
        clienteFiscal.correo_facturacion
      ),

    tax_id:

      safeString(
        clienteFiscal.rfc
      ).toUpperCase(),

    tax_system:

      safeString(
        clienteFiscal.regimen_fiscal
      ) ||

      '616',

    address: {

      zip:

        safeString(
          clienteFiscal.cp
        ),

    },

  }

}

// ======================================================
// EXPORTS
// ======================================================

export {

  safeMoney,
  safeQuantity,
  safeString,

}