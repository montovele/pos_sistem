import jsPDF from 'jspdf'
import type { InventoryItem, InventorySummary } from '@/types'
import { formatDisplayMoney } from '@/composables/reportPdf'

interface InventoryImportRecord {
  id?: number | string
  source?: string
  createdAt?: string
  importedRows?: number
}

interface InventoryReportPdfData {
  summary: InventorySummary
  lowStockItems: InventoryItem[]
  imports: InventoryImportRecord[]
}

type PdfColor = [number, number, number]

const formatNumber = (value: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 }).format(value)
const formatDate = (value?: string) => value
  ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value))
  : '-'

export const generateInventoryReportPdf = ({ summary, lowStockItems, imports }: InventoryReportPdfData) => {
  const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 42
  const contentWidth = pageWidth - margin * 2
  const ink: PdfColor = [24, 48, 68]
  const muted: PdfColor = [91, 115, 132]
  const teal: PdfColor = [11, 128, 110]
  const line: PdfColor = [218, 229, 227]
  const light: PdfColor = [246, 250, 249]
  const amber: PdfColor = [180, 92, 23]
  let cursorY = 0

  const addPageIfNeeded = (height: number) => {
    if (cursorY + height <= pageHeight - margin) return
    pdf.addPage()
    cursorY = margin
  }

  const drawFooter = () => {
    const pageCount = pdf.getNumberOfPages()
    for (let page = 1; page <= pageCount; page += 1) {
      pdf.setPage(page)
      pdf.setDrawColor(...line)
      pdf.line(margin, pageHeight - 30, pageWidth - margin, pageHeight - 30)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(...muted)
      pdf.text('Reporte de inventario', margin, pageHeight - 17)
      pdf.text(`Página ${page} de ${pageCount}`, pageWidth - margin, pageHeight - 17, { align: 'right' })
    }
  }

  const sectionTitle = (title: string) => {
    addPageIfNeeded(30)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(13)
    pdf.setTextColor(...ink)
    pdf.text(title, margin, cursorY)
    cursorY += 8
    pdf.setDrawColor(...teal)
    pdf.setLineWidth(1.5)
    pdf.line(margin, cursorY, margin + 38, cursorY)
    pdf.setLineWidth(1)
    cursorY += 18
  }

  const drawTable = (headers: string[], rows: string[][], widths: number[], accent = false) => {
    const rowHeight = 23
    addPageIfNeeded(rowHeight)
    pdf.setFillColor(...teal)
    pdf.roundedRect(margin, cursorY, contentWidth, rowHeight, 4, 4, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(255, 255, 255)
    let x = margin
    headers.forEach((header, index) => {
      pdf.text(header, x + 7, cursorY + 15)
      x += widths[index]
    })
    cursorY += rowHeight

    rows.forEach((row, rowIndex) => {
      addPageIfNeeded(rowHeight)
      if (rowIndex % 2 === 0) {
        pdf.setFillColor(...light)
        pdf.rect(margin, cursorY, contentWidth, rowHeight, 'F')
      }
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(...(accent && rowIndex < rows.length ? amber : ink))
      x = margin
      row.forEach((value, index) => {
        const text = pdf.splitTextToSize(value, widths[index] - 14)[0] || ''
        pdf.text(text, x + 7, cursorY + 15)
        x += widths[index]
      })
      pdf.setDrawColor(...line)
      pdf.line(margin, cursorY + rowHeight, margin + contentWidth, cursorY + rowHeight)
      cursorY += rowHeight
    })
    cursorY += 18
  }

  pdf.setFillColor(...ink)
  pdf.rect(0, 0, pageWidth, 112, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(23)
  pdf.text('Reporte de inventario', margin, 48)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(205, 229, 224)
  pdf.text('Resumen ejecutivo de existencias y alertas operativas', margin, 69)
  pdf.text(`Generado el ${new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short' }).format(new Date())}`, margin, 88)
  cursorY = 143

  const cards = [
    ['Artículos', formatNumber(summary.totalItems), teal],
    ['Unidades', formatNumber(summary.totalUnits), [31, 105, 129]],
    ['Costo de inventario', formatDisplayMoney(summary.inventoryCost), [69, 93, 114]],
    ['Valor de venta', formatDisplayMoney(summary.inventoryValue), [180, 92, 23]]
  ] as Array<[string, string, PdfColor]>
  const cardGap = 8
  const cardWidth = (contentWidth - cardGap * 3) / 4
  cards.forEach(([label, value, color], index) => {
    const x = margin + index * (cardWidth + cardGap)
    pdf.setFillColor(...color)
    pdf.roundedRect(x, cursorY, cardWidth, 64, 7, 7, 'F')
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(8)
    pdf.setTextColor(235, 250, 247)
    pdf.text(label.toUpperCase(), x + 10, cursorY + 18)
    pdf.setFontSize(13)
    pdf.setTextColor(255, 255, 255)
    pdf.text(value, x + 10, cursorY + 43)
  })
  cursorY += 94

  sectionTitle('Stock bajo')
  if (lowStockItems.length) {
    drawTable(
      ['PRODUCTO', 'SKU / ALMACÉN', 'STOCK', 'MÍNIMO'],
      lowStockItems.map(item => [item.name, `${item.sku} / ${item.warehouse}`, formatNumber(item.stock), formatNumber(item.minStock)]),
      [220, 190, 65, contentWidth - 475],
      true
    )
  } else {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(...muted)
    pdf.text('No hay alertas activas de stock bajo.', margin, cursorY)
    cursorY += 32
  }

  sectionTitle('Resumen por almacén')
  drawTable(
    ['ALMACÉN', 'ARTÍCULOS', 'UNIDADES', 'COSTO'],
    summary.byWarehouse.map(row => [row.warehouse, formatNumber(row.items), formatNumber(row.units), formatDisplayMoney(row.inventoryCost)]),
    [220, 100, 100, contentWidth - 420]
  )

  sectionTitle('Últimas importaciones')
  if (imports.length) {
    drawTable(
      ['FUENTE', 'AUDITORÍA', 'FECHA', 'FILAS'],
      imports.slice(0, 8).map(entry => [String(entry.source || 'archivo').toUpperCase(), `#${entry.id ?? '-'}`, formatDate(entry.createdAt), String(entry.importedRows || 0)]),
      [150, 100, 190, contentWidth - 440]
    )
  } else {
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(...muted)
    pdf.text('Todavía no hay importaciones registradas.', margin, cursorY)
  }

  drawFooter()
  pdf.save(`reporte-inventario-${new Date().toISOString().slice(0, 10)}.pdf`)
}
