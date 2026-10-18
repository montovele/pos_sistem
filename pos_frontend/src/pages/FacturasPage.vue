<template>
  <div class="facturas-page">
    <header class="page-header hero-header">
      <div>
        <p class="eyebrow">Ventas y facturación</p>
        <h1>Módulo de facturas</h1>
      </div>

      <div class="header-actions">
        <Button
          label="Generar factura"
          variant="primary"
          @click="generateInvoiceAction"
        />
        <Button
          label="Generar desde carrito"
          variant="secondary"
          :disabled="!cartStore.items.length"
          @click="generateFromCart"
        />
      </div>
    </header>

    <section class="summary-strip">
      <div class="summary-card success">
        <span>Total</span>
        <strong>{{ formatCurrency(totalInvoiceAmount) }}</strong>
        <small>Ventas del periodo</small>
      </div>
      <div class="summary-card primary">
        <span>Facturas</span>
        <strong>{{ facturaStore.facturas.length }}</strong>
        <small>Registros actuales</small>
      </div>
      <div class="summary-card neutral">
        <span>Estado</span>
        <strong>{{ activeStatusLabel }}</strong>
        <small>Vista actual</small>
      </div>
    </section>

    <Toast
      :visible="toast.visible"
      :message="toast.message"
      :type="toast.type"
      @close="toast.visible = false"
    />

    <div class="toolbar panel-box">
      <div class="search-box">
        <input
          v-model="searchTerm"
          type="text"
          placeholder="Buscar por folio o cliente"
          @input="applyFilters"
        />
      </div>

      <div class="status-filters">
        <button
          v-for="option in statusOptions"
          :key="option.value"
          :class="['filter-chip', { active: statusFilter === option.value }]"
          @click="setStatus(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <div v-if="error" class="alert-error">
      {{ error }}
    </div>

    <div v-if="facturaStore.currentInvoice" class="invoice-summary panel-box">
      <div class="summary-top">
        <div>
          <span class="label">Factura activa</span>
          <h2>{{ facturaStore.currentInvoice.folio || 'Sin folio' }}</h2>
        </div>
        <div class="detail-actions">
          <span class="status-badge">{{ facturaStore.currentInvoice.status || 'draft' }}</span>
          <button class="mini-btn" @click="downloadNonStampedPdf(facturaStore.currentInvoice)">PDF sin timbrar</button>
          <button class="mini-btn secondary" @click="downloadInvoiceFile(facturaStore.currentInvoice, 'xml')">XML</button>
          <button class="mini-btn danger" @click="cancelCurrentInvoice">Cancelar</button>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <span class="stat-label">Total</span>
          <strong>{{ formatCurrency(facturaStore.currentInvoice.total || 0) }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">Pago</span>
          <strong>{{ facturaStore.currentInvoice.paymentMethod || 'cash' }}</strong>
        </div>
        <div class="stat-card">
          <span class="stat-label">Fecha</span>
          <strong>{{ formatDate(facturaStore.currentInvoice.createdAt || new Date()) }}</strong>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-box">
          <h3>Cliente</h3>
          <p><strong>Nombre:</strong> {{ facturaStore.currentInvoice.cliente?.nombre || 'Consumidor final' }}</p>
          <p><strong>RFC:</strong> {{ facturaStore.currentInvoice.cliente?.rfc || 'XAXX010101000' }}</p>
        </div>

        <div class="detail-box">
          <h3>Resumen</h3>
          <p><strong>Folio:</strong> {{ facturaStore.currentInvoice.folio || 'Sin folio' }}</p>
          <p><strong>Estatus:</strong> {{ facturaStore.currentInvoice.status || 'draft' }}</p>
          <p><strong>Tipo:</strong> {{ facturaStore.currentInvoice.tipo || 'ingreso' }}</p>
        </div>
      </div>

      <div class="items-table">
        <div class="table-header">
          <span>Producto</span>
          <span>Cant.</span>
          <span>Importe</span>
        </div>
        <div
          v-for="item in facturaStore.currentInvoice.items || []"
          :key="item.id || item.productId || item.codigoProd"
          class="table-row"
        >
          <span>{{ item.nombreProd || 'Producto' }}</span>
          <span>{{ item.quantity || 0 }}</span>
          <span>{{ formatCurrency(Number(item.total || item.subtotal || 0)) }}</span>
        </div>
      </div>
    </div>

    <div v-else class="empty-state panel-box">
      <p>No hay una factura activa en este momento.</p>
      <p class="muted">Genera una factura desde una venta o desde el carrito del POS.</p>
    </div>

    <div v-if="visibleFacturas.length" class="history-card panel-box">
      <div class="history-header">
        <div>
          <span class="section-kicker">Historial</span>
          <h3>Facturas recientes</h3>
        </div>
        <span class="results-counter">{{ filteredFacturas.length }} resultados</span>
      </div>

      <div class="history-list">
        <div
          v-for="factura in visibleFacturas"
          :key="factura.id || factura.folio || factura.codigoTransaccion"
          class="history-item"
        >
          <div class="history-main" @click="openInvoiceModal(factura)">
            <strong>{{ factura.folio || 'Factura sin folio' }}</strong>
            <small>{{ factura.status || 'draft' }}</small>
          </div>

          <div class="history-actions">
            <span>{{ formatCurrency(Number(factura.total || 0)) }}</span>
            <div class="action-buttons">
              <button class="mini-btn" @click.stop="openInvoiceModal(factura)">Detalle</button>
              <button class="mini-btn" @click.stop="downloadNonStampedPdf(factura)">PDF</button>
              <button class="mini-btn secondary" @click.stop="downloadInvoiceFile(factura, 'xml')">XML</button>
              <button class="mini-btn danger" @click.stop="openCancelModal(factura)">Cancelar</button>
            </div>
          </div>
        </div>
      </div>

      <div class="pagination-wrapper">
        <span class="pagination-meta">
          {{ pageStart }}-{{ pageEnd }} de {{ filteredFacturas.length }}
        </span>

        <div class="pagination-controls">
          <button
            class="pagination-btn"
            type="button"
            :disabled="currentPage === 1"
            @click="goToPage(currentPage - 1)"
          >
            ←
          </button>

          <span class="current-page-indicator">{{ currentPage }}</span>

          <button
            class="pagination-btn"
            type="button"
            :disabled="currentPage >= totalPages"
            @click="goToPage(currentPage + 1)"
          >
            →
          </button>
        </div>
      </div>
    </div>

    <div v-else class="empty-state small-empty panel-box">
      <p>No hay facturas para mostrar con los filtros actuales.</p>
    </div>

    <Modal
      :is-open="showCancelModal"
      title="Confirmar cancelación"
      confirm-label="Sí, cancelar"
      confirm-variant="danger"
      :is-loading="isCanceling"
      @close="showCancelModal = false"
      @confirm="confirmCancelInvoice"
    >
      <p>¿Deseas cancelar esta factura?</p>
      <p><strong>{{ selectedFactura?.folio || 'Factura sin folio' }}</strong></p>
      <p>Esta acción no se puede deshacer.</p>
    </Modal>

    <Modal
      :is-open="showDetailModal"
      title="Detalle de factura"
      :show-confirm="false"
      @close="showDetailModal = false"
    >
      <div v-if="selectedFacturaDetail" class="detail-modal-content">
        <div class="modal-invoice-hero">
          <div>
            <span class="modal-kicker">Comprobante de venta</span>
            <h2>{{ selectedFacturaDetail.folio || 'Factura sin folio' }}</h2>
            <p>{{ selectedFacturaDetail.codigoTransaccion || 'Transacción sin identificador' }}</p>
          </div>
          <span class="modal-status-badge">{{ selectedFacturaDetail.status || 'draft' }}</span>
        </div>

        <div class="modal-detail-grid">
          <div class="modal-info-card">
            <span class="modal-info-label">Cliente</span>
            <strong>{{ selectedFacturaDetail.cliente?.nombre || 'Consumidor final' }}</strong>
            <small>RFC {{ selectedFacturaDetail.cliente?.rfc || 'XAXX010101000' }}</small>
          </div>
          <div class="modal-info-card">
            <span class="modal-info-label">Información de pago</span>
            <strong>{{ selectedFacturaDetail.paymentMethod || selectedFacturaDetail.metodoPago || 'cash' }}</strong>
            <small>{{ formatDate(selectedFacturaDetail.createdAt || new Date()) }}</small>
          </div>
        </div>

        <div class="modal-items-list">
          <div class="modal-items-heading">
            <div>
              <span class="modal-kicker">Detalle</span>
              <h3>Productos incluidos</h3>
            </div>
            <span>{{ (selectedFacturaDetail.items || []).length }} concepto(s)</span>
          </div>
          <div class="modal-items-header">
            <span>Producto</span>
            <span>Cantidad</span>
            <span>Importe</span>
          </div>
          <div
            v-for="item in selectedFacturaDetail.items || []"
            :key="item.id || item.productId || item.codigoProd"
            class="modal-item-row"
          >
            <div class="modal-product-name">
              <strong>{{ item.nombreProd || 'Producto' }}</strong>
              <small>{{ item.codigoProd || item.productId || 'Sin código' }}</small>
            </div>
            <span>{{ item.quantity || 0 }}</span>
            <span>{{ formatCurrency(Number(item.total || item.subtotal || 0)) }}</span>
          </div>
          <div class="modal-total-row">
            <span>Total de la transacción</span>
            <strong>{{ formatCurrency(Number(selectedFacturaDetail.total || 0)) }}</strong>
          </div>
        </div>

        <div class="modal-notice">
          <span class="modal-notice-icon">i</span>
          <p>Este comprobante es informativo y no representa un CFDI timbrado.</p>
        </div>
      </div>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useCartStore } from '@/stores/cartStore'
import { useFacturaStore } from '@/stores/facturaStore'
import { formatCurrency, formatDate, normalizeSaleItem } from '@/utils/helpers'
import Button from '@/components/common/Button.vue'
import Modal from '@/components/common/Modal.vue'
import Toast from '@/components/common/Toast.vue'

const router = useRouter()
const cartStore = useCartStore()
const facturaStore = useFacturaStore()

const statusFilter = ref<'all' | 'draft' | 'paid' | 'pending' | 'cancelled'>('all')
const searchTerm = ref('')
const showCancelModal = ref(false)
const showDetailModal = ref(false)
const isCanceling = ref(false)
const selectedFactura = ref<any>(null)
const selectedFacturaDetail = ref<any>(null)
const currentPage = ref(1)
const pageSize = 5
const toast = ref({ visible: false, message: '', type: 'success' as 'success' | 'error' | 'warning' | 'info' })

const statusOptions = [
  { value: 'all', label: 'Todas' },
  { value: 'draft', label: 'Borrador' },
  { value: 'paid', label: 'Pagadas' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'cancelled', label: 'Canceladas' }
] as const

const error = computed(() => facturaStore.error)

const filteredFacturas = computed(() => {
  const query = searchTerm.value.trim().toLowerCase()

  return facturaStore.facturas.filter((factura) => {
    const matchesStatus = statusFilter.value === 'all' || (factura.status || 'draft') === statusFilter.value
    const hasQuery = !query
    const matchesSearch = hasQuery || [
      factura.folio || '',
      factura.codigoTransaccion || '',
      factura.status || '',
      factura.paymentMethod || '',
      factura.cliente?.nombre || ''
    ].some((value) => String(value).toLowerCase().includes(query))

    return matchesStatus && matchesSearch
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredFacturas.value.length / pageSize)))

const pageStart = computed(() => {
  if (!filteredFacturas.value.length) return 0
  return (currentPage.value - 1) * pageSize + 1
})

const pageEnd = computed(() => Math.min(currentPage.value * pageSize, filteredFacturas.value.length))

const visibleFacturas = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredFacturas.value.slice(start, start + pageSize)
})

const totalInvoiceAmount = computed(() =>
  facturaStore.facturas.reduce((sum, factura) => sum + Number(factura.total || 0), 0)
)

const activeStatusLabel = computed(() => {
  const status = statusOptions.find(option => option.value === statusFilter.value)
  return status ? status.label : 'Todas'
})

const goToPage = (page: number) => {
  const safePage = Math.min(Math.max(page, 1), totalPages.value)
  currentPage.value = safePage
}

const setStatus = async (value: typeof statusFilter.value) => {
  statusFilter.value = value
  currentPage.value = 1
  await loadFacturas()
}

const applyFilters = async () => {
  currentPage.value = 1
  await loadFacturas()
}

const loadFacturas = async () => {
  try {
    await facturaStore.fetchFacturas({
      page: 1,
      limit: 20,
      ...(statusFilter.value !== 'all' && { status: statusFilter.value, estatus: statusFilter.value }),
      ...(searchTerm.value.trim() && { search: searchTerm.value.trim() })
    })
  } catch (err) {
    console.warn('No se pudieron cargar las facturas', err)
  }
}

const generateInvoiceAction = async () => {
  if (cartStore.items.length) {
    await generateFromCart()
    return
  }

  showToast('Agrega productos al carrito para generar la factura', 'warning')
}

const generateFromCart = async () => {
  if (!cartStore.items.length) {
    showToast('Agrega productos al carrito para generar la factura', 'warning')
    return
  }

  try {
    await facturaStore.generateInvoice({
      items: cartStore.items.map(item => normalizeSaleItem(item)),
      total: cartStore.total,
      paymentMethod: 'cash',
      discount: 0,
      tipo: 'ingreso',
      serie: 'A',
      metodoPago: 'PUE'
    })
    showToast('Factura generada correctamente', 'success')
  } catch (err) {
    console.error('No se pudo generar la factura desde el carrito', err)
    showToast('No se pudo generar la factura', 'error')
  }
}

const openInvoiceModal = (factura: any) => {
  if (!factura) return
  selectedFacturaDetail.value = factura
  showDetailModal.value = true
}

const openFactura = async (factura: any) => {
  if (!factura?.id) return
  await router.push({ name: 'FacturaDetalle', params: { id: String(factura.id) } })
}

const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
  toast.value = { visible: true, message, type }
  setTimeout(() => {
    toast.value.visible = false
  }, 3500)
}

const downloadInvoiceFile = async (factura: any, type: 'pdf' | 'xml') => {
  if (!factura?.id) return

  try {
    await facturaStore.downloadInvoiceFile(String(factura.id), type)
    showToast(`${type.toUpperCase()} descargado correctamente`, 'success')
  } catch (err) {
    console.error(`No se pudo descargar ${type.toUpperCase()}`, err)
    showToast(`No se pudo descargar el ${type.toUpperCase()}`, 'error')
  }
}

const downloadNonStampedPdf = (factura: any) => {
  if (!factura) return

  try {
    facturaStore.downloadNonStampedPdf(factura)
    showToast('PDF sin timbrar generado correctamente', 'success')
  } catch (err) {
    console.error('No se pudo generar el PDF sin timbrar', err)
    showToast('No se pudo generar el PDF sin timbrar', 'error')
  }
}

const openCancelModal = (factura: any) => {
  selectedFactura.value = factura
  showCancelModal.value = true
}

const confirmCancelInvoice = async () => {
  if (!selectedFactura.value?.id) return

  try {
    isCanceling.value = true
    await facturaStore.cancelInvoice(String(selectedFactura.value.id), 'Cancelada desde tabla de facturas')
    showCancelModal.value = false
    selectedFactura.value = null
    showToast('Factura cancelada correctamente', 'success')
    await loadFacturas()
  } catch (err) {
    console.error('No se pudo cancelar la factura', err)
    showToast('No se pudo cancelar la factura', 'error')
  } finally {
    isCanceling.value = false
  }
}

const cancelCurrentInvoice = async () => {
  if (!facturaStore.currentInvoice?.id) return

  try {
    isCanceling.value = true
    await facturaStore.cancelInvoice(String(facturaStore.currentInvoice.id), 'Cancelada desde factura frontend')
    showToast('Factura cancelada correctamente', 'success')
  } catch (err) {
    console.error('No se pudo cancelar la factura', err)
    showToast('No se pudo cancelar la factura', 'error')
  } finally {
    isCanceling.value = false
  }
}

onMounted(async () => {
  await loadFacturas()
})
</script>

<style scoped>
.facturas-page {
  max-width: 1200px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
}

.hero-header {
  background: linear-gradient(135deg, #11233d 0%, #1d4e89 48%, #0f172a 100%);
  border-radius: 24px;
  padding: 2rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
  margin-bottom: 1.5rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.eyebrow {
  margin: 0 0 0.35rem;
  text-transform: uppercase;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.7);
}

h1 {
  margin: 0;
  color: white;
  font-size: clamp(2rem, 3vw, 2.7rem);
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.summary-card {
  background: rgba(255, 255, 255, 0.8);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 18px;
  padding: 1.1rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05);
}

.summary-card.success {
  border-top: 4px solid #22c55e;
}

.summary-card.primary {
  border-top: 4px solid #2563eb;
}

.summary-card.neutral {
  border-top: 4px solid #8b5cf6;
}

.summary-card span {
  font-size: 0.76rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
}

.summary-card strong {
  color: #0f172a;
  font-size: 1.8rem;
  line-height: 1.1;
}

.summary-card small {
  color: #64748b;
}

.panel-box {
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: 20px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding: 1rem 1.1rem;
}

.search-box {
  flex: 1;
  min-width: 220px;
}

.search-box input {
  width: 100%;
  padding: 0.8rem 1rem;
  border: 1px solid #dbe2ea;
  border-radius: 12px;
  font-size: 0.95rem;
  background: white;
  color: #0f172a;
}

.status-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.filter-chip {
  border: 1px solid #dbe2ea;
  background: #f8fafc;
  color: #334155;
  border-radius: 999px;
  padding: 0.55rem 0.9rem;
  font-weight: 700;
  cursor: pointer;
}

.filter-chip.active {
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  border-color: transparent;
  color: white;
}

.invoice-summary,
.history-card,
.empty-state {
  padding: 1.3rem;
}

.summary-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.summary-top h2 {
  margin: 0.25rem 0 0;
  color: #111827;
}

.label {
  color: #64748b;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-badge {
  background: #dbeafe;
  color: #1d4ed8;
  padding: 0.35rem 0.7rem;
  border-radius: 999px;
  font-size: 0.72rem;
  text-transform: uppercase;
  font-weight: 700;
}

.detail-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  background: linear-gradient(180deg, #f8fafc 0%, #eff6ff 100%);
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.stat-label {
  color: #64748b;
  font-size: 0.8rem;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.detail-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem;
}

.detail-box h3 {
  margin: 0 0 0.75rem;
  color: #1f2937;
}

.detail-box p {
  margin: 0.3rem 0;
  color: #475569;
}

.items-table {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  overflow: hidden;
}

.table-header,
.table-row {
  display: grid;
  grid-template-columns: 2fr 0.8fr 1fr;
  gap: 1rem;
  padding: 0.9rem 1rem;
}

.table-header {
  background: #f8fafc;
  color: #475569;
  font-weight: 700;
}

.table-row {
  border-top: 1px solid #e5e7eb;
  color: #1f2937;
}

.history-card {
  margin-top: 1.5rem;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
}

.section-kicker {
  display: block;
  color: #64748b;
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.history-card h3 {
  margin: 0.3rem 0 0;
  color: #111827;
}

.results-counter {
  color: #475569;
  font-size: 0.85rem;
  font-weight: 600;
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding: 0.9rem 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
}

.history-main {
  cursor: pointer;
  flex: 1;
}

.history-main strong,
.history-main small {
  display: block;
}

.history-main small {
  color: #64748b;
  margin-top: 0.2rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.history-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.action-buttons {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.mini-btn {
  padding: 0.5rem 0.7rem;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: white;
  cursor: pointer;
  font-size: 0.72rem;
  font-weight: 700;
}

.mini-btn.secondary {
  background: #0f172a;
}

.mini-btn.danger {
  background: #dc2626;
}

.empty-state {
  text-align: center;
  color: #475569;
  margin-top: 1rem;
}

.small-empty {
  margin-top: 1rem;
}

.muted {
  color: #64748b;
  margin-top: 0.5rem;
}

.alert-error {
  margin-bottom: 1rem;
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
  border-radius: 12px;
  padding: 0.8rem 1rem;
}

.pagination-wrapper {
  margin-top: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e2e8f0;
}

.pagination-meta {
  color: #64748b;
  font-size: 0.85rem;
  font-weight: 600;
}

.pagination-controls {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
}

.pagination-btn {
  border: 1px solid #dbe2ea;
  background: #fff;
  color: #1f2937;
  border-radius: 10px;
  min-width: 2.6rem;
  min-height: 2.5rem;
  padding: 0.5rem 0.8rem;
  font-weight: 700;
  cursor: pointer;
}

.pagination-btn:hover:not(:disabled) {
  border-color: #93c5fd;
  background: #eff6ff;
}

.pagination-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.current-page-indicator {
  min-width: 2.8rem;
  text-align: center;
  background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
  color: white;
  border-radius: 10px;
  padding: 0.6rem 0.7rem;
  font-size: 0.82rem;
  font-weight: 800;
}

.detail-modal-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  color: #1e293b;
}

.modal-invoice-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  padding: 1.15rem;
  border-radius: 12px;
  background: linear-gradient(135deg, #eff6ff 0%, #f8fafc 100%);
  border: 1px solid #dbeafe;
}

.modal-kicker,
.modal-info-label {
  display: block;
  color: #64748b;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.modal-invoice-hero h2 {
  margin: 0.25rem 0 0.2rem;
  color: #172554;
  font-size: 1.35rem;
}

.modal-invoice-hero p {
  margin: 0;
  color: #64748b;
  font-size: 0.78rem;
}

.modal-status-badge {
  flex: 0 0 auto;
  padding: 0.4rem 0.65rem;
  border-radius: 999px;
  background: #dcfce7;
  color: #166534;
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
}

.modal-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.modal-info-card {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.85rem;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
}

.modal-info-card strong {
  overflow: hidden;
  color: #1e293b;
  font-size: 0.9rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-info-card small {
  color: #64748b;
  font-size: 0.75rem;
}

.modal-items-list {
  overflow: hidden;
  border: 1px solid #e2e8f0;
  border-radius: 11px;
  background: #fff;
}

.modal-items-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.95rem 1rem 0.8rem;
}

.modal-items-heading h3 {
  margin: 0.2rem 0 0;
  color: #1e293b;
  font-size: 0.98rem;
}

.modal-items-heading > span {
  color: #64748b;
  font-size: 0.75rem;
}

.modal-items-header,
.modal-item-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 4.5rem 5.5rem;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 1rem;
}

.modal-items-header {
  background: #f8fafc;
  color: #64748b;
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.modal-items-header span:nth-child(n + 2),
.modal-item-row > span {
  text-align: right;
}

.modal-item-row {
  border-top: 1px solid #f1f5f9;
  color: #334155;
  font-size: 0.82rem;
}

.modal-product-name {
  min-width: 0;
}

.modal-product-name strong,
.modal-product-name small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.modal-product-name strong {
  color: #1e293b;
  font-size: 0.83rem;
}

.modal-product-name small {
  margin-top: 0.15rem;
  color: #94a3b8;
  font-size: 0.7rem;
}

.modal-total-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.9rem 1rem;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
  color: #475569;
  font-size: 0.82rem;
}

.modal-total-row strong {
  color: #1d4ed8;
  font-size: 1.15rem;
}

.modal-notice {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid #fde68a;
  border-radius: 9px;
  background: #fffbeb;
  color: #92400e;
}

.modal-notice-icon {
  display: inline-grid;
  flex: 0 0 auto;
  width: 1.1rem;
  height: 1.1rem;
  place-items: center;
  border-radius: 50%;
  background: #f59e0b;
  color: white;
  font-size: 0.7rem;
  font-weight: 800;
}

.modal-notice p {
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.4;
}

@media (max-width: 640px) {
  .page-header,
  .summary-top,
  .history-header,
  .history-item,
  .pagination-wrapper {
    flex-direction: column;
    align-items: flex-start;
  }

  .toolbar {
    align-items: stretch;
  }

  .table-header {
    display: none;
  }

  .table-row {
    grid-template-columns: 1fr;
  }

  .history-actions {
    width: 100%;
    justify-content: space-between;
  }

  .modal-detail-grid {
    grid-template-columns: 1fr;
  }

  .modal-invoice-hero {
    flex-direction: column;
  }

  .modal-items-header {
    display: none;
  }

  .modal-item-row {
    grid-template-columns: minmax(0, 1fr) auto auto;
    padding: 0.8rem 0.75rem;
  }
}
</style>
