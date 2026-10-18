import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { InventoryItem, InventoryMovement, InventorySummary } from '@/types'
import inventoryService from '@/services/inventoryService'

export const useInventoryStore = defineStore('inventory', () => {
  const items = ref<InventoryItem[]>([])
  const lowStockItems = ref<InventoryItem[]>([])
  const isLoading = ref(false)
  const isLoadingLowStock = ref(false)
  const error = ref<string | null>(null)
  const lowStockError = ref<string | null>(null)
  const search = ref('')
  const currentPage = ref(1)
  const perPage = ref(20)
  const total = ref(0)
  const totalPages = ref(1)
  const summary = ref<InventorySummary | null>(null)
  const movements = ref<InventoryMovement[]>([])
  const imports = ref<Array<Record<string, unknown>>>([])
  const isLoadingReports = ref(false)

  const lowStockCount = computed(() => lowStockItems.value.length)

  const loadItems = async (page = currentPage.value) => {
    isLoading.value = true
    error.value = null

    try {
      const response = await inventoryService.getItems(search.value, page, perPage.value)
      items.value = response.data
      currentPage.value = response.page
      total.value = response.total
      totalPages.value = response.totalPages
    } catch (err: any) {
      error.value = err.message || 'No se pudo cargar el inventario'
    } finally {
      isLoading.value = false
    }
  }

  const loadLowStock = async () => {
    isLoadingLowStock.value = true
    lowStockError.value = null

    try {
      lowStockItems.value = await inventoryService.getLowStock()
    } catch (err: any) {
      lowStockError.value = err.message || 'No se pudo consultar el stock bajo'
    } finally {
      isLoadingLowStock.value = false
    }
  }

  const setSearch = (value: string) => {
    search.value = value
    currentPage.value = 1
  }

  const saveItem = async (payload: Partial<InventoryItem>, id?: number) => {
    const saved = id ? await inventoryService.updateItem(id, payload) : await inventoryService.createItem(payload)
    await Promise.all([loadItems(currentPage.value), loadLowStock()])
    return saved
  }

  const loadReports = async (warehouse = '') => {
    isLoadingReports.value = true
    try {
      const [nextSummary, nextLowStock, nextMovements, nextImports] = await Promise.all([
        inventoryService.getSummary(warehouse),
        inventoryService.getLowStockReport(warehouse),
        inventoryService.getMovements({ warehouse: warehouse || undefined }),
        inventoryService.getImports()
      ])
      summary.value = nextSummary
      lowStockItems.value = nextLowStock
      movements.value = nextMovements
      imports.value = nextImports
    } finally {
      isLoadingReports.value = false
    }
  }

  return {
    items,
    lowStockItems,
    lowStockCount,
    isLoading,
    isLoadingLowStock,
    error,
    lowStockError,
    search,
    currentPage,
    perPage,
    total,
    totalPages,
    summary,
    movements,
    imports,
    isLoadingReports,
    loadItems,
    loadLowStock,
    setSearch,
    saveItem,
    loadReports
  }
})
