// ======================================================
// facturas/controllers/clientesFiscalesController.js
// ENTERPRISE CONTROLLER
// MULTI-TENANT READY
// ======================================================

import {

  obtenerClienteFiscalPorRFC,
  crearClienteFiscal,
  actualizarClienteFiscal,

} from '../services/clienteFiscalService.js'

import {

  getAllClientesFiscales,

} from '../repositories/clienteFiscalRepository.js'

import {

  getFacturaById,
  listFacturas,

} from '../repositories/facturaRepository.js'

import {
  procesarFacturacion,
} from '../services/facturacionService.js'


// ======================================================
// HELPER
// ======================================================

function getProveedorId(req) {

  const proveedor_id =
    req.session?.user?.proveedor_id

  if (!proveedor_id) {

    const error =
      new Error(
        'Proveedor no identificado'
      )

    error.status = 401

    throw error

  }

  return Number(proveedor_id)

}

// ======================================================
// LISTAR CLIENTES
// ======================================================

export async function listarClientes(
  req,
  res,
  next
) {

  try {

    const proveedor_id =
      getProveedorId(req)

    console.log(
      '[CLIENTES_FISCALES] LISTAR',
      {
        proveedor_id
      }
    )

    const clientes =
      await getAllClientesFiscales(
        proveedor_id
      )

    return res.json({

      success: true,

      total:
        clientes.length,

      data: clientes,

    })

  } catch (error) {

    next(error)

  }

}

// ======================================================
// OBTENER CLIENTE POR RFC
// ======================================================

export async function obtenerCliente(
  req,
  res,
  next
) {

  try {

    const proveedor_id =
      getProveedorId(req)

    const rfc =
      req.params.rfc

    console.log(
      '[CLIENTES_FISCALES] OBTENER',
      {
        proveedor_id,
        rfc
      }
    )

    const cliente =
      await obtenerClienteFiscalPorRFC(
        rfc,
        proveedor_id
      )

    if (!cliente) {

      return res.status(404).json({

        success: false,

        error:
          'Cliente fiscal no encontrado',

      })

    }

    return res.json({

      success: true,

      data: cliente,

    })

  } catch (error) {

    next(error)

  }

}

// ======================================================
// CREAR CLIENTE
// ======================================================

export async function crearCliente(
  req,
  res,
  next
) {

  try {

    const proveedor_id =
      getProveedorId(req)

    console.log(
      '[CLIENTES_FISCALES] CREAR',
      {
        proveedor_id,
        rfc:
          req.body?.rfc
      }
    )

    const cliente =
      await crearClienteFiscal(
        req.body,
        proveedor_id
      )

    return res.status(201).json({

      success: true,

      data: cliente,

    })

  } catch (error) {

    next(error)

  }

}
// ======================================================
// LISTAR FACTURAS
// CONTROLLER
// FULL BACKWARD + FORWARD COMPATIBLE
// ======================================================

export async function listarFacturas(
req,
res,
next
){

try{

const proveedor_id=

Number(

req.user?.proveedor_id ??

req.query.proveedor_id

)||null

if(!proveedor_id){

return res
.status(400)
.json({

success:false,

message:
'proveedor_id requerido',

})

}

// =========================================
// PAGINATION
// SOPORTA page Y offset
// =========================================

const limit=

Math.min(

100,

Number(
req.query.limit
)||10

)

const page=

Math.max(

1,

Number(
req.query.page
)||1

)

const offset=

req.query.offset !==
undefined

?

Math.max(
0,
Number(
req.query.offset
)
)

:

(
page-1
)
*
limit

// =========================================

const filters={

estatus:

req.query.estatus ??

req.query.status ??

null,

search:

req.query.search ??

null,

}

// =========================================

const result=

await listFacturas({

proveedor_id,

limit,

offset,

...filters,

})

// =========================================

const total=

Number(
result.total
)||0

const rows=

result.rows ||

[]

const totalPages=

Math.max(

1,

Math.ceil(
total/limit
)

)

const currentPage=

Math.floor(
offset/limit
)+1

console.log(
'[FACTURAS] RESPONSE',
{

total,

rows:
rows.length,

page:
currentPage,

totalPages,

offset,

limit,

}

)

// =========================================
// RESPONSE UNIVERSAL
// =========================================

return res.json({

success:true,

// FRONT ANTIGUO
data:
rows,

// FRONT NUEVO
rows,

// PAGINACION SIMPLE
total,

limit,

offset,

page:
currentPage,

totalPages,

// PAGINACION OBJETO
pagination:{

total,

limit,

offset,

page:
currentPage,

totalPages,

hasNext:

currentPage
<
totalPages,

hasPrev:

currentPage
>
1,

},

// FILTROS
filters,

// META
meta:{

count:
rows.length,

},

})

}

catch(error){

console.error(
'[FACTURAS] ERROR',
{

proveedor_id:
req.user?.proveedor_id,

message:
error.message,

}

)

next(
error
)

}

}

// ======================================================
// GENERAR FACTURA
// MULTI-TENANT READY
// ======================================================

export async function generarFactura(
  req,
  res,
  next
) {

  try {

    // ==========================================
    // PROVEEDOR DESDE SESIÓN
    // ==========================================

    const proveedor_id =
      getProveedorId(
        req
      )

    console.log(
      '[FACTURACION] GENERAR',
      {

        proveedor_id,

        pedido_id:
          req.body?.pedido_id,

        cliente_fiscal_id:
          req.body?.cliente_fiscal_id

      }
    )

    // ==========================================
    // INYECTAR CONTEXTO TENANT
    // ==========================================

    const payload = {

      ...req.body,

      proveedor_id

    }

    console.log(
      'procesarFacturacion payload',  JSON.stringify(
    payload,
    null,
    2
  )
      
    )

    // ==========================================
    // GENERAR FACTURA
    // ==========================================

    const result =
      await procesarFacturacion(
        payload
      )

    console.log(
      '[FACTURACION] RESULT',
      result
    )

    return res.json({

      success: true,

      data:
        result

    })

  }

  catch (
    error
  ) {

    console.error(
      '[FACTURACION ERROR]',
      {

        proveedor_id:
          req.session?.user?.proveedor_id,

        message:
          error.message,

        stack:
          error.stack

      }
    )

    next(
      error
    )

  }

}


// ======================================================
// DESCARGAR XML
// ======================================================

export async function descargarXML(
  req,
  res,
  next
) {

  try {

    const factura =
      await getFacturaById(
        req.params.id
      )

    if (!factura) {

      return res.status(404).json({

        success: false,
        message: 'Factura no encontrada',

      })

    }

    // ==============================================
    // URL STORAGE
    // ==============================================

    if (factura.xml_url) {

      return res.json({

        success: true,
        url: factura.xml_url,

      })

    }

    // ==============================================
    // META STORAGE
    // ==============================================

    const xmlPath =
      factura?.meta?.xml_path

    if (!xmlPath) {

      return res.status(404).json({

        success: false,
        message: 'XML no disponible',

      })

    }

    const absolutePath =
      path.resolve(xmlPath)

    await fs.access(absolutePath)

    return res.download(
      absolutePath
    )

  } catch (error) {

    next(error)

  }

}


// ======================================================
// DESCARGAR PDF
// ======================================================

export async function descargarPDF(
  req,
  res,
  next
) {

  try {

    const factura =
      await getFacturaById(
        req.params.id
      )

    if (!factura) {

      return res.status(404).json({

        success: false,
        message: 'Factura no encontrada',

      })

    }

    // ==============================================
    // URL STORAGE
    // ==============================================

    if (factura.pdf_url) {

      return res.json({

        success: true,
        url: factura.pdf_url,

      })

    }

    // ==============================================
    // META STORAGE
    // ==============================================

    const pdfPath =
      factura?.meta?.pdf_path

    if (!pdfPath) {

      return res.status(404).json({

        success: false,
        message: 'PDF no disponible',

      })

    }

    const absolutePath =
      path.resolve(pdfPath)

    await fs.access(absolutePath)

    return res.download(
      absolutePath
    )

  } catch (error) {

    next(error)

  }

}



// ======================================================
// ACTUALIZAR CLIENTE
// ======================================================

export async function actualizarCliente(
  req,
  res,
  next
) {

  try {

    const proveedor_id =
      getProveedorId(req)

    const id =
      Number(
        req.params.id
      )

    console.log(
      '[CLIENTES_FISCALES] ACTUALIZAR',
      {
        proveedor_id,
        id
      }
    )

    const updated =
      await actualizarClienteFiscal(

        id,

        proveedor_id,

        req.body

      )

    return res.json({

      success: true,

      data: updated,

    })

  } catch (error) {

    next(error)

  }

}



// ======================================================
// OBTENER FACTURA
// ======================================================

export async function obtenerFactura(
  req,
  res,
  next
) {

  try {

    const factura =
      await getFacturaById(
        req.params.id
      )

    if (!factura) {

      return res.status(404).json({

        success: false,
        message: 'Factura no encontrada',

      })

    }

    return res.json({

      success: true,
      data: factura,

    })

  } catch (error) {

    next(error)

  }

}
// ======================================================
// EXPORT
// ======================================================

export default {
generarFactura,
  listarClientes,
  listFacturas,
  obtenerFactura,

  obtenerCliente,

  crearCliente,

  actualizarCliente,
    descargarPDF,
    descargarXML,

}