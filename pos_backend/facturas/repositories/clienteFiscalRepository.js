// ======================================================
// CLIENTE FISCAL REPOSITORY
// MULTI TENANT
// ======================================================

import db from '../config/db.js'

// ======================================================
// HELPERS
// ======================================================

const execute = async (
  sql,
  params = [],
  connection = null
) => {

  const executor =
    connection || db

  const [rows] =
    await executor.query(
      sql,
      params
    )

  return rows

}

const normalizeRFC = (
  value = ''
) =>
  String(value)
    .trim()
    .toUpperCase()

const normalizeString = (
  value = ''
) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')

const normalizeEmail = (
  value = ''
) =>
  normalizeString(value)
    .toLowerCase()

const parseJSON = (
  value,
  fallback = {}
) => {

  try {

    if (!value) {
      return fallback
    }

    return typeof value === 'object'
      ? value
      : JSON.parse(value)

  } catch {

    return fallback

  }

}

const normalizeCliente = (
  row = {}
) => ({

  ...row,

  meta:
    parseJSON(
      row.meta
    )

})

async function findOne(
  where,
  params = [],
  connection = null
) {

  const rows =
    await execute(
      `
      SELECT *
      FROM clientes_fiscales
      WHERE ${where}
      LIMIT 1
      `,
      params,
      connection
    )

  return rows.length
    ? normalizeCliente(
        rows[0]
      )
    : null

}

// ======================================================
// GETTERS
// ======================================================

export function getClienteFiscalById(
  id,
  proveedor_id,
  connection = null
) {

  return findOne(
    `
      id_cliente_fiscal = ?
      AND proveedor_id = ?
    `,
    [
      id,
      proveedor_id
    ],
    connection
  )

}

export function findByRFC(
  rfc,
  proveedor_id,
  connection = null
) {

  return findOne(
    `
      rfc = ?
      AND proveedor_id = ?
      AND deleted_at IS NULL
    `,
    [
      normalizeRFC(rfc),
      proveedor_id
    ],
    connection
  )

}

export function findByEmail(
  email,
  proveedor_id,
  connection = null
) {

  return findOne(
    `
      correo_facturacion = ?
      AND proveedor_id = ?
      AND deleted_at IS NULL
    `,
    [
      normalizeEmail(email),
      proveedor_id
    ],
    connection
  )

}

export function findByWooCustomerId(
  woo_customer_id,
  proveedor_id,
  connection = null
) {

  return findOne(
    `
      woo_customer_id = ?
      AND proveedor_id = ?
      AND deleted_at IS NULL
    `,
    [
      woo_customer_id,
      proveedor_id
    ],
    connection
  )

}

// ======================================================
// LISTAR
// ======================================================

export async function getAllClientesFiscales(
  proveedor_id,
  connection = null
) {

  const rows =
    await execute(
      `
      SELECT *
      FROM clientes_fiscales
      WHERE proveedor_id = ?
      AND deleted_at IS NULL
      ORDER BY id_cliente_fiscal DESC
      `,
      [proveedor_id],
      connection
    )

  return rows.map(
    normalizeCliente
  )

}

// ======================================================
// CREATE
// ======================================================

export async function createClienteFiscal(
  data,
  proveedor_id,
  connection = null
) {

  const existing =
    await findByRFC(
      data.rfc,
      proveedor_id,
      connection
    )

  if (existing) {

    return {

      success: true,
      duplicated: true,

      id_cliente_fiscal:
        existing.id_cliente_fiscal,

      cliente:
        existing

    }

  }

  const result =
    await execute(
      `
      INSERT INTO clientes_fiscales (

        proveedor_id,

        woo_customer_id,
        email,

        rfc,
        razon_social,
        regimen_fiscal,

        direccion,
        cp,

        correo_facturacion,
        telefono,

        uso_cfdi,

        pais,
        estado,
        municipio,

        hash_fiscal,
        meta

      )

      VALUES (

        ?,?,?,?,?,?,
        ?,?,
        ?,?,
        ?,
        ?,?,?,
        ?,?

      )
      `,
      [

        proveedor_id,

        data.woo_customer_id || null,
        normalizeEmail(data.email),

        normalizeRFC(data.rfc),

        normalizeString(
          data.razon_social
        ),

        normalizeString(
          data.regimen_fiscal
        ),

        data.direccion || null,
        data.cp || null,

        normalizeEmail(
          data.correo_facturacion
        ),

        data.telefono || null,

        data.uso_cfdi || 'G03',

        data.pais || 'MEX',
        data.estado || null,
        data.municipio || null,

        data.hash_fiscal || null,

        JSON.stringify(
          data.meta || {}
        )

      ],
      connection
    )

  return {

    success: true,

    duplicated: false,

    id_cliente_fiscal:
      result.insertId

  }

}

// ======================================================
// UPDATE
// ======================================================
// ======================================================
// UPDATE CLIENTE FISCAL
// ======================================================

export async function updateClienteFiscal(
  id,
  proveedor_id,
  data,
  connection = null
) {

  console.group(
    '[CLIENTES_FISCALES] UPDATE'
  )

  console.log({
    id,
    proveedor_id,
    data
  })

  const current =
    await getClienteFiscalById(
      Number(id),
      Number(proveedor_id),
      connection
    )

  if (!current) {

    throw new Error(
      'Cliente fiscal no encontrado'
    )

  }

  console.log(
    'CURRENT',
    current
  )

  const payload = [

    // email
    data.email ??
    current.email,

    // razon_social
    data.razon_social ??
    current.razon_social,

    // regimen
    data.regimen_fiscal ??
    current.regimen_fiscal,

    // direccion
    data.direccion ??
    current.direccion,

    // ← CORREGIDO
    data.codigo_postal ??
    data.cp ??
    current.cp,

    // telefono
    data.telefono ??
    current.telefono,

    // correo
    data.correo_facturacion ??
    current.correo_facturacion,

    // uso
    data.uso_cfdi ??
    current.uso_cfdi,

    // pais
    data.pais ??
    current.pais,

    // estado
    data.estado ??
    current.estado,

    // municipio
    data.municipio ??
    current.municipio,

    // hash
    data.hash_fiscal ??
    current.hash_fiscal,

    JSON.stringify({

      ...(current.meta || {}),

      ...(
        typeof data.meta ===
        'object'
          ? data.meta
          : {}
      )

    }),

    Number(id),

    Number(proveedor_id)

  ]

  console.log(
    'SQL PARAMS',
    payload
  )

  const result =
    await execute(
      `
      UPDATE clientes_fiscales
      SET

      email=?,
      razon_social=?,
      regimen_fiscal=?,
      direccion=?,
      cp=?,
      telefono=?,
      correo_facturacion=?,
      uso_cfdi=?,
      pais=?,
      estado=?,
      municipio=?,
      hash_fiscal=?,
      meta=?,
      updated_at=NOW()

      WHERE
      id_cliente_fiscal=?
      AND proveedor_id=?
      `,
      payload,
      connection
    )

  console.log(
    'RAW RESULT',
    result
  )

  const updated =
    await getClienteFiscalById(
      id,
      proveedor_id,
      connection
    )

  console.log(
    'UPDATED',
    updated
  )

  console.groupEnd()

  return {

    success:true,

    updated:true,

    affectedRows:
      result?.affectedRows ||

      0,

    changedRows:
      result?.changedRows ||

      0,

    data:
      updated

  }

}

// ======================================================
// UPSERT
// ======================================================

export async function upsertClienteFiscal(
  data,
  proveedor_id,
  connection = null
) {

  const existing =
    await findByRFC(
      data.rfc,
      proveedor_id,
      connection
    )

  if (!existing) {

    return createClienteFiscal(
      data,
      proveedor_id,
      connection
    )

  }

  await updateClienteFiscal(
    existing.id_cliente_fiscal,
    proveedor_id,
    data,
    connection
  )

  return {

    success: true,

    updated: true,

    id_cliente_fiscal:
      existing.id_cliente_fiscal

  }

}

// ======================================================
// DELETE / RESTORE
// ======================================================

export async function deleteClienteFiscal(
  id,
  proveedor_id,
  connection = null
) {

  await execute(
    `
    UPDATE clientes_fiscales
    SET
      deleted_at = NOW()
    WHERE id_cliente_fiscal = ?
    AND proveedor_id = ?
    `,
    [
      id,
      proveedor_id
    ],
    connection
  )

  return true

}

export async function restoreClienteFiscal(
  id,
  proveedor_id,
  connection = null
) {

  await execute(
    `
    UPDATE clientes_fiscales
    SET
      deleted_at = NULL
    WHERE id_cliente_fiscal = ?
    AND proveedor_id = ?
    `,
    [
      id,
      proveedor_id
    ],
    connection
  )

  return true

}

// ======================================================
// STATS
// ======================================================

export async function getClientesStats(
  proveedor_id,
  connection = null
) {

  const rows =
    await execute(
      `
      SELECT

        COUNT(*) total,

        COUNT(DISTINCT rfc)
          rfc_unicos

      FROM clientes_fiscales

      WHERE proveedor_id = ?
      `,
      [proveedor_id],
      connection
    )

  return rows[0]

}

// ======================================================
// COMPAT
// ======================================================

export const getClienteFiscalByRFC =
  findByRFC

export const insertClienteFiscal =
  createClienteFiscal

export default {

  getAllClientesFiscales,

  getClienteFiscalById,

  findByRFC,

  findByEmail,

  findByWooCustomerId,

  createClienteFiscal,

  updateClienteFiscal,

  upsertClienteFiscal,

  deleteClienteFiscal,

  restoreClienteFiscal,

  getClientesStats

}