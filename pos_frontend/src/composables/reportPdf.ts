export const formatDisplayMoney = (value: number | string | null | undefined): string => {
  const numericValue = Number(value ?? 0)
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(Number.isFinite(numericValue) ? numericValue : 0)
}

export const formatReportDate = (value: string | Date | null | undefined): string => {
  if (!value) return 'Sin fecha'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  const day = String(date.getUTCDate()).padStart(2, '0')
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const year = date.getUTCFullYear()
  const hour = String(date.getUTCHours()).padStart(2, '0')
  const minute = String(date.getUTCMinutes()).padStart(2, '0')

  return `${day}/${month}/${year} ${hour}:${minute}`
}

export const normalizeReportStatus = (value: string | null | undefined): string => {
  const normalized = String(value ?? '').trim().toLowerCase()

  if (!normalized) return 'Sin arqueo'

  const map: Record<string, string> = {
    completed: 'Completada',
    complete: 'Completada',
    pending: 'Pendiente',
    cancelled: 'Cancelada',
    cancelleds: 'Cancelada',
    failed: 'Fallida',
    cuadra: 'Cuadrada',
    cuadrada: 'Cuadrada',
    faltante: 'Faltante',
    sobrante: 'Sobrante',
    'sin arqueo': 'Sin arqueo',
    'sin_arqueo': 'Sin arqueo',
    'sin arqueado': 'Sin arqueo',
    'sin-arqueo': 'Sin arqueo'
  }

  return map[normalized] ?? String(value ?? '').replace(/_/g, ' ').replace(/^\w/, match => match.toUpperCase())
}

const resolvePaymentMethodKey = (paymentMethod?: string): string => {
  const normalized = String(paymentMethod ?? 'cash').trim().toLowerCase()

  if (['cash', 'efectivo', 'contado', 'dinero'].includes(normalized)) return 'cash'
  if (['card', 'tarjeta', 'credito', 'debito', 'visa', 'mastercard'].includes(normalized)) return 'card'
  if (['transfer', 'transferencia', 'qr', 'qrcode', 'qr transfer', 'qr / transferencia'].includes(normalized)) return 'transfer'
  if (['check', 'cheque'].includes(normalized)) return 'check'

  return 'other'
}

const resolvePaymentLabel = (paymentMethod: string): string => {
  switch (paymentMethod) {
    case 'cash': return 'Efectivo'
    case 'card': return 'Tarjeta'
    case 'transfer': return 'QR / Transferencia'
    case 'check': return 'Cheque'
    default: return 'Otros'
  }
}

export const summarizePaymentMethods = (transactions: Array<{ paymentMethod?: string; total?: number }>) => {
  const summary = new Map<string, { label: string; count: number; total: number }>()

  transactions.forEach(transaction => {
    const methodKey = resolvePaymentMethodKey(transaction.paymentMethod)
    const current = summary.get(methodKey) ?? { label: resolvePaymentLabel(methodKey), count: 0, total: 0 }

    current.count += 1
    current.total += Number(transaction.total ?? 0)
    summary.set(methodKey, current)
  })

  return Array.from(summary.values())
    .map(item => ({
      ...item,
      total: Number(item.total.toFixed(2))
    }))
    .sort((left, right) => right.total - left.total)
}
