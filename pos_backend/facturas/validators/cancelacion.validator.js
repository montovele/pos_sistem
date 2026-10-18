// facturas/validators/cancelacion.validator.js
// VALIDADOR EMPRESARIAL CANCELACIÓN CFDI

import * as yup from 'yup'

// ======================================================
// CONSTANTES SAT
// ======================================================

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const MOTIVOS_CANCELACION = [
  '01', // Comprobante emitido con errores con relación
  '02', // Comprobante emitido con errores sin relación
  '03', // No se llevó a cabo la operación
  '04', // Operación nominativa relacionada en factura global
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

// ======================================================
// SCHEMA
// ======================================================

export const cancelacionSchema =
  yup
    .object({
      factura_id:
        yup
          .number()
          .typeError(
            'factura_id debe ser numérico'
          )
          .integer(
            'factura_id inválido'
          )
          .positive(
            'factura_id inválido'
          )
          .required(
            'factura_id requerido'
          ),

      motivo:
        yup
          .string()
          .transform(
            sanitizeString
          )
          .oneOf(
            MOTIVOS_CANCELACION,
            'Motivo de cancelación inválido'
          )
          .required(
            'Motivo requerido'
          ),

      uuid_sustitucion:
        yup
          .string()
          .nullable()
          .transform(
            (value) => {
              if (
                !value ||
                value === ''
              ) {
                return null
              }

              return sanitizeString(
                value
              ).toUpperCase()
            }
          )

          .when(
            'motivo',
            {
              is: '01',

              then: (
                schema
              ) =>
                schema
                  .required(
                    'UUID de sustitución requerido para motivo 01'
                  )
                  .matches(
                    UUID_REGEX,
                    'UUID sustitución inválido'
                  ),

              otherwise: (
                schema
              ) =>
                schema.nullable(),
            }
          ),
    })

    .strict(false)

    .noUnknown(
      true,
      'Payload contiene campos inválidos'
    )

// ======================================================
// VALIDADOR HELPER
// ======================================================

export async function validarCancelacionPayload(
  payload
) {
  try {
    const validated =
      await cancelacionSchema.validate(
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