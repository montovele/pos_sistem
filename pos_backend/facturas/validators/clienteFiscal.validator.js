// facturas/validators/clienteFiscal.validator.js
// VALIDADOR EMPRESARIAL CLIENTE FISCAL

import * as yup from 'yup'

// ======================================================
// CONSTANTES SAT
// ======================================================

const RFC_REGEX =
  /^([A-Z&Ñ]{3,4})\d{6}([A-Z\d]{3})$/i

const CP_REGEX =
  /^\d{5}$/

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
// HELPERS
// ======================================================

function sanitizeString(
  value
) {
  if (
    value === undefined ||
    value === null
  ) {
    return value
  }

  return String(value)
    .trim()
    .replace(/\s+/g, ' ')
}

function sanitizeRFC(value) {
  if (!value) {
    return value
  }

  return sanitizeString(value)
    .toUpperCase()
}

function sanitizeEmail(
  value
) {
  if (!value) {
    return value
  }

  return sanitizeString(
    value
  ).toLowerCase()
}

// ======================================================
// SCHEMA
// ======================================================

export const clienteFiscalSchema =
  yup
    .object({
      woo_customer_id:
        yup
          .number()
          .nullable()
          .transform(
            (value) =>
              Number.isNaN(value)
                ? null
                : value
          ),

      email:
        yup
          .string()
          .transform(
            sanitizeEmail
          )
          .email(
            'Email inválido'
          )
          .nullable(),

      rfc:
        yup
          .string()
          .transform(
            sanitizeRFC
          )
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
          .transform(
            sanitizeString
          )
          .min(
            3,
            'Razón social inválida'
          )
          .max(
            255,
            'Razón social demasiado larga'
          )
          .required(
            'Razón social requerida'
          ),

      regimen_fiscal:
        yup
          .string()
          .oneOf(
            REGIMENES_VALIDOS,
            'Régimen fiscal inválido'
          )
          .required(
            'Régimen fiscal requerido'
          ),

      direccion:
        yup
          .string()
          .transform(
            sanitizeString
          )
          .nullable()
          .max(
            500,
            'Dirección demasiado larga'
          ),

      cp:
        yup
          .string()
          .transform(
            sanitizeString
          )
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
          .transform(
            sanitizeEmail
          )
          .email(
            'Correo de facturación inválido'
          )
          .max(
            255,
            'Correo demasiado largo'
          )
          .required(
            'Correo de facturación requerido'
          ),
    })

    .strict(false)

    .noUnknown(
      true,
      'Se detectaron campos inválidos'
    )

// ======================================================
// VALIDADOR HELPER
// ======================================================

export async function validarClienteFiscal(
  payload
) {
  try {
    const validated =
      await clienteFiscalSchema.validate(
        payload,
        {
          abortEarly:
            false,

          stripUnknown:
            true,
        }
      )

    return {
      success: true,
      data: validated,
      errors: [],
    }
  } catch (error) {
    return {
      success: false,

      data: null,

      errors:
        error.inner?.map(
          (err) => ({
            field:
              err.path,

            message:
              err.message,
          })
        ) || [
          {
            field:
              error.path,
            message:
              error.message,
          },
        ],
    }
  }
}