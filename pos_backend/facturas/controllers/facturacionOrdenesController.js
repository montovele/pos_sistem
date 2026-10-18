// =========================================================
// 📄 LISTAR ÓRDENES DISPONIBLES PARA FACTURACIÓN
// =========================================================

import {
  getOrdenesSinFacturar,
  getAll
}
from './models/ordenesFacturacion.model.js'


export async function listarOrdenesFacturacion(
  req,
  res
) {

  try {

    // =====================================================
    // 🔐 SESSION SAFE
    // =====================================================

    const user =
      req.session?.user
      || {}

    console.log(
      '[listarOrdenesFacturacion] user:',
      user
    )

    // =====================================================
    // 🔥 ADMIN REAL
    // =====================================================

    const isAdmin =
      user.isAdminUser === true

    // =====================================================
    // 🔒 ROL EFECTIVO
    // =====================================================

    /**
     * ADMIN:
     * → puede consultar todo
     *
     * CUALQUIER SESIÓN:
     * → continúa flujo normal
     */

    const rolEfectivo =

      isAdmin

        ? 'admin'

        : (
            user.rol
            || 'proveedor'
          )

    // =====================================================
    // 🔥 PROVEEDOR EFECTIVO
    // =====================================================

    const proveedorId =

      isAdmin

        ? null

        : (
            user.proveedor_id
            || null
          )

    // =====================================================
    // 📦 QUERY
    // =====================================================

    const query = {

      rol:
        rolEfectivo,

      proveedor_id:
        proveedorId,

      page:
        Number(
          req.query.page
          || 1
        ),

      limit:
        Number(
          req.query.limit
          || 20
        ),

      proveedor:

        isAdmin

          ? (
              req.query.proveedor
              || ''
            )

          : '',

      busqueda:

        req.query.busqueda
        || '',

      fecha_inicio:

        req.query.fecha_inicio
        || '',

      fecha_fin:

        req.query.fecha_fin
        || '',

      estado_ct:

        req.query.estado_ct
        || ''

    }

    console.log(
      '[listarOrdenesFacturacion] query:',
      query
    )

    // =====================================================
    // 🔥 DATA
    // =====================================================

    const result =

      await getOrdenesSinFacturar(
        query
      )

    console.log(
      '[listarOrdenesFacturacion] total:',
      result
        ?.pagination
        ?.total
    )

    console.log(
      '[listarOrdenesFacturacion] rows:',
      result
        ?.data
        ?.length
    )
console.log(
  '[listarOrdenesFacturacion] data\n',
  JSON.stringify(
    result,
    null,
    2
  )
)

    // =====================================================
    // RESPONSE
    // =====================================================

    return res.json({

      success: true,

      data:

        result?.data
        || [],

      pagination:

        result?.pagination

        || {

          total: 0,
          page: 1,
          limit: 20,
          pages: 0

        }

    })

  }

  catch (
    err
  ) {

    console.error(
      '[listarOrdenesFacturacion]',
      err
    )

    return res
      .status(500)
      .json({

        success: false,

        message:

          err.message

          ||

          'Error obteniendo órdenes para facturación',

        data: [],

        pagination: {

          total: 0,
          page: 1,
          limit: 20,
          pages: 0

        }

      })

  }

}

  // 🔹 Listar órdenes para Facturar
export async function listarFacturar(req, res) {
  const proveedor_id = req.session?.user?.proveedor_id;
  try {
    const ordenes = await getAll(proveedor_id);

    // 🔹 Normalizamos: cada orden siempre tiene items
    const ordenesNormalizadas = ordenes.map(o => ({
      ...o,
      items: Array.isArray(o.items) ? o.items : [],
    }));

    console.log('ordenesNormalizadas',ordenesNormalizadas)

    res.json({ success: true, data: ordenesNormalizadas });
  } catch (error) {
    console.error("Error listar órdenes:", error);
    res.status(500).json({ success: false, error: error.message });
  }
}