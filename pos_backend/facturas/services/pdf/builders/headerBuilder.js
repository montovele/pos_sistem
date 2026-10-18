// facturas/services/pdf/builder/headerBuilder.js
// ======================================================
// HEADER BUILDER EMPRESARIAL CFDI 4.0
// ======================================================

import fs from 'fs'
import path from 'path'

import {
  formatDateSAT,
} from '../helpers/satFormatter.js'

// ======================================================

const DEFAULT_LOGO =
  path.resolve(
    'storage/assets/logo.png'
  )

// ======================================================

export async function buildHeader(
  doc,
  data = {}
) {

  const {
    factura = {},
    emisor = {},
  } = data

  // ====================================================
  // CONFIG
  // ====================================================

  const startY = 35

  // ====================================================
  // LOGO
  // ====================================================

  try {

    if (
      fs.existsSync(DEFAULT_LOGO)
    ) {

      doc.image(
        DEFAULT_LOGO,
        40,
        startY,
        {
          width: 120,
        }
      )

    }

  } catch (error) {

    console.error(
      'Logo error:',
      error.message
    )

  }

  // ====================================================
  // TITULO
  // ====================================================

  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .text(
      'FACTURA CFDI 4.0',
      360,
      startY,
      {
        align: 'right',
      }
    )

  // ====================================================
  // BOX FACTURA
  // ====================================================

  doc
    .roundedRect(
      340,
      70,
      220,
      130,
      8
    )
    .stroke()

  const left = 355
  let y = 85

  buildRow(
    doc,
    'UUID',
    factura.uuid,
    left,
    y
  )

  y += 18

  buildRow(
    doc,
    'Serie',
    factura.serie,
    left,
    y
  )

  y += 18

  buildRow(
    doc,
    'Folio',
    factura.folio,
    left,
    y
  )

  y += 18

  buildRow(
    doc,
    'Fecha',
    formatDateSAT(
      factura.fecha_timbrado
    ),
    left,
    y
  )

  y += 18

  buildRow(
    doc,
    'Moneda',
    factura.moneda || 'MXN',
    left,
    y
  )

  y += 18

  buildRow(
    doc,
    'Tipo CFDI',
    factura.tipo_cfdi ||
      'I',
    left,
    y
  )

  // ====================================================
  // EMISOR
  // ====================================================

  const emisorY = 220

  doc
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(
      'EMISOR',
      40,
      emisorY
    )

  doc
    .font('Helvetica')
    .fontSize(9)

  doc.text(
    emisor.razon_social || '',
    40,
    emisorY + 20
  )

  doc.text(
    `RFC: ${emisor.rfc || ''}`,
    40,
    emisorY + 35
  )

  doc.text(
    `Régimen Fiscal: ${
      emisor.regimen_fiscal || ''
    }`,
    40,
    emisorY + 50
  )

  return emisorY + 80

}

// ======================================================

function buildRow(
  doc,
  label,
  value,
  x,
  y
) {

  doc
    .font('Helvetica-Bold')
    .fontSize(8)
    .text(
      `${label}:`,
      x,
      y
    )

  doc
    .font('Helvetica')
    .text(
      String(value || '-'),
      x + 55,
      y,
      {
        width: 140,
      }
    )

}