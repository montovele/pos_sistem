// ======================================================
// facturas/repositories/facturaRepository.js
// ENTERPRISE CFDI REPOSITORY v3
// CLEAN ARCHITECTURE + CONSISTENCY LAYER
// ======================================================

import crypto from 'crypto'
import db from '../config/db.js'

// ======================================================
// CONSTANTS
// ======================================================

export const FACTURA_STATUS = {

  PENDIENTE: 'pendiente',

  PROCESANDO: 'procesando',

  TIMBRANDO: 'timbrando',

  EMITIDA: 'emitida',

  ERROR: 'error',

  CANCELADA: 'cancelada',

}

// ======================================================
// DB EXECUTOR
// ======================================================

function exec(connection) {

  return connection || db

}

async function query(
  sql,
  params = [],
  connection = null
) {

  try {

    const [rows] =
      await exec(connection)
        .query(sql, params)

    return rows

  }

  catch (error) {

    console.error(
      '[FACTURA REPOSITORY QUERY ERROR]',
      {
        sql,
        params,
        message: error.message,
      }
    )

    throw error

  }

}

// ======================================================
// HELPERS
// ======================================================


function safeDate(value) {

  if (!value) {

    return null

  }

  try {

    return new Date(value)

  }

  catch {

    return null

  }

}

// ======================================================
// FACTURA NORMALIZER
// ======================================================
function parseJson(value) {

  if (!value) {
    return null
  }

  if (typeof value === 'object') {
    return value
  }

  try {

    return JSON.parse(value)

  } catch (error) {

    console.error(
      '[parseJson]',
      error.message
    )

    return null

  }

}
function mapFactura(row = {}) {
  console.log('mapFactura',row)

  return {

    ...row,

    subtotal:
      money(row.subtotal),

    iva:
      money(row.iva),

    total:
      money(row.total),

    descuento:
      money(row.descuento),

    request_data:
      parseJson(row.request_data),

    response_data:
      parseJson(row.response_data),

    meta:
      parseJson(row.meta),

    cancelacion_response:
      parseJson(row.cancelacion_response),

    xml_url:
      row.xml_url || null,

    pdf_url:
      row.pdf_url || null,

    pdf_custom_url:
      row.pdf_custom_url || null,

    verification_url:
      row.verification_url || null,

    created_at:
      safeDate(row.created_at),

    updated_at:
      safeDate(row.updated_at),

    fecha_emision:
      safeDate(row.fecha_emision),

    fecha_timbrado:
      safeDate(row.fecha_timbrado),

    cancelacion_fecha:
      safeDate(row.cancelacion_fecha),

  }

}

// ======================================================
// FINGERPRINT
// ======================================================

export function buildFacturaFingerprint(
  data = {}
) {

  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify(data)
    )
    .digest('hex')

}

// ======================================================
// GET FACTURA BY ID
// ======================================================

export async function getFacturaById(
  id,
  connection = null
) {

  const rows = await query(

    `
    SELECT *
    FROM facturas
    WHERE id_factura = ?
    LIMIT 1
    `,

    [id],

    connection

  )

  return rows[0]
    ? mapFactura(rows[0])
    : null

}

// ======================================================
// GET FACTURA BY UUID
// ======================================================

export async function getFacturaByUUID(
  uuid,
  connection = null
) {

  const rows = await query(

    `
    SELECT *
    FROM facturas
    WHERE uuid = ?
    LIMIT 1
    `,

    [uuid],

    connection

  )

  return rows[0]
    ? mapFactura(rows[0])
    : null

}

// ======================================================
// GET FACTURA BY FINGERPRINT
// ======================================================

export async function getFacturaByFingerprint(
  fingerprint,
  connection = null
) {

  const rows = await query(

    `
    SELECT *
    FROM facturas
    WHERE fingerprint = ?
    LIMIT 1
    `,

    [fingerprint],

    connection

  )

  return rows[0]
    ? mapFactura(rows[0])
    : null

}
// ======================================================
// HELPERS
// ======================================================

function num(value) {

  const n = Number(value)

  return Number.isFinite(n)
    ? n
    : 0

}

function money(value) {

  return Number(
    num(value).toFixed(2)
  )

}

function safeJson(value) {

  try {

    return JSON.stringify(
      value || {}
    )

  } catch (error) {

    return '{}'

  }

}

// ======================================================
// CALCULAR SUBTOTAL
// ======================================================

function calculateSubtotal(
  requestData = {}
) {

  const items =
    requestData.items || []

  return items.reduce(
    (sum, item) => {

      const cantidad = num(

        item.quantity ??

        item.cantidad ??

        item.qty ??

        1

      )

      const precio = num(

        item.unit_price ??

        item.precio_unitario ??

        item.valor_unitario ??

        item.price ??

        0

      )

      return (
        sum +
        (
          cantidad * precio
        )
      )

    },
    0
  )

}

// ======================================================
// CALCULAR IVA
// ======================================================

function calculateIVA(
  subtotal,
  total
) {

  return money(
    num(total) -
    num(subtotal)
  )

}
// ======================================================
// facturas/repositories/facturaRepository.js
// INSERT FACTURA
// MULTI TENANT SAFE + IDEMPOTENT + ROBUST
// ======================================================



// ======================================================
// HELPERS
// ======================================================

function buildFingerprint(
  data,
  requestData,
  proveedor_id
) {

  return crypto

    .createHash(
      'sha256'
    )

    .update(

      JSON.stringify({

        proveedor_id,

        pedido_id:
          data.pedido_id ??

          null,

        woo_order_id:
          data.woo_order_id ??

          null,

        cliente_fiscal_id:
          data.cliente_fiscal_id ??

          null,

        uuid:
          data.uuid ??

          null,

        invoice_id:
          data.invoice_id ??

          null,

        customer:
          requestData.customer ??

          null,

        items:
          requestData.items ??

          []

      })

    )

    .digest(
      'hex'
    )

}

// ======================================================
// GENERAR FOLIO
// ÚNICA FUENTE DE VERDAD
// CREA + BLOQUEA + INCREMENTA
// ======================================================

async function generateFacturaFolio({

  pedido_id = null,
  proveedor_id,
  prefijo = null,
  connection,

}) {

  const traceId =
    crypto.randomUUID()

  console.log(
    '[FOLIO]',
    traceId,
    'START'
  )

  if (!proveedor_id) {

    throw new Error(
      'proveedor_id requerido'
    )

  }

  const now =
    new Date()

  const anio =
    now.getFullYear()

  const mes =
    now.getMonth() + 1

  const prefijoInput =
    String(
      prefijo ||
      'FAC'
    )
      .trim()
      .toUpperCase()

  try {

    // =====================================
    // LOCK REGISTRO
    // =====================================

    let rows =
      await query(

        `
        SELECT

          id_folio,
          proveedor_id,
          prefijo,
          folio_actual

        FROM folios_facturas

        WHERE proveedor_id=?

        LIMIT 1

        FOR UPDATE
        `,

        [
          proveedor_id
        ],

        connection

      )

    let registro =
      rows?.[0]

    // =====================================
    // CREAR CONFIG
    // =====================================

    if (!registro) {

      console.log(
        '[FOLIO]',
        traceId,
        'CREANDO CONFIG'
      )

      try {

        const result =
          await query(

            `
            INSERT INTO
            folios_facturas
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
              0,
              ?,
              ?
            )
            `,

            [

              proveedor_id,
              prefijoInput,
              anio,
              mes,

            ],

            connection

          )

        registro = {

          id_folio:
            result.insertId,

          proveedor_id,

          prefijo:
            prefijoInput,

          folio_actual:
            0,

        }

      }

      catch (err) {

        if (
          err.code ===
          'ER_DUP_ENTRY'
        ) {

          rows =
            await query(

              `
              SELECT

                id_folio,
                proveedor_id,
                prefijo,
                folio_actual

              FROM folios_facturas

              WHERE proveedor_id=?

              LIMIT 1

              FOR UPDATE
              `,

              [
                proveedor_id
              ],

              connection

            )

          registro =
            rows[0]

        }

        else {

          throw err

        }

      }

    }

    // =====================================
    // PREFIJO DEFINITIVO
    // =====================================

    const finalPrefijo =

      registro.prefijo

    // =====================================
    // INCREMENTO ÚNICO
    // =====================================

    const siguiente =

      Number(
        registro.folio_actual
      ) + 1

    await query(

      `
      UPDATE
      folios_facturas

      SET

        folio_actual=?,
        anio=?,
        mes=?

      WHERE
        id_folio=?
      `,

      [

        siguiente,

        anio,

        mes,

        registro.id_folio

      ],

      connection

    )

    const numero =

      `${finalPrefijo}` +

      `${String(
        siguiente
      ).padStart(
        6,
        '0'
      )}`

    console.log(
      '[FOLIO]',
      traceId,
      {
        proveedor_id,
        prefijo:
          finalPrefijo,
        anterior:
          registro.folio_actual,
        nuevo:
          siguiente,
        numero,
      }
    )

    return {

      proveedor_id,

      pedido_id,

      prefijo:
        finalPrefijo,

      anio,

      mes,

      folio:
        siguiente,

      numero,

      transaction_id:
        traceId,

    }

  }

  catch (err) {

    console.error(
      '[FOLIO ERROR]',
      traceId,
      err
    )

    throw new Error(
      'No fue posible generar el folio'
    )

  }

}


// ======================================================
// INSERT FACTURA
// ======================================================

export async function insertFactura(
  data = {},
  connection = null
) {

console.group(
'[insertFactura]'
)

try {

console.log(
'RAW',
data
)

// ====================================================
// TENANT
// ====================================================

const proveedor_id =

Number(

data.proveedor_id ??

data.request_data?.proveedor_id ??

data.request_data?.metadata?.proveedor_id ??

data.meta?.proveedor_id

)

if (
!proveedor_id
) {

throw new Error(
'proveedor_id requerido'
)

}

// ====================================================
// NORMALIZAR
// ====================================================

const requestData = {

...(data.request_data || {}),

proveedor_id,

metadata: {

...(data.request_data?.metadata || {}),

proveedor_id,

},

}

const responseData = {

...(data.response_data || {})

}

const meta = {

...(data.meta || {}),

proveedor_id,

}

// ====================================================
// IMPORTES
// ====================================================

let subtotal =
money(
num(
data.subtotal
)
)

let iva =
money(
num(
data.iva
)
)

let total =
money(
num(
data.total
)
)

if (

subtotal <= 0 &&

Array.isArray(
requestData.items
)

) {

subtotal =
money(
calculateSubtotal(
requestData
)
)

}

if (
total <= 0
) {

total =
money(

num(

responseData.total

)

)

}

if (

iva <= 0 &&

subtotal > 0 &&

total > 0

) {

iva =
money(

calculateIVA(

subtotal,

total

)

)

}

// ====================================================
// FOLIO
// ====================================================

const folioData =
await generateFacturaFolio({

pedido_id:
data.pedido_id,

proveedor_id,

prefijo:

data.prefijo ??

requestData.prefijo ??

'FAC',

connection,

})

const numeroFactura =

data.numero_factura ??

data.uuid ??

folioData.numero

// ====================================================
// STORAGE
// ====================================================

const xmlPath =
data.xml_path ??
null

const pdfPath =
data.pdf_path ??
null

const xmlUrl =
data.xml_url ??
null

const pdfUrl =
data.pdf_url ??
null

const verificationUrl =
data.verification_url ??
null

// ====================================================
// META
// ====================================================

const finalMeta = {

...meta,

proveedor_id,

folio: {

numero:
folioData.numero,

prefijo:
folioData.prefijo,

anio:
folioData.anio,

mes:
folioData.mes,

consecutivo:
folioData.folio,

},

trace_id:
requestData.metadata?.trace_id,

receptor_rfc:
requestData.customer?.tax_id,

receptor_nombre:
requestData.customer?.legal_name,

uso_cfdi:

data.uso_cfdi ??

requestData.use_cfdi,

metodo_pago:

data.metodo_pago ??

requestData.payment_method,

forma_pago:

data.forma_pago ??

requestData.payment_form,

}

// ====================================================
// INSERT
// ====================================================
const sql = `
INSERT INTO facturas(
  proveedor_id,
  pedido_id,
  cliente_fiscal_id,

  uuid,
  invoice_id,
  numero_factura,

  subtotal,
  iva,
  total,
  descuento,

  moneda,

  proveedor_pac,
  estatus,

  xml_path,
  pdf_path,

  xml_url,
  pdf_url,

  verification_url,

  request_data,
  response_data,
  meta,

  fingerprint,

  fecha_emision,
  fecha_timbrado,

  created_at,
  updated_at
)

VALUES (
  ?, ?, ?,
  ?, ?, ?,
  ?, ?, ?, ?,
  ?,
  ?, ?,
  ?, ?,
  ?, ?,
  ?,
  ?, ?, ?,
  ?,
  ?, ?,
  NOW(),
  NOW()
)
`

const result = await query(
  sql,
  [
    proveedor_id,
    data.pedido_id,
    data.cliente_fiscal_id,

    data.uuid,
    data.invoice_id,
    numeroFactura,

    Number(subtotal),
    Number(iva),
    Number(total),
    Number(data.descuento || 0),

    data.moneda ?? 'MXN',

    data.proveedor_pac ?? 'FACTURAPI',
    data.estatus ?? 'emitida',

    xmlPath,
    pdfPath,

    xmlUrl,
    pdfUrl,

    verificationUrl,

    safeJson(requestData),
    safeJson(responseData),
    safeJson(finalMeta),

    buildFingerprint(
      data,
      requestData,
      proveedor_id
    ),

    requestData.fecha_emision ?? null,
    responseData.fecha_timbrado ?? null,
  ],
  connection
)

console.log(
'[FACTURA INSERTADA]',
{

id:
result.insertId,

numeroFactura,

proveedor_id,

}
)

return result.insertId

}

finally {

console.groupEnd()

}

}
// ======================================================
// UPDATE STATUS (ROBUSTO + TRANSICIONAL SAFE)
// ======================================================

const VALID_FINAL_STATUS = new Set([
  'pendiente',
  'emitida',
  'cancelada',
  'error',
])

const VALID_TRANSITIONAL_STATUS = new Set([
  'cancelando',
  'syncing',
  'timbrando',
])

export async function updateFacturaStatus(
  id,
  status,
  connection = null
) {

  if (!id) {
    throw new Error('id requerido')
  }

  // ==========================================
  // VALIDACIÓN INTELIGENTE
  // ==========================================

  const isValidFinal = VALID_FINAL_STATUS.has(status)
  const isValidTransient = VALID_TRANSITIONAL_STATUS.has(status)

  if (!isValidFinal && !isValidTransient) {
    throw new Error(
      `estatus inválido para facturas: ${status}`
    )
  }

  // ==========================================
  // LOGIC: SOLO GUARDAR EN BD ESTADOS FINALES
  // ==========================================

  const statusToPersist = isValidFinal
    ? status
    : status // opcional: puedes decidir NO persistir transitorios

  await query(
    `
    UPDATE facturas
    SET
      estatus = ?,
      updated_at = NOW()
    WHERE id_factura = ?
    `,
    [
      statusToPersist,
      id,
    ],
    connection
  )

  return true
}
// ======================================================
// UPDATE FACTURA ERROR
// ======================================================

export async function updateFacturaError(
  id,
  error,
  connection = null
) {

  await query(

    `
    UPDATE facturas
    SET

      estatus = ?,
      error_message = ?,
      updated_at = NOW()

    WHERE id_factura = ?
    `,

    [

      FACTURA_STATUS.ERROR,

      error || 'Error desconocido',

      id,

    ],

    connection

  )

  return true

}
// ======================================================
// UPDATE FACTURA TIMBRADA
// MULTI TENANT SAFE
// ======================================================

export async function updateFacturaTimbrada(
  id,
  data = {},
  connection = null
) {

  console.group(
    '\n🚀 UPDATE FACTURA TIMBRADA'
  )

  // ====================================================
  // PROVEEDOR
  // ====================================================

  const proveedor_id =

    Number(

      data.proveedor_id ??

      data.response_data?.proveedor_id ??

      data.meta?.proveedor_id

    ) ||

    null

  if (!proveedor_id) {

    throw new Error(
      'proveedor_id requerido'
    )

  }

  console.log({
    factura_id: id,
    proveedor_id
  })

  // ====================================================
  // FACTURA ACTUAL
  // ====================================================

  const rows =
    await query(

      `
      SELECT *
      FROM facturas
      WHERE
        id_factura=?
      AND
        proveedor_id=?
      LIMIT 1
      `,

      [

        id,

        proveedor_id

      ],

      connection

    )

  const facturaActual =
    rows?.[0]

  if (!facturaActual) {

    throw new Error(
      `Factura ${id} no encontrada`
    )

  }

  // ====================================================
  // RESPONSE DATA
  // ====================================================

  const responseData = {

    ...(data.response_data || {}),

    proveedor_id,

  }

  // ====================================================
  // IMPORTES
  // ====================================================

  const subtotal =

    data.subtotal != null

      ? money(
          data.subtotal
        )

      : facturaActual.subtotal

  const iva =

    data.iva != null

      ? money(
          data.iva
        )

      : facturaActual.iva

  const total =

    data.total != null

      ? money(
          data.total
        )

      : facturaActual.total

  // ====================================================
  // XML / PDF
  // ====================================================

  let xmlRaw =

    data.xml_raw ??

    data.xml ??

    responseData.xml ??

    facturaActual.xml ??

    null

  if (
    Buffer.isBuffer(
      xmlRaw
    )
  ) {

    xmlRaw =
      xmlRaw.toString(
        'utf8'
      )

  }

  const pdfRaw =

    data.pdf ??

    data.pdf_raw ??

    responseData.pdfBuffer ??

    facturaActual.pdf ??

    null

  // ====================================================
  // URLS
  // ====================================================

  const xmlUrl =

    data.xml_url ??

    responseData.xml_url ??

    facturaActual.xml_url

  const pdfUrl =

    data.pdf_url ??

    responseData.pdf_url ??

    facturaActual.pdf_url

  const pdfCustomUrl =

    data.pdf_custom_url ??

    facturaActual.pdf_custom_url

  const verificationUrl =

    data.verification_url ??

    responseData.verification_url ??

    facturaActual.verification_url

  // ====================================================
  // PATHS
  // ====================================================

  const xmlPath =

    data.xml_path ??

    facturaActual.xml_path

  const pdfPath =

    data.pdf_path ??

    facturaActual.pdf_path

  const pdfCustomPath =

    data.pdf_custom_path ??

    facturaActual.pdf_custom_path

  // ====================================================
  // MONEDA
  // ====================================================

  const moneda =

    data.moneda ??

    responseData.currency ??

    facturaActual.moneda ??

    'MXN'

  // ====================================================
  // FECHA
  // ====================================================

  const fechaTimbrado =

    data.fecha_timbrado ??

    responseData.fecha_timbrado ??

    responseData.stamped_at ??

    facturaActual.fecha_timbrado ??

    new Date()

  // ====================================================
  // META
  // ====================================================

  let currentMeta = {}

  try {

    currentMeta =

      typeof facturaActual.meta ===
      'string'

      ? JSON.parse(
          facturaActual.meta
        )

      : (
          facturaActual.meta ||
          {}
        )

  }

  catch {

    currentMeta = {}

  }

  const mergedMeta = {

    ...currentMeta,

    ...(data.meta || {}),

    proveedor_id,

    xml_path:
      xmlPath,

    pdf_path:
      pdfPath,

    pdf_custom_path:
      pdfCustomPath,

    xml_url:
      xmlUrl,

    pdf_url:
      pdfUrl,

    pdf_custom_url:
      pdfCustomUrl,

    verification_url:
      verificationUrl,

  }

  // ====================================================
  // SQL
  // ====================================================

  const sql = `

UPDATE facturas
SET

uuid=?,
invoice_id=?,

subtotal=?,
iva=?,
total=?,

moneda=?,

xml=?,
pdf=?,

xml_path=?,
pdf_path=?,
pdf_custom_path=?,

xml_url=?,
pdf_url=?,
pdf_custom_url=?,

verification_url=?,

sello_sat=?,
sello_cfdi=?,
cadena_original=?,

response_data=?,
meta=?,

fecha_timbrado=?,

estatus=?,

updated_at=NOW()

WHERE
id_factura=?
AND
proveedor_id=?

`

  const params = [

    data.uuid ??
      facturaActual.uuid,

    data.invoice_id ??
      facturaActual.invoice_id,

    subtotal,

    iva,

    total,

    moneda,

    xmlRaw,

    pdfRaw,

    xmlPath,

    pdfPath,

    pdfCustomPath,

    xmlUrl,

    pdfUrl,

    pdfCustomUrl,

    verificationUrl,

    data.sello_sat ??
      facturaActual.sello_sat,

    data.sello_cfdi ??
      facturaActual.sello_cfdi,

    data.cadena_original ??
      facturaActual.cadena_original,

    safeJson(
      responseData
    ),

    safeJson(
      mergedMeta
    ),

    fechaTimbrado,

    FACTURA_STATUS.EMITIDA,

    id,

    proveedor_id

  ]

  const result =
    await query(
      sql,
      params,
      connection
    )

  console.log({

    proveedor_id,

    affectedRows:
      result?.affectedRows,

    changedRows:
      result?.changedRows

  })

  console.groupEnd()

  return {

    success: true,

    proveedor_id,

    factura_id: id,

    affectedRows:
      result?.affectedRows,

    changedRows:
      result?.changedRows

  }

}
// ======================================================
// UPDATE FACTURA CANCELADA (ROBUST + META SAFE)
// ======================================================

export async function updateFacturaCancelada(
  facturaId,
  data = {},
  connection
) {

  if (!facturaId) {
    throw new Error('facturaId requerido')
  }

  if (!connection) {
    throw new Error('connection requerida para transacción')
  }

  // ==================================================
  // METADATA (NO PISAR META EXISTENTE)
  // ==================================================

  const metaCancelacion = {
    cancelacion_motivo: data.cancelacion_motivo || null,
    cancelacion_fecha:
      data.cancelacion_fecha ||
      new Date().toISOString(),
    cancelacion_sustitucion:
      data.cancelacion_sustitucion || null,
    cancelacion_response:
      data.cancelacion_response || null,
  }

  const sql = `
    UPDATE facturas
    SET
      estatus = ?,

      meta = JSON_SET(
        IFNULL(meta, JSON_OBJECT()),
        '$.cancelacion_motivo', ?,
        '$.cancelacion_fecha', ?,
        '$.cancelacion_sustitucion', ?,
        '$.cancelacion_response', ?
      ),

      updated_at = NOW()

    WHERE id_factura = ?
  `

  const params = [
    // status final SIEMPRE válido en tu ENUM
    data.estatus || 'cancelada',

    // meta merge seguro (NO destruye lo existente)
    metaCancelacion.cancelacion_motivo,
    metaCancelacion.cancelacion_fecha,
    metaCancelacion.cancelacion_sustitucion,
    JSON.stringify(metaCancelacion.cancelacion_response),

    facturaId,
  ]

  await connection.query(sql, params)

  return {
    success: true,
    facturaId,
    status: data.estatus || 'cancelada',
  }
}
// ======================================================
// LISTAR FACTURAS
// MULTI TENANT SAFE
// MYSQL2 SAFE
// ======================================================

export async function listFacturas({

  proveedor_id,

  limit = 50,

  offset = 0,

  estatus,

  search,

} = {}) {

  try {

    // ==========================================
    // VALIDACIÓN
    // ==========================================

    proveedor_id =
      Number(
        proveedor_id
      )

    if (
      !proveedor_id
    ) {

      throw new Error(
        'proveedor_id requerido'
      )

    }

    // ==========================================
    // PAGINACIÓN
    // ==========================================

    const safeLimit =
      Math.max(
        1,
        Math.min(
          100,
          Number(limit) || 50
        )
      )

    const safeOffset =
      Math.max(
        0,
        Number(offset) || 0
      )

    // ==========================================
    // FILTROS
    // ==========================================

    const where = [
      'proveedor_id = ?'
    ]

    const params = [
      proveedor_id
    ]

    // -------------------------
    // ESTATUS
    // -------------------------

    const normalizedStatus =
      String(
        estatus || ''
      )
      .trim()
      .toLowerCase()

    if (

      normalizedStatus &&

      normalizedStatus !==
      'todos'

    ) {

      where.push(
        'estatus = ?'
      )

      params.push(
        normalizedStatus
      )

    }

    // -------------------------
    // SEARCH
    // -------------------------

    const normalizedSearch =
      String(
        search || ''
      )
      .trim()

    if (
      normalizedSearch
    ) {

      where.push(`(

uuid LIKE ?

OR numero_factura LIKE ?

OR invoice_id LIKE ?

)`)

      const q =
        `%${normalizedSearch}%`

      params.push(
        q,
        q,
        q
      )

    }

    const whereSQL =
      `WHERE ${where.join(' AND ')}`

    // ==========================================
    // TOTAL
    // ==========================================

    const countSql = `
SELECT
COUNT(*) total
FROM facturas
${whereSQL}
`

    const [
      totalRow
    ] =
      await query(
        countSql,
        params
      )

    // ==========================================
    // DATA
    // ==========================================

    // MYSQL2:
    // LIMIT/OFFSET NO PARAMETRIZADOS
    // (ya sanitizados)

    const sql = `
SELECT *
FROM facturas

${whereSQL}

ORDER BY
id_factura DESC

LIMIT ${safeLimit}
OFFSET ${safeOffset}
`

    console.log(
      '[FACTURA SQL]',
      {
        sql,
        params
      }
    )

    const rows =
      await query(
        sql,
        params
      )

    return {

      total:
        Number(
          totalRow?.total
        ) || 0,

      rows:
        rows.map(
          mapFactura
        ),

      limit:
        safeLimit,

      offset:
        safeOffset,

    }

  } catch (error) {

    console.error(
      '[FACTURA REPOSITORY QUERY ERROR]',
      {
        proveedor_id,

        estatus,

        limit,

        offset,

        search,

        message:
          error.message,
      }
    )

    throw error

  }

}

// ======================================================
// HEALTH CHECK
// ======================================================

export async function facturaRepositoryHealthCheck() {

  try {

    const rows = await query(
      `SELECT 1 AS ok`
    )

    return {

      success: true,

      healthy:
        rows[0]?.ok === 1,

    }

  }

  catch (error) {

    return {

      success: false,

      healthy: false,

      error:
        error.message,

    }

  }

}

// ======================================================
// EXPORT DEFAULT
// ======================================================

export default {

  getFacturaById,

  getFacturaByUUID,

  getFacturaByFingerprint,

  insertFactura,

  updateFacturaStatus,

  updateFacturaError,

  updateFacturaTimbrada,

  updateFacturaCancelada,

  listFacturas,

  facturaRepositoryHealthCheck,

}