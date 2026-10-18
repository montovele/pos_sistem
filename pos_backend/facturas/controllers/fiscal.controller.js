// ======================================================
// modules/fiscal/controllers/fiscal.controller.js
// ======================================================

import FiscalConfigService from '../services/FiscalConfigService.js'

// ======================================================
// GET CONFIGURACIÓN FISCAL
// ======================================================

export async function obtenerConfiguracionFiscal(
  req,
  res
) {

  try {

    const configuracion =
      await FiscalConfigService.obtenerConfiguracion()

    if (!configuracion) {

      return res.status(404).json({

        success: false,

        message:
          'No existe configuración fiscal.'

      })

    }

    return res.json({

      success: true,

      data:
        configuracion

    })

  }

  catch (error) {

    console.error(
      '[FISCAL][GET]',
      error
    )

    return res.status(500).json({

      success: false,

      message:
        'Error obteniendo la configuración fiscal.',

      error:
        error.message

    })

  }

}

// ======================================================
// POST CONFIGURACIÓN FISCAL
// ======================================================

export async function crearConfiguracionFiscal(
  req,
  res
) {

  try {

    const resultado =
      await FiscalConfigService.crearConfiguracion(
        req.body
      )

    return res.status(201).json({

      success: true,

      message:
        'Configuración fiscal creada correctamente.',

      data:
        resultado

    })

  }

  catch (error) {

    console.error(
      '[FISCAL][POST]',
      error
    )

    return res.status(400).json({

      success: false,

      message:
        error.message

    })

  }

}

// ======================================================
// PUT CONFIGURACIÓN FISCAL
// ======================================================

export async function actualizarConfiguracionFiscal(
  req,
  res
) {

  try {

    const resultado =
      await FiscalConfigService.actualizarConfiguracion(
        req.body
      )

    return res.json({

      success: true,

      message:
        'Configuración fiscal actualizada correctamente.',

      data:
        resultado

    })

  }

  catch (error) {

    console.error(
      '[FISCAL][PUT]',
      error
    )

    return res.status(400).json({

      success: false,

      message:
        error.message

    })

  }

}