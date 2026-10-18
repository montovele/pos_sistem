// ======================================================
// modules/fiscal/models/fiscal.model.js
// ======================================================

import { poolCT } from '../../../ct/config/db_ct.js'

// ======================================================
// OBTENER CONFIGURACIÓN FISCAL
// ======================================================

export async function getConfiguracionFiscal() {

  const [rows] = await poolCT.query(`
    SELECT *
    FROM empresas_fiscales
    LIMIT 1
  `)

  return rows[0] ?? null

}

// ======================================================
// VERIFICAR SI EXISTE CONFIGURACIÓN
// ======================================================

export async function existeConfiguracionFiscal() {

  const [rows] = await poolCT.query(`
    SELECT COUNT(*) AS total
    FROM empresas_fiscales
  `)

  return Number(rows[0]?.total ?? 0) > 0

}

// ======================================================
// CREAR CONFIGURACIÓN
// ======================================================

export async function createConfiguracionFiscal(data) {

  const {

    razon_social,
    rfc,
    regimen_fiscal,
    codigo_postal,

    region_fiscal,

    tasa_iva_default,

    estimulo_iva_frontera,
    aviso_sat_presentado,
    establecimiento_autorizado,

    fecha_inicio_estimulo,
    fecha_fin_estimulo,

    sandbox_mode,
    facturapi_organization_id

  } = data

  const [result] = await poolCT.query(

    `
    INSERT INTO empresas_fiscales (

      razon_social,
      rfc,
      regimen_fiscal,
      codigo_postal,

      region_fiscal,

      tasa_iva_default,

      estimulo_iva_frontera,
      aviso_sat_presentado,
      establecimiento_autorizado,

      fecha_inicio_estimulo,
      fecha_fin_estimulo,

      sandbox_mode,
      facturapi_organization_id

    )
    VALUES (

      ?, ?, ?, ?,

      ?,

      ?,

      ?, ?, ?,

      ?, ?,

      ?, ?

    )
    `,

    [

      razon_social,
      rfc,
      regimen_fiscal,
      codigo_postal,

      region_fiscal,

      tasa_iva_default,

      estimulo_iva_frontera,
      aviso_sat_presentado,
      establecimiento_autorizado,

      fecha_inicio_estimulo,
      fecha_fin_estimulo,

      sandbox_mode,
      facturapi_organization_id

    ]

  )

  return result.insertId

}

// ======================================================
// ACTUALIZAR CONFIGURACIÓN
// ======================================================

export async function updateConfiguracionFiscal(data) {

  const {

    razon_social,
    rfc,
    regimen_fiscal,
    codigo_postal,

    region_fiscal,

    tasa_iva_default,

    estimulo_iva_frontera,
    aviso_sat_presentado,
    establecimiento_autorizado,

    fecha_inicio_estimulo,
    fecha_fin_estimulo,

    sandbox_mode,
    facturapi_organization_id

  } = data

  const [result] = await poolCT.query(

    `
    UPDATE empresas_fiscales

    SET

      razon_social=?,
      rfc=?,
      regimen_fiscal=?,
      codigo_postal=?,

      region_fiscal=?,

      tasa_iva_default=?,

      estimulo_iva_frontera=?,
      aviso_sat_presentado=?,
      establecimiento_autorizado=?,

      fecha_inicio_estimulo=?,
      fecha_fin_estimulo=?,

      sandbox_mode=?,
      facturapi_organization_id=?,

      updated_at=NOW()

    LIMIT 1
    `,

    [

      razon_social,
      rfc,
      regimen_fiscal,
      codigo_postal,

      region_fiscal,

      tasa_iva_default,

      estimulo_iva_frontera,
      aviso_sat_presentado,
      establecimiento_autorizado,

      fecha_inicio_estimulo,
      fecha_fin_estimulo,

      sandbox_mode,
      facturapi_organization_id

    ]

  )

  return result.affectedRows > 0

}