import { ref, computed } from 'vue'
import { useProductStore } from '@/stores/productStore'
import { useIndexedDB } from '@/db/indexedDB'
import type { Product } from '@/types'

export interface SearchHistory {
  id: string
  query: string
  type: 'code' | 'name' | 'all'
  timestamp: string
  resultCount: number
}

export interface SavedSearch {
  id: string
  name: string
  query: string
  type: 'code' | 'name' | 'all'
  category?: number
  createdAt: string
  lastUsed?: string
  frequency: number
}

export const useProductSearch = () => {
  const productStore = useProductStore()
  const { dbManager } = useIndexedDB()

  // Estado base
  const searchQuery = ref('')
  const searchType = ref<'code' | 'name' | 'all'>('all')
  const selectedCategory = ref<number | null>(null)
  const debounceTimer = ref<ReturnType<typeof setTimeout> | null>(null)

  // Historial y búsquedas guardadas
  const searchHistory = ref<SearchHistory[]>([])
  const savedSearches = ref<SavedSearch[]>([])
  const maxHistoryItems = 20
  const debounceMs = 400

  /**
   * Cargar historial desde IndexedDB
   */
  const loadSearchHistory = async () => {
    try {
      const history = await dbManager.getAllItems('searchHistory')
      if (history) {
        searchHistory.value = history.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
      }
    } catch (error) {
      console.error('Error cargando historial:', error)
    }
  }

  /**
   * Cargar búsquedas guardadas desde IndexedDB
   */
  const loadSavedSearches = async () => {
    try {
      const saved = await dbManager.getAllItems('savedSearches')
      if (saved) {
        savedSearches.value = saved.sort((a, b) => b.frequency - a.frequency)
      }
    } catch (error) {
      console.error('Error cargando búsquedas guardadas:', error)
    }
  }

  /**
   * Registrar búsqueda en historial
   */
  const recordSearch = async (query: string, type: 'code' | 'name' | 'all', resultCount: number) => {
    const entry: SearchHistory = {
      id: `${Date.now()}-${Math.random()}`,
      query,
      type,
      timestamp: new Date().toISOString(),
      resultCount
    }

    searchHistory.value.unshift(entry)

    // Mantener solo últimas 20
    if (searchHistory.value.length > maxHistoryItems) {
      searchHistory.value = searchHistory.value.slice(0, maxHistoryItems)
    }

    // Guardar en IndexedDB
    try {
      await dbManager.addItem('searchHistory', entry)
    } catch (error) {
      console.error('Error guardando en historial:', error)
    }
  }

  /**
   * Guardar búsqueda actual como favorita
   */
  const saveSearch = async (name: string) => {
    const saved: SavedSearch = {
      id: `${Date.now()}-${Math.random()}`,
      name,
      query: searchQuery.value,
      type: searchType.value,
      category: selectedCategory.value || undefined,
      createdAt: new Date().toISOString(),
      frequency: 1
    }

    savedSearches.value.push(saved)

    // Guardar en IndexedDB
    try {
      await dbManager.addItem('savedSearches', saved)
    } catch (error) {
      console.error('Error guardando búsqueda:', error)
    }

    console.log(`✅ Búsqueda guardada: ${name}`)
    return saved
  }

  /**
   * Eliminar búsqueda guardada
   */
  const deleteSavedSearch = async (id: string) => {
    const idx = savedSearches.value.findIndex(s => s.id === id)
    if (idx > -1) {
      savedSearches.value.splice(idx, 1)

      try {
        await dbManager.deleteItem('savedSearches', id)
      } catch (error) {
        console.error('Error eliminando búsqueda:', error)
      }
    }
  }

  /**
   * Cargar búsqueda guardada
   */
  const loadSavedSearch = async (id: string) => {
    const saved = savedSearches.value.find(s => s.id === id)
    if (!saved) return false

    searchQuery.value = saved.query
    searchType.value = saved.type
    selectedCategory.value = saved.category || null

    // Actualizar frecuencia y último uso
    saved.frequency++
    saved.lastUsed = new Date().toISOString()

    try {
      await dbManager.updateItem('savedSearches', id, saved)
    } catch (error) {
      console.error('Error actualizando búsqueda:', error)
    }

    console.log(`✅ Búsqueda cargada: ${saved.name}`)
    return true
  }

  /**
   * Limpiar historial
   */
  const clearSearchHistory = async () => {
    searchHistory.value = []
    try {
      await dbManager.clearStore('searchHistory')
    } catch (error) {
      console.error('Error limpiando historial:', error)
    }
  }

  // Resultados filtrados localmente
  const filteredProducts = computed(() => {
    let results = productStore.products

    // Filtrar por búsqueda
    if (searchQuery.value.trim()) {
      const query = searchQuery.value.toLowerCase()

      results = results.filter(product => {
        switch (searchType.value) {
          case 'code':
            return (
              product.codigoProd?.toLowerCase().includes(query) ||
              product.codigoAltern?.toLowerCase().includes(query)
            )
          case 'name':
            return product.nombreProd.toLowerCase().includes(query)
          case 'all':
          default:
            return (
              product.codigoProd?.toLowerCase().includes(query) ||
              product.codigoAltern?.toLowerCase().includes(query) ||
              product.nombreProd.toLowerCase().includes(query)
            )
        }
      })
    }

    // Filtrar por categoría
    if (selectedCategory.value !== null) {
      results = results.filter(product => product.id_category === selectedCategory.value)
    }

    return results
  })

  /**
   * Búsqueda con debounce mejorado
   */
  const search = (query: string) => {
    searchQuery.value = query

    // Cancelar timeout anterior
    if (debounceTimer.value) {
      clearTimeout(debounceTimer.value)
    }

    // Esperar antes de buscar
    debounceTimer.value = setTimeout(async () => {
      if (query.trim()) {
        try {
          await productStore.searchProducts(query)
          // Registrar en historial
          await recordSearch(query, searchType.value, filteredProducts.value.length)
        } catch (error) {
          console.error('Error en búsqueda:', error)
        }
      } else {
        await productStore.loadProducts()
      }
    }, debounceMs)
  }

  /**
   * Buscar por código específico
   */
  const searchByCode = async (code: string): Promise<Product | null> => {
    try {
      const result = await productStore.getProductByCode(code)
      if (result) {
        await recordSearch(code, 'code', 1)
      }
      return result
    } catch (error) {
      console.error('Error searching by code:', error)
      return null
    }
  }

  /**
   * Búsqueda por categoría
   */
  const searchByCategory = async (categoryId: number) => {
    selectedCategory.value = categoryId
    try {
      const results = await productStore.getProductsByCategory(categoryId)
      await recordSearch(`category:${categoryId}`, 'all', results?.length || 0)
      return results
    } catch (error) {
      console.error('Error searching by category:', error)
      return []
    }
  }

  /**
   * Búsqueda avanzada
   */
  const advancedSearch = async (
    query: string,
    type: 'code' | 'name' | 'all' = 'all',
    categoryId?: number,
    minPrice?: number,
    maxPrice?: number
  ) => {
    searchType.value = type
    if (categoryId !== undefined) {
      selectedCategory.value = categoryId
    }

    let results = filteredProducts.value

    // Filtrar por precio
    if (minPrice !== undefined || maxPrice !== undefined) {
      results = results.filter(p => {
        if (minPrice !== undefined && p.price < minPrice) return false
        if (maxPrice !== undefined && p.price > maxPrice) return false
        return true
      })
    }

    await recordSearch(query, type, results.length)
    return results
  }

  /**
   * Obtener sugerencias basadas en historial
   */
  const getSuggestions = (prefix: string, limit = 5) => {
    return searchHistory.value
      .filter(h => h.query.toLowerCase().startsWith(prefix.toLowerCase()))
      .map(h => h.query)
      .filter((q, i, arr) => arr.indexOf(q) === i) // unique
      .slice(0, limit)
  }

  /**
   * Obtener búsquedas populares
   */
  const getPopularSearches = (limit = 10) => {
    const frequency: Record<string, number> = {}

    searchHistory.value.forEach(h => {
      frequency[h.query] = (frequency[h.query] || 0) + 1
    })

    return Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .map(([query, count]) => ({ query, count }))
      .slice(0, limit)
  }

  /**
   * Limpiar búsqueda
   */
  const clearSearch = () => {
    searchQuery.value = ''
    selectedCategory.value = null
    if (debounceTimer.value) {
      clearTimeout(debounceTimer.value)
    }
  }

  /**
   * Exportar historial
   */
  const exportHistory = () => {
    const data = {
      searchHistory: searchHistory.value,
      savedSearches: savedSearches.value,
      exportedAt: new Date().toISOString()
    }

    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `busquedas-${Date.now()}.json`
    link.click()
    window.URL.revokeObjectURL(url)
  }

  // Computed
  const historyStats = computed(() => {
    return {
      totalSearches: searchHistory.value.length,
      uniqueQueries: new Set(searchHistory.value.map(h => h.query)).size,
      savedCount: savedSearches.value.length,
      lastSearch: searchHistory.value[0]?.timestamp
    }
  })

  const topSearches = computed(() => {
    return getPopularSearches(5)
  })

  return {
    // Estado base
    searchQuery,
    searchType,
    selectedCategory,
    filteredProducts,
    debounceMs,

    // Historial
    searchHistory,
    savedSearches,
    historyStats,
    topSearches,

    // Métodos de búsqueda
    search,
    searchByCode,
    searchByCategory,
    advancedSearch,
    clearSearch,

    // Métodos de historial
    recordSearch,
    clearSearchHistory,
    getSuggestions,
    getPopularSearches,

    // Métodos de búsquedas guardadas
    saveSearch,
    loadSavedSearch,
    deleteSavedSearch,

    // Métodos de carga
    loadSearchHistory,
    loadSavedSearches,

    // Exportación
    exportHistory,

    // Computed
    isLoading: computed(() => productStore.isLoading),
    error: computed(() => productStore.error)
  }
}
