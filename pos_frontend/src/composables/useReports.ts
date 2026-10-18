import { ref, computed } from 'vue'
import jsPDF from 'jspdf'
import { useAuthStore } from '@/stores/authStore'
import { useTransactionStore } from '@/stores/transactionStore'
import { api } from '@/services/api'
import type { Transaction, ReportFilter } from '@/types'
import {
  formatDisplayMoney,
  formatReportDate,
  normalizeReportStatus,
  summarizePaymentMethods
} from '@/composables/reportPdf'

export interface CashShortage {
  id: string
  numeroEmpleado: number
  cashier: string
  fechaCierre: string
  totalEsperado: number
  efectivoContado: number
  diferencia: number
}

export interface ReportStats {
  totalSales: number
  totalTransactions: number
  totalItems: number
  averageTicket: number
  averageItemsPerTicket: number
  averageSaleTime: number
  topCashiers: Array<{ name: string; sales: number; count: number }>
  topProducts: Array<{ code: string; name: string; quantity: number; total: number }>
  paymentMethods: Record<string, { count: number; total: number }>
  hourlyDistribution: Record<string, number>
  dailyDistribution: Record<string, number>
  cashClosings: CashShortage[]
  cashShortages: CashShortage[]
  finalStatus: 'CUADRADA' | 'FALTANTE' | 'SOBRANTE' | 'SIN ARQUEO'
  generatedAt: string
}

export interface ExportFormat {
  format: 'json' | 'csv' | 'pdf' | 'excel'
  filename: string
  data: any
}

export const useReports = () => {
  const transactionStore = useTransactionStore()
  const authStore = useAuthStore()

  // Estado
  const isGenerating = ref(false)
  const error = ref<string | null>(null)
  const currentReport = ref<ReportStats | null>(null)
  const filteredTransactions = ref<Transaction[]>([])
  const filter = ref<ReportFilter>({
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  })

  /**
   * Filtrar transacciones por rango de fechas
   */
  const filterByDateRange = (transactions: Transaction[], startDate: string, endDate: string) => {
    const start = new Date(startDate).getTime()
    const end = new Date(endDate).getTime() + 24 * 60 * 60 * 1000

    return transactions.filter(t => {
      const tDate = new Date(t.fechaDeTrans).getTime()
      return tDate >= start && tDate <= end
    })
  }

  /**
   * Filtrar por cajero específico
   */
  const filterByCashier = (transactions: Transaction[], cashierId?: number) => {
    if (!cashierId) return transactions
    return transactions.filter(t => t.numeroEmpleado === cashierId)
  }

  /**
   * Aplicar todos los filtros
   */
  const applyFilters = (transactions: Transaction[], filters: ReportFilter) => {
    let result = [...transactions]

    if (filters.startDate && filters.endDate) {
      result = filterByDateRange(result, filters.startDate, filters.endDate)
    }

    if (filters.cashierId) {
      result = filterByCashier(result, filters.cashierId)
    }

    return result
  }

  /**
   * Calcular top 10 cajeros por ventas
   */
  const calculateTopCashiers = (transactions: Transaction[]) => {
    const cashierMap = new Map<number, { name: string; sales: number; count: number }>()

    transactions.forEach(t => {
      if (!cashierMap.has(t.numeroEmpleado)) {
        cashierMap.set(t.numeroEmpleado, {
          name: t.nombreCajero,
          sales: 0,
          count: 0
        })
      }

      const cashier = cashierMap.get(t.numeroEmpleado)!
      cashier.sales += t.total
      cashier.count++
    })

    return Array.from(cashierMap.values())
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 10)
  }

  /**
   * Calcular top 10 productos por cantidad
   */
  const calculateTopProducts = (transactions: Transaction[]) => {
    const productMap = new Map<
      string,
      { code: string; name: string; quantity: number; total: number }
    >()

    transactions.forEach(t => {
      if (!Array.isArray(t.items)) return

      t.items.forEach(item => {
        if (!item) return

        const itemProduct = item.product
        const key = itemProduct?.codigoProd || item.codigoProd || String(item.productId || '')
        if (!key) return

        if (!productMap.has(key)) {
          productMap.set(key, {
            code: key,
            name: itemProduct?.nombreProd || item.nombreProd || 'Producto sin nombre',
            quantity: 0,
            total: 0
          })
        }

        const aggregateProduct = productMap.get(key)!
        aggregateProduct.quantity += Number(item.quantity || 0)
        aggregateProduct.total += Number(item.priceTot ?? item.total ?? item.subtotal ?? 0)
      })
    })

    return Array.from(productMap.values())
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10)
  }

  /**
   * Calcular distribución por método de pago
   */
  const calculatePaymentMethods = (transactions: Transaction[]) => {
    const methods: Record<string, { count: number; total: number }> = {
      cash: { count: 0, total: 0 },
      card: { count: 0, total: 0 },
      transfer: { count: 0, total: 0 },
      check: { count: 0, total: 0 },
      other: { count: 0, total: 0 }
    }

    transactions.forEach(t => {
      const normalized = String(t.paymentMethod ?? 'cash').trim().toLowerCase()

      let method: keyof typeof methods = 'cash'
      if (['cash', 'efectivo', 'contado', 'dinero'].includes(normalized)) method = 'cash'
      else if (['card', 'tarjeta', 'credito', 'debito', 'visa', 'mastercard'].includes(normalized)) method = 'card'
      else if (['transfer', 'transferencia', 'qr', 'qrcode', 'qr transfer', 'qr / transferencia'].includes(normalized)) method = 'transfer'
      else if (['check', 'cheque'].includes(normalized)) method = 'check'
      else method = 'other'

      methods[method].count++
      methods[method].total += Number(t.total || 0)
    })

    return methods
  }

  /**
   * Calcular distribución horaria
   */
  const calculateHourlyDistribution = (transactions: Transaction[]) => {
    const hourly: Record<string, number> = {}

    transactions.forEach(t => {
      const date = new Date(t.fechaDeTrans)
      const hour = date.getHours().toString().padStart(2, '0')
      const key = `${hour}:00 - ${hour}:59`

      hourly[key] = (hourly[key] || 0) + t.total
    })

    return hourly
  }

  /**
   * Calcular distribución diaria
   */
  const calculateDailyDistribution = (transactions: Transaction[]) => {
    const daily: Record<string, number> = {}

    transactions.forEach(t => {
      const date = new Date(t.fechaDeTrans).toISOString().split('T')[0]

      daily[date] = (daily[date] || 0) + t.total
    })

    return daily
  }

  const loadCashClosings = async (startDate: string, endDate: string, cashierId?: number) => {
    const response = await api.get('/caja/history')
    const history = Array.isArray(response.data?.data) ? response.data.data : []
    const start = new Date(`${startDate}T00:00:00`).getTime()
    const end = new Date(`${endDate}T23:59:59.999`).getTime()

    return history
      .filter((entry: any) => {
        const closedAt = entry.fechaArqueo || entry.fechaCierre || entry.horaCierre || entry.fechaApertura
        const timestamp = new Date(closedAt).getTime()
        return entry.efectivoContado != null && timestamp >= start && timestamp <= end &&
          (!cashierId || Number(entry.numeroEmpleado) === cashierId)
      })
      .map((entry: any): CashShortage => ({
        id: String(entry.id || entry.fechaCierre || Date.now()),
        numeroEmpleado: Number(entry.numeroEmpleado || 0),
        cashier: entry.cajero || entry.nombreCajero || 'Sin cajero',
        fechaCierre: entry.fechaArqueo || entry.fechaCierre || entry.horaCierre || entry.fechaApertura,
        totalEsperado: Number(entry.totalEsperado || 0),
        efectivoContado: Number(entry.efectivoContado || 0),
        diferencia: Number(entry.diferencia || 0)
      }))
  }

  const getFinalCashStatus = (cashHistory: CashShortage[]) => {
    const latest = cashHistory[0]
    if (!latest) return 'SIN ARQUEO' as const
    if (latest.diferencia < 0) return 'FALTANTE' as const
    if (latest.diferencia > 0) return 'SOBRANTE' as const
    return 'CUADRADA' as const
  }

  /**
   * Generar reporte completo
   */
  const generateReport = async (customFilter?: ReportFilter) => {
    try {
      isGenerating.value = true
      error.value = null

      if (authStore.token) {
        await authStore.loadCurrentUser()
      }

      const activeFilter: ReportFilter = {
        ...filter.value,
        ...(customFilter || {})
      }

      if (authStore.currentUser && authStore.currentUser.role !== 'admin') {
        activeFilter.cashierId = authStore.currentUser.numeroEmpleado
      }

      filter.value = activeFilter

      const backendResponse = await api.get('/reports', {
        params: {
          startDate: activeFilter.startDate,
          endDate: activeFilter.endDate,
          ...(activeFilter.cashierId ? { cashierId: activeFilter.cashierId } : {})
        }
      })

      const payload = backendResponse?.data?.data ?? backendResponse?.data ?? {}
      const backendTransactions = Array.isArray(payload.transactions)
        ? payload.transactions as Transaction[]
        : []

      const all = backendTransactions.length > 0
        ? backendTransactions
        : await transactionStore.loadTransactions(activeFilter.startDate, activeFilter.endDate, activeFilter.cashierId)

      const cashClosings = await loadCashClosings(activeFilter.startDate, activeFilter.endDate, activeFilter.cashierId)
      const cashShortages = cashClosings.filter(entry => entry.diferencia < 0)

      // Aplicar filtros
      filteredTransactions.value = applyFilters(all, activeFilter)

      // Calcular estadísticas
      const totalSales = filteredTransactions.value.reduce((sum, t) => sum + Number(t.total || 0), 0)
      const totalItems = filteredTransactions.value.reduce(
        (sum, t) =>
          sum +
          (Array.isArray(t.items)
            ? t.items.reduce((isum, i) => isum + Number(i?.quantity || 0), 0)
            : 0),
        0
      )

      const stats: ReportStats = {
        totalSales: Number(payload.totalSales ?? totalSales),
        totalTransactions: filteredTransactions.value.length || Number(payload.totalTransactions ?? 0),
        totalItems: Number(payload.totalItems ?? totalItems),
        averageTicket:
          filteredTransactions.value.length > 0
            ? Number(payload.averageTicket ?? (totalSales / filteredTransactions.value.length))
            : Number(payload.averageTicket ?? 0),
        averageItemsPerTicket:
          filteredTransactions.value.length > 0
            ? totalItems / filteredTransactions.value.length
            : 0,
        averageSaleTime: 45,
        topCashiers: calculateTopCashiers(filteredTransactions.value),
        topProducts: Array.isArray(payload.topProducts) && payload.topProducts.length > 0
          ? payload.topProducts
          : calculateTopProducts(filteredTransactions.value),
        paymentMethods: calculatePaymentMethods(filteredTransactions.value),
        hourlyDistribution: calculateHourlyDistribution(filteredTransactions.value),
        dailyDistribution: calculateDailyDistribution(filteredTransactions.value),
        cashClosings,
        cashShortages,
        finalStatus: getFinalCashStatus(cashClosings),
        generatedAt: new Date().toISOString()
      }

      currentReport.value = stats
      return stats
    } catch (err: any) {
      try {
        const activeFilter = customFilter || filter.value
        const all = await transactionStore.loadTransactions(activeFilter.startDate, activeFilter.endDate, activeFilter.cashierId)
        const cashClosings = await loadCashClosings(activeFilter.startDate, activeFilter.endDate, activeFilter.cashierId)
        const cashShortages = cashClosings.filter(entry => entry.diferencia < 0)
        const filtered = applyFilters(all, activeFilter)

        const totalSales = filtered.reduce((sum, t) => sum + Number(t.total || 0), 0)
        const totalItems = filtered.reduce(
          (sum, t) =>
            sum +
            (Array.isArray(t.items)
              ? t.items.reduce((isum, i) => isum + Number(i?.quantity || 0), 0)
              : 0),
          0
        )

        const fallbackStats: ReportStats = {
          totalSales,
          totalTransactions: filtered.length,
          totalItems,
          averageTicket: filtered.length > 0 ? totalSales / filtered.length : 0,
          averageItemsPerTicket: filtered.length > 0 ? totalItems / filtered.length : 0,
          averageSaleTime: 45,
          topCashiers: calculateTopCashiers(filtered),
          topProducts: calculateTopProducts(filtered),
          paymentMethods: calculatePaymentMethods(filtered),
          hourlyDistribution: calculateHourlyDistribution(filtered),
          dailyDistribution: calculateDailyDistribution(filtered),
          cashClosings,
          cashShortages,
          finalStatus: getFinalCashStatus(cashClosings),
          generatedAt: new Date().toISOString()
        }

        currentReport.value = fallbackStats
        filteredTransactions.value = filtered
        return fallbackStats
      } catch (fallbackError: any) {
        error.value = fallbackError?.message || err?.message || 'Error generando reporte'
        throw fallbackError
      }
    } finally {
      isGenerating.value = false
    }
  }

  /**
   * Generar reporte de ventas diarias
   */
  const generateDailyReport = async (date: string) => {
    const dateStr = date.split('T')[0]
    const nextDate = new Date(new Date(date).getTime() + 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0]

    return generateReport({
      startDate: dateStr,
      endDate: nextDate
    })
  }

  /**
   * Generar reporte de ventas mensuales
   */
  const generateMonthlyReport = async (year: number, month: number) => {
    const startDate = new Date(year, month - 1, 1).toISOString().split('T')[0]
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    return generateReport({
      startDate,
      endDate
    })
  }

  /**
   * Exportar a JSON
   */
  const exportToJSON = (
    report: ReportStats,
    filename = 'reporte.json',
    transactions: Transaction[] = []
  ) => {
    const json = JSON.stringify({ ...report, transactions }, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    downloadFile(blob, filename)
  }

  /**
   * Exportar a CSV
   */
  const exportToCSV = (
    report: ReportStats,
    filename = 'reporte.csv',
    transactions: Transaction[] = []
  ) => {
    const escapeCsv = (value: unknown) => {
      const text = String(value ?? '')
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
    }

    const safeNumber = (value: unknown, fallback = 0) => {
      const numericValue = Number(value)
      return Number.isFinite(numericValue) ? numericValue : fallback
    }

    const safeFixed = (value: unknown, digits = 2) => {
      const numericValue = safeNumber(value)
      return numericValue.toFixed(digits)
    }

    const formatDateTime = (value: string | Date | null | undefined) => {
      if (!value) return ''
      const date = value instanceof Date ? value : new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      return date.toLocaleString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      })
    }

    const addSection = (title: string, rows: unknown[][]) => {
      csvLines.push('')
      csvLines.push(title)
      if (rows.length) {
        const [header, ...body] = rows
        csvLines.push(header.map(escapeCsv).join(','))
        body.forEach(row => csvLines.push(row.map(escapeCsv).join(',')))
      }
    }

    const csvLines: string[] = []
    csvLines.push('LEMARQUET POS')
    csvLines.push('REPORTE FINANCIERO')
    csvLines.push(`Fecha de generación,${escapeCsv(formatDateTime(new Date()))}`)
    csvLines.push(`Estado final,${escapeCsv(report?.finalStatus ?? 'SIN ARQUEO')}`)
    csvLines.push(`Generado por,${escapeCsv(report?.generatedAt ? formatDateTime(report.generatedAt) : 'Sistema')}`)
    csvLines.push('')

    addSection('RESUMEN GENERAL', [
      ['Indicador', 'Valor'],
      ['Total de ventas', `$${safeFixed(report?.totalSales, 2)}`],
      ['Total de transacciones', String(report?.totalTransactions ?? 0)],
      ['Total de artículos', String(report?.totalItems ?? 0)],
      ['Ticket promedio', `$${safeFixed(report?.averageTicket, 2)}`],
      ['Promedio de artículos por ticket', safeFixed(report?.averageItemsPerTicket, 2)],
      ['Estado final', String(report?.finalStatus ?? 'SIN ARQUEO')]
    ])

    addSection('FALTANTES DE CAJA', [
      ['Cajero', 'Fecha de cierre', 'Total esperado', 'Efectivo contado', 'Diferencia'],
      ...((report?.cashShortages ?? []).map(item => [
        item.cashier,
        item.fechaCierre,
        `$${safeFixed(item.totalEsperado, 2)}`,
        `$${safeFixed(item.efectivoContado, 2)}`,
        `$${safeFixed(Math.abs(item.diferencia), 2)}`
      ]))
    ])

    addSection('TOP CAJEROS', [
      ['Nombre', 'Ventas', 'Transacciones'],
      ...((report?.topCashiers ?? []).map(c => [
        c.name,
        `$${safeFixed(c.sales, 2)}`,
        String(c.count)
      ]))
    ])

    addSection('TOP PRODUCTOS', [
      ['Código', 'Nombre', 'Cantidad', 'Total'],
      ...((report?.topProducts ?? []).map(p => [
        p.code,
        p.name,
        String(p.quantity),
        `$${safeFixed(p.total, 2)}`
      ]))
    ])

    addSection('TRANSACCIONES', [
      ['Código', 'Ticket', 'Fecha', 'Total', 'Estado', 'Método de pago'],
      ...transactions.map(transaction => [
        transaction.codigoTransaccion,
        transaction.codigoTicket,
        transaction.fechaDeTrans,
        `$${safeFixed(Number(transaction.total || 0), 2)}`,
        transaction.status,
        transaction.paymentMethod || 'cash'
      ])
    ])

    const csv = csvLines.join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    downloadFile(blob, filename)
  }

  const exportToPDF = (
    report: ReportStats,
    filename = 'reporte.pdf',
    transactions: Transaction[] = []
  ) => {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 40
    const borderColor: [number, number, number] = [148, 163, 184]
    const primaryColor: [number, number, number] = [15, 23, 42]
    const greenColor: [number, number, number] = [34, 197, 94]
    const amberColor: [number, number, number] = [245, 158, 11]
    const redColor: [number, number, number] = [220, 38, 38]
    const blueColor: [number, number, number] = [59, 130, 246]
    const textColor: [number, number, number] = [15, 23, 42]

    const drawSummaryCard = (
      x: number,
      y: number,
      width: number,
      height: number,
      title: string,
      value: string,
      fill: [number, number, number]
    ) => {
      pdf.setFillColor(...fill)
      pdf.roundedRect(x, y, width, height, 8, 8, 'F')
      pdf.setTextColor(255, 255, 255)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8)
      pdf.text(title.toUpperCase(), x + 12, y + 18)
      pdf.setFontSize(16)
      pdf.text(value, x + 12, y + 42)
    }

    const drawSectionTitle = (title: string, yPos: number) => {
      pdf.setTextColor(...textColor)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(12)
      pdf.text(title, margin, yPos)
      pdf.setDrawColor(...borderColor)
      pdf.line(margin, yPos + 8, pageWidth - margin, yPos + 8)
    }

    const drawTable = ({
      yPos,
      columns,
      rows,
      columnWidths,
      totalWidth,
      rowHeight = 18
    }: {
      yPos: number
      columns: Array<{ key: string; label: string; align?: 'left' | 'right' }>
      rows: Array<Record<string, string | number>>
      columnWidths: number[]
      totalWidth: number
      rowHeight?: number
    }) => {
      const startX = pageWidth - margin - totalWidth

      pdf.setFillColor(248, 250, 252)
      pdf.roundedRect(startX, yPos, totalWidth, rowHeight, 4, 4, 'F')
      pdf.setDrawColor(...borderColor)
      pdf.setTextColor(...textColor)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8)

      let xCursor = startX
      columns.forEach((column, index) => {
        const value = column.label
        const textX = column.align === 'right' ? xCursor + columnWidths[index] - 5 : xCursor + 6
        pdf.text(value, textX, yPos + 12, { align: column.align === 'right' ? 'right' : 'left' })
        xCursor += columnWidths[index]
      })

      let currentY = yPos + rowHeight
      rows.forEach(row => {
        if (currentY > pageHeight - 60) {
          pdf.addPage()
          currentY = margin
        }

        const rowStartY = currentY
        pdf.setDrawColor(226, 232, 240)
        pdf.setTextColor(...textColor)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(8)

        xCursor = startX
        columns.forEach((column, index) => {
          const value = String(row[column.key] ?? '')
          const maxWidth = columnWidths[index] - 10
          const wrapped = pdf.splitTextToSize(value, maxWidth)
          const text = wrapped[0] ?? ''
          const align = column.align === 'right' ? 'right' : 'left'
          const textX = align === 'right' ? xCursor + columnWidths[index] - 5 : xCursor + 6
          pdf.text(text, textX, rowStartY + 12, { align })
          xCursor += columnWidths[index]
        })

        pdf.line(startX, rowStartY + rowHeight - 1, startX + totalWidth, rowStartY + rowHeight - 1)
        currentY += rowHeight
      })

      return currentY
    }

    const paymentSummary = summarizePaymentMethods(transactions)

    pdf.setFillColor(15, 23, 42)
    pdf.rect(0, 0, pageWidth, 80, 'F')
    pdf.setTextColor(255, 255, 255)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(22)
    pdf.text('REPORTE DE CAJA', margin, 34)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.text(`Periodo: ${formatReportDate(report.generatedAt)}`, margin, 54)
    pdf.text(`Estado: ${normalizeReportStatus(report.finalStatus)}`, pageWidth - margin, 54, { align: 'right' })

    const summaryCards: Array<{ title: string; value: string; fill: [number, number, number] }> = [
      { title: 'Ventas', value: formatDisplayMoney(report.totalSales), fill: [22, 101, 52] },
      { title: 'Transacciones', value: String(report.totalTransactions || 0), fill: [59, 130, 246] },
      { title: 'Artículos', value: String((Number(report.totalItems || 0)).toFixed(2)), fill: [234, 88, 12] },
      { title: 'Ticket Promedio', value: formatDisplayMoney(report.averageTicket), fill: [124, 58, 237] }
    ]

    summaryCards.forEach((card, index) => {
      drawSummaryCard(
        margin + index * 123,
        100,
        110,
        50,
        card.title,
        card.value,
        card.fill
      )
    })

    let y = 180
    pdf.setDrawColor(...borderColor)
    pdf.roundedRect(margin, y, pageWidth - margin * 2, 70, 8, 8, 'S')

    const statusLabel = normalizeReportStatus(report.finalStatus)
    const statusColor = report.finalStatus === 'CUADRADA' ? greenColor : report.finalStatus === 'FALTANTE' ? redColor : amberColor
    pdf.setFillColor(...statusColor)
    pdf.roundedRect(margin + 14, y + 12, 8, 8, 2, 2, 'F')
    pdf.setTextColor(...textColor)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(14)
    pdf.text(statusLabel, margin + 30, y + 20)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)

    const statusMessage = report.finalStatus === 'SIN ARQUEO'
      ? 'El cierre de caja todavía no ha sido realizado.'
      : report.finalStatus === 'CUADRADA'
        ? 'La caja quedó cuadrada y sin diferencias.'
        : 'Se requiere revisión del arqueo de caja.'

    pdf.text(statusMessage, margin + 14, y + 40)
    pdf.text(`Faltantes: ${report.cashShortages.length}`, pageWidth - margin - 90, y + 20, { align: 'right' })
    pdf.text(`Total de ventas: ${formatDisplayMoney(report.totalSales)}`, pageWidth - margin - 90, y + 38, { align: 'right' })

    y += 92
    drawSectionTitle('MÉTODOS DE PAGO', y)
    y += 20

    const paymentRows = paymentSummary.length > 0
      ? paymentSummary.map(item => ({
          method: item.label,
          count: String(item.count),
          total: formatDisplayMoney(item.total)
        }))
      : [{ method: 'Sin movimientos', count: '0', total: '$0.00' }]

    const paymentColumns = [
      { key: 'method', label: 'Método', align: 'left' as const },
      { key: 'count', label: 'Transacciones', align: 'right' as const },
      { key: 'total', label: 'Importe', align: 'right' as const }
    ]
    const paymentWidths = [190, 120, 120]
    y = drawTable({
      yPos: y,
      columns: paymentColumns,
      rows: paymentRows,
      columnWidths: paymentWidths,
      totalWidth: 430,
      rowHeight: 18
    }) + 12

    drawSectionTitle('RESUMEN DE CAJA', y)
    y += 20

    const cashFields = [
      ['Fondo inicial', '$0.00'],
      ['Ventas en efectivo', formatDisplayMoney(report.totalSales)],
      ['Entradas', '$0.00'],
      ['Salidas', '$0.00'],
      ['Efectivo esperado', formatDisplayMoney(report.totalSales)],
      ['Efectivo contado', report.finalStatus === 'SIN ARQUEO' ? 'Pendiente' : formatDisplayMoney(report.totalSales)],
      ['Diferencia', report.finalStatus === 'SIN ARQUEO' ? 'Pendiente' : '$0.00']
    ]

    pdf.setTextColor(...textColor)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    cashFields.forEach(([label, value]) => {
      if (y > pageHeight - 90) {
        pdf.addPage()
        y = margin
      }
      pdf.text(String(label), margin, y)
      pdf.text(String(value), pageWidth - margin, y, { align: 'right' })
      y += 16
    })

    y += 10
    drawSectionTitle('TRANSACCIONES', y)
    y += 18

    const transactionRows = transactions.length > 0
      ? transactions.map(transaction => ({
          codigo: transaction.codigoTransaccion ?? '-',
          ticket: transaction.codigoTicket ?? '-',
          fecha: formatReportDate(transaction.fechaDeTrans),
          metodo: String(transaction.paymentMethod ?? 'Efectivo'),
          total: formatDisplayMoney(transaction.total),
          estado: normalizeReportStatus(transaction.status)
        }))
      : [{ codigo: 'Sin registros', ticket: '-', fecha: '-', metodo: '-', total: '$0.00', estado: 'Sin datos' }]

    const transactionColumns = [
      { key: 'codigo', label: 'Código', align: 'left' as const },
      { key: 'ticket', label: 'Ticket', align: 'left' as const },
      { key: 'fecha', label: 'Fecha', align: 'left' as const },
      { key: 'metodo', label: 'Método', align: 'left' as const },
      { key: 'total', label: 'Total', align: 'right' as const },
      { key: 'estado', label: 'Estado', align: 'left' as const }
    ]
    const transactionWidths = [90, 82, 90, 74, 60, 72]
    const transactionTotalWidth = transactionWidths.reduce((sum, width) => sum + width, 0)

    drawTable({
      yPos: y,
      columns: transactionColumns,
      rows: transactionRows,
      columnWidths: transactionWidths,
      totalWidth: transactionTotalWidth,
      rowHeight: 18
    })

    const blob = pdf.output('blob')
    downloadFile(blob, filename)
  }

  /**
   * Descargar archivo
   */
  const downloadFile = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    window.URL.revokeObjectURL(url)
  }

  /**
   * Obtener resumen para gráficas
   */
  const getChartData = (reportType: 'hourly' | 'daily' | 'cashier' | 'product') => {
    if (!currentReport.value) return null

    switch (reportType) {
      case 'hourly':
        return {
          labels: Object.keys(currentReport.value.hourlyDistribution),
          datasets: [
            {
              label: 'Ventas por Hora',
              data: Object.values(currentReport.value.hourlyDistribution),
              backgroundColor: 'rgba(75, 192, 192, 0.6)'
            }
          ]
        }

      case 'daily':
        return {
          labels: Object.keys(currentReport.value.dailyDistribution),
          datasets: [
            {
              label: 'Ventas por Día',
              data: Object.values(currentReport.value.dailyDistribution),
              backgroundColor: 'rgba(255, 99, 132, 0.6)'
            }
          ]
        }

      case 'cashier':
        return {
          labels: currentReport.value.topCashiers.map(c => c.name),
          datasets: [
            {
              label: 'Ventas por Cajero',
              data: currentReport.value.topCashiers.map(c => c.sales),
              backgroundColor: 'rgba(54, 162, 235, 0.6)'
            }
          ]
        }

      case 'product':
        return {
          labels: currentReport.value.topProducts.map(p => p.name),
          datasets: [
            {
              label: 'Cantidad Vendida',
              data: currentReport.value.topProducts.map(p => p.quantity),
              backgroundColor: 'rgba(255, 206, 86, 0.6)'
            }
          ]
        }

      default:
        return null
    }
  }

  /**
   * Comparar periodos
   */
  const comparePeriods = async (period1: ReportFilter, period2: ReportFilter) => {
    const report1 = await generateReport(period1)
    const report2 = await generateReport(period2)

    return {
      period1: report1,
      period2: report2,
      comparison: {
        salesDiff: report2.totalSales - report1.totalSales,
        salesDiffPercent:
          report1.totalSales > 0
            ? ((report2.totalSales - report1.totalSales) / report1.totalSales) * 100
            : 0,
        transactionsDiff: report2.totalTransactions - report1.totalTransactions,
        ticketDiff: report2.averageTicket - report1.averageTicket
      }
    }
  }

  // Computed
  const reportSummary = computed(() => {
    if (!currentReport.value) return null

    return {
      totalSales: `$${currentReport.value.totalSales.toFixed(2)}`,
      transactionCount: currentReport.value.totalTransactions,
      averageTicket: `$${currentReport.value.averageTicket.toFixed(2)}`,
      topCashier: currentReport.value.topCashiers[0],
      topProduct: currentReport.value.topProducts[0]
    }
  })

  return {
    // Estado
    isGenerating,
    error,
    currentReport,
    filteredTransactions,
    filter,
    reportSummary,

    // Métodos de generación
    generateReport,
    generateDailyReport,
    generateMonthlyReport,

    // Métodos de exportación
    exportToJSON,
    exportToCSV,
    exportToPDF,

    // Métodos de análisis
    getChartData,
    comparePeriods,

    // Métodos de filtrado
    filterByDateRange,
    filterByCashier,
    applyFilters
  }
}
