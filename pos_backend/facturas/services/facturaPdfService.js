// facturas/services/facturaPdfService.js
// VERSION EMPRESARIAL ROBUSTA
// Wrapper PDF CFDI + Validaciones + Compatibilidad Legacy

import {
  generarPDFFactura,
} from '../utils/generarPDFFactura.js'

// ======================================================
// GENERAR PDF CUSTOM
// ======================================================

export async function generarPDFCustom(
  data = {}
) {
  try {
    validarPayloadPDF(data)

    const pdfBuffer =
      await generarPDFFactura({
        factura:
          data.factura || {},

        pedido:
          data.pedido || {},

        clienteFiscal:
          data.clienteFiscal || {},

        conceptos:
          normalizarConceptos(
            data.conceptos || []
          ),

        subtotal:
          safeNumber(
            data.subtotal
          ),

        iva:
          safeNumber(data.iva),

        total:
          safeNumber(
            data.total
          ),

        folio:
          data.folio || '',
      })

    if (
      !pdfBuffer ||
      !(pdfBuffer instanceof Buffer)
    ) {
      throw new Error(
        'No se generó un PDF válido'
      )
    }

    return pdfBuffer
  } catch (error) {
    console.error(
      'generarPDFCustom error:',
      error
    )

    throw new Error(
      `Error generando PDF CFDI: ${error.message}`
    )
  }
}

// ======================================================
// ALIAS LEGACY
// Compatibilidad con código existente
// ======================================================

export const generarPDFBuffer =
  generarPDFCustom

// ======================================================
// VALIDACIONES
// ======================================================

function validarPayloadPDF(
  data
) {
  if (!data) {
    throw new Error(
      'Datos PDF requeridos'
    )
  }

  if (!data.factura) {
    throw new Error(
      'Factura requerida'
    )
  }

  if (!data.pedido) {
    throw new Error(
      'Pedido requerido'
    )
  }

  if (
    !data.clienteFiscal
  ) {
    throw new Error(
      'Cliente fiscal requerido'
    )
  }

  if (
    !Array.isArray(
      data.conceptos
    )
  ) {
    throw new Error(
      'Conceptos inválidos'
    )
  }
}

// ======================================================
// NORMALIZAR CONCEPTOS
// ======================================================

function normalizarConceptos(
  conceptos = []
) {
  return conceptos.map(
    (item) => ({
      descripcion:
        item.descripcion ||
        item.producto_nombre ||
        'Producto',

      cantidad:
        safeNumber(
          item.cantidad,
          1
        ),

      valor_unitario:
        safeNumber(
          item.valor_unitario ||
            item.precio_unitario
        ),

      importe:
        safeNumber(
          item.importe
        ) ||
        safeNumber(
          item.cantidad
        ) *
          safeNumber(
            item.valor_unitario ||
              item.precio_unitario
          ),

      sku:
        item.sku || '',

      impuestos:
        safeNumber(
          item.impuestos
        ),

      product_key:
        item.product_key ||
        item.clave_sat ||
        '01010101',

      unit_key:
        item.unit_key ||
        item.clave_unidad ||
        'H87',

      unit_name:
        item.unit_name ||
        'Pieza',
    })
  )
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