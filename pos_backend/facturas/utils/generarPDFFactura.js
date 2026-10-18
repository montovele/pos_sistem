// facturas/utils/generarPDFFactura.js
// VERSION EMPRESARIAL ROBUSTA
// CFDI 4.0 + PAGINACIÓN + QR + VALIDACIONES + SAT READY

import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'

// ======================================================
// CONFIG
// ======================================================

const COLORS = {
  primary: '#0f172a',
  secondary: '#334155',
  border: '#cbd5e1',
  light: '#f8fafc',
  muted: '#64748b',
  white: '#ffffff',
}

const PAGE = {
  width: 595,
  height: 842,
  margin: 40,
}

// ======================================================
// MAIN
// ======================================================

export async function generarPDFFactura({
  factura = {},
  pedido = {},
  clienteFiscal = {},
  conceptos = [],
  subtotal = 0,
  iva = 0,
  total = 0,
  folio = '',
}) {
  validarDatos({
    factura,
    clienteFiscal,
    conceptos,
  })

  return new Promise(
    async (
      resolve,
      reject
    ) => {
      try {
        // ============================================
        // DOC
        // ============================================

        const doc =
          new PDFDocument({
            size: 'A4',
            margin:
              PAGE.margin,
            bufferPages: true,
            autoFirstPage: true,
          })

        const buffers = []

        doc.on(
          'data',
          buffers.push.bind(
            buffers
          )
        )

        doc.on(
          'end',
          () => {
            resolve(
              Buffer.concat(
                buffers
              )
            )
          }
        )

        // ============================================
        // HELPERS
        // ============================================

        const money = (
          value = 0
        ) =>
          Number(
            value || 0
          ).toLocaleString(
            'es-MX',
            {
              style:
                'currency',
              currency:
                'MXN',
              minimumFractionDigits: 2,
            }
          )

        let currentY = 40

        // ============================================
        // HEADER
        // ============================================

        currentY =
          drawHeader({
            doc,
            factura,
            folio,
            currentY,
          })

        // ============================================
        // EMISOR
        // ============================================

        currentY =
          drawEmisor({
            doc,
            currentY,
          })

        // ============================================
        // RECEPTOR
        // ============================================

        currentY =
          drawReceptor({
            doc,
            clienteFiscal,
            currentY,
          })

        // ============================================
        // PEDIDO
        // ============================================

        currentY =
          drawPedido({
            doc,
            pedido,
            currentY,
          })

        // ============================================
        // TABLA HEADER
        // ============================================

        currentY =
          drawTableHeader({
            doc,
            currentY,
          })

        // ============================================
        // CONCEPTOS
        // ============================================

        for (const item of conceptos) {
          const rowHeight =
            calcularRowHeight(
              doc,
              item.descripcion
            )

          // ========================================
          // AUTO PAGE
          // ========================================

          if (
            currentY +
              rowHeight >
            690
          ) {
            doc.addPage()

            currentY = 40

            currentY =
              drawTableHeader({
                doc,
                currentY,
              })
          }

          currentY =
            drawConcepto({
              doc,
              item,
              currentY,
              rowHeight,
              money,
            })
        }

        // ============================================
        // TOTALES
        // ============================================

        currentY =
          drawTotales({
            doc,
            subtotal,
            iva,
            total,
            currentY,
            money,
          })

        // ============================================
        // UUID BOX
        // ============================================

        currentY =
          drawUUIDBox({
            doc,
            factura,
            currentY,
          })

        // ============================================
        // QR SAT
        // ============================================

        currentY =
          await drawQRCode({
            doc,
            factura,
            total,
            currentY,
          })

        // ============================================
        // FOOTER
        // ============================================

        drawFooter(doc)

        // ============================================
        // END
        // ============================================

        doc.end()
      } catch (error) {
        reject(error)
      }
    }
  )
}

// ======================================================
// HEADER
// ======================================================

function drawHeader({
  doc,
  factura,
  folio,
  currentY,
}) {
  doc
    .fillColor(
      COLORS.primary
    )
    .fontSize(22)
    .font(
      'Helvetica-Bold'
    )
    .text(
      'FACTURA CFDI 4.0',
      40,
      currentY
    )

  doc
    .fontSize(10)
    .font(
      'Helvetica'
    )
    .fillColor(
      COLORS.secondary
    )

  doc.text(
    `Folio: ${
      folio || 'N/D'
    }`,
    340,
    currentY,
    {
      width: 200,
      align: 'right',
    }
  )

  doc.text(
    `UUID: ${
      factura.uuid ||
      'N/D'
    }`,
    {
      width: 200,
      align: 'right',
    }
  )

  doc.text(
    `Fecha: ${
      factura.fecha ||
      new Date().toLocaleString(
        'es-MX'
      )
    }`,
    {
      width: 200,
      align: 'right',
    }
  )

  doc
    .moveTo(
      40,
      currentY + 70
    )
    .lineTo(
      555,
      currentY + 70
    )
    .strokeColor(
      COLORS.border
    )
    .stroke()

  return currentY + 90
}

// ======================================================
// EMISOR
// ======================================================

function drawEmisor({
  doc,
  currentY,
}) {
  sectionTitle(
    doc,
    'EMISOR',
    currentY
  )

  currentY += 20

  doc
    .fontSize(10)
    .font(
      'Helvetica'
    )
    .fillColor(
      COLORS.secondary
    )

  const fields = [
    process.env
      .FACTURACION_RAZON_SOCIAL ||
      'SSAXXON S.A. DE C.V.',

    `RFC: ${
      process.env
        .FACTURACION_RFC ||
      'XAXX010101000'
    }`,

    `Régimen Fiscal: ${
      process.env
        .FACTURACION_REGIMEN ||
      '601'
    }`,
  ]

  fields.forEach(
    (field) => {
      doc.text(
        field,
        40,
        currentY
      )

      currentY += 15
    }
  )

  return currentY + 20
}

// ======================================================
// RECEPTOR
// ======================================================

function drawReceptor({
  doc,
  clienteFiscal,
  currentY,
}) {
  sectionTitle(
    doc,
    'RECEPTOR',
    currentY
  )

  currentY += 20

  doc
    .fontSize(10)
    .font(
      'Helvetica'
    )
    .fillColor(
      COLORS.secondary
    )

  const fields = [
    clienteFiscal.razon_social,

    `RFC: ${clienteFiscal.rfc}`,

    `CP: ${clienteFiscal.cp}`,

    `Correo: ${
      clienteFiscal.correo_facturacion
    }`,
  ]

  fields.forEach(
    (field) => {
      doc.text(
        field || 'N/D',
        40,
        currentY
      )

      currentY += 15
    }
  )

  return currentY + 20
}

// ======================================================
// PEDIDO
// ======================================================

function drawPedido({
  doc,
  pedido,
  currentY,
}) {
  sectionTitle(
    doc,
    'PEDIDO',
    currentY
  )

  currentY += 20

  doc
    .fontSize(10)
    .font(
      'Helvetica'
    )
    .fillColor(
      COLORS.secondary
    )

  const rows = [
    `Pedido Local: ${
      pedido.id || 'N/D'
    }`,

    `WooCommerce: ${
      pedido.id_woocommerce ||
      'N/D'
    }`,

    `Cliente: ${
      pedido.cliente_nombre ||
      'N/D'
    }`,

    `Método Pago: ${
      pedido.metodo_pago ||
      'N/D'
    }`,
  ]

  rows.forEach(
    (row) => {
      doc.text(
        row,
        40,
        currentY
      )

      currentY += 15
    }
  )

  return currentY + 25
}

// ======================================================
// TABLA HEADER
// ======================================================

function drawTableHeader({
  doc,
  currentY,
}) {
  doc
    .rect(
      40,
      currentY,
      515,
      25
    )
    .fill(
      COLORS.primary
    )

  doc
    .fillColor(
      COLORS.white
    )
    .fontSize(9)
    .font(
      'Helvetica-Bold'
    )

  doc.text(
    'Descripción',
    50,
    currentY + 8
  )

  doc.text(
    'Cant.',
    280,
    currentY + 8
  )

  doc.text(
    'P.Unit',
    340,
    currentY + 8
  )

  doc.text(
    'Importe',
    450,
    currentY + 8
  )

  return currentY + 35
}

// ======================================================
// CONCEPTO
// ======================================================

function drawConcepto({
  doc,
  item,
  currentY,
  rowHeight,
  money,
}) {
  doc
    .fillColor(
      COLORS.primary
    )
    .font(
      'Helvetica'
    )
    .fontSize(9)

  doc.text(
    item.descripcion ||
      'Producto',
    50,
    currentY,
    {
      width: 210,
    }
  )

  doc.text(
    String(
      item.cantidad || 1
    ),
    290,
    currentY
  )

  doc.text(
    money(
      item.valor_unitario
    ),
    340,
    currentY
  )

  doc.text(
    money(
      item.importe ||
        item.subtotal ||
        0
    ),
    440,
    currentY,
    {
      width: 90,
      align: 'right',
    }
  )

  // Línea separadora

  doc
    .moveTo(
      40,
      currentY +
        rowHeight -
        5
    )
    .lineTo(
      555,
      currentY +
        rowHeight -
        5
    )
    .strokeColor(
      '#f1f5f9'
    )
    .stroke()

  return (
    currentY +
    rowHeight
  )
}

// ======================================================
// TOTALES
// ======================================================

function drawTotales({
  doc,
  subtotal,
  iva,
  total,
  currentY,
  money,
}) {
  currentY += 15

  doc
    .moveTo(
      320,
      currentY
    )
    .lineTo(
      555,
      currentY
    )
    .strokeColor(
      COLORS.border
    )
    .stroke()

  currentY += 15

  const rows = [
    [
      'Subtotal',
      subtotal,
    ],

    ['IVA', iva],

    ['Total', total],
  ]

  rows.forEach(
    ([label, value]) => {
      doc
        .font(
          'Helvetica-Bold'
        )
        .fontSize(10)
        .fillColor(
          COLORS.primary
        )

      doc.text(
        label,
        350,
        currentY
      )

      doc.text(
        money(value),
        440,
        currentY,
        {
          width: 90,
          align: 'right',
        }
      )

      currentY += 18
    }
  )

  return currentY + 20
}

// ======================================================
// UUID BOX
// ======================================================

function drawUUIDBox({
  doc,
  factura,
  currentY,
}) {
  doc
    .rect(
      40,
      currentY,
      515,
      70
    )
    .fill(
      COLORS.light
    )

  doc
    .fillColor(
      COLORS.primary
    )
    .fontSize(9)
    .font(
      'Helvetica-Bold'
    )

  doc.text(
    'UUID FISCAL',
    50,
    currentY + 10
  )

  doc
    .font(
      'Helvetica'
    )
    .fontSize(8)

  doc.text(
    factura.uuid ||
      'N/D',
    50,
    currentY + 30,
    {
      width: 470,
    }
  )

  return currentY + 90
}

// ======================================================
// QR SAT
// ======================================================

async function drawQRCode({
  doc,
  factura,
  total,
  currentY,
}) {
  try {
    if (!factura.uuid) {
      return currentY
    }

    const verificationURL =
      factura.verification_url ||
      `https://verificacfdi.facturaelectronica.sat.gob.mx/default.aspx?id=${factura.uuid}`

    const qrDataURL =
      await QRCode.toDataURL(
        verificationURL
      )

    const base64 =
      qrDataURL.replace(
        /^data:image\/png;base64,/,
        ''
      )

    const qrBuffer =
      Buffer.from(
        base64,
        'base64'
      )

    doc.image(
      qrBuffer,
      40,
      currentY,
      {
        width: 80,
      }
    )

    doc
      .fontSize(7)
      .fillColor(
        COLORS.muted
      )

    doc.text(
      `Verificación SAT`,
      135,
      currentY + 8
    )

    doc.text(
      `UUID: ${factura.uuid}`,
      135,
      currentY + 20,
      {
        width: 350,
      }
    )

    doc.text(
      `Total CFDI: ${total}`,
      135,
      currentY + 34
    )

    return currentY + 90
  } catch (error) {
    console.error(
      'QR generation error:',
      error.message
    )

    return currentY
  }
}

// ======================================================
// FOOTER
// ======================================================

function drawFooter(doc) {
  doc
    .fontSize(8)
    .fillColor(
      COLORS.muted
    )

  doc.text(
    'Documento generado automáticamente por el sistema CFDI.',
    40,
    760,
    {
      align: 'center',
      width: 515,
    }
  )
}

// ======================================================
// HELPERS
// ======================================================

function sectionTitle(
  doc,
  title,
  y
) {
  doc
    .fontSize(12)
    .font(
      'Helvetica-Bold'
    )
    .fillColor(
      COLORS.primary
    )
    .text(
      title,
      40,
      y
    )
}

function calcularRowHeight(
  doc,
  text = ''
) {
  const height =
    doc.heightOfString(
      text || '',
      {
        width: 210,
      }
    )

  return Math.max(
    height + 10,
    24
  )
}

function validarDatos({
  factura,
  clienteFiscal,
  conceptos,
}) {
  if (!factura) {
    throw new Error(
      'factura requerida'
    )
  }

  if (!clienteFiscal) {
    throw new Error(
      'clienteFiscal requerido'
    )
  }

  if (
    !Array.isArray(
      conceptos
    )
  ) {
    throw new Error(
      'conceptos inválidos'
    )
  }
}