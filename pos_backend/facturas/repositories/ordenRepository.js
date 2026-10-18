// facturas/repositories/ordenRepository.js

import db from '../config/db.js'

export async function getOrdenById(id) {
  const [rows] = await db.query(`
    SELECT *
    FROM ordenes
    WHERE id = ?
    LIMIT 1
  `, [id])

  return rows[0]
}

export async function getOrdenItems(
  ordenId
) {
  const [rows] = await db.query(`
    SELECT *
    FROM ordenes_detalle
    WHERE orden_id = ?
  `, [ordenId])

  return rows
}

export async function getOrdenCompleta(
  ordenId
) {
  const orden = await getOrdenById(ordenId)

  if (!orden) {
    return null
  }

  const items = await getOrdenItems(ordenId)
console.log('getOrdenCompleta',orden,items)
  return {
    ...orden,
    items
  }
}