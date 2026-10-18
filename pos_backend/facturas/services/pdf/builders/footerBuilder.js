// facturas/services/pdf/builder/footerBuilder.js
export async function buildFooter(
  doc
) {

  doc
    .fontSize(8)
    .text(
      'Documento generado automáticamente',
      40,
      760,
      {
        align: 'center',
      }
    )

}