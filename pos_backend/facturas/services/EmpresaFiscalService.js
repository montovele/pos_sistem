// ======================================================
// services/EmpresaFiscalService.js
// ======================================================

import { poolCT } from '../../ct/config/db_ct.js'

class EmpresaFiscalService {

  // ====================================================
  // NORMALIZADOR (robusto + tipos seguros)
  // ====================================================

  normalizeEmpresa(row = null) {

    if (!row) return null

    return {

      id: Number(row.id),

      razon_social: row.razon_social || '',
      rfc: row.rfc || '',
      regimen_fiscal: row.regimen_fiscal || '',
      codigo_postal: row.codigo_postal || '',

      region_fiscal: row.region_fiscal || 'normal',

      tasa_iva_default: Number(row.tasa_iva_default ?? 16),

      estimulo_iva_frontera:
        Boolean(Number(row.estimulo_iva_frontera ?? 0)),

      aviso_sat_presentado:
        Boolean(Number(row.aviso_sat_presentado ?? 0)),

      establecimiento_autorizado:
        Boolean(Number(row.establecimiento_autorizado ?? 0)),

      sandbox_mode:
        Boolean(Number(row.sandbox_mode ?? 0)),

      facturapi_organization_id:
        row.facturapi_organization_id || null,

      fecha_inicio_estimulo:
        row.fecha_inicio_estimulo
          ? new Date(row.fecha_inicio_estimulo)
          : null,

      fecha_fin_estimulo:
        row.fecha_fin_estimulo
          ? new Date(row.fecha_fin_estimulo)
          : null,

      created_at: row.created_at,
      updated_at: row.updated_at
    }
  }

  // ====================================================
  // 🔥 EMPRESA EMISORA GLOBAL (SOURCE OF TRUTH)
  // ====================================================

  async obtenerEmpresaEmisora() {

    try {

      const [rows] = await poolCT.execute(`
        SELECT *
        FROM empresas_fiscales
        WHERE region_fiscal IN (
          'frontera_norte',
          'frontera_sur',
          'normal'
        )
        ORDER BY
          estimulo_iva_frontera DESC,
          id ASC
        LIMIT 1
      `)

      const empresa = this.normalizeEmpresa(rows?.[0])

      console.log('[EMPRESA EMISORA GLOBAL]', empresa)

      return empresa

    } catch (error) {

      console.error('[EMPRESA EMISORA GLOBAL ERROR]', error)

      return null
    }
  }

  // ====================================================
  // VALIDACIÓN SIMPLE
  // ====================================================

  async existe() {

    const empresa = await this.obtenerEmpresaEmisora()

    return !!empresa
  }
}

export default new EmpresaFiscalService()