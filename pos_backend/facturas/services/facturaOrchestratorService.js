// ======================================================
// facturas/services/facturaOrchestratorService.js
// ENTERPRISE CLEAN ORCHESTRATOR
// ======================================================

import {
  getFacturaByPedidoAndKey,
  insertFactura,
  updateFacturaTimbrada,
} from '../repositories/facturaRepository.js'

import {
  insertConceptos,
} from '../repositories/facturaConceptosRepository.js'

import {
  obtenerSiguienteFolio,
} from '../repositories/foliosRepository.js'

import {
  obtenerOCrearClienteFiscal,
} from './clienteFiscalService.js'

import {
  emitirCFDI,
} from './satService.js'

import {
  syncFacturaWoo,
} from './facturaSyncService.js'

import {
  insertLog,
} from '../repositories/logsRepository.js'

import {
  validateFacturaOrchestrator,
} from './facturaValidationService.js'

import {
  mapConceptosToFacturapi,
} from '../mappers/facturapiMapper.js'

const SYSTEM = 'facturaOrchestrator'

// ======================================================
// SAFE LOG ASYNC
// ======================================================

function safeLog(data = {}) {

  setImmediate(async () => {

    try {

    await Promise.race([

  insertLog(data),

  new Promise((_, reject) =>

    setTimeout(() =>

      reject(
        new Error('LOG_TIMEOUT')
      ),

      3000
    )

  ),

])

    } catch (error) {

      console.error(
        '[LOG FAIL]',
        error.message
      )

    }

  })

}
// ======================================================
// CFDI EXECUTOR
// ======================================================

async function emitirCFDIEnterprise({
  facturaId,
  pedido,
  clienteFiscalData,
  conceptos,
}) {

  // ==================================================
  // LOS CONCEPTOS YA VIENEN EN FORMATO FACTURAPI
  // ==================================================

  const items =
    Array.isArray(conceptos)
      ? conceptos
      : []

  console.log(
    '\n🔥 ITEMS FINALES CFDI:\n'
  )

  console.dir(items, {
    depth: null
  })

  return emitirCFDI({

    customer:
      clienteFiscalData,

    items,

    currency:
      pedido.moneda || 'MXN',

    payment_form:
      pedido.payment_form || '03',

    payment_method:
      pedido.payment_method || 'PUE',

    use:
      clienteFiscalData.uso_cfdi || 'G03',

    external_id:
      `factura_${facturaId}`,

  })

}

// ======================================================
// MAIN
// ======================================================

export async function procesarFactura({

  pedido,
  clienteFiscalData,
  conceptos,
  idempotencyKey = null,

}) {

  let facturaId = null

  try {

    // ==================================================
    // VALIDACION
    // ==================================================

    validateFacturaOrchestrator({

      pedido,
      clienteFiscalData,
      conceptos,

    })

    // ==================================================
    // IDEMPOTENCIA
    // ==================================================

    const existente =
      await getFacturaByPedidoAndKey(
        pedido.id,
        idempotencyKey
      )

    if (
      existente &&
      existente.uuid
    ) {

      return {

        success: true,
        duplicated: true,
        factura: existente,

      }

    }

    // ==================================================
    // CLIENTE FISCAL
    // ==================================================

    const cliente =
      await obtenerOCrearClienteFiscal(
        clienteFiscalData
      )

    if (
      !cliente?.id_cliente_fiscal
    ) {

      throw new Error(
        'Cliente fiscal inválido'
      )

    }

    // ==================================================
    // FOLIO
    // ==================================================

    const folio =
      await obtenerSiguienteFolio(
        pedido.id,
        'F'
      )
console.log(
  '🔥 FOLIO_DATA  --facturaOrchestratorService linea 224',
  JSON.stringify(
    folio,
    null,
    2
  )
)
    // ==================================================
    // INSERT FACTURA
    // ==================================================

    facturaId =
      await insertFactura({

        pedido_id:
          pedido.id,

        cliente_fiscal_id:
          cliente.id_cliente_fiscal,

        numero_factura:
          folio.numeroFactura,

        estatus:
          'pendiente',

        subtotal:
          pedido.subtotal,

        total:
          pedido.total,

        moneda:
          pedido.moneda || 'MXN',

        uso_cfdi:
          clienteFiscalData.uso_cfdi,

        metodo_pago:
          pedido.payment_method || 'PUE',

        forma_pago:
          pedido.payment_form || '03',

        request_data: {

          pedido,
          clienteFiscalData,

        },

        idempotency_key:
          idempotencyKey,

      })

    // ==================================================
    // CONCEPTOS
    // ==================================================

    await insertConceptos(
      facturaId,
      conceptos
    )

    // ==================================================
    // TIMBRADO
    // ==================================================

    const cfdi =
      await emitirCFDIEnterprise({

        facturaId,
        pedido,
        clienteFiscalData,
        conceptos,

      })

    if (!cfdi?.uuid) {

      throw new Error(
        'CFDI inválido'
      )

    }

    // ==================================================
    // UPDATE TIMBRADA
    // ==================================================

    await updateFacturaTimbrada(
      facturaId,
      {

        uuid:
          cfdi.uuid,

        invoice_id:
          cfdi.invoiceId,

        subtotal:
          cfdi.subtotal,

        iva:
          cfdi.iva,

        total:
          cfdi.total,

        xml_url:
          cfdi.xml_url,

        pdf_url:
          cfdi.pdf_url,

        verification_url:
          cfdi.verification_url,

        response_data:
          cfdi,

      }
    )

    // ==================================================
    // WOO SYNC
    // ==================================================

    if (
      pedido?.id_woocommerce
    ) {

      safeLog({

        factura_id:
          facturaId,

        tipo:
          'woo_sync_start',

      })

      syncFacturaWoo(
        pedido.id_woocommerce,
        {
          uuid: cfdi.uuid,
          pdf_url: cfdi.pdf_url,
          xml_url: cfdi.xml_url,
        }
      ).catch(error => {

        console.error(
          'WOO SYNC ERROR:',
          error.message
        )

      })

    }

    // ==================================================
    // LOG SUCCESS
    // ==================================================

    safeLog({

      factura_id:
        facturaId,

      tipo:
        'cfdi_orchestrator_success',

      response_data: {

        uuid:
          cfdi.uuid,

        invoiceId:
          cfdi.invoiceId,

      },

    })

    return {

      success: true,

      factura_id:
        facturaId,

      uuid:
        cfdi.uuid,

      pdf_url:
        cfdi.pdf_url,

      xml_url:
        cfdi.xml_url,

      verification_url:
        cfdi.verification_url,

    }

  } catch (error) {

    console.error(
      '[ORCHESTRATOR ERROR]',
      error.message
    )

    safeLog({

      factura_id:
        facturaId,

      tipo:
        'cfdi_orchestrator_error',

      error:
        error.message,

    })

    throw error

  }

}

// ======================================================
// HEALTH
// ======================================================

export async function orchestratorHealthCheck() {

  return {

    success: true,
    healthy: true,
    service: SYSTEM,
    timestamp: new Date().toISOString(),

  }

}

export default {
  procesarFactura,
  orchestratorHealthCheck,
}
