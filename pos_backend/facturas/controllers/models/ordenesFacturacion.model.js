import { poolCT } from '../../../ct/config/db_ct.js'

import EmpresaFiscalService
from '../../services/EmpresaFiscalService.js'

import IvaFiscalService
from '../../services/IvaFiscalService.js'


const DB_ERP =
  process.env.DB_NAME || 'erp'

export async function getOrdenesSinFacturar({

  rol,
  proveedor_id,

  page = 1,
  limit = 20,

  proveedor,
  busqueda,

  fecha_inicio,
  fecha_fin,

  estado_ct,

}) {

  page = Math.max(
    1,
    Number(page || 1)
  )

  limit = Math.max(
    1,
    Math.min(
      100,
      Number(limit || 20)
    )
  )

  const offset =
    (page - 1) * limit

  const where = []
  const params = []
const empresaFiscal =
  await EmpresaFiscalService
    .obtenerPorProveedor(
      proveedor_id
    )

const tasaIVA =
  IvaFiscalService
    .determinarTasaIVA(
      empresaFiscal
    )
  // =====================================
  // ÓRDENES SIN FACTURA ACTIVA
  // =====================================

  where.push(`

    NOT EXISTS (

      SELECT 1

      FROM ${DB_ERP}.facturas f

      WHERE
        f.pedido_id = o.id

      AND
        f.estatus IN (
          'emitida',
          'cancelando'
        )

    )

  `)

  // =====================================
  // FILTRO PROVEEDOR
  // =====================================

  if (rol !== 'admin') {

    where.push(`

      EXISTS (

        SELECT 1

        FROM ordenes_detalle od

        WHERE
          od.orden_id = o.id

        AND
          od.proveedor_id = ?

      )

    `)

    params.push(
      Number(proveedor_id)
    )

  }

  else if (proveedor) {

    where.push(`

      EXISTS (

        SELECT 1

        FROM ordenes_detalle od

        WHERE
          od.orden_id = o.id

        AND
          od.proveedor_id = ?

      )

    `)

    params.push(
      Number(proveedor)
    )

  }

  // =====================================
  // ESTADO CT
  // =====================================

  if (estado_ct) {

    where.push(`

      IFNULL(
        oc.estado_ct,
        'sin_ct'
      ) = ?

    `)

    params.push(
      estado_ct
    )

  }

  // =====================================
  // BÚSQUEDA
  // =====================================

  if (busqueda) {

    const like =
      `%${busqueda}%`

    where.push(`

      (

        CAST(
          o.numero_orden AS CHAR
        ) LIKE ?

        OR

        o.cliente_nombre LIKE ?

        OR

        o.cliente_email LIKE ?

        OR

        IFNULL(
          oc.ct_folio,
          ''
        ) LIKE ?

      )

    `)

    params.push(
      like,
      like,
      like,
      like
    )

  }

  // =====================================
  // FECHAS
  // =====================================

  if (fecha_inicio) {

    where.push(`
      DATE(o.fecha_creacion) >= ?
    `)

    params.push(
      fecha_inicio
    )

  }

  if (fecha_fin) {

    where.push(`
      DATE(o.fecha_creacion) <= ?
    `)

    params.push(
      fecha_fin
    )

  }

  const whereSql =
    where.length
      ? `WHERE ${where.join(' AND ')}`
      : ''

  // =====================================
  // TOTAL REGISTROS
  // =====================================

  const [countRows] =
    await poolCT.query(

      `
      SELECT

        COUNT(
          DISTINCT o.id
        ) AS total

      FROM ordenes o

      LEFT JOIN ordenes_ct oc
        ON oc.orden_local_id = o.id

      ${whereSql}
      `,

      params

    )

  const total =
    Number(
      countRows?.[0]?.total || 0
    )

  // =====================================
  // ÓRDENES
  // =====================================

  const [rows] =
    await poolCT.query(

      `
      SELECT

        o.id,
        o.numero_orden,

        o.cliente_nombre,
        o.cliente_email,

        o.subtotal,
        o.total,

        o.estado_woo,
        o.estado_local,

        o.fecha_creacion,

        oc.id AS ct_id,

        IFNULL(
          oc.estado_ct,
          'sin_ct'
        ) AS estado_ct,

        oc.ct_folio,
        oc.id_pedido,
        oc.fecha_ct,

        (

          SELECT COUNT(*)

          FROM ${DB_ERP}.facturas f

          WHERE
            f.pedido_id = o.id

        ) AS facturas_existentes,

        (

          SELECT COUNT(*)

          FROM ordenes_detalle od

          WHERE
            od.orden_id = o.id

        ) AS total_productos

      FROM ordenes o

      LEFT JOIN ordenes_ct oc
        ON oc.orden_local_id = o.id

      ${whereSql}

      ORDER BY
        o.fecha_creacion DESC

      LIMIT ?
      OFFSET ?
      `,

      [
        ...params,
        limit,
        offset
      ]

    )

  // =====================================
  // PRODUCTOS
  // =====================================

  const ordenIds =
    rows.map(
      row => row.id
    )

  if (ordenIds.length) {

    const placeholders =
      ordenIds
        .map(() => '?')
        .join(',')

    const [productos] =
      await poolCT.query(

        `
        SELECT

          id,
          orden_id,

          sku,
          producto_nombre,

          cantidad,
          precio_unitario,

          proveedor_id

        FROM ordenes_detalle

        WHERE orden_id IN (
          ${placeholders}
        )

        ORDER BY
          orden_id,
          id
        `,

        ordenIds

      )

    const productosPorOrden =
      {}

    for (const producto of productos) {

      if (
        !productosPorOrden[
          producto.orden_id
        ]
      ) {

        productosPorOrden[
          producto.orden_id
        ] = []

      }

      productosPorOrden[
        producto.orden_id
      ].push({

        id:
          producto.id,

        sku:
          producto.sku,

        descripcion:
          producto.producto_nombre,

        cantidad:
          Number(
            producto.cantidad || 0
          ),

        precioUnitario:
          Number(
            producto.precio_unitario || 0
          ),

        total:
          Number(
            producto.cantidad || 0
          ) *
          Number(
            producto.precio_unitario || 0
          ),

        proveedorId:
          producto.proveedor_id,

      })

    }

    for (const orden of rows) {

      orden.detalles =
        productosPorOrden[
          orden.id
        ] || []

      orden.total_productos_real =
        orden.detalles.length

      orden.total_articulos =
        orden.detalles.reduce(
          (acc, item) =>
            acc + item.cantidad,
          0
        )

    }

  }

  // =====================================
  // NORMALIZACIÓN
  // =====================================

  const data =
    rows.map(row => ({

      ...row,

      subtotal:
        Number(
          row.subtotal || 0
        ),

      total:
        Number(
          row.total || 0
        ),

      detalles:
        row.detalles || []

    }))

  return {

    data,

    pagination: {

      total,

      page,

      limit,

      pages:
        Math.ceil(
          total / limit
        )

    }

  }

}
// ======================================================
// HELPERS
// ======================================================

function toNumber(v) {

  const n = Number(v)

  return Number.isFinite(n)
    ? n
    : 0

}

function round(v) {

  return Number(
    toNumber(v)
      .toFixed(2)
  )

}

function parseJSON(v) {

  try {

    if (!v) {
      return {}
    }

    return typeof v === 'string'
      ? JSON.parse(v)
      : v

  }

  catch {

    return {}

  }

}

// ======================================================
// SERVICE
// ======================================================
export async function getAll(
  proveedor_id
) {

  // =====================================================
  // CONFIG FISCAL
  // =====================================================

  let empresaFiscal = null
  let tasaIVA = 0.16

  try {

    empresaFiscal =
      await EmpresaFiscalService
        .obtenerEmpresaEmisora()
console.log('[EMPRESA EMISORA RESULT]', empresaFiscal)
    if (empresaFiscal) {

      tasaIVA =
        Number(
          IvaFiscalService
            .determinarTasaIVA(
              empresaFiscal
            )
        )

    }
console.log('[EMPRESA FISCAL RAW]', empresaFiscal)
console.log('[EMPRESA FISCAL IVA INPUT]', tasaIVA)
  }

  catch (err) {

    console.error(
      '[EMPRESA FISCAL]',
      err
    )

  }

  // =====================================================
  // QUERY
  // =====================================================
const [rows] =
  await poolCT.query(
`
SELECT

o.id AS orden_local_id,
o.numero_orden,
o.fecha_creacion,
o.cliente_nombre,
o.cliente_email,

-- =====================================
-- TOTALES REALES GUARDADOS EN LA ORDEN
-- =====================================

o.subtotal,
o.finalIVA,
o.shipping_total,
o.total AS total_local,

o.moneda,
o.metodo_pago,

o.estado_local,
o.estado_woo,
o.payment_status,

od.proveedor_id,
p.nombre proveedor_nombre,

od.sku,
od.producto_nombre,
od.cantidad,
od.precio_unitario,

oc.id AS orden_ct_id,
oc.ct_folio,
oc.pedido_status,
oc.estado_ct,
oc.almacen,
oc.tipo_pago,
oc.cfdi,
oc.fecha_ct,
oc.total AS total_ct,
oc.tipo_cambio,
oc.id_pedido,
oc.response_payload AS messageStamp,

cg.estado AS cotizacion_estado,
cg.respuesta_json AS cotizacion_respuesta,
cg.created_at AS cotizacion_creada,
cg.updated_at AS cotizacion_actualizada

FROM ordenes o

INNER JOIN ordenes_detalle od
  ON od.orden_id = o.id

INNER JOIN proveedores p
  ON p.id = od.proveedor_id

LEFT JOIN ordenes_ct oc
  ON oc.orden_local_id = o.id

LEFT JOIN cotizaciones_guias cg
  ON cg.ct_folio = oc.ct_folio
 AND cg.proveedor_id = od.proveedor_id

WHERE
  od.proveedor_id = ?

AND NOT EXISTS (

  SELECT 1
  FROM facturas f

  WHERE
    f.pedido_id = o.id

  AND f.estatus IN (
    'emitida',
    'cancelando'
  )

)

ORDER BY
  o.fecha_creacion DESC,
  oc.updated_at DESC
`,
[
  proveedor_id
]
)
console.log('[ROWS GETALL]', rows)

const map = new Map()

for (const row of rows) {

  if (!map.has(row.orden_local_id)) {

    console.log(
      '[ORDEN MYSQL]',
      {
        orden_id: row.orden_local_id,

        subtotal_bd: row.subtotal,

        iva_bd: row.finalIVA,

        shipping_bd: row.shipping_total,

        total_bd: row.total_local
      }
    )

    map.set(
      row.orden_local_id,
      {

        id:
          row.orden_local_id,

        numero_orden:
          row.numero_orden,

        fecha_creacion:
          row.fecha_creacion,

        cliente_nombre:
          row.cliente_nombre,

        cliente_email:
          row.cliente_email,

        estado_local:
          row.estado_local,

        estado_woo:
          row.estado_woo,

        payment_status:
          row.payment_status,

        proveedor_id:
          row.proveedor_id,

        proveedor_nombre:
          row.proveedor_nombre,

        orden_ct_id:
          row.orden_ct_id,

        ct_folio:
          row.ct_folio,

        estado_ct:
          row.estado_ct,

        pedido_status:
          row.pedido_status,

        tipo_pago:
          row.tipo_pago,

        tipo_cambio:
          row.tipo_cambio,

        cfdi:
          row.cfdi,

        total_local:
          Number(
            row.total_local || 0
          ),

        total_ct:
          Number(
            row.total_ct || 0
          ),

        empresa_fiscal:

          empresaFiscal

          ||

          {

            estimulo_iva_frontera: false,

            tasa_iva_default: 16

          },

        tasa_iva:
          tasaIVA,

        porcentaje_iva:
          tasaIVA * 100,

        aplica_estimulo_frontera:
          tasaIVA === 0.08,

        // =====================================================
        // USAR LOS VALORES REALES DE LA ORDEN
        // =====================================================

        subtotal:
          Number(
            row.subtotal || 0
          ),

        iva:
          Number(
            row.finalIVA || 0
          ),

        shipping_total:
          Number(
            row.shipping_total || 0
          ),

        total:
          Number(
            row.total_local || 0
          ),

        cotizacion: {

          estado:
            row.cotizacion_estado,

          respuesta:
            row.cotizacion_respuesta,

          creada:
            row.cotizacion_creada,

          actualizada:
            row.cotizacion_actualizada

        },

        items: []

      }
    )

  }

  const orden =
    map.get(
      row.orden_local_id
    )

  const cantidad =
    Number(
      row.cantidad
    )

  const precio =
    Number(
      row.precio_unitario
    )

  const importe =
    Number(
      (
        cantidad *
        precio
      ).toFixed(2)
    )

  console.log(
    '[ITEM MYSQL]',
    {

      orden:
        row.orden_local_id,

      sku:
        row.sku,

      producto:
        row.producto_nombre,

      cantidad,

      precio,

      importe,

      subtotal_bd:
        orden.subtotal,

      iva_bd:
        orden.iva,

      shipping_bd:
        orden.shipping_total,

      total_bd:
        orden.total

    }
  )

  orden.items.push({

    sku:
      row.sku,

    nombre:
      row.producto_nombre,

    cantidad,

    precio_unitario:
      precio,

    importe

  })

}

for (const orden of map.values()) {

  console.log(
    '[ORDEN FINAL]',
    {

      orden_id:
        orden.id,

      subtotal:
        orden.subtotal,

      iva:
        orden.iva,

      shipping:
        orden.shipping_total,

      total:
        orden.total,

      total_local:
        orden.total_local,

      items:
        orden.items.length

    }
  )

}

const resultado =
  [...map.values()]

console.log(
  '[ORDENES FACTURAR]',
  resultado
)

return resultado

}

