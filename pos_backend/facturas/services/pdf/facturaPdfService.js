// facturas/services/pdf/facturaPdfService.js
import PDFDocument from 'pdfkit'

import {
  facturaTemplate,
} from './templates/facturaTemplate.js'

export async function generarPDFCustom(
  data = {}
) {
  return new Promise(
    async (
      resolve,
      reject
    ) => {

      try {

        const doc =
          new PDFDocument({
            margin: 40,
            size: 'A4',
          })

        const buffers = []

        doc.on(
          'data',
          buffers.push.bind(buffers)
        )

        doc.on(
          'end',
          () => {
            resolve(
              Buffer.concat(
                buffers
              )
            )
          }
        )

        // =========================
        // TEMPLATE
        // =========================

        await facturaTemplate(
          doc,
          data
        )

        doc.end()

      } catch (error) {
        reject(error)
      }

    }
  )
}