// ======================================================
// modules/fiscal/services/FiscalConfigService.js
// ======================================================

import * as FiscalModel from '../controllers/models/fiscal.model.js'

import EmpresaFiscalService from './EmpresaFiscalService.js'
import IvaFiscalService from './IvaFiscalService.js'

class FiscalConfigService {

  // ====================================================
  // OBTENER CONFIGURACIÓN FISCAL
  // ====================================================

  async obtenerConfiguracion() {

    const empresa =
      await EmpresaFiscalService.obtenerEmpresaEmisora()

    if (!empresa) {
      return null
    }

    const tasaIVA =
      IvaFiscalService.determinarTasaIVA(
        empresa
      )

    const diagnostico =
      IvaFiscalService.obtenerDiagnostico(
        empresa
      )

    return {

      empresa: {

        id:
          empresa.id,

        razon_social:
          empresa.razon_social,

        rfc:
          empresa.rfc,

        regimen_fiscal:
          empresa.regimen_fiscal,

        codigo_postal:
          empresa.codigo_postal

      },

      fiscal: {

        region:
          empresa.region_fiscal,

        tasa_iva:
          tasaIVA,

        porcentaje_iva:
          tasaIVA * 100,

        tasa_iva_default:
          empresa.tasa_iva_default,

        estimulo_iva_frontera:
          empresa.estimulo_iva_frontera,

        sandbox_mode:
          empresa.sandbox_mode,

        facturapi_organization_id:
          empresa.facturapi_organization_id

      },

      diagnostico

    }

  }

  // ====================================================
  // CREAR CONFIGURACIÓN
  // ====================================================

  async crearConfiguracion(payload = {}) {

    const existe =
      await FiscalModel.existeConfiguracionFiscal()

    if (existe) {

      throw new Error(
        'Ya existe una configuración fiscal.'
      )

    }

    const id =
      await FiscalModel.createConfiguracionFiscal(
        payload
      )

    return {

      id,

      success: true

    }

  }

  // ====================================================
  // ACTUALIZAR CONFIGURACIÓN
  // ====================================================

  async actualizarConfiguracion(payload = {}) {

    const existe =
      await FiscalModel.existeConfiguracionFiscal()

    if (!existe) {

      throw new Error(
        'No existe una configuración fiscal.'
      )

    }

    const actualizado =
      await FiscalModel.updateConfiguracionFiscal(
        payload
      )

    return {

      success:
        actualizado

    }

  }

  // ====================================================
  // EXISTE
  // ====================================================

  async existe() {

    return FiscalModel.existeConfiguracionFiscal()

  }

}

export default new FiscalConfigService()