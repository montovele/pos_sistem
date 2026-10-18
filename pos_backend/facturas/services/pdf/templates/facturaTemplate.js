// facturas/services/pdf/templates/facturaTemplate.js
import {
  buildHeader,
} from '../builders/headerBuilder.js'

import {
  buildCliente,
} from '../builders/clienteBuilder.js'

import {
  buildConceptos,
} from '../builders/conceptosBuilder.js'

import {
  buildTotales,
} from '../builders/totalesBuilder.js'

import {
  buildQR,
} from '../builders/qrBuilder.js'

import {
  buildFooter,
} from '../builders/footerBuilder.js'

export async function facturaTemplate(
  doc,
  data
) {

  await buildHeader(
    doc,
    data
  )

  await buildCliente(
    doc,
    data
  )

  await buildConceptos(
    doc,
    data
  )

  await buildTotales(
    doc,
    data
  )

  await buildQR(
    doc,
    data
  )

  await buildFooter(
    doc,
    data
  )

}