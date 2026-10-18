// facturas/integrations/facturapi/emitirFactura.js
// INTEGRACION CENTRAL FACTURAPI
// CFDI 4.0 + XML/PDF + CANCELACION + VALIDACION

import dotenv from 'dotenv'
dotenv.config()

import FacturapiModule from 'facturapi'
import { Buffer } from 'buffer'

const Facturapi =
  FacturapiModule.default ||
  FacturapiModule

const facturapi =
  new Facturapi(
    process.env.FACTURAPI_API_KEY
  )

// =====================================================
// HELPERS
// =====================================================

async function streamToBuffer(
  stream
) {
  const chunks = []

  for await (const chunk of stream) {
    chunks.push(chunk)
  }

  return Buffer.concat(chunks)
}

async function streamToBase64(
  stream
) {
  const buffer =
    await streamToBuffer(stream)

  return buffer.toString('base64')
}

// =====================================================
// EMITIR FACTURA CFDI
// =====================================================

export async function emitirFactura(
  payload
) {
  try {
    // ===============================================
    // CLIENTE FACTURAPI
    // ===============================================

    const customer =
      await facturapi.customers.create({
        legal_name:
          payload.customer.legal_name,

        tax_id:
          payload.customer.tax_id,

        tax_system:
          payload.customer.tax_system,

        email:
          payload.customer.email,

        address: {
          zip:
            payload.customer.address
              ?.zip || '00000',
        },
      })

    // ===============================================
    // CREAR CFDI
    // ===============================================

    const invoice =
      await facturapi.invoices.create({
        customer:
          customer.id,

        items:
          payload.items.map(
            (item) => ({
              quantity:
                item.quantity,

              product: {
                description:
                  item.product.description,

                product_key:
                  item.product.product_key,

                price:
                  item.product.price,

                unit_key:
                  item.product.unit_key,

                unit_name:
                  item.product.unit_name,

                sku:
                  item.product.sku,

                taxes:
                  item.product.taxes ||
                  [],
              },
            })
          ),

        currency:
          payload.currency ||
          'MXN',

        payment_form:
          payload.payment_form ||
          '03',

        payment_method:
          payload.payment_method ||
          'PUE',

        use:
          payload.cfdi_use ||
          'G03',
      })

    // ===============================================
    // DESCARGAR XML
    // ===============================================

    const xmlStream =
      await facturapi.invoices.downloadXml(
        invoice.id
      )

    const xmlBuffer =
      await streamToBuffer(
        xmlStream
      )

    // ===============================================
    // DESCARGAR PDF SAT
    // ===============================================

    const pdfStream =
      await facturapi.invoices.downloadPdf(
        invoice.id
      )

    const pdfBuffer =
      await streamToBuffer(
        pdfStream
      )

    // ===============================================
    // RESPONSE
    // ===============================================

    return {
      success: true,

      invoiceId:
        invoice.id,

      customerId:
        customer.id,

      uuid:
        invoice.uuid,

      serie:
        invoice.series,

      folio:
        invoice.folio_number,

      fecha:
        invoice.date,

      subtotal:
        invoice.subtotal,

      total:
        invoice.total,

      currency:
        invoice.currency,

      verification_url:
        invoice.verification_url,

      pdfBuffer,
      xmlBuffer,

      pdfBase64:
        pdfBuffer.toString(
          'base64'
        ),

      xmlBase64:
        xmlBuffer.toString(
          'base64'
        ),

      selloCFD:
        invoice.stamp
          ?.signature || null,

      selloSAT:
        invoice.stamp
          ?.sat_signature ||
        null,

      noCertificadoSAT:
        invoice.stamp
          ?.sat_cert_number ||
        null,

      cadenaOriginal:
        invoice.stamp
          ?.complement_string ||
        null,

      invoiceRaw:
        invoice,
    }
  } catch (error) {
    console.error(
      'FACTURAPI ERROR:',
      error.response?.data ||
        error.message ||
        error
    )

    throw new Error(
      error.response?.data?.message ||
        error.message ||
        'Error emitiendo CFDI'
    )
  }
}

// =====================================================
// DESCARGAR XML
// =====================================================

export async function descargarXML(
  invoiceId
) {
  try {
    const xmlStream =
      await facturapi.invoices.downloadXml(
        invoiceId
      )

    return await streamToBuffer(
      xmlStream
    )
  } catch (error) {
    console.error(
      'ERROR DESCARGANDO XML:',
      error.message
    )

    throw new Error(
      'No fue posible descargar XML'
    )
  }
}

// =====================================================
// DESCARGAR PDF
// =====================================================

export async function descargarPDF(
  invoiceId
) {
  try {
    const pdfStream =
      await facturapi.invoices.downloadPdf(
        invoiceId
      )

    return await streamToBuffer(
      pdfStream
    )
  } catch (error) {
    console.error(
      'ERROR DESCARGANDO PDF:',
      error.message
    )

    throw new Error(
      'No fue posible descargar PDF'
    )
  }
}

// =====================================================
// CANCELAR CFDI
// =====================================================

export async function cancelarFactura(
  {
    invoiceId,
    motive,
    substitution,
  }
) {
  try {
    const response =
      await facturapi.invoices.cancel(
        invoiceId,
        {
          motive:
            motive || '02',

          substitution:
            substitution ||
            undefined,
        }
      )

    return {
      success: true,
      response,
    }
  } catch (error) {
    console.error(
      'ERROR CANCELANDO CFDI:',
      error.response?.data ||
        error.message
    )

    throw new Error(
      error.response?.data?.message ||
        'Error cancelando CFDI'
    )
  }
}

// =====================================================
// OBTENER CFDI
// =====================================================

export async function obtenerFactura(
  invoiceId
) {
  try {
    return await facturapi.invoices.retrieve(
      invoiceId
    )
  } catch (error) {
    console.error(
      'ERROR OBTENIENDO CFDI:',
      error.message
    )

    throw new Error(
      'No fue posible obtener CFDI'
    )
  }
}

// =====================================================
// VALIDAR UUID
// =====================================================

export async function validarUUID(
  invoiceId
) {
  try {
    const invoice =
      await facturapi.invoices.retrieve(
        invoiceId
      )

    return {
      success: true,

      uuid:
        invoice.uuid,

      status:
        invoice.status,

      verification_url:
        invoice.verification_url,
    }
  } catch (error) {
    console.error(
      'ERROR VALIDANDO UUID:',
      error.message
    )

    throw new Error(
      'No fue posible validar UUID'
    )
  }
}

// =====================================================
// REGENERAR ARCHIVOS
// =====================================================

export async function regenerarArchivosFactura(
  invoiceId
) {
  try {
    const xmlBuffer =
      await descargarXML(
        invoiceId
      )

    const pdfBuffer =
      await descargarPDF(
        invoiceId
      )

    return {
      success: true,
      xmlBuffer,
      pdfBuffer,
    }
  } catch (error) {
    console.error(
      'ERROR REGENERANDO ARCHIVOS:',
      error.message
    )

    throw error
  }
}