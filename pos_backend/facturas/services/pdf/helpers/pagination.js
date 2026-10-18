// facturas/services/pdf/helpers/pagination.js
export function checkPageBreak(
  doc,
  y,
  limit = 720
) {

  if (y >= limit) {
    doc.addPage()

    return 40
  }

  return y
}