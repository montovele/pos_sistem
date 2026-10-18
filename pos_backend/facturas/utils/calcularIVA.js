// facturas/utils/calcularIVA.js
// ENGINE FISCAL CFDI 4.0 ROBUSTO

// ======================================================
// CONSTANTES
// ======================================================

export const IVA_RATE = 0.16

export const TAX_OBJECT = {
  TAXABLE: '02',
  EXEMPT: '01',
  NOT_SUBJECT: '03',
}


// ======================================================
// HELPERS MODULARES
// ======================================================

export function calcularImporte(
  cantidad = 0,
  precioUnitario = 0
) {
  return roundSAT(
    safeNumber(cantidad) *
      safeNumber(precioUnitario)
  )
}

export function calcularIVAImporte(
  subtotal = 0,
  tasa = IVA_RATE
) {
  return roundSAT(
    safeNumber(subtotal) *
      safeNumber(tasa)
  )
}
// ======================================================
// HELPERS
// ======================================================

export function safeNumber(
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

export function roundSAT(
  value,
  decimals = 2
) {
  return Number(
    safeNumber(value).toFixed(
      decimals
    )
  )
}

// ======================================================
// CALCULAR IMPUESTO
// ======================================================

export function calcularImpuesto({
  base = 0,
  tasa = IVA_RATE,
  incluido = false,
}) {
  const safeBase =
    safeNumber(base)

  const safeRate =
    safeNumber(tasa)

  // ============================================
  // IVA INCLUIDO
  // ============================================

  if (incluido) {
    const subtotal =
      safeBase /
      (1 + safeRate)

    const impuesto =
      safeBase - subtotal

    return {
      subtotal:
        roundSAT(
          subtotal
        ),

      impuesto:
        roundSAT(
          impuesto
        ),

      total:
        roundSAT(
          safeBase
        ),
    }
  }

  // ============================================
  // IVA NORMAL
  // ============================================

  const impuesto =
    safeBase * safeRate

  const total =
    safeBase + impuesto

  return {
    subtotal:
      roundSAT(
        safeBase
      ),

    impuesto:
      roundSAT(
        impuesto
      ),

    total:
      roundSAT(total),
  }
}

// ======================================================
// CALCULAR CONCEPTO CFDI
// ======================================================

export function calcularConceptoCFDI(
  item = {}
) {
  const cantidad =
    safeNumber(
      item.cantidad,
      1
    )

  const valorUnitario =
    safeNumber(
      item.valor_unitario ||
        item.precio_unitario
    )

  const descuento =
    safeNumber(
      item.descuento
    )

  const tasa =
    safeNumber(
      item.tasa_iva,
      IVA_RATE
    )

  const objetoImp =
    item.objeto_imp ||
    TAX_OBJECT.TAXABLE

  // ============================================
  // IMPORTE BASE
  // ============================================

  const importeBruto =
    cantidad *
    valorUnitario

  const base =
    importeBruto -
    descuento

  // ============================================
  // EXENTO
  // ============================================

  if (
    objetoImp !==
    TAX_OBJECT.TAXABLE
  ) {
    return {
      cantidad,

      valor_unitario:
        roundSAT(
          valorUnitario
        ),

      importe:
        roundSAT(base),

      descuento:
        roundSAT(
          descuento
        ),

      subtotal:
        roundSAT(base),

      iva: 0,

      total:
        roundSAT(base),

      objeto_imp:
        objetoImp,

      impuestos: [],
    }
  }

  // ============================================
  // IMPUESTOS
  // ============================================

  const calc =
    calcularImpuesto({
      base,
      tasa,
    })

  return {
    cantidad,

    valor_unitario:
      roundSAT(
        valorUnitario
      ),

    importe:
      roundSAT(base),

    descuento:
      roundSAT(
        descuento
      ),

    subtotal:
      calc.subtotal,

    iva:
      calc.impuesto,

    total:
      calc.total,

    objeto_imp:
      objetoImp,

    impuestos: [
      {
        impuesto: '002',

        tipo_factor:
          'Tasa',

        tasa_cuota:
          tasa,

        importe:
          calc.impuesto,

        base:
          calc.subtotal,
      },
    ],
  }
}

// ======================================================
// CALCULAR TOTALES CFDI
// ======================================================

export function calcularTotalesCFDI(
  conceptos = []
) {
  const acumulado =
    conceptos.reduce(
      (acc, item) => {
        acc.subtotal +=
          safeNumber(
            item.subtotal ||
              item.importe
          )

        acc.descuentos +=
          safeNumber(
            item.descuento
          )

        acc.iva +=
          safeNumber(
            item.iva ||
              item.impuestos
          )

        acc.total +=
          safeNumber(
            item.total
          )

        return acc
      },

      {
        subtotal: 0,
        descuentos: 0,
        iva: 0,
        total: 0,
      }
    )

  return {
    subtotal:
      roundSAT(
        acumulado.subtotal
      ),

    descuentos:
      roundSAT(
        acumulado.descuentos
      ),

    iva:
      roundSAT(
        acumulado.iva
      ),

    total:
      roundSAT(
        acumulado.total
      ),
  }
}

// ======================================================
// HELPERS LEGACY
// ======================================================

export function calcularSubtotal(
  items = []
) {
  return roundSAT(
    items.reduce(
      (acc, item) => {
        return (
          acc +
          safeNumber(
            item.subtotal ||
              item.importe
          )
        )
      },
      0
    )
  )
}

export function calcularIVA(
  items = []
) {
  // ============================================
  // LEGACY NUMBER
  // calcularIVA(100)
  // ============================================

  if (
    typeof items ===
    'number'
  ) {
    return roundSAT(
      items * IVA_RATE
    )
  }

  return roundSAT(
    items.reduce(
      (acc, item) => {
        return (
          acc +
          safeNumber(
            item.iva ||
              item.impuestos
          )
        )
      },
      0
    )
  )
}

export function calcularTotal(
  subtotal = 0,
  iva = 0
) {
  return roundSAT(
    safeNumber(
      subtotal
    ) +
      safeNumber(iva)
  )
}