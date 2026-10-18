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
      console.log('listarClientes',clientes)
      
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

      console.log('cluente',cliente)
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
){

try{

const proveedor_id =
Number(
req.session?.user?.proveedor_id
)

if(
!proveedor_id
){

return res
.status(400)
.json({

success:false,

message:
'Proveedor requerido'

})

}

const payload={

...req.body,

proveedor_id

}

console.group(
'CONTROLLER crearCliente'
)

console.log(
payload
)

const cliente =
await crearClienteFiscal(
payload,
proveedor_id
)

console.groupEnd()

return res
.status(201)
.json({

success:true,

data:cliente

})

}
catch(error){

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
// EXPORT
// ======================================================

export default {

  listarClientes,

  obtenerCliente,

  crearCliente,

  actualizarCliente,

}