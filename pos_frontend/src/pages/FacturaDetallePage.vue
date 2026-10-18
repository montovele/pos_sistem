<template>
  <div class="detalle-page">
    <div class="page-header">
      <div>
        <p class="eyebrow">Detalle de factura</p>
        <h1>{{ factura?.folio || 'Factura sin folio' }}</h1>
      </div>
      <div class="header-actions">
        <button class="mini-btn secondary" @click="goBack">← Volver</button>
        <button class="mini-btn" @click="downloadNonStampedPdf">Descargar PDF sin timbrar</button>
        <button class="mini-btn secondary" @click="downloadFile('xml')">Descargar XML</button>
        <button class="mini-btn danger" @click="openCancelModal">Cancelar</button>
      </div>
    </div>

    <div v-if="error" class="alert-error">
      {{ error }}
    </div>

    <div v-if="isLoading" class="loading-state">
      <div class="spinner"></div>
      <p>Cargando factura...</p>
    </div>

    <div v-else-if="factura" class="detail-card">
      <div class="summary-row">
        <div class="summary-box">
          <span class="label">Estatus</span>
          <strong>{{ factura.status || 'draft' }}</strong>
        </div>
        <div class="summary-box">
          <span class="label">Total</span>
          <strong>{{ formatCurrency(Number(factura.total || 0)) }}</strong>
        </div>
        <div class="summary-box">
          <span class="label">Pago</span>
          <strong>{{ factura.paymentMethod || 'cash' }}</strong>
        </div>
      </div>

      <div class="two-columns">
        <div class="panel">
          <h3>Datos del cliente</h3>
          <p><strong>Nombre:</strong> {{ factura.cliente?.nombre || 'Consumidor final' }}</p>
          <p><strong>RFC:</strong> {{ factura.cliente?.rfc || 'XAXX010101000' }}</p>
          <p><strong>Tipo:</strong> {{ factura.tipo || 'ingreso' }}</p>
        </div>

        <div class="panel">
          <h3>Datos de comprobante</h3>
          <p><strong>Folio:</strong> {{ factura.folio || 'Sin folio' }}</p>
          <p><strong>Serie:</strong> {{ factura.serie || 'A' }}</p>
          <p><strong>Fecha:</strong> {{ formatDate(factura.createdAt || new Date()) }}</p>
        </div>
      </div>

      <div class="items-block">
        <h3>Conceptos</h3>
        <div class="items-table">
          <div class="table-header">
            <span>Producto</span>
            <span>Cant.</span>
            <span>Importe</span>
          </div>
          <div v-for="item in factura.items || []" :key="item.id || item.productId || item.codigoProd" class="table-row">
            <span>{{ item.nombreProd || 'Producto' }}</span>
            <span>{{ item.quantity || 0 }}</span>
            <span>{{ formatCurrency(Number(item.total || item.subtotal || 0)) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="empty-state">
      <p>No se encontró la factura solicitada.</p>
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
      <p><strong>{{ factura?.folio || 'Factura sin folio' }}</strong></p>
      <p>Esta acción no se puede deshacer.</p>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useFacturaStore } from '@/stores/facturaStore'
import { formatCurrency, formatDate } from '@/utils/helpers'
import Modal from '@/components/common/Modal.vue'

const route = useRoute()
const router = useRouter()
const facturaStore = useFacturaStore()

const isLoading = computed(() => facturaStore.isLoading)
const error = computed(() => facturaStore.error)
const factura = computed(() => facturaStore.currentInvoice)
const showCancelModal = ref(false)
const isCanceling = ref(false)

const goBack = () => {
  router.push('/facturas')
}

const loadFactura = async () => {
  const id = route.params.id as string
  if (!id) return

  try {
    await facturaStore.getFacturaById(id)
  } catch (err) {
    console.error('No se pudo cargar la factura', err)
  }
}

const downloadFile = async (type: 'pdf' | 'xml') => {
  const id = route.params.id as string
  if (!id) return

  try {
    await facturaStore.downloadInvoiceFile(id, type)
  } catch (err) {
    console.error(`No se pudo descargar ${type.toUpperCase()}`, err)
  }
}

const downloadNonStampedPdf = () => {
  if (!factura.value) return

  try {
    facturaStore.downloadNonStampedPdf(factura.value)
  } catch (err) {
    console.error('No se pudo generar el PDF sin timbrar', err)
  }
}

const openCancelModal = () => {
  showCancelModal.value = true
}

const confirmCancelInvoice = async () => {
  const id = route.params.id as string
  if (!id) return

  try {
    isCanceling.value = true
    await facturaStore.cancelInvoice(id, 'Cancelada desde detalle de factura')
    showCancelModal.value = false
  } catch (err) {
    console.error('No se pudo cancelar la factura', err)
  } finally {
    isCanceling.value = false
  }
}

onMounted(() => {
  loadFactura()
})
</script>

<style scoped>
.detalle-page {
  max-width: 1100px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.eyebrow {
  margin: 0 0 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.75rem;
  color: #64748b;
}

h1 {
  margin: 0;
  color: #111827;
}

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.mini-btn {
  padding: 0.6rem 0.9rem;
  border: none;
  border-radius: 8px;
  background: #2563eb;
  color: white;
  cursor: pointer;
  font-weight: 700;
}

.mini-btn.secondary {
  background: #0f172a;
}

.mini-btn.danger {
  background: #dc2626;
}

.detail-card,
.empty-state,
.loading-state {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(15, 23, 42, 0.04);
}

.detail-card {
  padding: 1.5rem;
}

.summary-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.summary-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #64748b;
}

.two-columns {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.panel {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem;
}

.panel h3,
.items-block h3 {
  margin: 0 0 0.75rem;
  color: #111827;
}

.panel p {
  margin: 0.45rem 0;
  color: #475569;
}

.items-block {
  margin-top: 1rem;
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

.empty-state,
.loading-state {
  padding: 2rem;
  text-align: center;
  color: #475569;
}

.spinner {
  width: 28px;
  height: 28px;
  margin: 0 auto 0.8rem;
  border: 3px solid rgba(37, 99, 235, 0.2);
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.alert-error {
  margin-bottom: 1rem;
  padding: 0.8rem 1rem;
  border-radius: 10px;
  background: #fee2e2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 640px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .table-header {
    display: none;
  }

  .table-row {
    grid-template-columns: 1fr;
  }
}
</style>
