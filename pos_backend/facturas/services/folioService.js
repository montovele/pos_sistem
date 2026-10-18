// ======================================================
// *Actualmente sin implementacion en ningun modulo*

// OBTENER SIGUIENTE FOLIO  
// ATÓMICO + SIN SALTOS + MULTI-TENANT
// ======================================================

export async function obtenerSiguienteFolio(
  proveedorId,
  pedidoId = null,
  prefijo = null,
  connection = null
) {
console.log(
  '\n🔥------- obtenerSiguienteFolio CALLED\n',
  {
    proveedorId,
    pedidoId,
    prefijo,
    stack: new Error().stack
  }
)
  if (!proveedorId) {

    throw new Error(
      'proveedorId requerido'
    )

  }

  const fecha =
    new Date()

  const anio =
    fecha.getFullYear()

  const mes =
    fecha.getMonth() + 1

  try {

    // ==========================================
    // BLOQUEAR REGISTRO
    // ==========================================

    let rows =
      await execute(

        `
        SELECT
          id_folio,
          proveedor_id,
          prefijo,
          folio_actual

        FROM folios_facturas

        WHERE proveedor_id = ?

        LIMIT 1

        FOR UPDATE
        `,

        [
          proveedorId
        ],

        connection

      )

    let registro =
      rows?.[0] || null

    // ==========================================
    // CREAR CONFIGURACIÓN
    // ==========================================

    if (!registro) {

      const prefijoFinal =
        normalizePrefijo(
          prefijo || 'FAC'
        )

      const result =
        await execute(

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

            proveedorId,
            prefijoFinal,
            anio,
            mes,

          ],

          connection

        )

      registro = {

        id_folio:
          result.insertId,

        proveedor_id:
          proveedorId,

        prefijo:
          prefijoFinal,

        folio_actual:
          0,

      }

    }

    // ==========================================
    // INCREMENTO ATÓMICO
    // ==========================================

    await execute(

      `
      UPDATE
        folios_facturas

      SET

        folio_actual =
          folio_actual + 1,

        anio = ?,

        mes = ?

      WHERE
        id_folio = ?
      `,

      [

        anio,
        mes,

        registro.id_folio,

      ],

      connection

    )

    // ==========================================
    // LEER VALOR FINAL
    // ==========================================

    const updated =
      await execute(

        `
        SELECT

          folio_actual,
          prefijo

        FROM
          folios_facturas

        WHERE
          id_folio = ?

        LIMIT 1
        `,

        [
          registro.id_folio
        ],

        connection

      )

    const actual =
      updated?.[0]

    const folio =
      Number(
        actual.folio_actual
      )

    const numeroFactura =
      buildNumeroFactura(
        actual.prefijo,
        folio
      )

    return {

      proveedor_id:
        proveedorId,

      pedido_id:
        pedidoId,

      prefijo:
        actual.prefijo,

      anio,

      mes,

      folio,

      numeroFactura,

      transaction_id:
        crypto.randomUUID(),

    }

  }

  catch (error) {

    console.error(
      '[OBTENER_FOLIO]',
      error
    )

    throw error

  }

}