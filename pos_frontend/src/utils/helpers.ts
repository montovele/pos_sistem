export const SUPPORTED_INVENTORY_UNITS = ['PZA', 'KG', 'LT', 'CAJA', 'M', 'ROLLO', 'L', 'PAQUETE', 'ML', 'PAR'] as const

export const normalizeInventoryUnit = (value: unknown): typeof SUPPORTED_INVENTORY_UNITS[number] => {
  const raw = String(value ?? '').trim().toUpperCase()
  if (!raw) return 'PZA'

  const aliases: Record<string, typeof SUPPORTED_INVENTORY_UNITS[number]> = {
    'PIEZA': 'PZA',
    'PIEZAS': 'PZA',
    'PZA': 'PZA',
    'UNIDAD': 'PZA',
    'UNIDADES': 'PZA',
    'KG': 'KG',
    'KILO': 'KG',
    'KILOS': 'KG',
    'KILOGRAMO': 'KG',
    'KILOGRAMOS': 'KG',
    'G': 'KG',
    'GR': 'KG',
    'GRAMO': 'KG',
    'GRAMOS': 'KG',
    'LITRO': 'LT',
    'LITROS': 'LT',
    'LT': 'LT',
    'L': 'LT',
    'CAJA': 'CAJA',
    'CAJAS': 'CAJA',
    'METRO': 'M',
    'METROS': 'M',
    'M': 'M',
    'ROLLO': 'ROLLO',
    'ROLLOS': 'ROLLO',
    'PAQUETE': 'PAQUETE',
    'PAQUETES': 'PAQUETE',
    'PAR': 'PAR',
    'PARES': 'PAR',
    'ML': 'ML',
    'MILILITRO': 'ML',
    'MILILITROS': 'ML'
  }

  return aliases[raw] ?? 'PZA'
}

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: 'MXN'
  }).format(value)
}

export const formatDate = (date: Date | string): string => {
  const d = new Date(date)
  return new Intl.DateTimeFormat('es-MX').format(d)
}

export const formatDateTime = (date: Date | string): string => {
  const d = new Date(date)
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(d)
}

export const generateTransactionCode = (): string => {
  return `TRX-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`
}

export const generateTicketCode = (): string => {
  return `TKT-${Math.random().toString(36).substring(2, 9).toUpperCase()}`
}

export const calculateLineDiscount = (price: number, quantity: number, discountRate = 0): number => {
  return Number((((price * quantity) * Number(discountRate || 0)) / 100).toFixed(2))
}

export const calculateSaleTotals = (items: any[] = [], saleDiscountPercent = 0) => {
  const subtotal = items.reduce((sum, item) => {
    const unitPrice = Number(item?.price ?? item?.product?.price ?? 0)
    const quantity = Number(item?.quantity ?? 1)
    return sum + (unitPrice * quantity)
  }, 0)

  const lineDiscount = items.reduce((sum, item) => {
    const unitPrice = Number(item?.price ?? item?.product?.price ?? 0)
    const quantity = Number(item?.quantity ?? 1)
    const discountRate = Number(item?.discountRate ?? item?.product?.discountRate ?? 0)
    return sum + calculateLineDiscount(unitPrice, quantity, discountRate)
  }, 0)

  const globalDiscountPercent = Number(saleDiscountPercent || 0)
  const globalDiscount = subtotal * (globalDiscountPercent / 100)
  const discountedSubtotal = Math.max(0, subtotal - lineDiscount - globalDiscount)

  return {
    subtotal: Number(subtotal.toFixed(2)),
    lineDiscount: Number(lineDiscount.toFixed(2)),
    globalDiscount: Number(globalDiscount.toFixed(2)),
    total: Number(discountedSubtotal.toFixed(2))
  }
}

export const normalizeSaleItem = (item: any) => {
  const product = item?.product ?? {}
  const quantity = Number(item?.quantity ?? 1)
  const price = Number(item?.price ?? product.price ?? 0)
  const discountRate = Number(item?.discountRate ?? product.discountRate ?? 0)
  const subtotal = Number((price * quantity).toFixed(2))
  const discount = Number(calculateLineDiscount(price, quantity, discountRate).toFixed(2))

  return {
    productId: Number(item?.productId ?? product.id ?? 0),
    codigoProd: item?.codigoProd ?? product.codigoProd ?? '',
    nombreProd: item?.nombreProd ?? product.nombreProd ?? '',
    quantity,
    price,
    discountRate,
    subtotal,
    discount,
    total: Number((subtotal - discount).toFixed(2))
  }
}

const normalizeUnitValue = (value: unknown): string => {
  if (value === null || value === undefined) return ''

  if (typeof value === 'object') {
    const objectValue = value as Record<string, unknown>
    return normalizeUnitValue(
      objectValue.code ??
      objectValue.codigo ??
      objectValue.name ??
      objectValue.nombre ??
      objectValue.value ??
      objectValue.label ??
      objectValue.unit ??
      objectValue.unidad ??
      objectValue.medida ??
      objectValue.descripcion
    )
  }

  return String(value).trim().toLowerCase().replace(/[_\s.-]+/g, '')
}

const hasTruthyFlag = (value: unknown): boolean => {
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value === 1
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return ['true', 'yes', 'si', '1', 'kg', 'g', 'gramos', 'kilo', 'kilogramos', 'peso'].includes(normalized)
  }
  return false
}

const hasWeightTextSignal = (product: any): boolean => {
  const textSource = [
    product?.nombreProd,
    product?.name,
    product?.descripcion,
    product?.description,
    product?.detalle,
    product?.comentario,
    product?.unit?.name,
    product?.unit?.nombre,
    product?.unit?.label,
    product?.unidad,
    product?.unidadMedida,
    product?.tipoUnidad,
    product?.categoria,
    product?.category,
    product?.venta,
    product?.tipoVenta,
    product?.tipo_venta,
    product?.ventaPorPeso,
    product?.venta_por_peso,
    product?.esPesable,
    product?.es_pesable
  ].join(' ')

  const normalized = String(textSource || '').toLowerCase()
  const strongWeightPatterns = [
    /vendida por peso|venta por peso|vendido por peso|precio por kg|por kilogramo|por kilo|por gramos|por gramos|kg\b|kilogram|kilo\b|gramos?\b/, 
    /venta.*kg|kg.*venta|peso.*kg|kg.*peso/
  ]

  return strongWeightPatterns.some(pattern => pattern.test(normalized))
}

const collectUnitCandidates = (product: any): string[] => {
  const metadata = product?.unit && typeof product.unit === 'object' ? product.unit : {}
  const directValues = [
    product?.unit,
    product?.unidad,
    product?.unitType,
    product?.tipoUnidad,
    product?.unidadMedida,
    product?.unidadVenta,
    product?.sellingUnit,
    product?.weightUnit,
    product?.unitMeasure,
    product?.unitOfMeasure,
    product?.measurementUnit,
    product?.unidad_medida,
    product?.unidad_medida_codigo,
    product?.tipo_unidad,
    product?.tipoVenta,
    product?.tipo_venta,
    product?.unidadComercial,
    metadata.code,
    metadata.codigo,
    metadata.name,
    metadata.nombre,
    metadata.value,
    metadata.label,
    product?.u,
    product?.um,
    product?.unidadCompra,
    product?.medida,
    product?.tipoMedida,
    product?.weight,
    product?.peso
  ]

  return directValues
    .filter(value => value !== null && value !== undefined)
    .map(value => normalizeUnitValue(value))
    .filter(Boolean)
}

export const getProductUnit = (product: any): 'KG' | 'PZA' => {
  const weightTokens = new Set([
    'kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos',
    'g', 'gr', 'gram', 'gramo', 'gramos'
  ])
  const pieceTokens = new Set(['pza', 'pieza', 'pzas', 'pz', 'unidad', 'unidades'])

  const unitCandidates = collectUnitCandidates(product)
  const explicitWeightUnit = unitCandidates.some(value => weightTokens.has(value))
  const explicitPieceUnit = unitCandidates.some(value => pieceTokens.has(value))

  if (explicitWeightUnit) return 'KG'
  if (explicitPieceUnit) return 'PZA'

  const hasWeightFlag = [
    product?.saleByWeight,
    product?.soldByWeight,
    product?.isWeighted,
    product?.weighable,
    product?.weightBased,
    product?.ventaPorPeso,
    product?.venta_por_peso,
    product?.is_weighted,
    product?.weight_based,
    product?.esPesable,
    product?.es_pesable,
    product?.porPeso,
    product?.por_peso,
    product?.sale_by_weight,
    product?.sold_by_weight,
    product?.unit?.saleByWeight,
    product?.unit?.soldByWeight,
    product?.unit?.isWeighted,
    product?.unit?.weighable
  ].some(hasTruthyFlag)

  if (hasWeightFlag) return 'KG'

  const hasWeightText = hasWeightTextSignal(product)
  if (hasWeightText) return 'KG'

  return 'PZA'
}

export const isWeightedProduct = (product: any): boolean => {
  if (!product) return false

  const unitCandidates = collectUnitCandidates(product)
  const weightTokens = new Set([
    'kg', 'kilo', 'kilos', 'kilogramo', 'kilogramos',
    'g', 'gr', 'gram', 'gramo', 'gramos'
  ])

  const hasWeightUnit = unitCandidates.some(value => weightTokens.has(value))
  const saleByWeight = [
    product?.saleByWeight,
    product?.soldByWeight,
    product?.ventaPorPeso,
    product?.venta_por_peso,
    product?.esPesable,
    product?.es_pesable,
    product?.sale_by_weight,
    product?.sold_by_weight,
    product?.unit?.saleByWeight,
    product?.unit?.soldByWeight,
    product?.unit?.isWeighted,
    product?.unit?.weighable
  ].some(hasTruthyFlag)

  return getProductUnit(product) === 'KG' || hasWeightUnit || saleByWeight
}

export const getProductPrice = (product: any): number => Number(
  product?.price ??
  product?.priceTot ??
  product?.precio ??
  product?.precioVenta ??
  product?.precioUnitario ??
  0
)

export const validateEmail = (email: string): boolean => {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return re.test(email)
}

export const validateProductCode = (code: string): boolean => {
  return code.length > 0 && code.length <= 50
}
