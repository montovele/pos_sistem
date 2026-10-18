// ======================================================
// facturas/services/facturaRecoveryService.js
// ENTERPRISE RECOVERY ENGINE FINAL
// SAT + STORAGE + DB + WOO + RESILIENCE
// ======================================================

import {

  getFacturaById,
  updateFacturaError,
  updateFacturaTimbrada,

} from '../repositories/facturaRepository.js'

import {

  getConceptosFactura,

} from '../repositories/facturaConceptosRepository.js'

import {

  getClienteFiscalById,

} from '../repositories/clienteFiscalRepository.js'

import {

  getOrdenCompleta,

} from '../repositories/ordenRepository.js'

import {

  insertLog,

} from '../repositories/logsRepository.js'

import {

  emitirCFDI,

} from './satService.js'

import {

  generarPDFCustom,

} from './pdf/facturaPdfService.js'

import {

  saveXML,
  savePDF,
  deleteFile,

} from './storageService.js'

import {

  syncFacturaWoo,

} from './facturaSyncService.js'

import {

  withTransaction,

} from './transactionService.js'

import {

  executeWithResilience,

} from './resiliencePolicyService.js'

import {

  changeFacturaStatus,
  markFacturaError,

} from './facturaStatusService.js'

import {

  validateRecoveryContext,

} from './facturaValidationService.js'

import {

  mapConceptosToFacturapi,

} from '../mappers/facturapiMapper.js'

// ======================================================
// CONFIG
// ======================================================

const SYSTEM =
  'facturaRecoveryService'

const RECOVERABLE_STATUS =
  new Set([

    'error',
    'timbrando',
    'procesando',
    'cancelada',

  ])

// ======================================================
// MAIN
// ======================================================

export async function recoverFactura(
  facturaId
) {

  let xmlPath = null
  let pdfPath = null
  let pdfCustomPath = null

  try {

    if (!facturaId) {

      throw new Error(
        'facturaId requerido'
      )

    }

    // ==================================================
    // FACTURA
    // ==================================================

    const factura =
      await getFacturaById(
        facturaId
      )

    if (!factura) {

      throw new Error(
        'Factura no encontrada'
      )

    }

    // ==================================================
    // STATUS VALIDATION
    // ==================================================

    if (

      !RECOVERABLE_STATUS.has(
        factura.estatus
      )

    ) {

      throw new Error(

        `Factura no recuperable (${factura.estatus})`

      )

    }

    // ==================================================
    // IDEMPOTENCIA
    // ==================================================

    if (

      factura.uuid &&

      factura.estatus ===
        'emitida'

    ) {

      return {

        success: true,

        duplicated: true,

        factura_id:
          factura.id_factura,

        uuid:
          factura.uuid,

        xml_url:
          factura.xml_url,

        pdf_url:
          factura.pdf_url,

        pdf_custom_url:
          factura.pdf_custom_url,

      }

    }

    // ==================================================
    // RELACIONES
    // ==================================================

    const [

      clienteFiscal,
      pedido,
      conceptos,

    ] = await Promise.all([

      getClienteFiscalById(
        factura.cliente_fiscal_id
      ),

      getOrdenCompleta(
        factura.pedido_id
      ),

      getConceptosFactura(
        facturaId
      ),

    ])

    if (!clienteFiscal) {

      throw new Error(
        'Cliente fiscal no encontrado'
      )

    }

    if (!pedido) {

      throw new Error(
        'Pedido no encontrado'
      )

    }

    if (

      !Array.isArray(conceptos) ||

      conceptos.length === 0

    ) {

      throw new Error(
        'Factura sin conceptos'
      )

    }

    // ==================================================
    // VALIDACION
    // ==================================================

    validateRecoveryContext({

      factura,
      clienteFiscal,
      pedido,
      conceptos,

    })

    // ==================================================
    // STATUS
    // ==================================================

    await changeFacturaStatus({

      facturaId,

      nextStatus:
        'procesando',

      source:
        SYSTEM,

    })

    // ==================================================
    // LOG
    // ==================================================

    await safeLog({

      factura_id:
        facturaId,

      tipo:
        'factura_recovery_started',

    })

    // ==================================================
    // CFDI
    // ==================================================

    const facturaTimbrada =
      await executeWithResilience({

        fn: () =>

          emitirCFDI({

            customer: {

              legal_name:
                clienteFiscal.razon_social,

              tax_id:
                clienteFiscal.rfc,

              email:
                clienteFiscal.correo_facturacion,

              tax_system:
                clienteFiscal.regimen_fiscal,

              address: {

                zip:
                  clienteFiscal.cp,

              },

            },

            items:
              mapConceptosToFacturapi(
                conceptos
              ),

            currency:
              factura.moneda || 'MXN',

            payment_form:
              factura.forma_pago || '03',

            payment_method:
              factura.metodo_pago || 'PUE',

            use:
              factura.uso_cfdi || 'G03',

            external_id:
              `recovery_${facturaId}`,

          }),

        service:
          SYSTEM,

        operation:
          'emitirCFDI',

      })

    // ==================================================
    // VALIDAR CFDI
    // ==================================================

    if (

      !facturaTimbrada ||

      !facturaTimbrada.uuid

    ) {

      throw new Error(
        'CFDI inválido'
      )

    }

    // ==================================================
    // STORAGE XML
    // ==================================================

    const xmlFile =
      await saveXML(

        facturaTimbrada.uuid,

        facturaTimbrada.xmlBuffer,

        {
          folder: 'xml',
        }

      )

    // ==================================================
    // STORAGE PDF
    // ==================================================

    const pdfFile =
      await savePDF(

        facturaTimbrada.uuid,

        facturaTimbrada.pdfBuffer,

        {
          folder: 'pdf',
        }

      )

    // ==================================================
    // PDF CUSTOM
    // ==================================================

    const customPdf =
      await generarPDFCustom({

        factura:
          facturaTimbrada,

        pedido,
        clienteFiscal,
        conceptos,

      })

    const customPdfFile =
      await savePDF(

        `${facturaTimbrada.uuid}_custom`,

        customPdf,

        {
          folder: 'pdf',
        }

      )

    // ==================================================
    // PATHS
    // ==================================================

    xmlPath =
      xmlFile.relativePath

    pdfPath =
      pdfFile.relativePath

    pdfCustomPath =
      customPdfFile.relativePath

    // ==================================================
    // URLS
    // ==================================================

    const xmlURL =
      xmlFile.publicUrl

    const pdfURL =
      pdfFile.publicUrl

    const pdfCustomURL =
      customPdfFile.publicUrl

    // ==================================================
    // DB UPDATE
    // ==================================================

    await withTransaction(

      async connection => {

        await updateFacturaTimbrada(

          facturaId,

          {

            uuid:
              facturaTimbrada.uuid,

            invoice_id:
              facturaTimbrada.invoiceId,

            subtotal:
              facturaTimbrada.subtotal,

            iva:
              facturaTimbrada.iva,

            total:
              facturaTimbrada.total,

            xml_raw:
              facturaTimbrada
                .xmlBuffer
                ?.toString(),

            xml_path:
              xmlPath,

            pdf_path:
              pdfPath,

            pdf_custom_path:
              pdfCustomPath,

            xml_url:
              xmlURL,

            pdf_url:
              pdfURL,

            pdf_custom_url:
              pdfCustomURL,

            verification_url:
              facturaTimbrada.verification_url,

            sello_sat:
              facturaTimbrada.selloSAT || null,

            sello_cfdi:
              facturaTimbrada.selloCFDI || null,

            cadena_original:
              facturaTimbrada.cadenaOriginal || null,

            response_data:
              sanitizeFacturaResponse(
                facturaTimbrada
              ),

          },

          connection

        )

        await changeFacturaStatus({

          facturaId,

          nextStatus:
            'emitida',

          source:
            SYSTEM,

          connection,

        })

      }

    )

    // ==================================================
    // LOG SUCCESS
    // ==================================================

    await safeLog({

      factura_id:
        facturaId,

      tipo:
        'factura_recovered',

      response_data: {

        uuid:
          facturaTimbrada.uuid,

      },

    })

    // ==================================================
    // WOO
    // ==================================================

    await safeWooSync({

      pedido,

      factura:
        facturaTimbrada,

      pdfURL,
      xmlURL,
      pdfCustomURL,

    })

    // ==================================================
    // RESPONSE
    // ==================================================

    return {

      success: true,

      recovered: true,

      factura_id:
        facturaId,

      uuid:
        facturaTimbrada.uuid,

      xml_url:
        xmlURL,

      pdf_url:
        pdfURL,

      pdf_custom_url:
        pdfCustomURL,

      verification_url:
        facturaTimbrada.verification_url,

    }

  } catch (error) {

    console.error(

      '❌ recoverFactura:',
      error.message

    )

    // ==================================================
    // CLEANUP
    // ==================================================

    await cleanupFiles([

      xmlPath,
      pdfPath,
      pdfCustomPath,

    ])

    // ==================================================
    // ERROR STATUS
    // ==================================================

    try {

      if (facturaId) {

        await markFacturaError({

          facturaId,

          error,

          source:
            SYSTEM,

        })

        await updateFacturaError(

          facturaId,

          error.message

        )

      }

      await safeLog({

        factura_id:
          facturaId,

        tipo:
          'factura_recovery_error',

        error:
          error.message,

      })

    } catch (internalError) {

      console.error(

        '❌ recovery internal:',
        internalError.message

      )

    }

    throw error

  }

}

// ======================================================
// BATCH
// ======================================================

export async function recoverFacturasBatch(
  ids = []
) {

  const results = []

  for (const id of ids) {

    try {

      results.push({

        success: true,

        factura_id:
          id,

        result:
          await recoverFactura(id),

      })

    } catch (error) {

      results.push({

        success: false,

        factura_id:
          id,

        error:
          error.message,

      })

    }

  }

  return results

}

// ======================================================
// WOO SAFE
// ======================================================

async function safeWooSync({
  pedido,
  factura,
  pdfURL,
  xmlURL,
  pdfCustomURL,
}) {

  try {

    const wooOrderId =

      pedido?.id_woocommerce ||

      pedido?.woo_order_id

    if (!wooOrderId) {

      return

    }

    await syncFacturaWoo(

      wooOrderId,

      {

        uuid:
          factura.uuid,

        factura_status:
          'emitida',

        pdf_url:
          pdfURL,

        xml_url:
          xmlURL,

        pdf_custom_url:
          pdfCustomURL,

      }

    )

  } catch (error) {

    console.error(

      'Woo sync error:',
      error.message

    )

  }

}

// ======================================================
// CLEANUP
// ======================================================

async function cleanupFiles(
  files = []
) {

  for (const file of files) {

    if (!file) continue

    try {

      await deleteFile(file)

    } catch (error) {

      console.error(

        'cleanup error:',
        error.message

      )

    }

  }

}

// ======================================================
// SAFE LOG
// ======================================================

async function safeLog(
  data = {}
) {

  try {

    await insertLog(data)

  } catch (error) {

    console.error(

      'log error:',
      error.message

    )

  }

}

// ======================================================
// SANITIZER
// ======================================================

function sanitizeFacturaResponse(
  factura = {}
) {

  return {

    uuid:
      factura.uuid,

    invoiceId:
      factura.invoiceId,

    verification_url:
      factura.verification_url,

    status:
      factura.status,

    subtotal:
      factura.subtotal,

    iva:
      factura.iva,

    total:
      factura.total,

  }

}

// ======================================================
// HEALTH
// ======================================================

export async function facturaRecoveryHealthCheck() {

  return {

    success: true,

    healthy: true,

    service:
      SYSTEM,

    timestamp:
      new Date()
        .toISOString(),

  }

}

// ======================================================
// EXPORT
// ======================================================

export default {

  recoverFactura,

  recoverFacturasBatch,

  facturaRecoveryHealthCheck,

}