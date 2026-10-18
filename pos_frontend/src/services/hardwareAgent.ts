const agentUrl = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_HARDWARE_AGENT_URL)
  ? import.meta.env.VITE_HARDWARE_AGENT_URL
  : 'http://127.0.0.1:18181'

const agentToken = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_HARDWARE_AGENT_TOKEN)
  ? String(import.meta.env.VITE_HARDWARE_AGENT_TOKEN)
  : ''
const mockEnabled = typeof import.meta !== 'undefined' && import.meta.env?.VITE_HARDWARE_AGENT_MOCK === 'true'

const mockHardware = {
  health: () => ({
    status: 'ok',
    connected: true,
    printer: {
      connected: true,
      name: 'Mock Epson TM-T20',
      model: 'Mock Printer',
      active: true
    },
    printers: [{
      id: 'mock-printer',
      name: 'Mock Epson TM-T20',
      model: 'Mock Printer',
      active: true,
      connected: true
    }],
    drawer: {
      connected: true,
      name: 'Mock Cash Drawer',
      active: true
    },
    simulated: true
  }),
  print: (payload?: Record<string, unknown>) => ({
    success: true,
    print: {
      ok: true,
      simulated: true,
      copies: payload?.ticket ? 1 : 0,
      document: payload?.ticket ? 'mock-ticket' : 'mock-document'
    },
    drawer: {
      ok: true,
      simulated: true,
      opened: Boolean(payload?.openDrawer)
    }
  }),
  drawer: () => ({
    ok: true,
    opened: true,
    simulated: true
  })
}

const agentRequest = async <T = any>(path: string, options: RequestInit = {}): Promise<T> => {
  try {
    const response = await fetch(`${agentUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(agentToken ? { 'X-Agent-Token': agentToken } : {}),
        ...(options.headers || {})
      }
    })

    const body = await response.json().catch(() => ({}))

    if (!response.ok || body.success === false) {
      const error = new Error(body.detail || body.error || body.message || 'El agente local no pudo completar la operación') as Error & { code?: string }
      error.code = body.error || body.code || body.message || 'AGENT_ERROR'
      throw error
    }

    return body as T
  } catch (error: any) {
    const reason = String(error?.message || '').toLowerCase()
    const fallback = reason.includes('fetch') || reason.includes('network') || reason.includes('offline') || reason.includes('failed to fetch') || reason.includes('connect')

    if (fallback && mockEnabled) {
      if (path === '/health') return mockHardware.health() as T
      if (path === '/print') return mockHardware.print(JSON.parse(String((options as any)?.body || '{}'))) as T
      if (path === '/drawer/open') return mockHardware.drawer() as T
      if (path === '/test/print') return mockHardware.print({ ticket: { saleId: 'mock-test', total: 0 }, openDrawer: true }) as T
    }

    if (fallback && !error?.code) error.code = 'AGENT_UNREACHABLE'
    throw error
  }
}

const buildTicketPayload = (sale: any) => ({
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

export const hardwareAgent = {
  async health() {
    return agentRequest('/health', {
      method: 'GET'
    })
  },

  async printTicket(ticket: Record<string, unknown>, options: { saleId?: string; type?: string; openDrawer?: boolean; source?: 'offline' | 'online' } = {}) {
    return agentRequest('/print', {
      method: 'POST',
      body: JSON.stringify({
        saleId: options.saleId,
        type: options.type || 'SALE',
        ...(options.source ? { source: options.source } : {}),
        ticket,
        openDrawer: !!options.openDrawer
      })
    })
  },

  async openDrawer() {
    return agentRequest('/drawer/open', {
      method: 'POST',
      body: JSON.stringify({})
    })
  },

  async readScale() {
    return agentRequest<{ weight?: number; weightGrams?: number; weightKg?: number; grams?: number; unit?: string; stable?: boolean }>('/scale/weight', {
      method: 'GET'
    })
  },

  async testPrint() {
    return agentRequest('/test/print', {
      method: 'POST',
      body: JSON.stringify({
        ticket: {
          saleId: 'MOCK-TEST',
          total: 0,
          items: [{ name: 'Prueba de impresión', quantity: 1, price: 0, total: 0 }],
          footer: 'Prueba local - agente simulado'
        },
        openDrawer: true
      })
    })
  }
}

export const printSaleTicket = async (sale: any, paymentMethod?: string) => {
  const isCashPayment = ['cash', 'efectivo', 'money'].includes(String(paymentMethod || sale?.paymentMethod || '').toLowerCase())

  const ticket = buildTicketPayload(sale)

  try {
    const result = await hardwareAgent.printTicket(ticket, {
      saleId: sale?.codigoTransaccion || sale?.id,
      type: 'SALE',
      openDrawer: isCashPayment
    })

    return {
      success: result?.print?.ok === true,
      status: result?.print?.ok === true ? 'printed' : 'failed',
      result,
      error: result?.print?.ok === true && result?.drawer?.ok === false ? 'DRAWER_OPEN_FAILED' : null
    }
  } catch (error: any) {
    return {
      success: false,
      status: 'failed',
      result: null,
      error: error.code || error.message || 'AGENT_ERROR'
    }
  }
}
