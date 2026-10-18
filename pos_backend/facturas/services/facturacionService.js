// ======================================================
// facturas/services/facturacionService.js
// ENTERPRISE FACADE LAYER
// MULTI-TENANT + TRACEABLE + RESILIENT
// ======================================================

import crypto from 'crypto'

import {
  validarFacturaPayload,
} from '../validators/factura.validator.js'

import {
  obtenerPedidoFacturable,
} from './pedidoService.js'

import {
  obtenerOCrearClienteFiscal,
} from './clienteFiscalService.js'

import {
  emitirCFDIOrquestado,
} from './cfdiOrchestratorService.js'

// ======================================================
// HELPERS
// ======================================================

function assertRequired(
  value,
  field
) {

  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {

    throw new Error(
      `${field} requerido`
    )

  }

}

function normalizeItems(
  conceptos
) {

  if (
    !Array.isArray(
      conceptos
    )
  ) {

    return []

  }

  return conceptos.filter(
    Boolean
  )

}
// ======================================================
// MAIN
// ======================================================

export async function procesarFacturacion(
  payload = {}
) {

  const traceId =
    crypto.randomUUID()

  const startedAt =
    Date.now()

  try {

    console.group(
      '[FACTURACION]'
    )

    console.log(
      'INPUT',
      JSON.stringify(
        payload,
        null,
        2
      )
    )

    // ==================================================
    // VALIDACIONES
    // ==================================================

    assertRequired(
      payload.proveedor_id,
      'proveedor_id'
    )

    assertRequired(
      payload.pedido_id,
      'pedido_id'
    )

    const validation =
      await validarFacturaPayload(
        payload
      )

    if (
      !validation.success
    ) {

      console.error(
        '[VALIDACION]',
        validation.errors
      )

      throw new Error(
        JSON.stringify(
          validation.errors,
          null,
          2
        )
      )

    }

    const data =
      validation.data

    // ==================================================
    // PEDIDO
    // ==================================================

      const pedido =
        await obtenerPedidoFacturable(
          data.pedido_id,
          payload
        )

    if (!pedido) {

      throw new Error(
        'Pedido no encontrado'
      )

    }

    console.log(
      '[PEDIDO]',
      pedido.id
    )

    // ==================================================
    // CONCEPTOS FRONTEND
    // ==================================================

    const frontendConceptos =
      Array.isArray(
        payload.conceptos
      )
        ? payload.conceptos
        : []
console.log('conceptosfrontend',frontendConceptos,frontendConceptos.impuestos)
    const usarConceptosFrontend =
      frontendConceptos.length > 0

    console.log(
      '📥 CONCEPTOS FRONTEND',
      frontendConceptos.length
    )

    console.log(
      '📦 CONCEPTOS PEDIDO',
      pedido.conceptos?.length || 0
    )

    console.log(
      '🎯 ORIGEN CFDI',
      usarConceptosFrontend
        ? 'FRONTEND'
        : 'PEDIDO'
    )

    // ==================================================
    // ITEMS DEFINITIVOS
    // ==================================================

    const items =
      usarConceptosFrontend

        ? frontendConceptos.map(
            concepto => {

              const traslado =
                concepto.impuestos?.[0]

              const tasa =
                Number(
                  traslado?.tasa_cuota || 0
                ) / 100

              return {

                descripcion:
                  concepto.descripcion,

                cantidad:
                  Number(
                    concepto.cantidad || 1
                  ),

                valor_unitario:
                  Number(
                    concepto.valor_unitario || 0
                  ),

                subtotal:
                  Number(
                    payload.subtotal || 0
                  ),

                importe:
                  Number(
                    concepto.importe || 0
                  ),

                descuento:
                  Number(
                    concepto.descuento || 0
                  ),

                iva:
                  Number(
                    payload.iva || 0
                  ),

                impuestos:
                  Number(
                    traslado?.importe || 0
                  ),

                iva_rate:
                  tasa,

                quantity:
                  Number(
                    concepto.cantidad || 1
                  ),

                product: {

                  description:
                    concepto.descripcion,

                  product_key:
                    concepto.clave_producto ||
                    '01010101',

                  unit_key:
                    concepto.clave_unidad ||
                    'H87',

                  unit_name:
                    concepto.unidad ||
                    'Pieza',

                  price:
                    Number(
                      concepto.valor_unitario || 0
                    ),

                  taxes:
                    tasa > 0
                      ? [
                          {
                            type: 'IVA',
                            rate: tasa
                          }
                        ]
                      : []

                },

                taxes:
                  tasa > 0
                    ? [
                        {
                          type: 'IVA',
                          rate: tasa
                        }
                      ]
                    : [],

                taxability:
                  tasa > 0
                    ? 'taxable'
                    : 'none',

                raw:
                  concepto

              }

            }
          )

        : normalizeItems(
            pedido.conceptos
          )

    // ==================================================
    // TOTALES
    // ==================================================
console.log('totales --globales',payload ,pedido)
    const subtotal =
      Number(
        pedido.subtotal 
      )

    const iva =
      Number(
        payload.iva ??
        pedido.iva ??
        0
      )

    const total =
      Number(
        payload.total ??
        pedido.total ??
        0
      )

    console.log(
      '💰 TOTALES CFDI',
      {
        subtotal,
        iva,
        total
      }
    )

    console.log(
      '\n=========== ITEMS ORQUESTADOR ===========\n'
    )

    console.log(
      JSON.stringify(
        items,
        null,
        2
      )
    )

    console.log(
      '\n=========================================\n'
    )

    // ==================================================
    // CLIENTE FISCAL
    // ==================================================

    const clienteInput = {

      ...data.datos_fiscales,

      proveedor_id:
        payload.proveedor_id,

      woo_customer_id:
        pedido.cliente_id,

      email:

        data.datos_fiscales?.email ||

        data.datos_fiscales?.correo_facturacion ||

        pedido.cliente_email,

      telefono:

        data.datos_fiscales?.telefono ||

        pedido.cliente_telefono,

      codigo_postal:

        data.datos_fiscales?.codigo_postal

    }

    const clienteFiscal =
      await obtenerOCrearClienteFiscal(

        clienteInput,

        payload.proveedor_id

      )

    console.log(
      '[CLIENTE RESULT]',
      clienteFiscal
    )

    // ==================================================
    // CUSTOMER CFDI
    // ==================================================

    const customer = {

      legal_name:
        clienteFiscal.razon_social,

      tax_id:
        clienteFiscal.rfc,

      email:

        clienteFiscal.correo_facturacion ||

        clienteFiscal.email ||

        pedido.cliente_email,

      tax_system:
        clienteFiscal.regimen_fiscal,

      address: {

        zip:

          clienteFiscal.cp ||

          clienteFiscal.codigo_postal

      }

    }

    console.log(
      '[CUSTOMER CFDI]',
      customer
    )

    // ==================================================
    // ORQUESTADOR
    // ==================================================

    const result =
      await emitirCFDIOrquestado({

        proveedor_id:
          payload.proveedor_id,

        pedido_id:
          pedido.id,

        woo_order_id:
          pedido.id_woocommerce,

        cliente_fiscal_id:
          clienteFiscal.id_cliente_fiscal,

        customer,

        items,

        subtotal,

        iva,

        total,

        impuestos:
          payload.impuestos ||

          {
            traslados: [],
            retenciones: []
          },

        payment_method:
          data.payment_method,

        payment_form:
          data.payment_form,

        use_cfdi:
          data.datos_fiscales?.uso_cfdi,

        metadata: {

          trace_id:
            traceId,

          proveedor_id:
            payload.proveedor_id,

          source:
            'facturacionService',

          conceptos_source:
            usarConceptosFrontend
              ? 'frontend'
              : 'pedido'

        }

      })

    // ==================================================
    // RESPONSE
    // ==================================================

    return {

      success: true,

      factura_id:
        result.factura_id,

      uuid:
        result.uuid,

      pdf_url:
        result.storage?.pdf?.publicUrl ||
        null,

      xml_url:
        result.storage?.xml?.publicUrl ||
        null,

      pdf_custom:
        result.storage?.pdf_custom?.publicUrl ||
        null,

      verification_url:
        result.verification_url ||
        null,

      trace_id:
        traceId,

      execution_time:
        Date.now() -
        startedAt

    }

  }

  catch (error) {

    console.error(
      '[FACTURACION ERROR]',
      {
        trace_id:
          traceId,

        message:
          error.message,

        stack:
          error.stack
      }
    )

    throw error

  }

  finally {

    console.groupEnd()

  }

}