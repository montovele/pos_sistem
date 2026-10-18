<template>
  <div class="payment-form">
    <div class="payment-scroll">
      <!-- Header -->
      <div class="form-header">
        <h3>Procesar Pago</h3>
        <div class="totals-summary">
          <div class="total-row">
            <span class="label">Subtotal:</span>
            <span class="value">{{ formatCurrency(subtotal) }}</span>
          </div>
          <div class="total-row">
            <span class="label">IVA (16%):</span>
            <span class="value">{{ formatCurrency(tax) }}</span>
          </div>
          <div class="total-row total-amount">
            <span class="label">Total a pagar:</span>
            <span class="value">{{ formatCurrency(total) }}</span>
          </div>
        </div>
      </div>

      <!-- Métodos de pago -->
      <div class="payment-methods">
        <h4>Selecciona método de pago</h4>
        <div class="methods-grid">
          <button
            v-for="method in paymentMethods"
            :key="method.id"
            :class="['method-btn', { active: selectedMethod === method.id }]"
            @click="selectedMethod = method.id"
          >
            <span class="method-icon">{{ method.icon }}</span>
            <span class="method-name">{{ method.name }}</span>
          </button>
        </div>
      </div>

      <!-- Detalles específicos del método -->
      <div v-if="selectedMethod === 'cash'" class="method-details cash-method">
        <div class="info-box">
          <p><strong>Cobro en efectivo:</strong></p>

          <div class="cash-section">
            <span class="section-label">Cantidades rápidas</span>
            <div class="quick-amounts">
              <button
                v-for="preset in quickCashAmounts"
                :key="preset"
                type="button"
                class="quick-amount-btn"
                @click="cashReceived = preset"
              >
                {{ formatCurrency(preset) }}
              </button>
            </div>
          </div>

          <div class="cash-row">
            <label class="meta-label" for="cash-received">Cantidad manual</label>
            <input
              id="cash-received"
              v-model.number="cashReceived"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              class="form-input"
            />
          </div>
          <div class="terminal-meta">
            <span class="meta-label">Cambio:</span>
            <span class="meta-value">{{ formatCurrency(changeAmount) }}</span>
          </div>
        </div>
      </div>

      <div v-else-if="selectedMethod === 'terminal'" class="method-details terminal-method">
        <div class="info-box">
          <p><strong>Cobro con terminal bancaria:</strong></p>
          <p>Solicita al cliente pagar mediante la terminal del banco. El cobro se confirma al finalizar la venta.</p>
          <div class="terminal-meta">
            <span class="meta-label">Monto:</span>
            <span class="meta-value">{{ formatCurrency(total) }}</span>
          </div>
          <div class="terminal-meta">
            <span class="meta-label">Referencia:</span>
            <input
              v-model="terminalReference"
              type="text"
              placeholder="Ej. Autorización / folio"
              class="form-input"
            />
          </div>
        </div>
      </div>

      <!-- Notas/observaciones -->
      <div class="form-group">
        <label>Notas (opcional)</label>
        <textarea
          v-model="notes"
          placeholder="Agregar observaciones..."
          class="form-textarea"
          rows="2"
        ></textarea>
      </div>

      <!-- Estado de proceso -->
      <div v-if="isProcessing" class="processing-state">
        <div class="spinner"></div>
        <p>Procesando pago...</p>
      </div>

      <!-- Error -->
      <Alert
        v-if="error"
        :message="error"
        type="error"
        dismissible
        @close="error = ''"
      />

      <!-- Éxito -->
      <Alert
        v-if="successMessage"
        :message="successMessage"
        type="success"
        :auto-close="true"
        :duration="3000"
      />
    </div>

    <!-- Botones de acción -->
    <div class="form-actions">
      <button
        class="btn btn-secondary"
        @click="handleCancel"
        :disabled="isProcessing"
      >
        Cancelar
      </button>
      <button
        class="btn btn-primary"
        @click="handleSubmit"
        :disabled="!isFormValid || isProcessing"
      >
        <span v-if="isProcessing" class="spinner-mini"></span>
        {{ isProcessing ? 'Procesando...' : 'Confirmar Pago' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useCartStore } from '@/stores/cartStore'
import { useAuthStore } from '@/stores/authStore'
import { formatCurrency, generateTransactionCode, isWeightedProduct } from '@/utils/helpers'
import { createSaleAndPrint } from '@/services/saleService'
import Alert from '@/components/common/Alert.vue'

const props = defineProps<{
  total: number
  subtotal: number
  tax: number
  items: any[]
}>()

const emit = defineEmits<{
  success: [transactionCode: string]
  cancel: []
}>()

// Stores
const cartStore = useCartStore()
const authStore = useAuthStore()

// Estado de formulario
const selectedMethod = ref('cash')
const terminalReference = ref('')
const notes = ref('')
const globalDiscountPercent = ref(0)
const cashReceived = ref(Number(props.total || 0))
const isProcessing = ref(false)
const error = ref('')
const successMessage = ref('')

// Métodos de pago
const paymentMethods = [
  { id: 'cash', name: 'Efectivo', icon: '💵' },
  { id: 'terminal', name: 'Terminal bancaria', icon: '🏧' }
]

const paymentTotals = computed(() => {
  const baseSubtotal = Number(props.subtotal || 0)
  const baseDiscount = props.items.reduce((sum, item) => {
    const unitPrice = Number(item?.price ?? item?.product?.price ?? 0)
    const quantity = Number(item?.quantity ?? 1)
    const discountRate = Number(item?.discountRate ?? item?.product?.discountRate ?? 0)
    return sum + (((unitPrice * quantity) * discountRate) / 100)
  }, 0)

  const saleDiscount = (baseSubtotal - baseDiscount) * (Number(globalDiscountPercent.value || 0) / 100)
  const finalSubtotal = Math.max(0, baseSubtotal - baseDiscount - saleDiscount)
  const finalTotal = finalSubtotal + Number(props.tax || 0)

  return {
    subtotal: Number(baseSubtotal.toFixed(2)),
    lineDiscount: Number(baseDiscount.toFixed(2)),
    globalDiscount: Number(saleDiscount.toFixed(2)),
    total: Number(finalTotal.toFixed(2))
  }
})

const quickCashAmounts = computed(() => {
  const total = Number(props.total || 0)
  const basePresets = [50, 100, 200, 500, 1000, 2000]
  const valid = basePresets.filter((amount) => amount >= total)
  return valid.length ? valid.slice(0, 5) : [total]
})

// Código de transacción
const transactionCode = generateTransactionCode()

const changeAmount = computed(() => {
  const received = Number(cashReceived.value || 0)
  const total = Number(props.total || 0)
  return Number((received - total).toFixed(2))
})

watch(
  () => props.total,
  (newTotal) => {
    const total = Number(newTotal || 0)
    if (!cashReceived.value || cashReceived.value < total) {
      cashReceived.value = total
    }
  },
  { immediate: true }
)

// Validación
const isFormValid = computed(() => {
  switch (selectedMethod.value) {
    case 'cash':
      return Number(cashReceived.value || 0) >= Number(props.total || 0)
    case 'terminal':
      return true
    default:
      return false
  }
})

const handleSubmit = async () => {
  try {
    isProcessing.value = true
    error.value = ''

    if (selectedMethod.value === 'cash' && Number(cashReceived.value || 0) < Number(props.total || 0)) {
      error.value = 'El monto recibido no puede ser menor al total de la venta.'
      return
    }

    const normalizedItems = cartStore.cart.items.map((item) => {
      const isWeightProduct = isWeightedProduct(item.product)
      const productUnit = isWeightProduct ? 'KG' : 'PZA'
      const quantity = Number(item.quantity ?? 0)
      const unitPrice = Number(item.price ?? item.product?.price ?? 0)
      const subtotal = Number((unitPrice * quantity).toFixed(2))

      return {
        ...item,
        productId: item.productId ?? item.product?.id,
        codigoProd: item.product?.codigoProd ?? item.codigoProd,
        nombreProd: item.product?.nombreProd ?? item.nombreProd,
        unit: productUnit,
        quantity,
        price: unitPrice,
        subtotal,
        total: subtotal,
        saleByWeight: isWeightProduct
      }
    })

    const saleResult = await createSaleAndPrint({
      items: normalizedItems,
      total: Number(paymentTotals.value.total || props.total || 0),
      paymentMethod: selectedMethod.value,
      discount: Number(globalDiscountPercent.value || 0),
      employeeNumber: authStore.currentUser?.numeroEmpleado,
      customer: { nombre: 'Consumidor final', rfc: 'XAXX010101000' }
    })

    const registeredCode = saleResult.sale?.codigoTransaccion || transactionCode

    if (saleResult.offline) {
      successMessage.value = saleResult.print.status === 'failed'
        ? `✅ Venta guardada localmente. Impresión pendiente: ${saleResult.print.error || 'El agente local no está disponible.'}`
        : `✅ Venta guardada e impresa localmente. Pendiente de sincronización: ${registeredCode}`
    } else if (saleResult.print.status === 'failed') {
      successMessage.value = `✅ Venta registrada. Impresión pendiente: ${saleResult.print.error || 'No se pudo imprimir el ticket del agente local.'}`
    } else {
      successMessage.value = `✅ Pago procesado exitosamente. Código: ${registeredCode}`
    }

    setTimeout(() => {
      cartStore.clear()
      emit('success', registeredCode)
    }, 1500)
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Error al procesar pago'
  } finally {
    isProcessing.value = false
  }
}

const handleCancel = () => {
  // Resetear formulario
  selectedMethod.value = 'cash'
  terminalReference.value = ''
  notes.value = ''
  error.value = ''
  successMessage.value = ''

  emit('cancel')
}
</script>

<style scoped>
.payment-form {
  background: transparent;
  border: none;
  border-radius: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  overflow: hidden;
  max-height: none;
  min-height: 0;
  height: 100%;
}

.payment-scroll {
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 0.08rem;
}

/* Header */
.form-header {
  border-bottom: 1px solid #e1eaf2;
  padding: 0 0 0.18rem;
}

.form-header h3 {
  margin: 0 0 0.25rem;
  font-size: 0.92rem;
  color: #173758;
}

/* Resumen de totales */
.totals-summary {
  background: #f5f9fc;
  padding: 0.35rem 0.45rem;
  border: 1px solid #e1eaf2;
  border-radius: 7px;
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
}

.total-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.76rem;
}

.total-row.total-amount {
  border-top: 1px solid #d7e5f0;
  padding-top: 0.4rem;
  margin-top: 0.3rem;
  font-size: 0.92rem;
  font-weight: 700;
}

.total-row .label {
  color: #657b91;
}

.total-row .value {
  color: #173758;
  font-weight: 600;
}

.total-row.total-amount .value {
  color: #0b7a75;
}

/* Métodos de pago */
.payment-methods {
  display: flex;
  flex-direction: column;
  gap: 0.26rem;
}

.payment-methods h4 {
  margin: 0;
  font-size: 0.82rem;
  color: #173758;
}

.methods-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.35rem;
}

.method-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.08rem;
  padding: 0.28rem 0.18rem;
  border: 1px solid #d7e5f0;
  background: white;
  border-radius: 7px;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #58718a;
}

.method-btn:hover {
  border-color: #83b9df;
  background: #f5f9fc;
}

.method-btn.active {
  border-color: #1677d2;
  background: #eff6ff;
  color: #1677d2;
  font-weight: 600;
}

.method-icon {
  font-size: 1rem;
}

.method-name {
  font-size: 0.7rem;
  text-align: center;
}

/* Detalles de método */
.method-details {
  background: #f5f9fc;
  padding: 0.35rem 0.4rem;
  border: 1px solid #e1eaf2;
  border-radius: 7px;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.info-box {
  background: #fff;
  padding: 0.42rem 0.5rem;
  border-left: 3px solid #1677d2;
  border-radius: 4px;
}

.info-box p {
  margin: 0.25rem 0;
  font-size: 0.76rem;
  color: #173758;
}

.terminal-method .info-box {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.cash-section {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin: 0.18rem 0 0.28rem;
}

.section-label {
  font-size: 0.68rem;
  font-weight: 700;
  color: #173758;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.quick-amounts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.quick-amount-btn {
  border: 1px solid #d7e5f0;
  background: #f8fbff;
  color: #173758;
  border-radius: 6px;
  padding: 0.4rem 0.55rem;
  font-size: 0.72rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.quick-amount-btn:hover {
  border-color: #83b9df;
  background: #eef7ff;
}

.cash-row {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  margin: 0.18rem 0 0.3rem;
}

.terminal-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding-top: 0.2rem;
  border-top: 1px solid #e1eaf2;
  font-size: 0.72rem;
}

.meta-label {
  color: #657b91;
  font-weight: 600;
}

.meta-value {
  color: #173758;
  font-weight: 700;
}

.qr-method {
  align-items: center;
  padding: 0.75rem 0.7rem;
}

.qr-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  max-width: 240px;
  min-height: 220px;
  padding: 0.65rem;
  border: 1px solid #dfeaf4;
  border-radius: 12px;
  background: linear-gradient(180deg, #ffffff, #f8fbff);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.qr-image {
  display: block;
  width: 100%;
  max-width: 200px;
  height: auto;
  border-radius: 8px;
  background: white;
}

.qr-reference {
  font-family: 'Courier New', monospace;
  font-size: 0.72rem;
  word-break: break-all;
}

/* Formulario */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}

.form-group label {
  font-weight: 600;
  font-size: 0.72rem;
  color: #35546f;
}

.form-input,
.form-textarea {
  padding: 0.44rem 0.55rem;
  border: 1px solid #d7e5f0;
  border-radius: 6px;
  font-size: 0.76rem;
  transition: all 0.2s ease;
  font-family: inherit;
}

.form-input:focus,
.form-textarea:focus {
  outline: none;
  border-color: #667eea;
  box-shadow: 0 0 0 3px rgba(22, 119, 210, 0.1);
}

.form-textarea {
  resize: vertical;
  min-height: 34px;
  max-height: 60px;
}

/* Acciones */
.form-actions {
  position: sticky;
  bottom: 0;
  display: flex;
  gap: 0.35rem;
  justify-content: flex-end;
  padding: 0.12rem 0 0;
  border-top: 1px solid #e1eaf2;
  background: rgba(255, 255, 255, 0.96);
  z-index: 2;
  flex-shrink: 0;
}

.btn {
  padding: 0.48rem 0.7rem;
  border: none;
  border-radius: 6px;
  font-size: 0.76rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  min-width: 0;
  flex: 1;
}

.btn-primary {
  background: #1677d2;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #0f5eaa;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(22, 119, 210, 0.25);
}

.btn-secondary {
  background: #eef3f7;
  color: #35546f;
}

.btn-secondary:hover:not(:disabled) {
  background: #dce7ef;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spinner-mini {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Processing state */
.processing-state {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  border-radius: 0;
}

.spinner {
  width: 50px;
  height: 50px;
  border: 5px solid rgba(255, 255, 255, 0.3);
  border-top-color: #667eea;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 1rem;
}

.processing-state p {
  color: #2c3e50;
  font-weight: 600;
  font-size: 1.1rem;
  background: white;
  padding: 1rem 2rem;
  border-radius: 8px;
}

/* Responsive */
@media (max-width: 768px) {
  .payment-form {
    padding: 0.6rem;
  }

  .methods-grid {
    grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .form-actions {
    flex-direction: row;
  }

  .btn {
    width: auto;
  }
}
</style>
