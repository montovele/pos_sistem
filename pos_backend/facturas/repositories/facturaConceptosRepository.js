// ======================================================
// 📁 facturas/repositories/facturaConceptosRepository.js
// ENTERPRISE REPOSITORY FINAL
// CFDI 4.0 + MYSQL2 + AUDITORIA + RECOVERY
// FIX IVA / SUBTOTAL / TASA CFDI
// ======================================================

import db from '../config/db.js'

// ======================================================
// HELPERS
// ======================================================

function getExecutor(
  connection = null
) {

  return connection || db

}

// ======================================================

async function execute(
  query,
  params = [],
  connection = null
) {

  const executor =
    getExecutor(connection)

  const [rows] =
    await executor.query(
      query,
      params
    )

  return rows

}

// ======================================================

function safeNumber(
  value,
  fallback = 0
) {

  const parsed =
    Number(value)

  return Number.isFinite(parsed)
    ? parsed
    : fallback

}

// ======================================================

function roundMoney(
  value
) {

  return Number(
    safeNumber(value)
      .toFixed(2)
  )

}

// ======================================================

function normalizeString(
  value = ''
) {

  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')

}

// ======================================================

function parseJSON(
  value,
  fallback = {}
) {

  try {

    if (!value) {

      return fallback

    }

    if (
      typeof value ===
      'object'
    ) {

      return value

    }

    return JSON.parse(value)

  }

  catch {

    return fallback

  }

}

// ======================================================
// NORMALIZE OUTPUT
// ======================================================

function normalizeConcepto(
  row = {}
) {

  return {

    ...row,

    cantidad:
      safeNumber(
        row.cantidad
      ),

    valor_unitario:
      roundMoney(
        row.valor_unitario
      ),

    descuento:
      roundMoney(
        row.descuento
      ),

    subtotal:
      roundMoney(
        row.subtotal
      ),

    impuestos:
      roundMoney(
        row.impuestos
      ),

    total:
      roundMoney(
        row.total
      ),

    tasa_cuota:
      safeNumber(
        row.tasa_cuota,
        0.16
      ),

    meta:
      parseJSON(
        row.meta,
        {}
      ),

    created_at:
      row.created_at
        ? new Date(row.created_at)
        : null,

    updated_at:
      row.updated_at
        ? new Date(row.updated_at)
        : null,

  }

}

// ======================================================
// NORMALIZAR INPUT
// ======================================================

function normalizeConceptoInput(
  item = {}
) {

  // ====================================================
  // CANTIDAD
  // ====================================================

  const cantidad =
    safeNumber(

      item.quantity ??

      item.cantidad ??

      1

    )

  // ====================================================
  // VALOR UNITARIO
  // 🔥 ESTE VALOR YA ES SIN IVA
  // ====================================================

  const valorUnitario =
    roundMoney(

      item.valor_unitario ??

      item.price ??

      item.precio ??

      item.precio_unitario ??

      item?.product?.price ??

      0

    )

  // ====================================================
  // DESCUENTO
  // ====================================================

  const descuento =
    roundMoney(
      item.descuento ?? 0
    )

  // ====================================================
  // SUBTOTAL
  // 🔥 NO DIVIDIR ENTRE 1.16
  // ====================================================

  const subtotal =
    roundMoney(

      (
        cantidad *
        valorUnitario
      ) - descuento

    )

  // ====================================================
  // TASA IVA
  // ====================================================

  const tasaCuota =
    safeNumber(

      item.tasa_cuota ??

      item.tasaIVA ??

      item.tasa_iva ??

      0.16,

      0.16

    )

  // ====================================================
  // IVA
  // 🔥 CALCULADO DESDE SUBTOTAL
  // ====================================================

  const impuestos =
    roundMoney(

      item.iva ??

      item.tax ??

      (
        subtotal *
        tasaCuota
      )

    )

  // ====================================================
  // TOTAL
  // ====================================================

  const total =
    roundMoney(
      subtotal + impuestos
    )

  // ====================================================
  // DEBUG
  // ====================================================

  console.log(
    '[CONCEPTO NORMALIZADO CFDI]',
    {

      descripcion:
        item.descripcion,

      cantidad,

      valorUnitario,

      subtotal,

      tasaCuota,

      impuestos,

      total,

    }
  )

  // ====================================================
  // RETURN
  // ====================================================

  return {

    clave_prod_serv:

      item.clave_prod_serv ||

      item.product_key ||

      item.clave_sat ||

      item?.product?.product_key ||

      '01010101',

    no_identificacion:

      item.no_identificacion ||

      item.sku ||

      item?.product?.sku ||

      null,

    descripcion:
      normalizeString(

        item.descripcion ||

        item.description ||

        item?.product?.description ||

        'Producto'

      ),

    clave_unidad:

      item.clave_unidad ||

      item.unit_key ||

      item?.product?.unit_key ||

      'H87',

    unidad:

      item.unidad ||

      item.unit_name ||

      item?.product?.unit_name ||

      'Pieza',

    // ==================================================
    // CFDI VALUES
    // ==================================================

    cantidad,

    valor_unitario:
      valorUnitario,

    descuento,

    subtotal,

    impuestos,

    total,

    // ==================================================
    // SAT
    // ==================================================

    objeto_impuesto:

      item.objeto_impuesto ||
      '02',

    impuesto:

      item.impuesto ||
      '002',

    tipo_factor:

      item.tipo_factor ||
      'Tasa',

    tasa_cuota:
      tasaCuota,

    // ==================================================
    // META
    // ==================================================

    meta:
      item.meta || {},

  }

}

// ======================================================
// INSERT CONCEPTO
// ======================================================

export async function insertConcepto(
  facturaId,
  concepto = {},
  connection = null
) {

  if (!facturaId) {

    throw new Error(
      'facturaId requerido'
    )

  }

  const item =
    normalizeConceptoInput(
      concepto
    )

  const result =
    await execute(
      `
      INSERT INTO factura_conceptos (

        factura_id,

        clave_prod_serv,
        no_identificacion,

        descripcion,

        clave_unidad,
        unidad,

        cantidad,

        valor_unitario,
        descuento,

        subtotal,
        impuestos,
        total,

        objeto_impuesto,
        impuesto,
        tipo_factor,
        tasa_cuota,

        meta,

        created_at,
        updated_at

      )
      VALUES (

        ?,

        ?, ?,

        ?,

        ?, ?,

        ?,

        ?, ?,

        ?, ?, ?,

        ?, ?, ?, ?,

        ?,

        NOW(),
        NOW()

      )
      `,
      [

        facturaId,

        item.clave_prod_serv,
        item.no_identificacion,

        item.descripcion,

        item.clave_unidad,
        item.unidad,

        item.cantidad,

        item.valor_unitario,
        item.descuento,

        item.subtotal,
        item.impuestos,
        item.total,

        item.objeto_impuesto,
        item.impuesto,
        item.tipo_factor,
        item.tasa_cuota,

        JSON.stringify(
          item.meta || {}
        ),

      ],
      connection
    )

  return result.insertId

}

// ======================================================
// INSERT MULTIPLE
// ======================================================

export async function insertConceptos(
  facturaId,
  conceptos = [],
  connection = null
) {

  if (
    !Array.isArray(conceptos)
  ) {

    throw new Error(
      'conceptos debe ser array'
    )

  }

  if (!conceptos.length) {

    throw new Error(
      'Conceptos requeridos'
    )

  }

  const inserted = []

  for (const concepto of conceptos) {

    const id =
      await insertConcepto(
        facturaId,
        concepto,
        connection
      )

    inserted.push(id)

  }

  return {

    success: true,

    inserted:
      inserted.length,

    ids:
      inserted,

  }

}

// ======================================================
// GET BY FACTURA
// ======================================================

export async function getConceptosByFacturaId(
  facturaId,
  connection = null
) {

  const rows =
    await execute(
      `
      SELECT *
      FROM factura_conceptos
      WHERE factura_id = ?
      ORDER BY id_concepto ASC
      `,
      [facturaId],
      connection
    )

  return rows.map(
    normalizeConcepto
  )

}

// ======================================================
// GET CONCEPTO BY ID
// ======================================================

export async function getConceptoById(
  conceptoId,
  connection = null
) {

  const rows =
    await execute(
      `
      SELECT *
      FROM factura_conceptos
      WHERE id_concepto = ?
      LIMIT 1
      `,
      [conceptoId],
      connection
    )

  return rows?.length
    ? normalizeConcepto(
        rows[0]
      )
    : null

}

// ======================================================
// DELETE
// ======================================================

export async function deleteConceptosByFacturaId(
  facturaId,
  connection = null
) {

  await execute(
    `
    DELETE FROM factura_conceptos
    WHERE factura_id = ?
    `,
    [facturaId],
    connection
  )

  return true

}

// ======================================================
// UPDATE
// ======================================================

export async function updateConcepto(
  conceptoId,
  data = {},
  connection = null
) {

  const current =
    await getConceptoById(
      conceptoId,
      connection
    )

  if (!current) {

    throw new Error(
      'Concepto no encontrado'
    )

  }

  const merged =
    normalizeConceptoInput({

      ...current,

      ...data,

    })

  const mergedMeta = {

    ...(current.meta || {}),

    ...(data.meta || {}),

  }

  await execute(
    `
    UPDATE factura_conceptos
    SET

      clave_prod_serv = ?,
      no_identificacion = ?,

      descripcion = ?,

      clave_unidad = ?,
      unidad = ?,

      cantidad = ?,

      valor_unitario = ?,
      descuento = ?,

      subtotal = ?,
      impuestos = ?,
      total = ?,

      objeto_impuesto = ?,
      impuesto = ?,
      tipo_factor = ?,
      tasa_cuota = ?,

      meta = ?,

      updated_at = NOW()

    WHERE id_concepto = ?
    `,
    [

      merged.clave_prod_serv,
      merged.no_identificacion,

      merged.descripcion,

      merged.clave_unidad,
      merged.unidad,

      merged.cantidad,

      merged.valor_unitario,
      merged.descuento,

      merged.subtotal,
      merged.impuestos,
      merged.total,

      merged.objeto_impuesto,
      merged.impuesto,
      merged.tipo_factor,
      merged.tasa_cuota,

      JSON.stringify(
        mergedMeta
      ),

      conceptoId,

    ],
    connection
  )

  return true

}

// ======================================================
// STATS
// ======================================================

export async function getConceptosStats(
  connection = null
) {

  const rows =
    await execute(
      `
      SELECT

        COUNT(*) AS total_conceptos,

        SUM(cantidad) AS total_cantidad,

        SUM(subtotal) AS subtotal,

        SUM(impuestos) AS impuestos,

        SUM(total) AS total

      FROM factura_conceptos
      `,
      [],
      connection
    )

  return {

    total_conceptos:
      Number(
        rows?.[0]
          ?.total_conceptos || 0
      ),

    total_cantidad:
      safeNumber(
        rows?.[0]
          ?.total_cantidad || 0
      ),

    subtotal:
      roundMoney(
        rows?.[0]
          ?.subtotal || 0
      ),

    impuestos:
      roundMoney(
        rows?.[0]
          ?.impuestos || 0
      ),

    total:
      roundMoney(
        rows?.[0]
          ?.total || 0
      ),

  }

}

// ======================================================
// HEALTH CHECK
// ======================================================

export async function facturaConceptosHealthCheck() {

  try {

    const rows =
      await execute(`
        SELECT 1 AS ok
      `)

    return {

      success: true,

      healthy:
        rows?.[0]?.ok === 1,

    }

  }

  catch (error) {

    console.error(
      '❌ facturaConceptosHealthCheck:',
      error.message
    )

    return {

      success: false,

      healthy: false,

      error:
        error.message,

    }

  }

}

// ======================================================
// LEGACY EXPORTS
// ======================================================

export {
  getConceptosByFacturaId as getConceptosFactura,
}

// ======================================================
// DEFAULT EXPORT
// ======================================================

export default {

  insertConcepto,

  insertConceptos,

  getConceptosByFacturaId,

  getConceptoById,

  updateConcepto,

  deleteConceptosByFacturaId,

  getConceptosStats,

  facturaConceptosHealthCheck,

}