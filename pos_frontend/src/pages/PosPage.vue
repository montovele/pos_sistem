<template>
  <div class="pos-page">
    <header class="pos-topbar">
      <div class="brand-block">
        <span class="brand-mark">N</span>
        <div><strong>LEMARQUET POS</strong><small>TECNOLOGÍA & ACCESORIOS</small></div>
      </div>
      <div class="topbar-item"><span class="topbar-icon">▣</span><div><strong>Caja 01 <i :class="['live-dot', { off: !cajaAbierta }]">●</i></strong><small>{{ cajaAbierta ? 'Activa' : 'Cerrada' }}</small></div></div>
      <div class="topbar-item topbar-desktop"><span class="topbar-icon">◷</span><div><strong>Turno {{ new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}</strong><small>Turno actual</small></div></div>
      <div class="topbar-item topbar-desktop"><span class="topbar-icon">♙</span><div><strong>{{ authStore.currentUser?.nombreEmpleado || 'Cajero' }}</strong><small>Cajero</small></div></div>
      <div class="topbar-status topbar-desktop"><span class="live-dot">●</span> Impresora<br /><small>Conectada</small></div>
      <div class="topbar-status topbar-desktop"><span class="live-dot">●</span> Cajón<br /><small>Disponible</small></div>
      <RouterLink to="/caja" class="topbar-settings" title="Configuración de caja">⚙</RouterLink>
    </header>

    <section class="hardware-bar" aria-label="Estado del hardware">
      <span class="hardware-state" :class="hardwareConnected ? 'connected' : 'disconnected'">
        <span class="status-dot"></span>
        {{ hardwareConnected ? 'Agente de impresión conectado' : 'Agente de impresión desconectado' }}
      </span>
      <span v-if="printerName" class="printer-name">{{ printerName }}</span>
      <button class="hardware-action" type="button" :disabled="hardwareBusy || !hardwareConnected" @click="openDrawer">
        {{ hardwareBusy ? 'Abriendo...' : 'Abrir cajón' }}
      </button>
      <button class="hardware-action secondary" type="button" :disabled="hardwareBusy" @click="checkHardwareStatus">Actualizar hardware</button>
    </section>

    <Alert
      v-if="!cajaAbierta"
      type="warning"
      message="La caja está cerrada. Ábrela antes de cobrar una venta."
    />
    <Alert v-if="cashError" type="error" :message="cashError" />

    <div class="pos-container">
      <div class="pos-main-column">
        <div class="quick-tools">
          <section class="scanner-panel" aria-label="Lector de código de barras">
            <div class="scanner-copy"><span class="scanner-icon">▥</span><strong>Escanear producto</strong></div>
            <div class="scanner-input-wrap">
              <input
                ref="scannerInput"
                v-model="barcode"
                class="scanner-input"
                type="text"
                inputmode="numeric"
                autocomplete="off"
                aria-label="Código de barras"
                @input="scheduleBarcodeScan"
                @keydown.enter.prevent="scanBarcode"
              />
              <button v-if="barcode" class="clear-scanner" type="button" aria-label="Limpiar código" @click="clearScanner">×</button>
              <button class="scan-button" type="button" @click="scanBarcode">Agregar</button>
            </div>
            <p v-if="scannerMessage" class="scanner-message" :class="scannerError ? 'error' : 'success'">{{ scannerMessage }}</p>
          </section>

          <section class="scale-panel" :class="{ 'is-ready': selectedWeightProduct }" aria-label="Venta por peso">
            <div class="scale-heading">
              <span class="scale-icon">⚖</span>
              <div>
                <strong>Venta por peso</strong>
                <small>{{ selectedWeightProduct ? selectedWeightProduct.nombreProd : 'Selecciona un producto del catálogo' }}</small>
              </div>
            </div>

            <div class="scale-input-wrap">
              <div class="weight-input-shell" :class="{ 'has-focus': selectedWeightProduct }">
                <input
                  ref="weightInput"
                  v-model.number="weightGrams"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Peso en gramos"
                  aria-label="Peso en gramos"
                />
                <span class="weight-helper" v-if="selectedWeightProduct">Ingresa el peso en gramos</span>
              </div>
              <span class="scale-conversion">{{ weightKg.toFixed(3) }} kg</span>
              <button type="button" class="scale-action secondary" :disabled="scaleBusy" @click="readScaleWeight">
                {{ scaleBusy ? 'Leyendo...' : 'Leer báscula' }}
              </button>
              <button type="button" class="scale-action" :disabled="!canAddWeightedProduct" @click="addWeightedProduct">
                Agregar peso
              </button>
            </div>

            <div v-if="selectedWeightProduct" class="scale-guidance" aria-live="polite">
              <span class="guidance-icon">↗</span>
              <span>Selecciona el producto por kg y escribe el peso correspondiente en el campo de gramos.</span>
            </div>

            <p v-if="scaleMessage" class="scale-message" :class="{ error: scaleError }">{{ scaleMessage }}</p>
          </section>
        </div>

        <section class="products-section">
          <ProductCatalog
            @select="handleSelectProduct"
            @add="handleProductAdd"
          />
        </section>

        <Alert
          v-if="pendingTransactionsCount > 0 && !pendingSyncError"
          type="warning"
          :message="pendingSyncMessage"
        />
      </div>

      <aside :class="['cart-section', { 'cart-section-pulse': cartPulse, 'payment-expanded': showPaymentForm && cartStore.items.length }]">
        <Card title="Venta actual">
          <Alert
            v-if="!cartStore.items.length && !showPaymentForm"
            type="info"
            message="El carrito está vacío"
          />

          <div v-if="cartStore.items.length && !showPaymentForm" class="cart-items-container">
            <div class="cart-items">
              <CartItem
                v-for="item in cartStore.items"
                :key="item.id"
                :item="item"
                @remove="handleRemoveItem"
                @update="handleUpdateItem"
              />
            </div>

            <div class="cart-summary">
              <div class="summary-row">
                <span class="label">Subtotal:</span>
                <span class="value">{{ formatCurrency(cartStore.subtotal) }}</span>
              </div>
              <div class="summary-row">
                <span class="label">IVA (16%):</span>
                <span class="value">{{ formatCurrency(cartStore.tax) }}</span>
              </div>
              <div class="summary-row total">
                <span class="label">Total:</span>
                <span class="value">{{ formatCurrency(cartStore.total) }}</span>
              </div>
            </div>

            <div class="cart-actions">
              <Button
                label="Limpiar"
                variant="secondary"
                size="small"
                @click="cartStore.clear()"
              />
              <Button
                label="� Cobrar (F10)"
                variant="primary"
                :disabled="!cartStore.items.length"
                @click="openPayment"
              />
            </div>
          </div>

          <PaymentForm
            v-if="showPaymentForm && cartStore.items.length"
            :total="cartStore.total"
            :subtotal="cartStore.subtotal"
            :tax="cartStore.tax"
            :items="cartStore.items"
            @success="handlePaymentSuccess"
            @cancel="showPaymentForm = false"
          />
        </Card>
      </aside>
    </div>

    <footer class="pos-shortcuts" aria-label="Acciones rápidas de caja">
      <button type="button" @click="focusScanner"><span>⌕</span><b>Buscar</b><small>F2</small></button>
      <button type="button" @click="focusQuantity"><span>▣</span><b>Cantidad</b><small>F4</small></button>
      <button type="button" :disabled="!cartStore.items.length" @click="clearSale"><span>×</span><b>Limpiar venta</b><small>F5</small></button>
      <button type="button" :disabled="hardwareBusy" @click="checkHardwareStatus"><span>↻</span><b>Actualizar</b><small>Hardware</small></button>
      <button type="button" :disabled="hardwareBusy || !hardwareConnected" @click="openDrawer"><span>▣</span><b>Abrir cajón</b><small>F8</small></button>
      <button type="button" :disabled="!cartStore.items.length" @click="openPayment"><span>▭</span><b>Cobrar</b><small>F10</small></button>
    </footer>

    <!-- Modal de éxito de transacción -->
    <Modal
      v-if="transactionSuccessful"
      :is-open="transactionSuccessful"
      title="Transacción Completada"
      @close="transactionSuccessful = false"
    >
      <div class="success-content">
        <div class="success-icon-wrap">
          <div class="success-icon">✓</div>
        </div>
        <div class="success-header">
          <span class="success-badge">Pago exitoso</span>
          <h3>La compra se procesó correctamente</h3>
        </div>
        <div class="transaction-panel">
          <span class="transaction-label">Código de transacción</span>
          <div class="transaction-code-box">
            <span class="transaction-code">{{ transactionCode }}</span>
          </div>
        </div>
        <p class="success-message">La venta quedó registrada y lista para continuar con una nueva operación.</p>
      </div>
      <template #footer>
        <Button
          label="Nueva Compra"
          variant="primary"
          @click="handleNewTransaction"
        />
      </template>
    </Modal>

    <Modal
      v-if="showPendingSyncModal"
      :is-open="showPendingSyncModal"
      title="Error de sincronización"
      @close="showPendingSyncModal = false"
    >
      <p>{{ pendingSyncModalMessage }}</p>
      <template #footer>
        <Button
          label="Entendido"
          variant="primary"
          @click="showPendingSyncModal = false"
        />
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, computed, nextTick, watch } from 'vue'
import { useProductStore } from '@/stores/productStore'
import { useCartStore } from '@/stores/cartStore'
import { useTransactionStore } from '@/stores/transactionStore'
import { useAuthStore } from '@/stores/authStore'
import { useLocalCart } from '@/composables/useLocalCart'
import ProductCatalog from '@/components/pos/ProductCatalog.vue'
import CartItem from '@/components/pos/CartItem.vue'
import PaymentForm from '@/components/pos/PaymentForm.vue'
import Card from '@/components/common/Card.vue'
import Button from '@/components/common/Button.vue'
import Alert from '@/components/common/Alert.vue'
import Modal from '@/components/common/Modal.vue'
import { formatCurrency, isWeightedProduct } from '@/utils/helpers'
import { hardwareAgent } from '@/services/hardwareAgent'
import { api } from '@/services/api'
import type { Product } from '@/types'

// Stores
const productStore = useProductStore()
const cartStore = useCartStore()
const transactionStore = useTransactionStore()
const authStore = useAuthStore()
const localCart = useLocalCart()

// Estado local
const showPaymentForm = ref(false)
const transactionSuccessful = ref(false)
const transactionCode = ref('')
const showPendingSyncModal = ref(false)
const pendingSyncModalMessage = ref('')
const pendingTransactionsCount = computed(() => transactionStore.pendingTransactions.length)
const pendingSyncError = computed(() => transactionStore.pendingTransactions.find((item) => item.lastError)?.lastError)
const pendingSyncMessage = computed(() => {
  return pendingSyncError.value
    ? `Hay ${pendingTransactionsCount.value} venta(s) pendiente(s). No se pudo completar el último intento: ${pendingSyncError.value}. Se volverá a intentar automáticamente.`
    : `Hay ${pendingTransactionsCount.value} venta(s) pendiente(s); se sincronizarán automáticamente al estar disponible el backend.`
})
let lastShownPendingSyncMessage = ''
watch(pendingSyncMessage, (message) => {
  if (pendingSyncError.value && message !== lastShownPendingSyncMessage) {
    pendingSyncModalMessage.value = message
    lastShownPendingSyncMessage = message
    showPendingSyncModal.value = true
  }
}, { immediate: true })
const scannerInput = ref<HTMLInputElement | null>(null)
const weightInput = ref<HTMLInputElement | null>(null)
const barcode = ref('')
const scannerMessage = ref('')
const scannerError = ref(false)
const scannerBusy = ref(false)
const scannerTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const cajaAbierta = ref(false)
const hardwareConnected = ref(false)
const hardwareBusy = ref(false)
const printerName = ref('')
const cashError = ref('')
const cartPulse = ref(false)
const selectedWeightProduct = ref<Product | null>(null)
const weightGrams = ref(0)
const scaleBusy = ref(false)
const scaleMessage = ref('')
const scaleError = ref(false)
const cashSessionKey = computed(() => `pos_cash_session_${authStore.currentUser?.numeroEmpleado || 'anonymous'}`)
const weightKg = computed(() => Math.max(0, Number(weightGrams.value || 0) / 1000))
const canAddWeightedProduct = computed(() => Boolean(selectedWeightProduct.value) && Number(weightGrams.value || 0) > 0)

const isKgProduct = (product?: Partial<Product> & { unidad?: string }) => {
  if (!product) return false
  const unit = String(product.unit ?? product.unidad ?? '').trim().toUpperCase()
  return isWeightedProduct(product) || ['KG', 'G', 'GR', 'GRAMOS'].includes(unit)
}

const loadCajaState = async () => {
  try {
    const response = await api.get('/caja/status')
    cajaAbierta.value = Boolean(response.data?.data?.abierta)
    cashError.value = ''
  } catch {
    try {
      const saved = localStorage.getItem(cashSessionKey.value)
      cajaAbierta.value = saved ? Boolean(JSON.parse(saved)?.cajaAbierta) : false
    } catch {
      cajaAbierta.value = false
    }
  }
}

const openPayment = async () => {
  if (!cartStore.items.length) return
  await loadCajaState()
  if (!cajaAbierta.value) {
    cashError.value = 'Debe abrir la caja del usuario antes de iniciar el cobro.'
    return
  }

  cashError.value = ''
  showPaymentForm.value = true
}

const clearScanner = () => {
  if (scannerTimer.value) {
    clearTimeout(scannerTimer.value)
    scannerTimer.value = null
  }
  barcode.value = ''
  scannerMessage.value = ''
  scannerError.value = false
  nextTick(() => scannerInput.value?.focus())
}

const scheduleBarcodeScan = () => {
  if (document.activeElement === weightInput.value) {
    if (scannerTimer.value) {
      clearTimeout(scannerTimer.value)
      scannerTimer.value = null
    }
    return
  }

  if (scannerTimer.value) clearTimeout(scannerTimer.value)
  scannerTimer.value = setTimeout(() => {
    scannerTimer.value = null
    void scanBarcode()
  }, 180)
}

const scanBarcode = async () => {
  const code = barcode.value.trim().toLowerCase()
  if (!code || scannerBusy.value) return

  scannerBusy.value = true

  let product = productStore.products.find((item) =>
    [item.codigoProd, item.codigoAltern].some((itemCode) => String(itemCode || '').toLowerCase() === code)
  )

  if (!product) {
    product = await productStore.getProductByCode(barcode.value.trim()) || undefined
  }

  if (!product) {
    await productStore.searchProducts(barcode.value.trim())
    product = productStore.products.find((item) =>
      [item.codigoProd, item.codigoAltern].some((itemCode) => String(itemCode || '').trim().toLowerCase() === code)
    )
  }

  if (!product) {
    scannerError.value = true
    scannerMessage.value = `No se encontró el código ${barcode.value.trim()}`
    scannerBusy.value = false
    return
  }

  if ((product.stock || 0) <= 0) {
    scannerError.value = true
    scannerMessage.value = `${product.nombreProd} no tiene existencias`
    scannerBusy.value = false
    return
  }

  if (isKgProduct(product)) {
    selectedWeightProduct.value = product
    scannerError.value = false
    scannerMessage.value = `${product.nombreProd} seleccionado. Introduce el peso para agregarlo.`
    barcode.value = ''
    scannerBusy.value = false
    focusWeightInput()
    return
  }

  cartStore.addItem(product, 1)
  scannerError.value = false
  scannerMessage.value = `${product.nombreProd} agregado`
  barcode.value = ''
  scannerBusy.value = false
  nextTick(() => scannerInput.value?.focus())
}

const checkHardwareStatus = async () => {
  hardwareBusy.value = true
  try {
    const health = await hardwareAgent.health()
    hardwareConnected.value = health?.status === 'ok'
    printerName.value = health?.printers?.[0]?.name || health?.printers?.[0]?.model || ''
  } catch {
    hardwareConnected.value = false
    printerName.value = ''
  } finally {
    hardwareBusy.value = false
  }
}

const openDrawer = async () => {
  if (hardwareBusy.value || !hardwareConnected.value) return
  hardwareBusy.value = true
  try {
    await hardwareAgent.openDrawer()
  } catch {
    hardwareConnected.value = false
  } finally {
    hardwareBusy.value = false
  }
}

const focusScanner = () => {
  nextTick(() => scannerInput.value?.focus())
}

const focusWeightInput = () => {
  if (scannerTimer.value) {
    clearTimeout(scannerTimer.value)
    scannerTimer.value = null
  }
  barcode.value = ''
  scannerInput.value?.blur()
  nextTick(() => {
    weightInput.value?.focus()
    weightInput.value?.select()
  })
}

const focusQuantity = () => {
  const quantityInput = document.querySelector<HTMLInputElement>('.qty-input')
  quantityInput?.focus()
  quantityInput?.select()
}

const clearSale = () => {
  cartStore.clear()
  showPaymentForm.value = false
}

const handleShortcut = (event: KeyboardEvent) => {
  if (event.ctrlKey || event.altKey || event.metaKey) return

  const actions: Record<string, () => void | Promise<void>> = {
    F2: focusScanner,
    F4: focusQuantity,
    F5: clearSale,
    F8: openDrawer,
    F10: openPayment
  }
  const action = actions[event.key]
  if (!action) return

  event.preventDefault()
  void action()
}

// Métodos
const handleSelectProduct = (product: Product) => {
  if (!isKgProduct(product)) {
    selectedWeightProduct.value = null
    weightGrams.value = 0
    scaleMessage.value = 'Selecciona un producto vendido por kg o gramos para usar la báscula.'
    scaleError.value = true
    return
  }

  selectedWeightProduct.value = product
  weightGrams.value = 0
  scaleMessage.value = `${product.nombreProd} listo para venta por peso`
  scaleError.value = false
  focusWeightInput()
}

const handleProductAdd = (product: Product) => {
  cartPulse.value = false
  requestAnimationFrame(() => {
    cartPulse.value = true
  })
  window.setTimeout(() => {
    cartPulse.value = false
  }, 500)
}

const readScaleWeight = async () => {
  try {
    scaleBusy.value = true
    scaleError.value = false
    const response = await hardwareAgent.readScale()
    const normalizedGrams = Number(response?.weightGrams ?? response?.grams)
    const normalizedKg = Number(response?.weightKg)
    const rawWeight = Number.isFinite(normalizedGrams)
      ? normalizedGrams
      : (Number.isFinite(normalizedKg) ? normalizedKg : Number(response?.weight ?? 0))
    const unit = String(response?.unit || 'g').trim().toLowerCase()
    const isKgScale = ['kg', 'kilo', 'kilogram', 'kilogramo', 'kilogramos'].includes(unit)
    const isGramScale = ['g', 'gr', 'gram', 'gramo', 'gramos'].includes(unit)

    weightGrams.value = Number.isFinite(normalizedKg) && !Number.isFinite(normalizedGrams)
      ? normalizedKg * 1000
      : (isKgScale ? rawWeight * 1000 : rawWeight)
    if (response?.stable === false) {
      scaleError.value = true
      scaleMessage.value = 'La báscula no está estable. Repite la lectura.'
      return
    }
    scaleMessage.value = `Peso leído: ${weightKg.value.toFixed(3)} kg`
  } catch {
    scaleError.value = true
    scaleMessage.value = 'No se pudo leer la báscula. Introduce el peso manualmente.'
  } finally {
    scaleBusy.value = false
  }
}

const addWeightedProduct = () => {
  if (!selectedWeightProduct.value || weightKg.value <= 0) return

  const quantity = Number(weightKg.value.toFixed(3))
  if (quantity <= 0) return

  const added = cartStore.addItem(selectedWeightProduct.value, quantity)
  if (!added) {
    scaleError.value = true
    scaleMessage.value = 'No se pudo agregar el producto por peso. Revisa la cantidad ingresada.'
    return
  }

  scaleMessage.value = `${selectedWeightProduct.value.nombreProd} agregado: ${weightKg.value.toFixed(3)} kg`
  scaleError.value = false
  weightGrams.value = 0
  cartPulse.value = false
  focusWeightInput()
  requestAnimationFrame(() => {
    cartPulse.value = true
  })
  window.setTimeout(() => {
    cartPulse.value = false
  }, 500)
}

const handleRemoveItem = (itemId: string) => {
  console.log('Item removido:', itemId)
}

const handleUpdateItem = (itemId: string, quantity: number) => {
  console.log('Item actualizado:', itemId, 'cantidad:', quantity)
}

const handlePaymentSuccess = (code: string) => {
  transactionCode.value = code
  transactionSuccessful.value = true
  showPaymentForm.value = false
}

const handleNewTransaction = () => {
  transactionSuccessful.value = false
  // El carrito ya fue limpiado en el componente PaymentForm
}

// Load products on mount
onMounted(async () => {
  window.addEventListener('keydown', handleShortcut)
  loadCajaState()
  productStore.loadProducts()
  await localCart.loadFromLocal()
  await transactionStore.loadPendingTransactions()
  await checkHardwareStatus()
  nextTick(() => scannerInput.value?.focus())
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleShortcut)
})
</script>

<style scoped>
.pos-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  padding: 0 0.8rem 0.55rem;
  background: #eef5f9;
  color: #18212b;
}

.pos-topbar {
  position: relative;
  z-index: 1500;
  display: flex;
  align-items: stretch;
  min-height: 3.65rem;
  margin: 0 -0.8rem 0.75rem;
  padding: 0 1.4rem;
  background: #102d4c;
  color: white;
  box-shadow: 0 2px 8px rgba(16, 45, 76, 0.18);
}

.brand-block,
.topbar-item,
.topbar-status,
.topbar-settings {
  display: flex;
  align-items: center;
}

.brand-block {
  gap: 0.55rem;
  min-width: 14rem;
  padding-right: 1.25rem;
  border-right: 1px solid rgba(255, 255, 255, 0.12);
}

.brand-mark {
  color: #42a9f5;
  font-size: 2rem;
  font-weight: 900;
  line-height: 1;
}

.brand-block strong { display: block; font-size: 1.15rem; letter-spacing: 0.03em; }
.brand-block small,
.topbar-item small,
.topbar-status small { display: block; color: #b9c9d9; font-size: 0.58rem; }

.topbar-item {
  gap: 0.55rem;
  padding: 0 1.2rem;
  border-right: 1px solid rgba(255, 255, 255, 0.12);
}

.topbar-item strong { font-size: 0.76rem; }
.topbar-icon { color: #e7f1fb; font-size: 1.4rem; }
.live-dot { color: #35c285; font-style: normal; font-size: 0.65rem; }
.live-dot.off { color: #e16b61; }
.topbar-status { padding: 0 0.9rem; color: #dbe8f4; font-size: 0.63rem; line-height: 1.2; }
.topbar-settings {
  position: relative;
  z-index: 1600;
  margin-left: auto;
  color: white;
  font-size: 1.25rem;
  text-decoration: none;
}

.pos-header,
.scanner-panel,
.hardware-bar,
.pos-container {
  max-width: 1400px;
  margin-left: auto;
  margin-right: auto;
}

.pos-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 0.6rem;
}

.eyebrow {
  margin: 0 0 0.3rem;
  color: #0b7a75;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.pos-header h1 { margin: 0; color: #18212b; font-size: clamp(1.7rem, 3vw, 2.35rem); }
.header-subtitle { margin: 0.35rem 0 0; color: #65717d; }
.header-status { display: flex; align-items: center; gap: 0.8rem; white-space: nowrap; }
.cash-status,
.hardware-state { display: inline-flex; align-items: center; gap: 0.45rem; font-size: 0.86rem; font-weight: 700; }
.cash-status.open,
.hardware-state.connected { color: #18794e; }
.cash-status.closed,
.hardware-state.disconnected { color: #a34735; }
.status-dot { width: 0.55rem; height: 0.55rem; border-radius: 50%; background: currentColor; }
.cash-link { color: #0b7a75; font-size: 0.86rem; font-weight: 700; text-decoration: none; }

.scanner-panel {
  display: grid;
  grid-template-columns: auto minmax(220px, 1fr) auto;
  align-items: center;
  gap: 0.45rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid #d7e5f0;
  border-radius: 8px;
  background: white;
}

.scanner-copy,
.scanner-copy > div { display: flex; align-items: center; gap: 0.45rem; }
.scanner-copy strong { color: #173758; font-size: 0.72rem; white-space: nowrap; }
.scanner-icon { color: #1677d2; font-size: 1rem; font-weight: 900; }
.scanner-input-wrap { position: relative; display: flex; gap: 0.35rem; }
.scanner-input { width: 100%; min-width: 0; padding: 0.55rem 2.2rem 0.55rem 0.65rem; border: 1px solid #d7e3ef; border-radius: 6px; background: #f8fbfe; font-size: 0.76rem; min-height: 34px; }
.scanner-input:focus { outline: 2px solid rgba(22, 119, 210, 0.18); border-color: #1677d2; }
.clear-scanner { position: absolute; right: 5.2rem; top: 50%; transform: translateY(-50%); border: 0; background: transparent; color: #6c7a7a; cursor: pointer; font-size: 1.1rem; }
.scan-button { border: 0; border-radius: 6px; padding: 0 0.75rem; background: #1677d2; color: white; font-size: 0.7rem; font-weight: 800; cursor: pointer; min-height: 34px; }
.scanner-message { margin: 0; font-size: 0.72rem; font-weight: 700; }
.scanner-message.success { color: #18794e; }
.scanner-message.error { color: #a34735; }

.hardware-bar { display: none; }
.printer-name { color: #65717d; font-size: 0.8rem; margin-right: auto; }
.hardware-action { border: 1px solid #0b7a75; border-radius: 5px; padding: 0.45rem 0.75rem; background: #0b7a75; color: white; cursor: pointer; font-size: 0.78rem; font-weight: 700; }
.hardware-action.secondary { background: transparent; color: #0b7a75; }
.hardware-action:disabled { cursor: not-allowed; opacity: 0.5; }
.pos-page > .alert { max-width: 1400px; width: 100%; margin: 0 auto 0.5rem; padding: 0.55rem 0.75rem; }

.pos-container {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(320px, 420px);
  gap: 0.9rem;
  align-items: stretch;
}

.pos-main-column {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 0.7rem;
}

.quick-tools {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.55rem;
  align-items: stretch;
}

.pos-shortcuts {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  min-height: 3rem;
  margin-top: 0.6rem;
  border: 1px solid #d7e5f0;
  border-radius: 7px;
  background: #f7fbfe;
  color: #294766;
}

.scale-panel {
  display: grid;
  grid-template-columns: minmax(170px, 220px) minmax(0, 1fr);
  align-items: start;
  gap: 0.42rem;
  max-width: 1400px;
  width: 100%;
  margin: 0;
  padding: 0.42rem 0.6rem;
  border: 1px solid #cfe1ee;
  border-radius: 8px;
  background: #f7fbfe;
  transition: border-color 0.25s ease, box-shadow 0.25s ease, transform 0.25s ease;
}

.scale-panel.is-ready {
  border-color: rgba(11, 122, 117, 0.45);
  box-shadow: 0 8px 20px rgba(11, 122, 117, 0.08);
}

.scale-heading {
  display: flex;
  align-items: center;
  gap: 0.42rem;
  min-width: 0;
}

.scale-icon {
  color: #0b7a75;
  font-size: 1.1rem;
}

.scale-heading strong,
.scale-heading small {
  display: block;
}

.scale-heading strong {
  color: #173758;
  font-size: 0.72rem;
}

.scale-heading small {
  overflow: hidden;
  color: #66809b;
  font-size: 0.62rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scale-input-wrap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
  gap: 0.32rem;
  min-width: 0;
}

.weight-input-shell {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  flex: 0 0 auto;
}

.weight-input-shell input {
  width: 6.8rem;
  min-width: 0;
  padding: 0.42rem 0.5rem;
  border: 1px solid #c8dbea;
  border-radius: 5px;
  background: white;
  color: #173758;
  font-size: 0.72rem;
  min-height: 34px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.weight-input-shell.has-focus input {
  border-color: #0b7a75;
  box-shadow: 0 0 0 3px rgba(11, 122, 117, 0.08);
  transform: translateY(-1px);
}

.weight-helper {
  margin-top: 0.18rem;
  color: #0b7a75;
  font-size: 0.56rem;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  animation: helperPulse 1.8s ease-in-out infinite;
}

@keyframes helperPulse {
  0%, 100% { opacity: 0.6; transform: translateX(0); }
  50% { opacity: 1; transform: translateX(2px); }
}

.scale-conversion {
  min-width: 4rem;
  color: #0b7a75;
  font-size: 0.68rem;
  font-weight: 800;
  flex: 0 0 auto;
}

.scale-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.42rem 0.52rem;
  border: 1px solid #1677d2;
  border-radius: 5px;
  background: #1677d2;
  color: white;
  cursor: pointer;
  font-size: 0.68rem;
  font-weight: 700;
  white-space: nowrap;
  min-height: 34px;
  flex: 0 0 auto;
}

.scale-action.secondary {
  border-color: #0b7a75;
  background: transparent;
  color: #0b7a75;
}

.scale-action:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.scale-guidance {
  grid-column: 1 / -1;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.42rem 0.55rem;
  border-radius: 8px;
  background: linear-gradient(90deg, rgba(11, 122, 117, 0.08), rgba(22, 119, 210, 0.08));
  border: 1px solid rgba(11, 122, 117, 0.14);
  color: #173758;
  font-size: 0.62rem;
  font-weight: 700;
  animation: guidanceSlide 0.35s ease-out;
}

.guidance-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.2rem;
  height: 1.2rem;
  border-radius: 50%;
  background: rgba(11, 122, 117, 0.1);
  color: #0b7a75;
  font-size: 0.8rem;
}

@keyframes guidanceSlide {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.scale-message {
  grid-column: 1 / -1;
  margin: 0;
  color: #18794e;
  font-size: 0.64rem;
  font-weight: 700;
}

.scale-message.error {
  color: #a34735;
}

.pos-shortcuts button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  border-right: 1px solid #d7e5f0;
  border-top: 0;
  border-bottom: 0;
  border-left: 0;
  background: transparent;
  color: #294766;
  cursor: pointer;
  font-size: 0.68rem;
  min-height: 48px;
  touch-action: manipulation;
}

.pos-shortcuts button:last-child { border-right: 0; }
.pos-shortcuts button:hover:not(:disabled) { background: #eaf3fb; color: #1677d2; }
.pos-shortcuts button:disabled { cursor: not-allowed; opacity: 0.4; }
.pos-shortcuts button span { font-size: 1.1rem; }
.pos-shortcuts b { color: #173758; font-size: 0.65rem; }
.pos-shortcuts small { color: #7890a8; font-size: 0.58rem; }

/* Sección de productos */
.products-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  flex: 1;
}

/* Sección de carrito */
.cart-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  height: 100%;
  transition: all 0.28s ease;
}

.cart-section-pulse {
  animation: cart-updated 0.5s ease;
}

.cart-section.payment-expanded {
  position: fixed;
  top: 3.65rem;
  right: 1rem;
  width: min(430px, calc(100vw - 2rem));
  bottom: 0;
  z-index: 1200;
  height: calc(100vh - 3.65rem);
}

.cart-section.payment-expanded :deep(.card) {
  height: 100%;
  border-radius: 0 0 16px 16px;
  box-shadow: 0 30px 60px rgba(15, 23, 42, 0.28);
}

.cart-section.payment-expanded :deep(.card-header) {
  min-height: 2.2rem;
  padding: 0 0.55rem 0.15rem;
  margin-top: 0;
}

.cart-section.payment-expanded :deep(.card-body) {
  overflow: visible;
  padding: 0 0.4rem 0.15rem;
  min-height: 0;
}

@keyframes cart-updated {
  0% { transform: translateX(0); }
  35% { transform: translateX(-4px); }
  70% { transform: translateX(4px); }
  100% { transform: translateX(0); }
}

.products-section :deep(.product-catalog),
.cart-section :deep(.card) {
  height: 100%;
  min-height: 0;
}

.cart-section :deep(.card) {
  display: flex;
  flex: 1;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  border: 1px solid rgba(141, 169, 197, 0.35);
  border-radius: 18px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(245, 250, 255, 0.92));
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.10);
  transition: all 0.28s ease;
}

.cart-section :deep(.card-header) {
  display: flex;
  align-items: center;
  min-height: 2.6rem;
  padding: 0.7rem 0.9rem 0.8rem;
  background: linear-gradient(135deg, #0f2d46 0%, #184d7f 100%);
  color: white;
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  font-size: 0.9rem;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.cart-section :deep(.card-body) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  overflow: visible;
  padding: 0.75rem 0.75rem 0.8rem;
  background: radial-gradient(circle at top, rgba(125, 211, 252, 0.08), transparent 35%);
}

.cart-section :deep(.payment-form) {
  flex: 1 1 auto;
  min-height: 0;
  height: auto;
  overflow: visible;
  max-height: none;
  width: 100%;
  scrollbar-width: none;
  gap: 0.2rem;
}

.cart-section :deep(.payment-form)::-webkit-scrollbar {
  display: none;
}

.cart-hero {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 0.55rem 0.55rem 0.65rem;
  margin-bottom: 0.65rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 14px;
  background: linear-gradient(135deg, rgba(15, 118, 110, 0.07), rgba(59, 130, 246, 0.08));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.5);
  animation: heroFadeIn 0.35s ease;
}

.cart-hero-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  width: fit-content;
  padding: 0.34rem 0.7rem;
  border-radius: 999px;
  background: rgba(15, 118, 110, 0.12);
  color: #0f766e;
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.cart-hero-badge-icon {
  color: #10b981;
  font-size: 0.72rem;
  animation: pulseDot 1.4s ease-in-out infinite;
}

.cart-hero-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.55rem;
}

.metric-chip {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  padding: 0.5rem 0.6rem;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: rgba(255, 255, 255, 0.8);
}

.metric-chip-highlight {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(16, 185, 129, 0.1));
  border-color: rgba(59, 130, 246, 0.2);
}

.metric-label {
  color: #64748b;
  font-size: 0.58rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.metric-chip strong {
  color: #0f172a;
  font-size: 0.8rem;
  font-weight: 800;
  line-height: 1.2;
}

.metric-chip-highlight strong {
  color: #0f766e;
}

@keyframes heroFadeIn {
  from { opacity: 0; transform: translateY(-6px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes pulseDot {
  0%, 100% { opacity: 0.7; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.18); }
}

.cart-items-container {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  flex: 1;
  min-height: 0;
  height: 100%;
  max-height: none;
  padding: 0;
}

.cart-items-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.05rem 0.1rem;
}

.items-heading {
  color: #1f2d3d;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.items-count {
  color: #64748b;
  font-size: 0.62rem;
  font-weight: 700;
}

.cart-items {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  min-height: auto;
  max-height: none;
  overflow: visible;
  overflow-x: hidden;
  padding: 0.1rem 0.05rem 0;
  scrollbar-width: thin;
  scrollbar-color: #7aa8d1 #edf3f8;
}

.cart-items::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

.cart-items::-webkit-scrollbar-track {
  background: rgba(237, 243, 248, 0.9);
  border-radius: 999px;
}

.cart-items::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #89afd7 0%, #5b86b2 100%);
  border: 2px solid rgba(255, 255, 255, 0.8);
  border-radius: 999px;
}

.cart-items::-webkit-scrollbar-thumb:hover {
  background: linear-gradient(180deg, #719fcf 0%, #4a7299 100%);
}

.cart-summary {
  background: linear-gradient(180deg, #f8fbff 0%, #eff6ff 100%);
  padding: 0.6rem 0.7rem;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.78rem;
}

.summary-row .label {
  color: #51607a;
  font-weight: 600;
}

.summary-row .value {
  color: #1f2d3d;
  font-weight: 700;
}

.summary-row.total {
  border-top: 1px solid rgba(148, 163, 184, 0.25);
  padding-top: 0.5rem;
  margin-top: 0.3rem;
  font-size: 0.95rem;
}

.cart-summary {
  flex-shrink: 0;
}

.summary-row.total .value {
  color: #0f9f73;
  font-size: 1.1rem;
}

.cart-actions {
  display: flex;
  gap: 0.42rem;
  justify-content: space-between;
  margin-top: 0.08rem;
}

.cart-actions :deep(.btn) {
  flex: 1;
  min-height: 2.35rem;
  padding: 0.38rem 0.6rem;
  font-size: 0.72rem;
  border-radius: 10px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.cart-actions :deep(.btn:hover:not(:disabled)) {
  transform: translateY(-1px);
  box-shadow: 0 10px 18px rgba(15, 23, 42, 0.08);
}

/* Contenido de éxito */
.success-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 1rem;
  padding: 0.5rem 0.2rem 0.4rem;
}

.success-icon-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 5.25rem;
  height: 5.25rem;
  border-radius: 50%;
  background: radial-gradient(circle at center, rgba(34, 197, 94, 0.18), rgba(34, 197, 94, 0.03) 60%, transparent 100%);
  animation: floatBadge 2.2s ease-in-out infinite;
}

.success-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.8rem;
  height: 3.8rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #2ec27e, #19a564);
  color: white;
  font-size: 2rem;
  font-weight: 900;
  box-shadow: 0 18px 30px rgba(34, 197, 94, 0.35);
}

@keyframes floatBadge {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-6px); }
}

.success-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
}

.success-badge {
  display: inline-flex;
  padding: 0.32rem 0.7rem;
  border-radius: 999px;
  background: rgba(16, 185, 129, 0.12);
  color: #0e7d51;
  font-size: 0.7rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.success-header h3 {
  margin: 0;
  color: #102d4c;
  font-size: 1.15rem;
  font-weight: 800;
}

.transaction-panel {
  width: 100%;
  padding: 0.8rem 0.85rem;
  border-radius: 16px;
  border: 1px solid rgba(148, 163, 184, 0.2);
  background: linear-gradient(180deg, rgba(239, 246, 255, 0.95), rgba(255, 255, 255, 0.8));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

.transaction-label {
  display: block;
  margin-bottom: 0.55rem;
  color: #65717d;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.transaction-code-box {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.7rem 0.75rem;
  border-radius: 10px;
  background: linear-gradient(135deg, rgba(15, 118, 110, 0.06), rgba(16, 185, 129, 0.06));
  border: 1px solid rgba(15, 118, 110, 0.12);
}

.transaction-code {
  display: block;
  font-size: 1.1rem;
  font-weight: 800;
  color: #0f766e;
  font-family: 'Courier New', monospace;
  letter-spacing: 0.03em;
  word-break: break-all;
}

.success-message {
  margin: 0;
  color: #475569;
  font-size: 0.88rem;
  line-height: 1.5;
}

/* Responsive */
@media (max-width: 900px) {
  .scanner-panel { grid-template-columns: 1fr 1fr; }
  .scanner-message { grid-column: 1 / -1; }
  .pos-container {
    grid-template-columns: 1fr;
  }
  .cart-section {
    position: sticky;
    bottom: 0;
    background: white;
    padding: 1rem;
    border-top: 2px solid #e0e0e0;
    max-height: 50vh;
  }

  .scale-panel {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 700px) {
  .pos-page { overflow: auto; }
  .pos-header { align-items: flex-start; flex-direction: column; }
  .header-status { width: 100%; justify-content: space-between; }
  .scanner-panel { grid-template-columns: 1fr; }
  .scanner-input-wrap { min-width: 0; }
  .scale-input-wrap { flex-wrap: wrap; }
  .scale-input-wrap input { flex: 1; width: auto; }
  .hardware-bar { flex-wrap: wrap; gap: 0.6rem; }
  .printer-name { margin-right: 0; }
  .pos-container { flex: none; }
  .cart-section { position: static; max-height: none; }
}

@media (max-width: 768px) {
  .pos-page {
    padding: 1rem 0;
  }

  .pos-container {
    gap: 1rem;
    padding: 0 0.5rem;
  }

  .cart-items {
    max-height: 300px;
  }
}
</style>

