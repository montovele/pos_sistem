// ======================================================
// facturas/services/facturaValidationService.js
// VALIDACIÓN CENTRAL CFDI 4.0
// VERSION ENTERPRISE FINAL ROBUSTA
// COMPATIBLE CON:
// - facturaOrchestratorService
// - satService
// - facturaRecoveryService
// - facturaCancelacionService
// - facturaStatusService
// ======================================================

// ======================================================
// CATÁLOGOS CFDI 4.0
// ======================================================

const ALLOWED_USO_CFDI = [

  'G01',
  'G02',
  'G03',

  'I01',
  'I02',
  'I03',
  'I04',
  'I05',
  'I06',
  'I07',
  'I08',

  'D01',
  'D02',
  'D03',
  'D04',
  'D05',
  'D06',
  'D07',
  'D08',
  'D09',
  'D10',

  'S01',
  'CP01',
  'CN01',

]

const ALLOWED_METODO_PAGO = [

  'PUE',
  'PPD',

]

const ALLOWED_FORMA_PAGO = [

  '01',
  '02',
  '03',
  '04',
  '05',
  '06',
  '08',
  '12',
  '13',
  '14',
  '15',
  '17',
  '23',
  '24',
  '25',
  '26',
  '27',
  '28',
  '29',
  '30',
  '99',

]

// ======================================================
// CONFIG
// ======================================================

const MAX_CONCEPTOS =

  Number(
    process.env
      .FACTURA_MAX_CONCEPTOS
  ) || 500

// ======================================================
// HELPERS BASE
// ======================================================

function isEmpty(value) {

  return (

    value === undefined ||

    value === null ||

    value === ''

  )

}

// ======================================================

function normalizeString(
  value
) {

  return String(
    value || ''
  )
    .trim()

}

// ======================================================

function normalizeUpper(
  value
) {

  return normalizeString(
    value
  ).toUpperCase()

}

// ======================================================

function normalizeNumber(
  value,
  decimals = 2
) {

  const parsed =
    Number(value || 0)

  if (
    Number.isNaN(parsed)
  ) {
    return 0
  }

  return Number(
    parsed.toFixed(decimals)
  )

}

// ======================================================

function roundMoney(
  value
) {

  return normalizeNumber(
    value,
    2
  )

}

// ======================================================

function assertRequired(
  value,
  field
) {

  if (isEmpty(value)) {

    throw new Error(
      `${field} requerido`
    )

  }

}

// ======================================================
// RFC VALIDATION
// ======================================================

export function validarRFC(
  rfc = ''
) {

  const normalizedRFC =
    normalizeUpper(rfc)

  const regex =
    /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/

  return regex.test(
    normalizedRFC
  )

}

// ======================================================
// EMAIL VALIDATION
// ======================================================

export function validarEmail(
  email = ''
) {

  const normalizedEmail =
    normalizeString(email)
      .toLowerCase()

  const regex =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/

  return regex.test(
    normalizedEmail
  )

}

// ======================================================
// ZIP VALIDATION
// ======================================================

export function validarCP(
  cp = ''
) {

  return /^\d{5}$/.test(
    normalizeString(cp)
  )

}

// ======================================================
// USO CFDI VALIDATION
// ======================================================

export function validarUsoCFDI(
  uso = ''
) {

  return ALLOWED_USO_CFDI.includes(
    normalizeUpper(uso)
  )

}

// ======================================================
// METODO PAGO VALIDATION
// ======================================================

export function validarMetodoPago(
  metodo = ''
) {

  return ALLOWED_METODO_PAGO.includes(
    normalizeUpper(metodo)
  )

}

// ======================================================
// FORMA PAGO VALIDATION
// ======================================================

export function validarFormaPago(
  forma = ''
) {

  return ALLOWED_FORMA_PAGO.includes(
    normalizeString(forma)
  )

}

// ======================================================
// VALIDAR CONCEPTO INDIVIDUAL
// ======================================================

export function validarConcepto(
  item = {},
  index = 0
) {

  const cantidad =
    normalizeNumber(

      item.quantity ??
      item.cantidad ??
      0,

      6

    )

  const precio =
    normalizeNumber(

      item.price ??
      item.valor_unitario ??
      item.precio_unitario ??
      item?.product?.price ??
      0

    )

  const descripcion =

    item.description ||

    item.descripcion ||

    item?.product?.description

  if (
    cantidad <= 0
  ) {

    throw new Error(

      `Cantidad inválida en concepto #${index + 1}`

    )

  }

  if (
    precio < 0
  ) {

    throw new Error(

      `Precio inválido en concepto #${index + 1}`

    )

  }

  if (
    isEmpty(descripcion)
  ) {

    throw new Error(

      `Descripción requerida en concepto #${index + 1}`

    )

  }

  return {

    cantidad,
    precio,
    subtotal:
      roundMoney(
        cantidad * precio
      ),

  }

}

// ======================================================
// VALIDAR CONCEPTOS
// ======================================================

export function validarConceptos(
  items = []
) {

  if (
    !Array.isArray(items)
  ) {

    throw new Error(
      'Conceptos CFDI inválidos'
    )

  }

  if (!items.length) {

    throw new Error(
      'Conceptos CFDI requeridos'
    )

  }

  if (
    items.length >
    MAX_CONCEPTOS
  ) {

    throw new Error(
      'Límite de conceptos excedido'
    )

  }

  let subtotal = 0

  items.forEach(
    (item, index) => {

      const validated =
        validarConcepto(
          item,
          index
        )

      subtotal +=
        validated.subtotal

    }
  )

  subtotal =
    roundMoney(subtotal)

  if (
    subtotal <= 0
  ) {

    throw new Error(
      'Total CFDI inválido'
    )

  }

  return {

    subtotal,
    total: subtotal,

  }

}

// ======================================================
// VALIDAR CLIENTE FISCAL
// ======================================================

export function validarClienteFiscal(
  customer = {}
) {

  assertRequired(
    customer?.legal_name,
    'Razón social'
  )

  if (
    !validarRFC(
      customer?.tax_id
    )
  ) {

    throw new Error(
      'RFC inválido'
    )

  }

  if (
    !validarEmail(
      customer?.email
    )
  ) {

    throw new Error(
      'Email inválido'
    )

  }

  if (
    !validarCP(
      customer?.address?.zip
    )
  ) {

    throw new Error(
      'Código postal inválido'
    )

  }

  return true

}

// ======================================================
// VALIDAR CFDI BASE
// ======================================================

export function validarCFDIBase(
  payload = {}
) {

  if (!payload) {

    throw new Error(
      'Payload CFDI requerido'
    )

  }

  // ====================================================
  // CUSTOMER
  // ====================================================

  validarClienteFiscal(
    payload.customer
  )

  // ====================================================
  // CONCEPTOS
  // ====================================================

  const conceptos =
    validarConceptos(
      payload.items
    )

  // ====================================================
  // USO CFDI
  // ====================================================

  if (

    payload.use &&

    !validarUsoCFDI(
      payload.use
    )

  ) {

    throw new Error(
      'Uso CFDI inválido'
    )

  }

  // ====================================================
  // METODO PAGO
  // ====================================================

  if (

    payload.payment_method &&

    !validarMetodoPago(
      payload.payment_method
    )

  ) {

    throw new Error(
      'Método de pago inválido'
    )

  }

  // ====================================================
  // FORMA PAGO
  // ====================================================

  if (

    payload.payment_form &&

    !validarFormaPago(
      payload.payment_form
    )

  ) {

    throw new Error(
      'Forma de pago inválida'
    )

  }

  return {

    success: true,

    subtotal:
      conceptos.subtotal,

    total:
      conceptos.total,

  }

}

// ======================================================
// VALIDACION ORCHESTRATOR
// ======================================================

export function validateFacturaOrchestrator(
  input = {}
) {

  if (!input.pedido) {

    throw new Error(
      'Pedido requerido'
    )

  }

  if (

    !Array.isArray(
      input.conceptos
    ) ||

    !input.conceptos.length

  ) {

    throw new Error(
      'Conceptos requeridos'
    )

  }

  if (
    !input.clienteFiscalData
  ) {

    throw new Error(
      'Cliente fiscal requerido'
    )

  }

  return validarCFDIBase({

    customer: {

      legal_name:

        input.clienteFiscalData
          ?.legal_name ||

        input.clienteFiscalData
          ?.razon_social,

      tax_id:

        input.clienteFiscalData
          ?.tax_id ||

        input.clienteFiscalData
          ?.rfc,

      email:

        input.clienteFiscalData
          ?.email ||

        input.clienteFiscalData
          ?.correo_facturacion,

      address: {

        zip:

          input.clienteFiscalData
            ?.zip ||

          input.clienteFiscalData
            ?.cp,

      },

    },

    items:
      input.conceptos,

    use:

      input
        .clienteFiscalData
        ?.uso_cfdi ||

      'G03',

    payment_method:

      input.pedido
        ?.metodo_pago ||

      'PUE',

    payment_form:

      input.pedido
        ?.forma_pago ||

      '03',

  })

}

// ======================================================
// VALIDACION SAT SERVICE
// ======================================================

export function validateSATPayload(
  payload = {}
) {

  return validarCFDIBase(
    payload
  )

}

// ======================================================
// VALIDACION RECOVERY
// ======================================================

export function validateRecoveryContext({

  factura,
  clienteFiscal,
  pedido,
  conceptos,

}) {

  if (
    !factura?.id_factura
  ) {

    throw new Error(
      'Factura inválida'
    )

  }

  if (
    !clienteFiscal?.rfc
  ) {

    throw new Error(
      'Cliente fiscal inválido'
    )

  }

  if (
    !pedido?.id
  ) {

    throw new Error(
      'Pedido inválido'
    )

  }

  validarConceptos(
    conceptos
  )

  return true

}

// ======================================================
// VALIDACION CANCELACION
// ======================================================

export function validateCancelacionContext({

  factura,
  motivo,

}) {

  if (!factura) {

    throw new Error(
      'Factura requerida'
    )

  }

  if (!factura.uuid) {

    throw new Error(
      'UUID requerido'
    )

  }

  if (
    factura.estatus !==
    'emitida'
  ) {

    throw new Error(
      'Factura no cancelable'
    )

  }

  if (
    isEmpty(motivo)
  ) {

    throw new Error(
      'Motivo requerido'
    )

  }

  return true

}

// ======================================================
// VALIDACION STATUS FLOW
// ======================================================

export function validateStatusChange({

  currentStatus,
  nextStatus,

}) {

  if (
    isEmpty(currentStatus)
  ) {

    throw new Error(
      'currentStatus requerido'
    )

  }

  if (
    isEmpty(nextStatus)
  ) {

    throw new Error(
      'nextStatus requerido'
    )

  }

  return true

}

// ======================================================
// HEALTH CHECK
// ======================================================

export async function validationHealthCheck() {

  return {

    success: true,

    healthy: true,

    service:
      'facturaValidationService',

    timestamp:
      new Date()
        .toISOString(),

  }

}

// ======================================================
// EXPORT DEFAULT
// ======================================================

export default {

  validarRFC,

  validarEmail,

  validarCP,

  validarConceptos,

  validarClienteFiscal,

  validarCFDIBase,

  validateSATPayload,

  validateFacturaOrchestrator,

  validateRecoveryContext,

  validateCancelacionContext,

  validateStatusChange,

  validationHealthCheck,

}