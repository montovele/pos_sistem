// facturas/services/pdf/builder/qrBuilder.js
import QRCode from 'qrcode'

export async function buildQR(
  doc,
  data
) {

  const {
    factura,
  } = data

  const qr =
    await QRCode.toDataURL(
      factura.verification_url
    )

  doc.image(
    qr,
    40,
    620,
    {
      width: 120,
    }
  )

}