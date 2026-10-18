// services/IvaFiscalService.js

class IvaFiscalService {

  // ===================================================
  // NORMALIZAR TASA
  // 16 → 0.16
  // 8 → 0.08
  // ===================================================

  normalizarTasa(
    tasa = 16
  ) {

    tasa =
      Number(tasa)

    if (
      Number.isNaN(tasa)
    ) {
      return 0.16
    }

    return (
      tasa > 1
        ? tasa / 100
        : tasa
    )

  }

  // ===================================================
  // DETERMINAR IVA
  // ===================================================

  determinarTasaIVA(
    empresa = {}
  ) {

    try {

      const hoy =
        new Date()

      const inicio =
        empresa?.fecha_inicio_estimulo
          ? new Date(
              empresa.fecha_inicio_estimulo
            )
          : null

      const fin =
        empresa?.fecha_fin_estimulo
          ? new Date(
              empresa.fecha_fin_estimulo
            )
          : null

      const vigente =

        inicio &&
        fin &&

        hoy >= inicio &&
        hoy <= fin

      const aplicaEstimulo =

        String(
          empresa?.region_fiscal
        ) ===
        'frontera_norte'

        &&

        Boolean(
          Number(
            empresa?.estimulo_iva_frontera
          )
        )

        &&

        Boolean(
          Number(
            empresa?.aviso_sat_presentado
          )
        )

        &&

        Boolean(
          Number(
            empresa?.establecimiento_autorizado
          )
        )

        &&

        vigente

      if (
        aplicaEstimulo
      ) {

        return 0.08

      }

      return this.normalizarTasa(
        empresa?.tasa_iva_default
      )

    }

    catch (
      err
    ) {

      console.error(
        '[IVA SERVICE]',
        err
      )

      return 0.16

    }

  }

  // ===================================================
  // DETALLE (DEBUG / FRONT)
  // ===================================================

  obtenerDiagnostico(
    empresa = {}
  ) {

    const tasa =
      this.determinarTasaIVA(
        empresa
      )

    return {

      tasa,

      porcentaje:
        tasa * 100,

      aplicaEstimulo:
        tasa === 0.08,

      region:
        empresa?.region_fiscal,

      avisoSAT:
        Boolean(
          Number(
            empresa?.aviso_sat_presentado
          )
        ),

      establecimiento:
        Boolean(
          Number(
            empresa?.establecimiento_autorizado
          )
        ),

      vigente:

        empresa?.fecha_inicio_estimulo &&
        empresa?.fecha_fin_estimulo

    }

  }

}

export default new IvaFiscalService()