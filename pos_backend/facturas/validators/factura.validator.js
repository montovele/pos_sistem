// ======================================================
// facturas/validators/factura.validator.js
// VERSION EMPRESARIAL ROBUSTA FINAL
// CFDI 4.0 + SAT READY + PAC SAFE
// ======================================================

import * as yup from 'yup'

// ======================================================
// SAT CONSTANTS
// ======================================================

const RFC_REGEX =
  /^([A-ZÑ&]{3,4})\d{6}([A-Z0-9]{3})$/i

const CP_REGEX =
  /^\d{5}$/

const UUID_REGEX =
  /^[0-9a-f-]{36}$/i

// ======================================================
// RFC GENERICOS SAT
// ======================================================

const RFC_PUBLICO_GENERAL =
  'XAXX010101000'

const RFC_EXTRANJERO =
  'XEXX010101000'

// ======================================================
// REGIMENES SAT
// ======================================================

const REGIMENES_VALIDOS = [

  '601',
  '603',
  '605',
  '606',
  '607',
  '608',
  '610',
  '611',
  '612',
  '614',
  '615',
  '616',
  '620',
  '621',
  '622',
  '623',
  '624',
  '625',
  '626',

]

// ======================================================
// USOS CFDI
// ======================================================

const USOS_CFDI_VALIDOS = [

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

// ======================================================
// FORMAS DE PAGO SAT
// ======================================================

const FORMAS_PAGO_VALIDAS = [

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
  '31',
  '99',

]

// ======================================================
// METODOS PAGO SAT
// ======================================================

const METODOS_PAGO_VALIDOS = [

  'PUE',
  'PPD',

]

// ======================================================
// MONEDAS SOPORTADAS
// ======================================================

const MONEDAS_VALIDAS = [

  'MXN',
  'USD',
  'EUR',

]

// ======================================================
// HELPERS
// ======================================================

function sanitizeString(
  value = ''
) {

  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')

}

// ======================================================

function sanitizeUpper(
  value = ''
) {

  return sanitizeString(
    value
  ).toUpperCase()

}

// ======================================================

function sanitizeLower(
  value = ''
) {

  return sanitizeString(
    value
  ).toLowerCase()

}

// ======================================================

function sanitizeRFC(
  value = ''
) {

  return sanitizeUpper(
    value
  )

}

// ======================================================

function sanitizeUUID(
  value = ''
) {

  return sanitizeString(
    value
  ).toLowerCase()

}

// ======================================================

function sanitizeMoney(
  value
) {

  const number =
    Number(value)

  if (
    !Number.isFinite(number)
  ) {

    return 0

  }

  return Number(
    number.toFixed(2)
  )

}

// ======================================================

function validarRFCGenerico(
  rfc = ''
) {

  const normalized =
    sanitizeRFC(rfc)

  return [

    RFC_PUBLICO_GENERAL,
    RFC_EXTRANJERO,

  ].includes(normalized)

}

// ======================================================

function validarUsoCFDI(
  uso = ''
) {

  return USOS_CFDI_VALIDOS.includes(
    sanitizeUpper(uso)
  )

}

// ======================================================
// DATOS FISCALES
// ======================================================

export const datosFiscalesSchema =
  yup.object({

    rfc:
      yup
        .string()
        .transform(sanitizeRFC)
        .matches(
          RFC_REGEX,
          'RFC inválido'
        )
        .required(
          'RFC requerido'
        ),

    razon_social:
      yup
        .string()
        .transform(sanitizeUpper)
        .min(
          3,
          'Razón social inválida'
        )
        .max(
          254,
          'Razón social demasiado larga'
        )
        .required(
          'Razón social requerida'
        ),

    regimen_fiscal:
      yup
        .string()
        .transform(sanitizeString)
        .oneOf(
          REGIMENES_VALIDOS,
          'Régimen fiscal inválido'
        )
        .required(
          'Régimen fiscal requerido'
        ),

    codigo_postal:
      yup
        .string()
        .transform(sanitizeString)
        .matches(
          CP_REGEX,
          'Código postal inválido'
        )
        .required(
          'Código postal requerido'
        ),

    correo_facturacion:
      yup
        .string()
        .transform(sanitizeLower)
        .email(
          'Correo inválido'
        )
        .max(
          254,
          'Correo demasiado largo'
        )
        .required(
          'Correo requerido'
        ),

    uso_cfdi:
      yup
        .string()
        .transform(sanitizeUpper)
        .oneOf(
          USOS_CFDI_VALIDOS,
          'Uso CFDI inválido'
        )
        .default('G03'),

    direccion:
      yup
        .string()
        .transform(sanitizeString)
        .nullable()
        .max(
          500,
          'Dirección demasiado larga'
        ),

    pais:
      yup
        .string()
        .transform(sanitizeUpper)
        .default('MEX'),

    estado:
      yup
        .string()
        .transform(sanitizeString)
        .nullable(),

    municipio:
      yup
        .string()
        .transform(sanitizeString)
        .nullable(),

  })

// ======================================================
// FACTURA SCHEMA
// ======================================================

export const facturaSchema =
  yup.object({

    pedido_id:
      yup
        .number()
        .typeError(
          'pedido_id debe ser numérico'
        )
        .integer(
          'pedido_id inválido'
        )
        .positive(
          'pedido_id inválido'
        )
        .required(
          'pedido_id requerido'
        ),

    payment_form:
      yup
        .string()
        .transform(sanitizeString)
        .oneOf(
          FORMAS_PAGO_VALIDAS,
          'Forma de pago inválida'
        )
        .default('03'),

    payment_method:
      yup
        .string()
        .transform(sanitizeUpper)
        .oneOf(
          METODOS_PAGO_VALIDOS,
          'Método de pago inválido'
        )
        .default('PUE'),

    moneda:
      yup
        .string()
        .transform(sanitizeUpper)
        .oneOf(
          MONEDAS_VALIDAS,
          'Moneda inválida'
        )
        .default('MXN'),

    idempotency_key:
      yup
        .string()
        .nullable()
        .max(
          255,
          'idempotency_key demasiado largo'
        ),

    uuid_relacionado:
      yup
        .string()
        .nullable()
        .transform(
          sanitizeUUID
        )
        .matches(
          UUID_REGEX,
          'UUID relacionado inválido'
        ),

    datos_fiscales:
      datosFiscalesSchema
        .required(
          'Datos fiscales requeridos'
        ),

  })

  .strict(false)

  .noUnknown(
    true,
    'Payload contiene campos inválidos'
  )

  // ====================================================
  // VALIDACIONES CROSS-FIELD
  // ====================================================

  .test(
    'cfdi-rules',
    'Validación CFDI inválida',
    function (value) {

      const datos =
        value?.datos_fiscales

      if (!datos) {
        return true
      }

      // ================================================
      // RFC GENERICO
      // ================================================

      if (
        validarRFCGenerico(
          datos.rfc
        )
      ) {

        if (
          datos.uso_cfdi !==
          'S01'
        ) {

          return this.createError({

            path:
              'datos_fiscales.uso_cfdi',

            message:
              'RFC genérico requiere uso CFDI S01',

          })

        }

      }

      // ================================================
      // PPD => FORMA 99
      // ================================================

      if (
        value.payment_method ===
        'PPD'
      ) {

        if (
          value.payment_form !==
          '99'
        ) {

          return this.createError({

            path:
              'payment_form',

            message:
              'PPD requiere forma de pago 99',

          })

        }

      }

      return true

    }
  )
// ======================================================
// VALIDADOR PRINCIPAL
// PRESERVA CAMPOS DE CONTEXTO (MULTITENANT SAFE)
// ======================================================

export async function validarFacturaPayload(
  payload = {}
) {

  try {

    // ==========================================
    // PRESERVAR CONTEXTO ANTES DEL STRIP
    // ==========================================

    const proveedor_id =
      payload.proveedor_id

    const validated =
      await facturaSchema.validate(
        payload,
        {

          abortEarly: false,

          stripUnknown: true,

        }
      )

    // ==========================================
    // RESTAURAR CAMPOS CONTEXTUALES
    // ==========================================

    validated.proveedor_id =
      proveedor_id

    // ==========================================
    // NORMALIZACIÓN GENERAL
    // ==========================================

    validated.payment_form =
      sanitizeString(
        validated.payment_form
      )

    validated.payment_method =
      sanitizeUpper(
        validated.payment_method
      )

    validated.moneda =
      sanitizeUpper(
        validated.moneda
      )

    // ==========================================
    // DATOS FISCALES
    // ==========================================

    validated.datos_fiscales ??= {}

    validated.datos_fiscales.rfc =
      sanitizeRFC(
        validated.datos_fiscales.rfc
      )

    validated.datos_fiscales.razon_social =
      sanitizeUpper(
        validated.datos_fiscales
          .razon_social
      )

    validated.datos_fiscales.correo_facturacion =
      sanitizeLower(
        validated.datos_fiscales
          .correo_facturacion
      )

    validated.datos_fiscales.email =
      sanitizeLower(
        validated.datos_fiscales.email
      )

    validated.datos_fiscales.codigo_postal =
      sanitizeString(
        validated.datos_fiscales
          .codigo_postal
      )

    validated.datos_fiscales.telefono =
      sanitizeString(
        validated.datos_fiscales
          .telefono
      )

    // ==========================================
    // VALIDACIÓN FINAL
    // ==========================================

    if (
      !validated.proveedor_id
    ) {

      throw new Error(
        'proveedor_id requerido'
      )

    }

    return {

      success: true,

      data: validated,

      errors: [],

    }

  } catch (error) {

    console.error(
      '[FACTURA VALIDATION ERROR]',
      error
    )

    return {

      success: false,

      data: null,

      errors:
        error.inner?.map(
          err => ({

            field:
              err.path,

            message:
              err.message,

          })
        ) ||

        [

          {

            field:
              error.path ||
              'payload',

            message:
              error.message,

          },

        ],

    }

  }

}

// ======================================================
// EXPORTS SAT HELPERS
// ======================================================

export {

  REGIMENES_VALIDOS,
  USOS_CFDI_VALIDOS,
  FORMAS_PAGO_VALIDAS,
  METODOS_PAGO_VALIDOS,
  MONEDAS_VALIDAS,
  validarRFCGenerico,
  validarUsoCFDI,
  sanitizeMoney,

}