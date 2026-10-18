import http from './http'
import { hardwareAgent } from './hardwareAgent'
import { dbManager } from '@/db/indexedDB'
import type { PendingTransaction } from '@/types'

const isCashPayment = (paymentMethod?: string) =>
  ['cash', 'efectivo', 'money'].includes(String(paymentMethod || '').toLowerCase())

const isNetworkError = (error: any) =>
  !navigator.onLine ||
  /network|offline|failed to fetch|fetch|timeout|ERR_NETWORK|ECONNABORTED/i.test(String(error?.message || error || '')) ||
  (Number(error?.status ?? error?.response?.status) >= 500 && Number(error?.status ?? error?.response?.status) <= 599)

const printSucceeded = (result: any) => result?.printStatus === 'printed' || result?.print?.ok === true

const getDrawerStatus = (result: any, requested: boolean) => {
  if (!requested) return 'skipped'
  if (['opened', 'skipped', 'failed'].includes(result?.drawerStatus)) return result.drawerStatus
  if (result?.drawer?.ok === true) return 'opened'
  if (result?.drawer?.ok === false) return 'failed'
  return 'pending'
}

const getDeviceId = () => {
  const key = 'pos_device_id'
  const current = localStorage.getItem(key)
  if (current) return current

  const deviceId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  localStorage.setItem(key, deviceId)
  return deviceId
}

const createClientTransactionId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `sale-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

const toPlainSaleItems = (items: any[] = []) => items.map((item: any) => {
  const product = item?.product || {}
  const quantity = Number(item?.quantity ?? 0)
  const price = Number(item?.price ?? product?.price ?? 0)
  const subtotal = Number(item?.subtotal ?? item?.total ?? price * quantity)

  return {
    id: item?.id ?? product?.id ?? null,
    productId: item?.productId ?? product?.id ?? null,
    codigoProd: item?.codigoProd ?? product?.codigoProd ?? '',
    nombreProd: item?.nombreProd ?? product?.nombreProd ?? product?.name ?? 'Producto',
    quantity: Number.isFinite(quantity) ? quantity : 0,
    unit: item?.unit ?? product?.unit ?? 'PZA',
    price: Number.isFinite(price) ? price : 0,
    subtotal: Number.isFinite(subtotal) ? subtotal : 0,
    total: Number.isFinite(subtotal) ? subtotal : 0,
    discountRate: Number(item?.discountRate ?? product?.discountRate ?? 0) || 0,
    saleByWeight: Boolean(item?.saleByWeight ?? product?.saleByWeight)
  }
})

const savePendingSale = async (payload: any, clientTransactionId: string) => {
  const timestamp = new Date().toISOString()
  const deviceId = getDeviceId()
  const normalizedPayload = {
    ...payload,
    items: payload.items ?? [],
    total: Number(payload.total ?? 0),
    discount: Number(payload.discount ?? 0),
    paymentMethod: payload.paymentMethod ?? 'cash',
    employeeNumber: payload.employeeNumber,
    customer: payload.customer ?? { nombre: 'Consumidor final' },
    clientTransactionId,
    deviceId,
    createdAt: timestamp
  }

  const pending: PendingTransaction = {
    id: clientTransactionId,
    clientTransactionId,
    deviceId,
    codigoTransaccion: `LOCAL-${clientTransactionId.slice(0, 8).toUpperCase()}`,
    codigoTicket: `TICKET-LOCAL-${clientTransactionId.slice(0, 8).toUpperCase()}`,
    fechaDeTrans: timestamp,
    items: normalizedPayload.items,
    total: Number(normalizedPayload.total ?? 0),
    discount: Number(normalizedPayload.discount ?? 0),
    paymentMethod: normalizedPayload.paymentMethod ?? 'cash',
    employeeNumber: normalizedPayload.employeeNumber,
    customer: normalizedPayload.customer ?? { nombre: 'Consumidor final' },
    status: 'pending',
    syncStatus: 'pending',
    printStatus: 'pending',
    drawerStatus: 'pending',
    attempts: 0,
    timestamp: Date.now(),
    payload: normalizedPayload
  }

  await dbManager.addItem('pendingTransactions', pending)
  return pending
}

const saleToTicket = (sale: any) => ({
  storeName: 'LEMARQUET POS',
  folio: sale?.codigoTicket || sale?.codigoTransaccion || 'TICKET',
  saleId: sale?.codigoTransaccion || sale?.id || 'POS-SALE',
  date: sale?.fechaDeTrans || new Date().toISOString(),
  customerName: sale?.customer?.nombre || sale?.cliente?.nombre || 'Público general',
  items: (sale?.items || []).map((item: any) => ({
    name: item?.nombreProd || item?.nombre || item?.name || 'Producto',
    quantity: Number(item?.quantity ?? 1),
    price: Number(item?.unitPrice ?? item?.price ?? 0),
    total: Number(item?.total ?? item?.subtotal ?? 0)
  })),
  subtotal: Number(sale?.subtotal ?? sale?.total ?? 0),
  tax: Number(sale?.tax ?? sale?.impuestos ?? 0),
  total: Number(sale?.total ?? 0),
  paymentMethod: sale?.paymentMethod || 'cash',
  footer: 'Gracias por su compra'
})

export async function createSaleAndPrint(payload: any) {
  const clientTransactionId = payload.clientTransactionId || createClientTransactionId()
  const items = toPlainSaleItems(Array.isArray(payload.items) ? payload.items : [])
  const total = Number(payload.total ?? 0)

  if (items.length === 0) {
    throw new Error('La venta debe contener al menos un producto')
  }

  if (!Number.isFinite(total) || total < 0) {
    throw new Error('El total de la venta no es válido')
  }

  const requestPayload = {
    items,
    total,
    discount: Number(payload.discount ?? 0),
    paymentMethod: payload.paymentMethod ?? 'cash',
    employeeNumber: payload.employeeNumber,
    customer: payload.customer ?? { nombre: 'Consumidor final' },
    clientTransactionId,
    deviceId: getDeviceId(),
    createdAt: new Date().toISOString()
  }

  let response: any

  try {
    response = await http.post('/transactions', requestPayload)
  } catch (error: any) {
    if (!isNetworkError(error)) throw error

    const pending = await savePendingSale(requestPayload, clientTransactionId)
    pending.lastError = error?.message || 'Servidor no disponible; venta guardada para sincronizar'
    await dbManager.addItem('pendingTransactions', pending)
    let printResponse: any = null
    let printError: any = null

    try {
      printResponse = await hardwareAgent.printTicket(saleToTicket(pending), {
        saleId: pending.codigoTransaccion,
        type: 'SALE',
        source: 'offline',
        openDrawer: isCashPayment(requestPayload.paymentMethod)
      })
    } catch (agentError: any) {
      printError = agentError
    }

    pending.printStatus = printSucceeded(printResponse) ? 'printed' : 'unknown'
    pending.drawerStatus = getDrawerStatus(printResponse, isCashPayment(requestPayload.paymentMethod))
    pending.printError = printError?.code || printError?.message || undefined
    pending.printedAt = pending.printStatus === 'printed' ? new Date().toISOString() : undefined
    await dbManager.addItem('pendingTransactions', pending)

    return {
      sale: pending,
      offline: true,
      print: {
        success: printSucceeded(printResponse),
        status: printSucceeded(printResponse) ? 'printed' : 'failed',
        drawer: printResponse?.drawer ?? null,
        error: printError?.code || printError?.message || 'PRINT_FAILED'
      }
    }
  }

  const sale = response?.data ?? response
  const persistedSale = {
    ...sale,
    syncStatus: 'synced' as const,
    printStatus: 'pending' as const,
    drawerStatus: 'pending' as const
  }
  await dbManager.addItem('transactions', persistedSale)

  try {
    const cashPayment = isCashPayment(sale?.paymentMethod || payload.paymentMethod)
    const printResponse = await hardwareAgent.printTicket(saleToTicket(sale), {
      saleId: sale?.codigoTransaccion || sale?.id,
      type: 'SALE',
      source: 'online',
      openDrawer: cashPayment
    })
    const printStatus = printSucceeded(printResponse) ? 'printed' : 'unknown'
    const drawerStatus = getDrawerStatus(printResponse, cashPayment)
    const printError = printStatus === 'printed'
      ? (drawerStatus === 'failed' ? 'DRAWER_OPEN_FAILED' : undefined)
      : (printResponse?.error || 'PRINT_FAILED')
    await dbManager.addItem('transactions', {
      ...persistedSale,
      printStatus,
      drawerStatus,
      printError,
      printedAt: printStatus === 'printed' ? new Date().toISOString() : undefined
    })

    return {
      sale,
      print: {
        success: printStatus === 'printed',
        status: printStatus === 'printed' ? 'printed' : 'failed',
        drawer: printResponse?.drawer ?? null,
        error: printError || null
      }
    }
  } catch (error: any) {
    await dbManager.addItem('transactions', {
      ...persistedSale,
      printStatus: 'unknown',
      drawerStatus: isCashPayment(sale?.paymentMethod || payload.paymentMethod) ? 'pending' : 'skipped',
      printError: error?.code || error?.message || 'AGENT_ERROR'
    })
    return {
      sale,
      print: {
        success: false,
        status: 'failed',
        drawer: null,
        error: error?.code || error?.message || 'AGENT_ERROR'
      }
    }
  }
}

export async function reprintSale(sale: any) {
  return hardwareAgent.printTicket(saleToTicket(sale), {
    saleId: sale?.codigoTransaccion || sale?.id,
    type: 'REPRINT',
    openDrawer: false
  })
}

export async function checkHardware() {
  try {
    const health = await hardwareAgent.health()
    return {
      connected: health?.status === 'ok',
      printers: health?.printers || [],
      error: null
    }
  } catch (error) {
    return {
      connected: false,
      printers: [],
      error: 'HARDWARE_AGENT_OFFLINE'
    }
  }
}
