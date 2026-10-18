// ======================================================
// facturas/services/clienteFiscalService.js
// ENTERPRISE SERVICE
// MULTI-TENANT READY
// ======================================================

import {

  getClienteFiscalByRFC,
  insertClienteFiscal,
  updateClienteFiscal,

} from '../repositories/clienteFiscalRepository.js'

import {
  withTransaction,
} from './transactionService.js'

import {
  obtenerOCrearClientePAC,
} from './satService.js'

import {
  executeWithResilience,
  isRetryableError,
} from './resiliencePolicyService.js'

import {
  insertLog,
} from '../repositories/logsRepository.js'

// ======================================================

const SYSTEM =
  'clienteFiscalService'

const DEFAULT_TAX_SYSTEM =
  process.env.DEFAULT_TAX_SYSTEM ||
  '601'

const DEFAULT_CFDI_USE =
  process.env.DEFAULT_CFDI_USE ||
  'G03'

// ======================================================
// HELPERS
// ======================================================

function sanitizeString(
  value = ''
) {

  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')

}

// ======================================================

function normalizeUpper(
  value = ''
) {

  return sanitizeString(value)
    .toUpperCase()

}

// ======================================================

function normalizeEmail(
  value = ''
) {

  return sanitizeString(value)
    .toLowerCase()

}

// ======================================================

function normalizeZip(
  value = ''
) {

  return sanitizeString(value)

}

// ======================================================

function validateRequired(
  value,
  field
) {

  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {

    throw new Error(
      `${field} requerido`
    )

  }

}

// ======================================================

function validarRFC(
  rfc = ''
) {

  const normalized =
    normalizeUpper(rfc)

  const fisica =
    /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/

  const moral =
    /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/

  if (
    !fisica.test(normalized) &&
    !moral.test(normalized)
  ) {

    throw new Error(
      'RFC inválido'
    )

  }

  return normalized

}
// ======================================================
// SANITIZE CLIENTE
// ENTERPRISE + MULTITENANT SAFE
// ======================================================

function sanitizeClienteData(
  data = {}
) {

  // ==========================================
  // NORMALIZAR CONTEXTO
  // ==========================================

  const proveedor_id =

    data?.proveedor_id != null

      ? Number(
          data.proveedor_id
        )

      : null


  const codigoPostal =

    normalizeZip(

      data.codigo_postal ??

      data.cp ??

      data.zip ??

      null

    )


  // ==========================================
  // META SAFE
  // ==========================================

  let meta = {}

  try {

    meta =

      typeof data.meta === 'string'

        ? JSON.parse(
            data.meta
          )

        :

        typeof data.meta === 'object'

          ? data.meta

          : {}

  }

  catch {

    meta = {}

  }

  return {

    // ========================================
    // IDENTIDAD
    // ========================================

    razon_social:

      sanitizeString(

        data.razon_social ??

        data.legal_name ??

        data.nombre ??

        ''

      ),

    rfc:

      data.rfc ||

      data.tax_id

        ?

        validarRFC(

          data.rfc ??

          data.tax_id

        )

        :

        null,

    // ========================================
    // CONTACTO
    // ========================================

    email:

      normalizeEmail(

        data.email
      ),

    correo_facturacion:

      normalizeEmail(

        data.correo_facturacion ??

        data.billing_email ??

        data.email

      ),

    telefono:

      sanitizeString(

        data.telefono ??

        data.phone ??

        data.billing_phone ??

        data.telefono_cliente

      ),

    // ========================================
    // DIRECCION
    // ========================================

    codigo_postal:
      codigoPostal,

    cp:
      codigoPostal,

    direccion:

      sanitizeString(
        data.direccion
      ),

    municipio:

      sanitizeString(
        data.municipio
      ),

    estado:

      sanitizeString(
        data.estado
      ),

    pais:

      sanitizeString(

        data.pais ??

        'MEX'

      ),

    // ========================================
    // CFDI
    // ========================================

    regimen_fiscal:

      sanitizeString(

        data.regimen_fiscal ??

        DEFAULT_TAX_SYSTEM

      ),

    uso_cfdi:

      sanitizeString(

        data.uso_cfdi ??

        DEFAULT_CFDI_USE

      ),

    // ========================================
    // MULTITENANT
    // ========================================

    proveedor_id,

    woo_customer_id:

      data.woo_customer_id

        ? Number(
            data.woo_customer_id
          )

        : null,

    // ========================================
    // META
    // ========================================

    meta,

  }

}

// ======================================================

async function safeLog(
  data = {}
) {

  try {

    await insertLog(data)

  } catch (error) {

    console.error(
      '[CLIENTE_FISCAL_LOG]',
      error.message
    )

  }

}

// ======================================================

async function withClienteResilience(
  fn,
  operation,
  metadata = {}
) {

  return executeWithResilience({

    fn,

    service:
      SYSTEM,

    operation,

    retryDecider:
      isRetryableError,

    metadata,

  })

}

// ======================================================
// OBTENER CLIENTE RFC
// ======================================================

export async function obtenerClienteFiscalPorRFC(
  rfc,
  proveedor_id
) {

  validateRequired(
    proveedor_id,
    'proveedor_id'
  )

  const normalizedRFC =
    validarRFC(rfc)

  return withClienteResilience(

    () =>
      getClienteFiscalByRFC(

        normalizedRFC,

        proveedor_id

      ),

    'obtenerClienteFiscalPorRFC',

    {

      rfc:
        normalizedRFC,

      proveedor_id,

    }

  )

}
// ======================================================
// CREAR CLIENTE
// ROBUST + MULTITENANT SAFE
// ======================================================

export async function crearClienteFiscal(
  data = {},
  proveedor_id = null
) {

  console.log(
    '[crearClienteFiscal]',
    {
      proveedor_id,
      data
    }
  )

  // =====================================
  // NORMALIZAR CONTEXTO
  // =====================================

  const resolvedProveedorId =

    Number(

      proveedor_id ??

      data?.proveedor_id

    )

  validateRequired(
    resolvedProveedorId,
    'proveedor_id'
  )

  // =====================================
  // SANITIZE
  // =====================================

  const cliente =
    sanitizeClienteData({

      ...data,

      proveedor_id:
        resolvedProveedorId

    })

  // =====================================
  // NORMALIZACIÓN FINAL
  // =====================================

  cliente.proveedor_id =
    resolvedProveedorId

  cliente.codigo_postal =

    cliente.codigo_postal ??

    cliente.cp ??

    null

  cliente.cp =
    cliente.codigo_postal

  validateRequired(
    cliente.codigo_postal,
    'codigo_postal'
  )

  console.group(
    '[SERVICE crearClienteFiscal]'
  )

  console.log(
    cliente
  )

  // =====================================
  // EXISTENTE
  // =====================================

  const existing =
    await getClienteFiscalByRFC(

      cliente.rfc,

      resolvedProveedorId

    )

  if (existing) {

    console.info(
      'Cliente existente'
    )

    console.groupEnd()

    return existing

  }

  // =====================================
  // PAC
  // =====================================

  const codigoPostal =

    String(
      cliente.codigo_postal
    )
    .trim()

  const pacPayload = {

    legal_name:

      cliente.razon_social,

    tax_id:

      cliente.rfc,

    email:

      cliente.correo_facturacion ||

      cliente.email,

    tax_system:

      cliente.regimen_fiscal ||

      '601',

    address: {

      zip:
        codigoPostal

    }

  }

  // limpiar nulls recursivo
  Object.keys(
    pacPayload
  ).forEach(
    key => {

      if (

        pacPayload[key] == null ||

        pacPayload[key] === ''

      ) {

        delete pacPayload[key]

      }

    }
  )

  console.group(
    '🏢 PAC CLIENT'
  )

  console.log(
    JSON.stringify(
      pacPayload,
      null,
      2
    )
  )

  console.groupEnd()

  const pacCustomer =

    await obtenerOCrearClientePAC(
      pacPayload
    )

  // =====================================
  // INSERT
  // =====================================

  const insertPayload = {

    ...cliente,

    proveedor_id:
      resolvedProveedorId,

    pac_customer_id:

      pacCustomer?.id ||

      null,

    pac_synced:
      !!pacCustomer,

    pac_last_sync:
      new Date(),

  }

  console.log(
    '[INSERT payload]',
    insertPayload
  )

  const result =

    await withClienteResilience(

      () =>

        insertClienteFiscal(

          insertPayload,

          resolvedProveedorId

        ),

      'crearClienteFiscal',

      {

        proveedor_id:
          resolvedProveedorId,

        rfc:
          cliente.rfc

      }

    )

  console.groupEnd()

  return result

}

// ======================================================
// ACTUALIZAR CLIENTE
// ======================================================

export async function actualizarClienteFiscal(
  clienteId,
  proveedor_id,
  data = {},
  connection = null
) {

  validateRequired(
    clienteId,
    'clienteId'
  )

  validateRequired(
    proveedor_id,
    'proveedor_id'
  )
console.log(
'DATA UPDATE',
data
)
  const cliente =
    sanitizeClienteData(
      data
    )

  const result =
    await withClienteResilience(

      () =>
        updateClienteFiscal(

          clienteId,

          proveedor_id,

          cliente,

          connection

        ),

      'actualizarClienteFiscal',

      {

        proveedor_id,

        cliente_id:
          clienteId,

      }

    )
console.log(
'UPDATE RESULT',
result
)
  await safeLog({

    tipo:
      'cliente_fiscal_updated',

    request_data:
      cliente,

    response_data: {

      cliente_id:
        clienteId,

      proveedor_id,

    },

  })

  return result

}
// ======================================================
// UPSERT CLIENTE FISCAL
// ROBUST + BACKWARD COMPATIBLE
// ======================================================

export async function obtenerOCrearClienteFiscal(
  data = {},
  proveedor_id = null
) {

  // ==========================================
  // NORMALIZAR INPUT
  // ==========================================

  const resolvedProveedorId =
    Number(

      proveedor_id ??

      data?.proveedor_id ??

      data?.meta?.proveedor_id

    )

  validateRequired(
    resolvedProveedorId,
    'proveedor_id'
  )

  // ==========================================
  // LIMPIAR DATA
  // ==========================================

  const cliente =
    sanitizeClienteData({

      ...data,

      proveedor_id:
        resolvedProveedorId,

    })

  console.log(
    '[CLIENTE_FISCAL][UPSERT]',
    {

      proveedor_id:
        resolvedProveedorId,

      rfc:
        cliente.rfc,

      email:
        cliente.email,

    }
  )

  return withTransaction(

    async (
      connection
    ) => {

      // ==============================
      // BUSCAR EXISTENTE
      // ==============================

      const existing =
        await getClienteFiscalByRFC(

          cliente.rfc,

          resolvedProveedorId,

          connection

        )

      if (existing) {

        console.log(
          '[CLIENTE_FISCAL] EXISTENTE',
          existing.id_cliente_fiscal
        )

        return existing

      }

      // ==============================
      // CREAR NUEVO
      // ==============================

      const created =
        await crearClienteFiscal(

          cliente,

          resolvedProveedorId,

          connection

        )

      console.log(
        '[CLIENTE_FISCAL] CREADO',
        created
      )

      return created

    }

  )

}

// ======================================================
// VALIDAR
// ======================================================

export async function validarClienteFiscal(
  data = {}
) {

  try {

    const cliente =
      sanitizeClienteData(
        data
      )

    validateRequired(
      cliente.razon_social,
      'razon_social'
    )

    validateRequired(
      cliente.rfc,
      'rfc'
    )

    validateRequired(
      cliente.email,
      'email'
    )

    validateRequired(
      cliente.codigo_postal,
      'codigo_postal'
    )

    return {

      success: true,

      valid: true,

      cliente,

    }

  } catch (error) {

    return {

      success: false,

      valid: false,

      error:
        error.message,

    }

  }

}

// ======================================================
// HEALTH
// ======================================================

export async function clienteFiscalHealthCheck() {

  return {

    success: true,

    healthy: true,

    service:
      SYSTEM,

    timestamp:
      new Date()
        .toISOString(),

  }

}

// ======================================================
// EXPORT
// ======================================================

export default {

  obtenerClienteFiscalPorRFC,

  crearClienteFiscal,

  actualizarClienteFiscal,

  obtenerOCrearClienteFiscal,

  validarClienteFiscal,

  clienteFiscalHealthCheck,

}