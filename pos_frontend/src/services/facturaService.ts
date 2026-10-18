import type {
  Factura,
  FacturaRequest,
  FacturaPreview,
  FacturaListResponse
} from '@/types'
import jsPDF from 'jspdf'
import http from './http'

class FacturaService {
  private unwrapPayload<T = any>(response: any): T {
    const payload = response?.data ?? response

    if (payload && typeof payload === 'object' && 'success' in payload) {
      if (payload.success === false) {
        throw new Error(payload.message || 'Error en la operación')
      }
      return (payload.data ?? payload) as T
    }

    return payload as T
  }

  private async tryDownload(id: string, type: 'pdf' | 'xml'): Promise<void> {
    const candidates = [
      `/facturas/${id}/${type}`,
      `/facturas/admin/facturas/${id}/${type}`
    ]

    let lastError: unknown = null

    for (const endpoint of candidates) {
      try {
        const response = await http.get(endpoint, { responseType: 'blob' })
        const blobData = response as any
        const blob = new Blob([blobData?.data ?? blobData], {
          type: type === 'pdf' ? 'application/pdf' : 'application/xml'
        })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `factura-${id}.${type}`
        link.style.display = 'none'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        setTimeout(() => URL.revokeObjectURL(url), 1500)
        return
      } catch (error) {
        lastError = error
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error(`No se pudo descargar el archivo ${type.toUpperCase()}`)
  }

  async previewInvoice(payload: FacturaRequest): Promise<FacturaPreview> {
    const response: any = await http.post('/facturas/preview', payload)
    return this.unwrapPayload<FacturaPreview>(response)
  }

  async generateInvoice(payload: FacturaRequest): Promise<Factura> {
    try {
      const response: any = await http.post('/facturas/generate', payload)
      const data = this.unwrapPayload<any>(response)
      return (data?.data ?? data ?? {}) as Factura
    } catch (error) {
      try {
        const transactionResponse: any = await http.post('/transactions', {
          items: (payload.items ?? []).map((item) => ({
            ...item,
            quantity: Number(item.quantity ?? 1),
            price: Number(item.price ?? 0),
            subtotal: Number(item.subtotal ?? (Number(item.price ?? 0) * Number(item.quantity ?? 1))),
            total: Number(item.total ?? (Number(item.price ?? 0) * Number(item.quantity ?? 1)))
          })),
          total: Number(payload.total ?? 0),
          paymentMethod: payload.paymentMethod ?? 'cash',
          employeeNumber: 1,
          customer: payload.cliente ?? { nombre: 'Consumidor final' }
        })

        const data = this.unwrapPayload<any>(transactionResponse)
        return {
          id: data?.codigoTransaccion || data?.id || Date.now(),
          folio: `FAC-${Date.now()}`,
          codigoTransaccion: data?.codigoTransaccion || `TRX-${Date.now()}`,
          status: 'paid',
          total: Number(payload.total ?? data?.total ?? 0),
          paymentMethod: payload.paymentMethod ?? data?.paymentMethod ?? 'cash',
          createdAt: new Date().toISOString(),
          items: payload.items ?? [],
          cliente: payload.cliente ?? { nombre: 'Consumidor final', rfc: 'XAXX010101000' },
          tipo: payload.tipo ?? 'ingreso',
          serie: payload.serie ?? 'A',
          metodoPago: payload.metodoPago ?? 'PUE'
        } as Factura
      } catch (fallbackError) {
        throw error
      }
    }
  }

  async getFacturas(params: Record<string, unknown> = {}): Promise<FacturaListResponse> {
    const normalizedParams = { ...params }

    if (normalizedParams.status && !normalizedParams.estatus) {
      normalizedParams.estatus = normalizedParams.status
    }

    try {
      const response: any = await http.get('/facturas', { params: normalizedParams })
      return this.unwrapPayload<FacturaListResponse>(response)
    } catch (error) {
      const transactionResponse: any = await http.get('/transactions')
      const data = this.unwrapPayload<any>(transactionResponse)
      const rows = Array.isArray(data)
        ? data.map((item, index) => ({
            id: item.codigoTransaccion || item.id || index + 1,
            folio: `FAC-${index + 1}`,
            codigoTransaccion: item.codigoTransaccion,
            status: item.status || 'paid',
            total: Number(item.total || 0),
            paymentMethod: item.paymentMethod || 'cash',
            createdAt: item.fechaDeTrans || new Date().toISOString(),
            items: Array.isArray(item.items) ? item.items : [],
            cliente: { nombre: 'Consumidor final', rfc: 'XAXX010101000' },
            tipo: 'ingreso',
            serie: 'A',
            metodoPago: 'PUE'
          }))
        : []

      return { rows, total: rows.length, page: 1, limit: rows.length, totalPages: 1 }
    }
  }

  async getFacturaById(id: string): Promise<Factura> {
    const candidates = [`/facturas/${id}`, `/facturas/admin/facturas/${id}`]
    let lastError: unknown = null

    for (const endpoint of candidates) {
      try {
        const response: any = await http.get(endpoint)
        return this.unwrapPayload<Factura>(response)
      } catch (error) {
        lastError = error
      }
    }

    throw lastError instanceof Error ? lastError : new Error('No se pudo obtener la factura')
  }

  async downloadPdf(id: string): Promise<void> {
    await this.tryDownload(id, 'pdf')
  }

  downloadNonStampedPdf(factura: Factura): void {
    const pdf = new jsPDF()
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 18
    const contentWidth = pageWidth - margin * 2
    const colors = {
      navy: [24, 43, 72] as [number, number, number],
      blue: [37, 99, 235] as [number, number, number],
      ink: [31, 41, 55] as [number, number, number],
      muted: [100, 116, 139] as [number, number, number],
      border: [226, 232, 240] as [number, number, number],
      soft: [248, 250, 252] as [number, number, number],
      white: [255, 255, 255] as [number, number, number]
    }
    let y = 20
    let pageNumber = 1

    const normalizeText = (value: unknown) =>
      String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7E]/g, '')

    const money = (value: unknown) => {
      const amount = Number(value ?? 0)
      return Number.isFinite(amount)
        ? `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : '$0.00'
    }

    const footer = () => {
      pdf.setDrawColor(...colors.border)
      pdf.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16)
      pdf.setFontSize(8)
      pdf.setTextColor(...colors.muted)
      pdf.setFont('helvetica', 'normal')
      pdf.text('Documento informativo | No es un CFDI | Sin timbrado fiscal', margin, pageHeight - 10)
      pdf.text(`Pagina ${pageNumber}`, pageWidth - margin, pageHeight - 10, { align: 'right' })
    }

    const newPage = () => {
      footer()
      pdf.addPage()
      pageNumber += 1
      y = 20
    }

    const ensureSpace = (height: number) => {
      if (y + height > pageHeight - 24) {
        newPage()
      }
    }

    const writeLabelValue = (label: string, value: unknown, x: number, width: number) => {
      pdf.setFontSize(8)
      pdf.setFont('helvetica', 'bold')
      pdf.setTextColor(...colors.muted)
      pdf.text(normalizeText(label).toUpperCase(), x, y)
      pdf.setFontSize(10)
      pdf.setFont('helvetica', 'normal')
      pdf.setTextColor(...colors.ink)
      const lines = pdf.splitTextToSize(normalizeText(value), width)
      pdf.text(lines, x, y + 5)
    }

    const subtotal = (factura.items || []).reduce(
      (sum, item) => sum + Number(item.subtotal ?? item.total ?? (item.price ?? 0) * (item.quantity ?? 0)),
      0
    )

    pdf.setFillColor(...colors.navy)
    pdf.rect(0, 0, pageWidth, 49, 'F')
    pdf.setTextColor(...colors.white)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(19)
    pdf.text('COMPROBANTE DE VENTA', margin, 20)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text('Factura informativa sin timbrado fiscal', margin, 29)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.text(normalizeText(factura.folio || factura.codigoTicket || 'SIN FOLIO'), pageWidth - margin, 20, { align: 'right' })
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.text('DOCUMENTO NO FISCAL', pageWidth - margin, 29, { align: 'right' })

    y = 63
    pdf.setFillColor(254, 243, 199)
    pdf.setDrawColor(253, 230, 138)
    pdf.roundedRect(margin, y - 7, contentWidth, 15, 2, 2, 'FD')
    pdf.setTextColor(146, 64, 14)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(9)
    pdf.text('ESTATUS: SIN TIMBRAR', margin + 7, y + 2)
    pdf.setFont('helvetica', 'normal')
    pdf.text('Este documento no sustituye un CFDI.', pageWidth - margin - 7, y + 2, { align: 'right' })
    y += 25

    ensureSpace(39)
    pdf.setFillColor(...colors.soft)
    pdf.setDrawColor(...colors.border)
    pdf.roundedRect(margin, y, contentWidth, 34, 2, 2, 'FD')
    pdf.setTextColor(...colors.ink)
    writeLabelValue('Cliente', factura.cliente?.nombre || 'Consumidor final', margin + 8, contentWidth / 2 - 18)
    writeLabelValue('RFC', factura.cliente?.rfc || 'XAXX010101000', margin + contentWidth / 2, contentWidth / 2 - 18)
    y += 44

    ensureSpace(39)
    pdf.setFillColor(...colors.white)
    pdf.setDrawColor(...colors.border)
    pdf.roundedRect(margin, y, contentWidth, 34, 2, 2, 'S')
    pdf.setTextColor(...colors.ink)
    writeLabelValue('Transaccion', factura.codigoTransaccion || factura.id || 'Sin identificador', margin + 8, contentWidth / 3 - 16)
    writeLabelValue('Fecha', factura.createdAt || new Date().toISOString(), margin + contentWidth / 3, contentWidth / 3 - 16)
    writeLabelValue('Metodo de pago', factura.paymentMethod || factura.metodoPago || 'cash', margin + (contentWidth / 3) * 2, contentWidth / 3 - 16)
    y += 47

    ensureSpace(22)
    pdf.setTextColor(...colors.navy)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(12)
    pdf.text('Conceptos', margin, y)
    y += 8

    const columns = {
      code: margin + 5,
      product: margin + 42,
      quantity: pageWidth - margin - 73,
      amount: pageWidth - margin - 5
    }
    const tableHeader = () => {
      pdf.setFillColor(...colors.navy)
      pdf.roundedRect(margin, y - 5, contentWidth, 13, 2, 2, 'F')
      pdf.setTextColor(...colors.white)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8)
      pdf.text('CODIGO', columns.code, y + 3)
      pdf.text('PRODUCTO', columns.product, y + 3)
      pdf.text('CANT.', columns.quantity, y + 3, { align: 'right' })
      pdf.text('IMPORTE', columns.amount, y + 3, { align: 'right' })
      y += 15
    }

    tableHeader()
    pdf.setFontSize(9)
    for (const [index, item] of (factura.items || []).entries()) {
      const quantity = Number(item.quantity ?? 0)
      const total = Number(item.total ?? item.subtotal ?? (item.price ?? 0) * quantity)
      const productLines = pdf.splitTextToSize(normalizeText(item.nombreProd || 'Producto'), 75)
      const rowHeight = Math.max(13, productLines.length * 4.5 + 7)

      if (y + rowHeight > pageHeight - 28) {
        newPage()
        tableHeader()
      }

      if (index % 2 === 0) {
        pdf.setFillColor(...colors.soft)
        pdf.rect(margin, y - 5, contentWidth, rowHeight, 'F')
      }
      pdf.setTextColor(...colors.muted)
      pdf.setFont('helvetica', 'normal')
      pdf.text(normalizeText(item.codigoProd || item.productId || '-'), columns.code, y + 3)
      pdf.setTextColor(...colors.ink)
      pdf.text(productLines, columns.product, y + 3)
      pdf.text(String(quantity), columns.quantity, y + 3, { align: 'right' })
      pdf.setFont('helvetica', 'bold')
      pdf.text(money(total), columns.amount, y + 3, { align: 'right' })
      y += rowHeight
      pdf.setDrawColor(...colors.border)
      pdf.line(margin, y - 5, pageWidth - margin, y - 5)
    }

    ensureSpace(55)
    y += 12
    pdf.setDrawColor(...colors.border)
    pdf.line(pageWidth - 88, y - 5, pageWidth - margin, y - 5)
    pdf.setTextColor(...colors.muted)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text('Subtotal', pageWidth - 83, y + 4)
    pdf.text(money(subtotal), pageWidth - margin, y + 4, { align: 'right' })
    y += 10
    pdf.setFillColor(...colors.blue)
    pdf.roundedRect(pageWidth - 88, y - 5, 70, 19, 2, 2, 'F')
    pdf.setTextColor(...colors.white)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.text('TOTAL', pageWidth - 82, y + 7)
    pdf.text(money(factura.total), pageWidth - margin, y + 7, { align: 'right' })
    y += 33

    ensureSpace(29)
    pdf.setFillColor(...colors.soft)
    pdf.setDrawColor(...colors.border)
    pdf.roundedRect(margin, y, contentWidth, 24, 2, 2, 'FD')
    pdf.setTextColor(...colors.muted)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    const disclaimer = pdf.splitTextToSize(
      'Documento informativo generado desde una transaccion. No es un CFDI, no tiene sello digital y no esta timbrado.',
      contentWidth - 14
    )
    pdf.text(disclaimer, margin + 7, y + 9)
    footer()

    const identifier = normalizeText(factura.codigoTransaccion || factura.id || factura.folio || Date.now())
    pdf.save(`factura-no-timbrada-${identifier}.pdf`)
  }

  async downloadXml(id: string): Promise<void> {
    await this.tryDownload(id, 'xml')
  }

  async cancelInvoice(id: string, reason = 'Cancelada desde frontend'): Promise<void> {
    const candidates = [
      `/facturas/${id}/cancel`,
      `/facturas/admin/facturas/${id}/cancelar`,
      `/facturas/${id}/cancelar`
    ]

    let lastError: unknown = null

    for (const endpoint of candidates) {
      try {
        await http.post(endpoint, { reason })
        return
      } catch (error) {
        lastError = error
      }
    }

    throw lastError instanceof Error ? lastError : new Error('No se pudo cancelar la factura')
  }
}

export default new FacturaService()
