// facturas/services/pdf/builder/totalesBuilder.js
// ======================================================
// TOTALES BUILDER EMPRESARIAL
// ======================================================

import {
  formatCurrency,
} from '../helpers/currency.js'

// ======================================================

export async function buildTotales(
  doc,
  data = {}
) {

  const {
    subtotal = 0,
    iva = 0,
    total = 0,
    retenciones = 0,
  } = data

  let y =
    data.startY || 620

  const boxX = 340
  const boxWidth = 220

  // ====================================================
  // BOX
  // ====================================================

  doc
    .roundedRect(
      boxX,
      y,
      boxWidth,
      110,
      8
    )
    .stroke()

  y += 15

  // ====================================================
  // SUBTOTAL
  // ====================================================

  buildTotalRow(
    doc,
    'Subtotal',
    subtotal,
    y
  )

  y += 20

  // ====================================================
  // IVA
  // ====================================================

  buildTotalRow(
    doc,
    'IVA',
    iva,
    y
  )

  y += 20

  // ====================================================
  // RETENCIONES
  // ====================================================

  if (
    Number(retenciones) > 0
  ) {

    buildTotalRow(
      doc,
      'Retenciones',
      retenciones,
      y
    )

    y += 20

  }

  // ====================================================
  // LINE
  // ====================================================

  doc
    .moveTo(
      boxX + 10,
      y
    )
    .lineTo(
      boxX + 210,
      y
    )
    .stroke()

  y += 12

  // ====================================================
  // TOTAL
  // ====================================================

  doc
    .font('Helvetica-Bold')
    .fontSize(13)

  doc.text(
    'TOTAL',
    boxX + 15,
    y
  )

  doc.text(
    formatCurrency(total),
    boxX + 95,
    y,
    {
      width: 100,
      align: 'right',
    }
  )

  return y + 40

}

// ======================================================

function buildTotalRow(
  doc,
  label,
  amount,
  y
) {

  doc
    .font('Helvetica')
    .fontSize(10)

  doc.text(
    label,
    355,
    y
  )

  doc.text(
    formatCurrency(amount),
    430,
    y,
    {
      width: 110,
      align: 'right',
    }
  )

}