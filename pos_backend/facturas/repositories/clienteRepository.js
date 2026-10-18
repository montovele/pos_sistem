// facturas/repositories/clienteRepository.js

import db from '../config/db.js'

// ======================================================
// OBTENER CLIENTE POR ID
// ======================================================

export async function getClienteById(
  clienteId
) {
  const [rows] = await db.query(
    `
      SELECT
        c.*,

        pt.id AS price_tier_id,
        pt.nombre AS price_tier_nombre,
        pt.margen AS price_tier_margen

      FROM clientes c

      LEFT JOIN price_tiers pt
        ON pt.id = c.price_tier_id

      WHERE c.id = ?
      LIMIT 1
    `,
    [clienteId]
  )

  return rows[0] || null
}

// ======================================================
// OBTENER CLIENTE POR RFC
// ======================================================

export async function getClienteByRFC(
  rfc
) {
  const [rows] = await db.query(
    `
      SELECT *
      FROM clientes
      WHERE rfc = ?
      LIMIT 1
    `,
    [rfc]
  )

  return rows[0] || null
}

// ======================================================
// OBTENER CLIENTE POR EMAIL
// ======================================================

export async function getClienteByEmail(
  correo
) {
  const [rows] = await db.query(
    `
      SELECT *
      FROM clientes
      WHERE correo = ?
      LIMIT 1
    `,
    [correo]
  )

  return rows[0] || null
}

// ======================================================
// LISTAR CLIENTES
// ======================================================

export async function listarClientes({
  limit = 50,
  offset = 0,
  search = '',
} = {}) {
  const searchLike =
    `%${search}%`

  const [rows] = await db.query(
    `
      SELECT
        c.*,

        pt.nombre AS price_tier_nombre

      FROM clientes c

      LEFT JOIN price_tiers pt
        ON pt.id = c.price_tier_id

      WHERE (
        c.nombre LIKE ?
        OR c.correo LIKE ?
        OR c.rfc LIKE ?
      )

      ORDER BY c.id DESC

      LIMIT ?
      OFFSET ?
    `,
    [
      searchLike,
      searchLike,
      searchLike,
      Number(limit),
      Number(offset),
    ]
  )

  return rows
}

// ======================================================
// CONTAR CLIENTES
// ======================================================

export async function countClientes(
  search = ''
) {
  const searchLike =
    `%${search}%`

  const [rows] = await db.query(
    `
      SELECT COUNT(*) total
      FROM clientes
      WHERE (
        nombre LIKE ?
        OR correo LIKE ?
        OR rfc LIKE ?
      )
    `,
    [
      searchLike,
      searchLike,
      searchLike,
    ]
  )

  return rows[0]?.total || 0
}

// ======================================================
// CREAR CLIENTE
// ======================================================

export async function createCliente({
  nombre,
  rfc,
  telefono,
  correo,
  direccion,
  proveedor_id = null,
  price_tier_id = null,
}) {
  const [result] = await db.query(
    `
      INSERT INTO clientes (
        nombre,
        rfc,
        telefono,
        correo,
        direccion,
        proveedor_id,
        price_tier_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    [
      nombre,
      rfc,
      telefono,
      correo,
      direccion,
      proveedor_id,
      price_tier_id,
    ]
  )

  return result.insertId
}

// ======================================================
// ACTUALIZAR CLIENTE
// ======================================================

export async function updateCliente(
  clienteId,
  payload
) {
  const fields = []
  const values = []

  Object.entries(payload)
    .forEach(([key, value]) => {
      fields.push(`${key} = ?`)
      values.push(value)
    })

  if (!fields.length) {
    return false
  }

  values.push(clienteId)

  await db.query(
    `
      UPDATE clientes
      SET ${fields.join(', ')}
      WHERE id = ?
    `,
    values
  )

  return true
}

// ======================================================
// ELIMINAR CLIENTE
// ======================================================

export async function deleteCliente(
  clienteId
) {
  await db.query(
    `
      DELETE FROM clientes
      WHERE id = ?
    `,
    [clienteId]
  )

  return true
}

// ======================================================
// OBTENER CLIENTES CON FACTURAS
// ======================================================

export async function getClientesFacturacion(
  {
    limit = 50,
    offset = 0,
  } = {}
) {
  const [rows] = await db.query(
    `
      SELECT
        c.id,
        c.nombre,
        c.correo,
        c.rfc,

        COUNT(f.id_factura)
          AS total_facturas,

        SUM(f.total)
          AS total_facturado

      FROM clientes c

      LEFT JOIN ordenes o
        ON o.cliente_id = c.id

      LEFT JOIN facturas f
        ON f.pedido_id = o.id

      GROUP BY c.id

      ORDER BY total_facturado DESC

      LIMIT ?
      OFFSET ?
    `,
    [
      Number(limit),
      Number(offset),
    ]
  )

  return rows
}

// ======================================================
// OBTENER CLIENTE COMPLETO
// ======================================================

export async function getClienteCompleto(
  clienteId
) {
  const cliente =
    await getClienteById(
      clienteId
    )

  if (!cliente) {
    return null
  }

  const [ordenes] =
    await db.query(
      `
        SELECT
          id,
          numero_orden,
          total,
          estado_local,
          fecha_creacion
        FROM ordenes
        WHERE cliente_id = ?
        ORDER BY id DESC
      `,
      [clienteId]
    )

  const [facturas] =
    await db.query(
      `
        SELECT
          id_factura,
          uuid,
          total,
          estatus,
          fecha_emision
        FROM facturas
        WHERE pedido_id IN (
          SELECT id
          FROM ordenes
          WHERE cliente_id = ?
        )
        ORDER BY id_factura DESC
      `,
      [clienteId]
    )

  return {
    cliente,
    ordenes,
    facturas,
  }
}