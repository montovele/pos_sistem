// facturas/integrations/facturapi/descargarPDF.js

import FacturapiModule from 'facturapi'

const Facturapi =
  FacturapiModule.default ||
  FacturapiModule

const facturapi =
  new Facturapi(
    process.env.FACTURAPI_API_KEY
  )

/**
 * =========================================================
 * STREAM -> BUFFER
 * =========================================================
 */

async function streamToBuffer(
  stream
) {
  const chunks = []

  for await (
    const chunk of stream
  ) {
    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}

/**
 * =========================================================
 * DESCARGAR PDF CFDI
 * =========================================================
 *
 * @param {String} invoiceId
 *
 * @returns {Promise<{
 *   success: Boolean,
 *   pdfBuffer: Buffer|null,
 *   base64: String|null,
 *   error: String|null
 * }>}
 *
 * =========================================================
 */

export async function descargarPDF(
  invoiceId
) {
  try {
    if (!invoiceId) {
      throw new Error(
        'invoiceId requerido'
      )
    }

    /**
     * =====================================================
     * DESCARGAR PDF
     * =====================================================
     */

    const pdfStream =
      await facturapi.invoices
        .downloadPdf(
          invoiceId
        )

    /**
     * =====================================================
     * BUFFER PDF
     * =====================================================
     */

    const pdfBuffer =
      await streamToBuffer(
        pdfStream
      )

    /**
     * =====================================================
     * BASE64
     * =====================================================
     */

    const base64 =
      pdfBuffer.toString(
        'base64'
      )

    /**
     * =====================================================
     * RESPONSE
     * =====================================================
     */

    return {
      success: true,

      pdfBuffer,

      base64,

      error: null,
    }
  } catch (error) {
    console.error(
      '[FACTURAPI_PDF_ERROR]',
      error?.response?.data ||
        error.message ||
        error
    )

    return {
      success: false,

      pdfBuffer: null,

      base64: null,

      error:
        error?.response?.data?.message ||
        error.message ||
        'Error descargando PDF',
    }
  }
}