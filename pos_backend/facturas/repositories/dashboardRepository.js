// facturas/repositories/dashboardRepository.js

import db from '../config/db.js'

export async function getDashboardFacturacion() {
  const [rows] = await db.query(
    `
      SELECT
        COUNT(*) total_facturas,

        SUM(total) total_facturado,

        SUM(
          CASE
            WHEN estatus = 'emitida'
            THEN total
            ELSE 0
          END
        ) total_emitido,

        SUM(
          CASE
            WHEN estatus = 'cancelada'
            THEN total
            ELSE 0
          END
        ) total_cancelado

      FROM facturas
    `
  )

  return rows[0]
}

export async function getFacturasRecientes() {
  const [rows] = await db.query(
    `
      SELECT
        id_factura,
        uuid,
        total,
        estatus,
        fecha_emision
      FROM facturas
      ORDER BY id_factura DESC
      LIMIT 10
    `
  )

  return rows
}