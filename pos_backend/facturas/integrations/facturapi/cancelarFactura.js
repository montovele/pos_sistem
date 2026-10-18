// facturas/integrations/facturapi/cancelarFactura.js

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
 * MOTIVOS SAT CANCELACIÓN CFDI
 * =========================================================
 *
 * 01 -> Comprobante emitido con errores con relación
 * 02 -> Comprobante emitido con errores sin relación
 * 03 -> No se llevó a cabo la operación
 * 04 -> Operación nominativa relacionada en factura global
 *
 * =========================================================
 */

/**
 * =========================================================
 * CANCELAR CFDI FACTURAPI
 * =========================================================
 *
 * @param {Object} params
 *
 * @param {String} params.invoiceId
 * @param {String} params.uuid
 * @param {String} params.motivo
 * @param {String|null} params.folioSustitucion
 *
 * @returns {Promise<Object>}
 *
 * =========================================================
 */

export async function cancelarFactura(
  {
    invoiceId,
    uuid,
    motivo = '02',
    folioSustitucion = null,
  }
) {
  try {
    /**
     * =====================================================
     * VALIDACIONES
     * =====================================================
     */

    if (!invoiceId && !uuid) {
      throw new Error(
        'invoiceId o uuid requerido'
      )
    }

    /**
     * =====================================================
     * IDENTIFICADOR CFDI
     * =====================================================
     */

    const invoiceIdentifier =
      invoiceId || uuid

    /**
     * =====================================================
     * PAYLOAD CANCELACIÓN SAT
     * =====================================================
     */

    const payload = {
      motive: motivo,
    }

    /**
     * =====================================================
     * CFDI RELACIONADO
     * =====================================================
     */

    if (
      motivo === '01' &&
      folioSustitucion
    ) {
      payload.replacement =
        folioSustitucion
    }

    /**
     * =====================================================
     * CANCELACIÓN FACTURAPI
     * =====================================================
     */

    const response =
      await facturapi.invoices
        .cancel(
          invoiceIdentifier,
          payload
        )

    /**
     * =====================================================
     * RESPONSE NORMALIZADO
     * =====================================================
     */

    return {
      success: true,

      invoice_id:
        response.id,

      uuid:
        response.uuid,

      status:
        response.status,

      cancellation_status:
        response.cancellation_status,

      motive:
        motivo,

      folio_sustitucion:
        folioSustitucion,

      verification_url:
        response.verification_url ||

        null,

      raw:
        response,

      error: null,
    }
  } catch (error) {
    console.error(
      '[FACTURAPI_CANCEL_ERROR]',
      error?.response?.data ||
        error.message ||
        error
    )

    /**
     * =====================================================
     * RESPUESTA ERROR NORMALIZADA
     * =====================================================
     */

    return {
      success: false,

      invoice_id: null,

      uuid: null,

      status: null,

      cancellation_status: null,

      motive: motivo,

      folio_sustitucion:
        folioSustitucion,

      verification_url: null,

      raw:
        error?.response?.data ||
        null,

      error:
        error?.response?.data
          ?.message ||
        error.message ||
        'Error cancelando CFDI',
    }
  }
}