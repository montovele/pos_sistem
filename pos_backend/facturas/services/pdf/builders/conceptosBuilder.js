// facturas/services/pdf/builder/conceptosBuilder.js
// ======================================================
// CONCEPTOS BUILDER EMPRESARIAL
// ======================================================

import {
  formatCurrency,
} from '../helpers/currency.js'

import {
  checkPageBreak,
} from '../helpers/pagination.js'

// ======================================================

const TABLE_START_X = 40

const COLS = {
  clave: 40,
  descripcion: 120,
  cantidad: 350,
  precio: 420,
  importe: 500,
}

// ======================================================

export async function buildConceptos(
  doc,
  data = {}
) {

  const {
    conceptos = [],
  } = data

  let y = data.startY || 320

  // ====================================================
  // TITLE
  // ====================================================

  doc
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(
      'CONCEPTOS',
      TABLE_START_X,
      y
    )

  y += 25

  // ====================================================
  // HEADER TABLE
  // ====================================================

  drawTableHeader(
    doc,
    y
  )

  y += 22

  // ====================================================
  // ITEMS
  // ====================================================

  for (const item of conceptos) {

    y = checkPageBreak(
      doc,
      y,
      120
    )

    const rowHeight =
      calculateRowHeight(
        doc,
        item.descripcion
      )

    drawConceptoRow(
      doc,
      item,
      y,
      rowHeight
    )

    y += rowHeight + 12

  }

  // ====================================================
  // LINE
  // ====================================================

  doc
    .moveTo(40, y)
    .lineTo(560, y)
    .stroke()

  return y + 20

}

// ======================================================

function drawTableHeader(
  doc,
  y
) {

  doc
    .rect(
      40,
      y,
      520,
      20
    )
    .fillAndStroke(
      '#EAEAEA',
      '#000'
    )

  doc.fillColor('#000')

  doc
    .font('Helvetica-Bold')
    .fontSize(8)

  doc.text(
    'CLAVE',
    COLS.clave,
    y + 6
  )

  doc.text(
    'DESCRIPCIÓN',
    COLS.descripcion,
    y + 6
  )

  doc.text(
    'CANT.',
    COLS.cantidad,
    y + 6
  )

  doc.text(
    'PRECIO',
    COLS.precio,
    y + 6
  )

  doc.text(
    'IMPORTE',
    COLS.importe,
    y + 6
  )

}

// ======================================================

function drawConceptoRow(
  doc,
  item,
  y,
  rowHeight
) {

  doc
    .font('Helvetica')
    .fontSize(8)

  doc.text(
    item.clave_producto ||
      '01010101',
    COLS.clave,
    y,
    {
      width: 70,
    }
  )

  doc.text(
    item.descripcion || '',
    COLS.descripcion,
    y,
    {
      width: 210,
    }
  )

  doc.text(
    String(
      item.cantidad || 1
    ),
    COLS.cantidad,
    y
  )

  doc.text(
    formatCurrency(
      item.valor_unitario ||
      item.precio ||
      0
    ),
    COLS.precio,
    y
  )

  doc.text(
    formatCurrency(
      item.importe || 0
    ),
    COLS.importe,
    y
  )

  // ================================================
  // ROW BORDER
  // ================================================

  doc
    .moveTo(40, y + rowHeight + 6)
    .lineTo(
      560,
      y + rowHeight + 6
    )
    .stroke()

}

// ======================================================

function calculateRowHeight(
  doc,
  text = ''
) {

  const height =
    doc.heightOfString(
      text,
      {
        width: 210,
      }
    )

  return Math.max(
    height,
    20
  )

}