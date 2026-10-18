// facturas/services/pdf/builder/clienteBuilder.js
export async function buildCliente(
  doc,
  data
) {

  const {
    clienteFiscal,
  } = data

  doc
    .fontSize(12)
    .text(
      'RECEPTOR',
      40,
      150
    )

  doc
    .fontSize(10)
    .text(
      clienteFiscal.razon_social,
      40,
      170
    )

  doc.text(
    clienteFiscal.rfc,
    40,
    185
  )

  doc.text(
    clienteFiscal.cp,
    40,
    200
  )

}