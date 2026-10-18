import type { Product, PaginatedResponse } from '@/types'
import { normalizeInventoryUnit } from '@/utils/helpers'
import http from './http'

const PRODUCT_CACHE_KEY = 'pos_product_cache_v1'

class ProductService {
  private readCache(): Product[] {
    try {
      const raw = localStorage.getItem(PRODUCT_CACHE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  private writeCache(items: Product[]): void {
    try {
      const current = this.readCache()
      const merged = [...current]

      items.forEach((item) => {
        const itemId = Number(item?.id ?? 0)
        const index = merged.findIndex((existing) => {
          const existingId = Number(existing?.id ?? 0)
          const sameId = itemId > 0 && existingId > 0 && existingId === itemId
          if (sameId) return true
          return String(existing?.codigoProd || '').toLowerCase() === String(item?.codigoProd || '').toLowerCase()
        })

        if (index >= 0) {
          merged[index] = { ...merged[index], ...item }
        } else {
          merged.push(item)
        }
      })

      localStorage.setItem(PRODUCT_CACHE_KEY, JSON.stringify(merged))
    } catch {
      // ignore storage quota errors and keep the app functional in offline mode
    }
  }

  private buildCachedPaginatedResponse(query: string, page: number, perPage: number): PaginatedResponse<Product> {
    const cache = this.readCache()
    const safeQuery = String(query || '').trim().toLowerCase()
    const filtered = safeQuery
      ? cache.filter((product) => {
          const haystack = `${product?.codigoProd ?? ''} ${product?.nombreProd ?? ''} ${product?.codigoAltern ?? ''}`.toLowerCase()
          return haystack.includes(safeQuery)
        })
      : cache

    const total = filtered.length
    const totalPages = Math.max(1, Math.ceil(total / Math.max(1, perPage)))
    const currentPage = Math.min(Math.max(1, page), totalPages)
    const start = (currentPage - 1) * Math.max(1, perPage)
    const data = filtered.slice(start, start + Math.max(1, perPage))

    return {
      data,
      total,
      page: currentPage,
      perPage: Math.max(1, perPage),
      totalPages
    }
  }
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

  private isInventoryItemLike(item: any): boolean {
    if (!item || typeof item !== 'object') return false
    return (
      'sku' in item ||
      'name' in item ||
      'warehouse' in item ||
      'organizationId' in item
    ) && !('codigoProd' in item || 'nombreProd' in item)
  }

  private mapInventoryItemToProduct(item: any): Product {
    const normalizedUnit = normalizeInventoryUnit(item?.unit ?? item?.unidad ?? 'PZA')

    return {
      id: Number(item?.productId ?? item?.id ?? 0),
      codigoProd: String(item?.sku ?? item?.codigoProd ?? item?.codigo ?? item?.id ?? 'SIN-CODIGO'),
      codigoAltern: item?.barcode ? String(item.barcode) : undefined,
      nombreProd: String(item?.name ?? item?.nombreProd ?? item?.nombre ?? 'Producto sin nombre'),
      price: Number(item?.price ?? item?.precio ?? item?.precioVenta ?? 0),
      stock: Number(item?.stock ?? 0),
      org_id: Number(item?.organizationId ?? item?.org_id ?? 0),
      id_category: Number(item?.categoryId ?? item?.id_category ?? 0),
      description: item?.description ?? item?.descripcion ?? '',
      image: item?.image ?? '',
      category: String(item?.category ?? item?.categoria ?? 'Otros'),
      cost: Number(item?.cost ?? item?.costo ?? 0),
      unit: normalizedUnit,
      saleByWeight: normalizedUnit === 'KG',
      lowStockThreshold: Number(item?.minStock ?? item?.stockMinimo ?? 0),
      active: item?.active ?? true,
      discountRate: Number(item?.discountRate ?? 0),
      taxRate: Number(item?.taxRate ?? 0)
    }
  }

  private toPaginatedResponse(response: any, page: number, perPage: number): PaginatedResponse<Product> {
    const envelope = response?.success === true ? response : null
    const payload = envelope?.data ?? response?.data ?? response
    const result = Array.isArray(payload) ? payload : (payload ?? {})
    const items = Array.isArray(result)
      ? result
      : Array.isArray(result.items)
        ? result.items
        : Array.isArray(result.data)
          ? result.data
          : Array.isArray(result.rows)
            ? result.rows
            : []

    const normalizedItems = items.map((item) => this.isInventoryItemLike(item) ? this.mapInventoryItemToProduct(item) : item as Product)
    const total = Number(envelope?.total ?? result?.total ?? normalizedItems.length)
    const resolvedPerPage = Number(envelope?.perPage ?? result?.perPage ?? perPage)

    return {
      data: normalizedItems as Product[],
      total,
      page: Number(envelope?.page ?? result?.page ?? page),
      perPage: resolvedPerPage,
      totalPages: Number(envelope?.totalPages ?? result?.totalPages ?? Math.max(1, Math.ceil(total / resolvedPerPage)))
    }
  }

  private async getInventoryFallback(page: number, perPage: number, search = ''): Promise<PaginatedResponse<Product>> {
    const response: any = await http.get('/inventario', {
      params: {
        search: search.trim() || undefined,
        page,
        perPage
      }
    })

    const payload = response?.success === true ? response : response
    const data = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : []
    const meta = payload?.meta ?? {}

    return {
      data: data.map((item: any) => this.mapInventoryItemToProduct(item)),
      total: Number(meta.total ?? data.length ?? 0),
      page: Number(meta.page ?? page),
      perPage: Number(meta.perPage ?? perPage),
      totalPages: Number(meta.totalPages ?? Math.max(1, Math.ceil((Number(meta.total ?? data.length ?? 0)) / Number(meta.perPage ?? perPage))))
    }
  }

  /**
   * Obtener productos con paginación
   * @param page Número de página (default 1)
   * @param perPage Cantidad por página (default 50)
   */
  async getProducts(page = 1, perPage = 50): Promise<PaginatedResponse<Product>> {
    console.log('[ProductService] getProducts request', { page, perPage })
    try {
      const response: any = await http.get('/products', {
        params: { page, perPage }
      })

      console.log('[ProductService] getProducts raw response', response)
      const paginated = this.toPaginatedResponse(response, page, perPage)
      if (paginated.data.length > 0) {
        this.writeCache(paginated.data)
        return paginated
      }

      const cached = this.buildCachedPaginatedResponse('', page, perPage)
      if (cached.data.length > 0) return cached

      return this.getInventoryFallback(page, perPage)
    } catch (error) {
      console.warn('[ProductService] getProducts fallback to inventory', error)
      const cached = this.buildCachedPaginatedResponse('', page, perPage)
      if (cached.data.length > 0) return cached
      return this.getInventoryFallback(page, perPage)
    }
  }

  /**
   * Obtener producto por ID
   */
  async getProductById(id: number): Promise<Product> {
    console.log('[ProductService] getProductById request', { id })
    const response: any = await http.get(`/products/${id}`)
    console.log('[ProductService] getProductById response', response)
    return this.unwrapPayload<Product>(response)
  }

  /**
   * Buscar producto por código
   * @param code Código del producto
   */
  async getProductByCode(code: string): Promise<Product> {
    console.log('[ProductService] getProductByCode request', { code })
    const normalizedCode = String(code || '').trim()

    try {
      const response: any = await http.get('/products/by-code', {
        params: { code: normalizedCode }
      })
      console.log('[ProductService] getProductByCode response', response)
      const payload = this.unwrapPayload<Product>(response)
      if (!payload) {
        throw new Error('Producto no encontrado')
      }

      if (payload && typeof payload === 'object') {
        this.writeCache([payload as Product])
      }

      return payload as Product
    } catch (error) {
      const cache = this.readCache()
      const match = cache.find((product) => {
        const target = String(product.codigoProd || '').toLowerCase()
        const alt = String(product.codigoAltern || '').toLowerCase()
        return target === normalizedCode.toLowerCase() || alt === normalizedCode.toLowerCase()
      })

      if (match) return match

      throw error instanceof Error ? error : new Error('Producto no encontrado')
    }
  }

  /**
   * Buscar productos por nombre o código
   * @param query Término de búsqueda
   */
  async searchProducts(query: string, page = 1, perPage = 50): Promise<PaginatedResponse<Product>> {
    console.log('[ProductService] searchProducts request', { query, page, perPage })
    try {
      const response: any = await http.get('/products', {
        params: { search: query, page, perPage }
      })
      console.log('[ProductService] searchProducts response', response)
      const paginated = this.toPaginatedResponse(response, page, perPage)
      if (paginated.data.length > 0) {
        this.writeCache(paginated.data)
        return paginated
      }

      const cached = this.buildCachedPaginatedResponse(query, page, perPage)
      if (cached.data.length > 0) return cached

      return this.getInventoryFallback(page, perPage, query)
    } catch (error) {
      try {
        const response: any = await http.get('/products/search', {
          params: { q: query, search: query, page, perPage }
        })
        console.log('[ProductService] searchProducts fallback response', response)
        const paginated = this.toPaginatedResponse(response, page, perPage)
        if (paginated.data.length > 0) {
          this.writeCache(paginated.data)
          return paginated
        }
      } catch {
        // fallback final a inventario
      }

      const cached = this.buildCachedPaginatedResponse(query, page, perPage)
      if (cached.data.length > 0) return cached

      return this.getInventoryFallback(page, perPage, query)
    }
  }

  /**
   * Obtener productos por categoría
   * @param categoryId ID de la categoría
   */
  async getProductsByCategory(categoryId: number): Promise<Product[]> {
    console.log('[ProductService] getProductsByCategory request', { categoryId })
    const response: any = await http.get(`/products/category/${categoryId}`)
    console.log('[ProductService] getProductsByCategory response', response)
    const payload = this.unwrapPayload<any>(response)
    const result = Array.isArray(payload) ? payload : (payload ?? {})
    const items = Array.isArray(result?.items)
      ? result.items
      : Array.isArray(result?.data)
        ? result.data
        : []

    if (!items.length && !Array.isArray(payload)) {
      throw new Error('Error al obtener productos')
    }

    return items
  }

  /**
   * Actualizar información del producto
   * @param id ID del producto
   * @param data Datos a actualizar
   */
  async updateProduct(id: number, data: Partial<Product>): Promise<Product> {
    console.log('[ProductService] updateProduct request', { id, data })
    const response: any = await http.put(`/products/${id}`, data)
    console.log('[ProductService] updateProduct response', response)
    return this.unwrapPayload<Product>(response)
  }
}

export default new ProductService()
