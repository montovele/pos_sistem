// facturas/dto/cfdi.dto.js

export function buildCFDIPayload({
  clienteFiscal,
  conceptos,
  pedido,
  payload,
}) {
  return {
    legal_name:
      clienteFiscal.razon_social,

    tax_id:
      clienteFiscal.rfc,

    email:
      clienteFiscal.correo_facturacion,

    tax_system:
      clienteFiscal.regimen_fiscal,

    zip:
      clienteFiscal.cp,

    items:
      conceptos.map((item) => ({
        quantity:
          item.cantidad,

        product: {
          description:
            item.descripcion,

          product_key:
            item.product_key,

          unit_key:
            item.unit_key,

          unit_name:
            item.unit_name,

          price:
            item.valor_unitario,

          sku:
            item.sku,

          taxes:
            item.taxes || [],
        },
      })),

    currency:
      pedido.moneda || 'MXN',

    payment_form:
      payload.payment_form || '03',

    payment_method:
      payload.payment_method || 'PUE',

    use:
      payload.use || 'G03',
  }
}