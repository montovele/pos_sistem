import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  Factura,
  FacturaListResponse,
  FacturaPreview,
  FacturaRequest
} from '@/types'
import facturaService from '@/services/facturaService'

export const useFacturaStore = defineStore('facturas', () => {
  const facturas = ref<Factura[]>([])
  const currentInvoice = ref<Factura | null>(null)
  const preview = ref<FacturaPreview | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const fetchFacturas = async (params: Record<string, unknown> = {}) => {
    isLoading.value = true
    error.value = null

    try {
      const response = await facturaService.getFacturas(params)
      const rows = Array.isArray(response?.rows)
        ? response.rows
        : Array.isArray(response?.data)
          ? response.data
          : Array.isArray(response)
            ? response
            : []

      facturas.value = rows as Factura[]
      return response
    } catch (err: any) {
      error.value = err?.message || 'Error al cargar facturas'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const previewInvoice = async (payload: FacturaRequest) => {
    isLoading.value = true
    error.value = null

    try {
      const response = await facturaService.previewInvoice(payload)
      preview.value = response
      return response
    } catch (err: any) {
      error.value = err?.message || 'Error al generar vista previa'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const generateInvoice = async (payload: FacturaRequest) => {
    isLoading.value = true
    error.value = null

    try {
      const response = await facturaService.generateInvoice(payload)
      currentInvoice.value = response
      if (response && 'id' in response) {
        const exists = facturas.value.some(item => item.id === response.id)
        if (!exists) {
          facturas.value = [response, ...facturas.value]
        }
      }
      return response
    } catch (err: any) {
      error.value = err?.message || 'Error al crear factura'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const getFacturaById = async (id: string) => {
    isLoading.value = true
    error.value = null

    try {
      const response = await facturaService.getFacturaById(id)
      currentInvoice.value = response
      return response
    } catch (err: any) {
      error.value = err?.message || 'Error al obtener factura'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const downloadInvoiceFile = async (id: string, type: 'pdf' | 'xml') => {
    isLoading.value = true
    error.value = null

    try {
      if (type === 'pdf') {
        await facturaService.downloadPdf(id)
      } else {
        await facturaService.downloadXml(id)
      }
    } catch (err: any) {
      error.value = err?.message || `Error al descargar ${type.toUpperCase()}`
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const downloadNonStampedPdf = (factura: Factura) => {
    facturaService.downloadNonStampedPdf(factura)
  }

  const cancelInvoice = async (id: string, reason = 'Cancelada desde frontend') => {
    isLoading.value = true
    error.value = null

    try {
      await facturaService.cancelInvoice(id, reason)
      if (currentInvoice.value && String(currentInvoice.value.id) === String(id)) {
        currentInvoice.value = {
          ...currentInvoice.value,
          status: 'cancelled'
        }
      }

      const index = facturas.value.findIndex(item => String(item.id) === String(id))
      if (index >= 0) {
        facturas.value[index] = {
          ...facturas.value[index],
          status: 'cancelled'
        }
      }

      return true
    } catch (err: any) {
      error.value = err?.message || 'Error al cancelar factura'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
    facturas,
    currentInvoice,
    preview,
    isLoading,
    error,
    fetchFacturas,
    previewInvoice,
    generateInvoice,
    getFacturaById,
    downloadInvoiceFile,
    downloadNonStampedPdf,
    cancelInvoice
  }
})
