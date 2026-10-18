// facturas/integrations/facturapi/descargarXML.js

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
 * DESCARGAR XML CFDI
 * =========================================================
 *
 * @param {String} invoiceId
 *
 * @returns {Promise<{
 *   success: Boolean,
 *   xmlBuffer: Buffer|null,
 *   xmlString: String|null,
 *   error: String|null
 * }>}
 *
 * =========================================================
 */

export async function descargarXML(
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
     * DESCARGAR STREAM XML
     * =====================================================
     */

    const xmlStream =
      await facturapi.invoices
        .downloadXml(
          invoiceId
        )

    /**
     * =====================================================
     * CONVERTIR BUFFER
     * =====================================================
     */

    const xmlBuffer =
      await streamToBuffer(
        xmlStream
      )

    /**
     * =====================================================
     * STRING XML
     * =====================================================
     */

    const xmlString =
      xmlBuffer.toString(
        'utf8'
      )

    /**
     * =====================================================
     * RESPONSE
     * =====================================================
     */

    return {
      success: true,

      xmlBuffer,

      xmlString,

      error: null,
    }
  } catch (error) {
    console.error(
      '[FACTURAPI_XML_ERROR]',
      error?.response?.data ||
        error.message ||
        error
    )

    return {
      success: false,

      xmlBuffer: null,

      xmlString: null,

      error:
        error?.response?.data?.message ||
        error.message ||
        'Error descargando XML',
    }
  }
}