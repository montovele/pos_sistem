import crypto from 'crypto'
import db from '../config/db.js'

// ======================================================
// HELPERS
// ======================================================

function execute(query, params = [], connection = null) {
  const executor = connection || db
  return executor.query(query, params).then(r => r[0])
}

function safeNumber(v, f = 0) {
  const n = Number(v)
  return Number.isFinite(n) ? n : f
}

function normalizePrefijo(p = 'F') {
  return String(p || 'F').trim().toUpperCase()
}

function buildNumeroFactura(prefijo, folio) {
  return `${prefijo}-${String(folio).padStart(6, '0')}`
}

// ======================================================
// GET BY ID (NUEVO - CRÍTICO)
// ======================================================

export async function getFolioById(idFolio, proveedorId) {
  const rows = await execute(
    `
    SELECT *
    FROM folios_facturas
    WHERE id_folio = ?
      AND proveedor_id = ?
    LIMIT 1
    `,
    [idFolio, proveedorId]
  )

  return rows[0] || null
}

// ======================================================
// LIST
// ======================================================

export async function listFolios(proveedorId) {
  return execute(
    `
    SELECT *
    FROM folios_facturas
    WHERE proveedor_id = ?
    ORDER BY anio DESC, mes DESC
    `,
    [proveedorId]
  )
}

// ======================================================
// CREATE
// ======================================================

export async function createFolioConfig(
  data
) {

  try {

    const folioInicial =
      Number(
        safeNumber(
          data.folio_actual
        )
      )

    // =========================================
    // VALIDACIONES
    // =========================================

    if (
      !Number.isFinite(
        folioInicial
      )
    ) {

      throw new Error(
        'El folio inicial debe ser numérico'
      )

    }

    // =========================================
    // SI ES PRIMER REGISTRO
    // NUNCA PERMITIR 0 O NEGATIVOS
    // =========================================

    const folioActual =

      folioInicial > 0
        ? folioInicial
        : 1

    const result =
      await execute(

        `
        INSERT INTO folios_facturas
        (

          proveedor_id,
          prefijo,
          folio_actual,
          anio,
          mes

        )

        VALUES
        (
          ?,
          ?,
          ?,
          ?,
          ?
        )
        `,

        [

          data.proveedor_id,

          normalizePrefijo(
            data.prefijo
          ),

          folioActual,

          data.anio,

          data.mes,

        ]

      )

    return {

      insertId:
        result.insertId,

      folio_actual:
        folioActual,

    }

  }

  catch (err) {

    if (
      err.code ===
      'ER_DUP_ENTRY'
    ) {

      const error =
        new Error(

          'Ya existe una configuración de folio para este proveedor. Puedes editar el registro existente en lugar de crear uno nuevo.'

        )

      error.status =
        409

      error.code =
        'FOLIO_ALREADY_EXISTS'

      throw error

    }

    throw err

  }

}
// ======================================================
// UPDATE (SEGURIDAD MEJORADA)
// ======================================================

export async function updateFolio(idFolio, proveedorId, data) {
  await execute(
    `
    UPDATE folios_facturas
    SET
      prefijo = ?,
      folio_actual = ?
    WHERE id_folio = ?
      AND proveedor_id = ?
    `,
    [
      normalizePrefijo(data.prefijo),
      safeNumber(data.folio_actual),
      idFolio,
      proveedorId
    ]
  )

  return true
}

// ======================================================
// LOCK
// ======================================================

export async function lockFolio(proveedorId, anio, mes, prefijo, connection) {
  const rows = await execute(
    `
    SELECT *
    FROM folios_facturas
    WHERE proveedor_id = ?
      AND anio = ?
      AND mes = ?
      AND prefijo = ?
    FOR UPDATE
    `,
    [proveedorId, anio, mes, normalizePrefijo(prefijo)],
    connection
  )

  return rows[0] || null
}
// ======================================================
// OBTENER FOLIO ACTUAL
// SOLO CONSULTA
// NO CREA
// NO INCREMENTA
// NO BLOQUEA
// ======================================================

export async function obtenerSiguienteFolio(
  proveedorId,
  pedidoId = null,
  prefijo = 'F',
  connection
) {

  try {

    const registro =
      await execute(
        `
        SELECT
          id_folio,
          proveedor_id,
          prefijo,
          folio_actual,
          anio,
          mes

        FROM folios_facturas

        WHERE proveedor_id = ?

        LIMIT 1
        `,
        [proveedorId],
        connection
      )

    const folio =
      registro?.[0]

    if (!folio) {

      return null

    }

    const numeroActual =
      Number(
        folio.folio_actual || 0
      )

    return {

      id_folio:
        folio.id_folio,

      proveedor_id:
        folio.proveedor_id,

      pedido_id:
        pedidoId,

      prefijo:
        folio.prefijo ||

        normalizePrefijo(prefijo),

      anio:
        folio.anio,

      mes:
        folio.mes,

      folio:
        numeroActual,

      numeroFactura:
        buildNumeroFactura(
          folio.prefijo,
          numeroActual
        ),

    }

  }

  catch (err) {

    console.error(
      '[OBTENER_FOLIO]',
      err
    )

    throw new Error(
      'No fue posible obtener el folio actual'
    )

  }

}

// ======================================================
// RESET (SEGURIDAD MULTI-TENANT)
// NUNCA PERMITIR FOLIOS <= 0
// ======================================================

export async function resetFolio(
  idFolio,
  proveedorId,
  folio = 1
) {

  const nuevoFolio =
    Math.max(
      1,
      safeNumber(folio)
    )

  const result =
    await execute(
      `
      UPDATE folios_facturas
      SET

        folio_actual = ?

      WHERE
        id_folio = ?
        AND proveedor_id = ?
      `,
      [
        nuevoFolio,
        idFolio,
        proveedorId
      ]
    )

  if (
    result.affectedRows === 0
  ) {

    const error =
      new Error(
        'Folio no encontrado para el proveedor indicado'
      )

    error.status = 404
    error.code = 'FOLIO_NOT_FOUND'

    throw error

  }

  return {

    success: true,

    id_folio:
      idFolio,

    proveedor_id:
      proveedorId,

    folio_actual:
      nuevoFolio,

  }

}