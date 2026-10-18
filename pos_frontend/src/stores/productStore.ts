import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Product, PaginatedResponse } from '@/types'
import productService from '@/services/productService'

export const useProductStore = defineStore('products', () => {
  const products = ref<Product[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const currentPage = ref(1)
  // En POS se necesita ver un volumen mayor de productos en una sola carga para evitar
  // que el catálogo quede incompleto por la paginación del backend.
  const perPage = ref(500)
  const total = ref(0)

  const totalPages = computed(() => Math.ceil(total.value / perPage.value))

  const loadProducts = async (page = 1) => {
    isLoading.value = true
    error.value = null

    try {
      const response = await productService.getProducts(page, perPage.value)
      products.value = response.data
      currentPage.value = page
      total.value = response.total
    } catch (err: any) {
      error.value = err.message || 'Failed to load products'
    } finally {
      isLoading.value = false
    }
  }

  const searchProducts = async (query: string, page = 1) => {
    isLoading.value = true
    error.value = null

    try {
      const response = await productService.searchProducts(query, page, perPage.value)
      products.value = response.data
      currentPage.value = response.page
      total.value = response.total
      return response
    } catch (err: any) {
      error.value = err.message || 'Search failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const getProductByCode = async (code: string): Promise<Product | null> => {
    try {
      return await productService.getProductByCode(code)
    } catch (err: any) {
      error.value = err.message
      return null
    }
  }

  const getProductsByCategory = async (categoryId: number) => {
    try {
      return await productService.getProductsByCategory(categoryId)
    } catch (err: any) {
      error.value = err.message
      return []
    }
  }

  return {
    products,
    isLoading,
    error,
    currentPage,
    perPage,
    total,
    totalPages,
    loadProducts,
    searchProducts,
    getProductByCode,
    getProductsByCategory
  }
})
