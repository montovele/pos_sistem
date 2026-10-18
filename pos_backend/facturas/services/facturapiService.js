// facturas/services/facturapiService.js
import dotenv from 'dotenv'
dotenv.config()

import FacturapiModule from 'facturapi'
import { Buffer } from 'buffer'

const Facturapi =
  FacturapiModule.default ||
  FacturapiModule

// ======================================================
// CONFIG
// ======================================================

const FACTURAPI_API_KEY =
  process.env.FACTURAPI_API_KEY

if (!FACTURAPI_API_KEY) {
  throw new Error(
    'FACTURAPI_API_KEY no definida'
  )
}

const facturapi =
  new Facturapi(
    FACTURAPI_API_KEY
  )

// ======================================================
// HELPERS
// ======================================================

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

async function streamToBase64(
  stream
) {
  const buffer =
    await streamToBuffer(
      stream
    )

  return buffer.toString(
    'base64'
  )
}

function sanitizeCustomer(
  datosFiscales
) {
  return {
    legal_name:
      datosFiscales.razon_social,

    tax_id:
      datosFiscales.rfc,

    email:
      datosFiscales.correo_facturacion,

    tax_system:
      datosFiscales.regimen_fiscal,

    address: {
      zip:
        datosFiscales.cp,
    },
  }
}

function sanitizeItems(
  items = []
) {
  return items.map(
    (item) => ({
      quantity:
        Number(
          item.quantity || 1
        ),

      product: {
        description:
          item.product
            ?.description,

        product_key:
          item.product
            ?.product_key,

        price:
          Number(
            item.product
              ?.price || 0
          ),

        unit_key:
          item.product
            ?.unit_key ||
          'H87',

        unit_name:
          item.product
            ?.unit_name ||
          'Pieza',

        sku:
          item.product
            ?.sku,

        taxes:
          item.product
            ?.taxes || [],
      },
    })
  )
}

function normalizeFacturapiError(
  error
) {
  return {
    success: false,

    message:
      error?.response?.data
        ?.message ||
      error.message ||
      'Error Facturapi',

    details:
      error?.response?.data ||
      null,
  }
}

// ======================================================
// CUSTOMERS
// ======================================================

export async function createCustomer(
  datosFiscales
) {
  try {
    const customer =
      await facturapi.customers.create(
        sanitizeCustomer(
          datosFiscales
        )
      )

    return {
      success: true,
      customer,
    }
  } catch (error) {
    console.error(
      'createCustomer error:',
      error
    )

    return normalizeFacturapiError(
      error
    )
  }
}

export async function getCustomerByRFC(
  rfc
) {
  try {
    const customers =
      await facturapi.customers.list({
        q: rfc,
      })

    const customer =
      customers?.data?.find(
        (c) =>
          c.tax_id === rfc
      )

    return {
      success: true,
      customer:
        customer || null,
    }
  } catch (error) {
    return normalizeFacturapiError(
      error
    )
  }
}

export async function getOrCreateCustomer(
  datosFiscales
) {
  try {
    const existing =
      await getCustomerByRFC(
        datosFiscales.rfc
      )

    if (
      existing.success &&
      existing.customer
    ) {
      return {
        success: true,
        customer:
          existing.customer,
        existing: true,
      }
    }

    return await createCustomer(
      datosFiscales
    )
  } catch (error) {
    return normalizeFacturapiError(
      error
    )
  }
}

// ======================================================
// INVOICES
// ======================================================

export async function createInvoice({
  customerId,
  items,
  moneda = 'MXN',
  payment_form = '03',
  payment_method = 'PUE',
  uso_cfdi = 'G03',
}) {
  try {
    const invoice =
      await facturapi.invoices.create(
        {
          customer:
            customerId,

          items:
            sanitizeItems(
              items
            ),

          currency:
            moneda,

          use:
            uso_cfdi,

          payment_form,

          payment_method,

          date:
            new Date().toISOString(),
        }
      )

    return {
      success: true,
      invoice,
    }
  } catch (error) {
    console.error(
      'createInvoice error:',
      error
    )

    return normalizeFacturapiError(
      error
    )
  }
}

// ======================================================
// DOWNLOADS
// ======================================================

export async function downloadInvoicePdf(
  invoiceId
) {
  try {
    const stream =
      await facturapi.invoices.downloadPdf(
        invoiceId
      )

    const base64 =
      await streamToBase64(
        stream
      )

    return {
      success: true,
      base64,
    }
  } catch (error) {
    return normalizeFacturapiError(
      error
    )
  }
}

export async function downloadInvoiceXml(
  invoiceId
) {
  try {
    const stream =
      await facturapi.invoices.downloadXml(
        invoiceId
      )

    const base64 =
      await streamToBase64(
        stream
      )

    return {
      success: true,
      base64,
    }
  } catch (error) {
    return normalizeFacturapiError(
      error
    )
  }
}

// ======================================================
// CANCELACION
// ======================================================

export async function cancelarFactura(
  invoiceId
) {
  try {
    const response =
      await facturapi.invoices.cancel(
        invoiceId
      )

    return {
      success: true,
      response,
    }
  } catch (error) {
    return normalizeFacturapiError(
      error
    )
  }
}

// ======================================================
// ORQUESTADOR CFDI
// ======================================================

export async function emitirCFDI({
  datos_fiscales,
  items,
  moneda = 'MXN',
  payment_form = '03',
  payment_method = 'PUE',
  uso_cfdi = 'G03',
}) {
  try {
    // ==========================================
    // CUSTOMER
    // ==========================================

    const customerResult =
      await getOrCreateCustomer(
        datos_fiscales
      )

    if (
      !customerResult.success
    ) {
      throw new Error(
        customerResult.message
      )
    }

    const customer =
      customerResult.customer

    // ==========================================
    // INVOICE
    // ==========================================

    const invoiceResult =
      await createInvoice({
        customerId:
          customer.id,

        items,

        moneda,

        payment_form,

        payment_method,

        uso_cfdi,
      })

    if (
      !invoiceResult.success
    ) {
      throw new Error(
        invoiceResult.message
      )
    }

    const invoice =
      invoiceResult.invoice

    // ==========================================
    // DOWNLOADS
    // ==========================================

    const [
      pdfResult,
      xmlResult,
    ] = await Promise.all([
      downloadInvoicePdf(
        invoice.id
      ),

      downloadInvoiceXml(
        invoice.id
      ),
    ])

    if (
      !pdfResult.success
    ) {
      throw new Error(
        pdfResult.message
      )
    }

    if (
      !xmlResult.success
    ) {
      throw new Error(
        xmlResult.message
      )
    }

    // ==========================================
    // RESPONSE
    // ==========================================

    return {
      success: true,

      invoiceId:
        invoice.id,

      customerId:
        customer.id,

      uuid:
        invoice.uuid,

      folio:
        invoice.folio_number,

      serie:
        invoice.series,

      fecha:
        invoice.date,

      moneda:
        invoice.currency,

      subtotal:
        invoice.subtotal,

      total:
        invoice.total,

      verification_url:
        invoice
          .verification_url,

      pdfBase64:
        pdfResult.base64,

      xmlBase64:
        xmlResult.base64,

      selloCFD:
        invoice.stamp
          ?.signature,

      selloSAT:
        invoice.stamp
          ?.sat_signature,

      noCertificadoSAT:
        invoice.stamp
          ?.sat_cert_number,

      cadenaOriginal:
        invoice.stamp
          ?.complement_string,

      raw:
        invoice,
    }
  } catch (error) {
    console.error(
      'emitirCFDI error:',
      error
    )

    return normalizeFacturapiError(
      error
    )
  }
}