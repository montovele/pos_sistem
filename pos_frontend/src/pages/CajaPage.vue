<template>
  <div class="caja-page">
    <header class="caja-hero">
      <div class="hero-copy">
        <p class="eyebrow">Control de turno</p>
        <h1>Gestión de Caja</h1>
        <p class="hero-description">Abre tu turno, controla las ventas y realiza el arqueo antes de cerrar.</p>
      </div>
      <div class="hero-status">
        <span class="status-dot" :class="cajaAbierta ? 'is-open' : 'is-closed'"></span>
        <div>
          <small>Estado de la caja</small>
          <strong>{{ cajaAbierta ? 'Abierta' : 'Cerrada' }}</strong>
        </div>
        <Button
          v-if="!cajaAbierta"
          label="Abrir caja"
          variant="success"
          @click="openCaja"
        />
        <Button
          v-else
          label="Cerrar caja"
          variant="danger"
          @click="closeCaja"
        />
      </div>
    </header>

    <Alert
      v-if="!isOnline"
      type="warning"
      :message="'📴 Sin conexión. La sesión de la caja y las ventas pendientes se guardan localmente y se sincronizan cuando vuelva la red.'"
    />

    <div class="caja-toolbar">
      <div class="connection-badge" :class="isOnline ? 'online' : 'offline'">
        <span class="connection-dot"></span>{{ isOnline ? 'Conectado' : 'Modo sin conexión' }}
      </div>
      <p v-if="!cajaAbierta && !error" class="next-step">Abre la caja para comenzar a registrar y consultar ventas.</p>
      <p v-else class="next-step">Turno de {{ cajeroActual || 'cajero actual' }} · Apertura {{ horaApertura || '-' }}</p>
    </div>

    <Alert
      v-if="error"
      type="error"
      :message="error"
      class="mt-4"
    />
    <Alert
      v-if="successMessage"
      type="success"
      :message="successMessage"
      class="mt-4"
    />
    <Alert
      v-if="salesNotice"
      type="info"
      :message="salesNotice"
      class="mt-4"
    />

    <main class="operations-container">
      <section class="section-block day-overview">
        <div class="section-intro">
          <div><p class="section-kicker">Vista general</p><h2>Resumen del turno</h2></div>
          <span class="section-note">Datos acumulados de la caja actual</span>
        </div>
        <div class="summary-grid">
          <div class="summary-item featured"><span class="label">Ventas totales</span><strong class="amount">{{ formatCurrency(totalVentas) }}</strong><small>Ingresos registrados</small></div>
          <div class="summary-item"><span class="label">Transacciones</span><strong class="amount">{{ totalTransacciones }}</strong><small>Operaciones realizadas</small></div>
          <div class="summary-item"><span class="label">Ticket promedio</span><strong class="amount">{{ formatCurrency(promedio) }}</strong><small>Valor por operación</small></div>
          <div class="summary-item cash-card"><span class="label">Efectivo recibido</span><strong class="amount cash">{{ formatCurrency(totalEfectivo) }}</strong><small>Base para el arqueo</small></div>
        </div>
      </section>

      <section class="section-block payment-block">
        <div class="section-intro"><div><p class="section-kicker">Composición de ventas</p><h2>Métodos de pago</h2></div></div>
        <div class="payment-methods">
          <div v-for="(metodo, key) in metodoPago" :key="key" class="payment-method">
            <span class="method-name">{{ formatMetodoPago(key) }}</span>
            <span class="method-count">({{ metodo.count }})</span>
            <span class="method-amount">{{ formatCurrency(metodo.total) }}</span>
          </div>
        </div>
      </section>

      <section class="section-block transactions-block">
        <div class="section-intro"><div><p class="section-kicker">Detalle operativo</p><h2>Ventas registradas</h2></div><span class="section-note">{{ transacciones.length }} operaciones</span></div>
        <div v-if="isLoadingTransactions" class="loading">
          Cargando transacciones...
        </div>
        <Alert
          v-else-if="!transacciones.length"
          type="info"
          message="No hay transacciones registradas"
        />
        <div v-else class="transactions-list">
          <div class="transactions-header">
            <span class="col-id">ID</span>
            <span class="col-hora">Hora</span>
            <span class="col-items">Items</span>
            <span class="col-metodo">Método</span>
            <span class="col-monto">Monto</span>
          </div>
          <div
            v-for="trans in transacciones"
            :key="trans.id"
            class="transaction-row"
          >
            <span class="col-id">#{{ trans.id?.substring(0, 8) }}</span>
            <span class="col-hora">{{ formatTime(trans.fechaDeTrans) }}</span>
            <span class="col-items">{{ trans.cantidadItems || 0 }}</span>
            <span class="col-metodo">{{ trans.tipoPago || 'Efectivo' }}</span>
            <span class="col-monto">{{ formatCurrency(trans.montoTotal || 0) }}</span>
          </div>
        </div>
      </section>

      <section class="section-block count-block">
        <div class="section-intro"><div><p class="section-kicker">Paso final del turno</p><h2>Arqueo de caja</h2><p class="section-description">Compara lo esperado con el efectivo que tienes físicamente.</p></div></div>
        <div class="arqueo-container">
          <div class="arqueo-section">
            <span class="step-number">1</span><h3>Efectivo esperado</h3>
            <div class="arqueo-item">
              <span class="label">Base de caja:</span>
              <span class="amount">{{ formatCurrency(baseCaja) }}</span>
            </div>
            <div class="arqueo-item">
              <span class="label">+ Ventas en efectivo:</span>
              <span class="amount">{{ formatCurrency(totalEfectivo) }}</span>
            </div>
            <div class="arqueo-item total">
              <span class="label">= Total Esperado:</span>
              <span class="amount">{{ formatCurrency(totalEsperado) }}</span>
            </div>
          </div>

          <div class="arqueo-section">
            <span class="step-number">2</span><h3>Efectivo contado</h3>
            <div class="arqueo-input">
              <label>Cantidad contada en efectivo:</label>
              <input
                v-model.number="efectivoContado"
                type="number"
                placeholder="0.00"
                step="0.01"
              />
            </div>
          </div>

          <div class="arqueo-section">
            <span class="step-number">3</span><h3>Resultado</h3>
            <div class="arqueo-item" :class="diferencia >= 0 ? 'positive' : 'negative'">
              <span class="label">Diferencia:</span>
              <span class="amount">{{ formatCurrency(diferencia) }}</span>
            </div>
            <div v-if="diferencia < 0" class="cuadratura-error">
              Faltante de caja: {{ formatCurrency(Math.abs(diferencia)) }}
            </div>
            <div v-else-if="diferencia > 0" class="cuadratura-ok">
              Sobrante de caja: {{ formatCurrency(diferencia) }}
            </div>
            <div v-if="diferencia === 0" class="cuadratura-ok">
              ✅ Caja cuadrada
            </div>
            <div v-else class="cuadratura-error">
              ⚠️ Diferencia encontrada: {{ formatCurrency(diferencia) }}
            </div>
          </div>
        </div>

        <div v-if="cajaAbierta" class="arqueo-actions">
          <Button
            label="Guardar Arqueo"
            variant="primary"
            :disabled="isProcessing || efectivoContado === null"
            @click="saveArqueo"
          />
          <Button
            label="Limpiar"
            variant="secondary"
            @click="limpiarArqueo"
          />
        </div>
      </section>

      <section class="section-block history-block">
        <div class="section-intro"><div><p class="section-kicker">Consulta</p><h2>Historial de cajas</h2></div><span class="section-note">Aperturas y cierres anteriores</span></div>
        <div v-if="isLoadingHistorial" class="loading">
          ⏳ Cargando historial...
        </div>
        <Alert
          v-else-if="!historialCajas.length"
          type="info"
          message="Sin historial de aperturas/cierres"
        />
        <div v-else class="historial-list">
          <div class="historial-header">
            <span class="col-fecha">Fecha</span>
            <span class="col-cajero">Cajero</span>
            <span class="col-apertura">Apertura</span>
            <span class="col-cierre">Cierre</span>
            <span class="col-total">Total</span>
            <span class="col-diferencia">Diferencia</span>
          </div>
          <div
            v-for="hist in historialCajas"
            :key="hist.id"
            class="historial-row"
          >
            <span class="col-fecha">{{ formatDate(hist.fechaApertura) }}</span>
            <span class="col-cajero">{{ hist.cajero || hist.nombreCajero || '-' }}</span>
            <span class="col-apertura">{{ hist.horaApertura }}</span>
            <span class="col-cierre">{{ hist.horaCierre || hist.fechaCierre || '-' }}</span>
            <span class="col-total">{{ formatCurrency(hist.totalVentas) }}</span>
            <span class="col-diferencia" :class="hist.diferencia === 0 ? 'ok' : 'error'">
              {{ formatCurrency(hist.diferencia) }}
            </span>
          </div>
        </div>
      </section>
    </main>

    <!-- Modal de abrir caja -->
    <Modal
      :is-open="showOpenModal"
      title="🔓 Abrir Caja"
      @close="closeOpenModal"
    >
      <div class="modal-form">
        <div class="form-group">
          <label>Base de Caja (Efectivo Inicial) *</label>
          <input
            v-model.number="baseCajaInput"
            type="number"
            placeholder="0.00"
            step="0.01"
            required
          />
        </div>
      </div>
      <template #footer>
        <Button
          label="Cancelar"
          variant="secondary"
          @click="closeOpenModal"
        />
        <Button
          label="Abrir Caja"
          variant="success"
          :disabled="baseCajaInput <= 0"
          @click="handleOpenCaja"
        />
      </template>
    </Modal>

    <!-- Modal de cerrar caja -->
    <Modal
      :is-open="showCloseModal"
      title="🔒 Cerrar Caja"
      @close="closeCloseModal"
    >
      <div class="close-confirmation">
        <p>¿Está seguro de que desea cerrar la caja?</p>
        <p class="info">Se guardará el arqueo y el total de ventas: <strong>{{ formatCurrency(totalVentas) }}</strong></p>
        <Alert
          v-if="efectivoContado === null"
          type="warning"
          message="Guarde primero el efectivo contado para poder cerrar la caja."
        />
      </div>
      <template #footer>
        <Button
          label="Cancelar"
          variant="secondary"
          @click="closeCloseModal"
        />
        <Button
          label="Cerrar Caja"
          variant="danger"
          :disabled="isProcessing || efectivoContado === null"
          @click="handleCloseCaja"
        />
      </template>
    </Modal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useTransactionStore } from '@/stores/transactionStore'
import Button from '@/components/common/Button.vue'
import Alert from '@/components/common/Alert.vue'
import Modal from '@/components/common/Modal.vue'
import { api } from '@/services/api'
import { enqueueCashOpening } from '@/services/cashSessionSync'
import { formatCurrency } from '@/utils/helpers'

interface Transaction {
  id: string
  fechaDeTrans: string
  cantidadItems: number
  tipoPago: string
  montoTotal: number
}

interface CajaHistory {
  id: string
  fechaApertura: string
  horaApertura: string
  horaCierre?: string
  fechaCierre?: string
  cajero?: string
  nombreCajero?: string
  totalVentas: number
  diferencia: number
}

// Stores
const authStore = useAuthStore()
const transactionStore = useTransactionStore()

// Estado
const cajaAbierta = ref(false)
const cajeroActual = ref('')
const horaApertura = ref('')
const horaCierre = ref('')
const baseCaja = ref(0)
const efectivoContado = ref<number | null>(null)
const backendTotalVentas = ref<number | null>(null)
const backendTotalEfectivo = ref<number | null>(null)
const backendTotalEsperado = ref<number | null>(null)
const backendTotalTransacciones = ref<number | null>(null)
const backendDiferencia = ref<number | null>(null)
const transacciones = ref<Transaction[]>([])
const historialCajas = ref<CajaHistory[]>([])
const error = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const salesNotice = ref<string | null>(null)
const isLoadingTransactions = ref(false)
const isLoadingHistorial = ref(false)
const isProcessing = ref(false)
const isOnline = ref<boolean>(navigator.onLine)
const cashSessionKey = computed(() => `pos_cash_session_${authStore.currentUser?.numeroEmpleado || 'anonymous'}`)
const cashSessionClientId = ref('')
const cashSessionSyncStatus = ref<'synced' | 'pending'>('synced')
const cashSessionServerId = ref<string | null>(null)
const isBackendUnavailable = (err: any) =>
  !navigator.onLine || (Number(err?.status) >= 500 && Number(err?.status) < 600) ||
  /network|offline|failed to fetch|fetch|timeout|ERR_NETWORK|ECONNABORTED|status code 5\d\d/i.test(String(err?.message || ''))

// Modales
const showOpenModal = ref(false)
const showCloseModal = ref(false)
const baseCajaInput = ref<number | null>(null)

// Métodos de pago
const metodoPago = ref<Record<string, { count: number; total: number }>>({
  efectivo: { count: 0, total: 0 },
  tarjeta: { count: 0, total: 0 },
  cheque: { count: 0, total: 0 },
  transferencia: { count: 0, total: 0 }
})

// Computed
const totalVentas = computed(() => {
  if (backendTotalVentas.value !== null) return backendTotalVentas.value
  return transacciones.value.reduce((sum, t) => sum + (t.montoTotal || 0), 0)
})

const totalTransacciones = computed(() => {
  if (backendTotalTransacciones.value !== null) return backendTotalTransacciones.value
  return transacciones.value.length
})

const promedio = computed(() => {
  if (totalTransacciones.value === 0) return 0
  return totalVentas.value / totalTransacciones.value
})

const totalEfectivo = computed(() => {
  if (backendTotalEfectivo.value !== null) return backendTotalEfectivo.value
  return metodoPago.value.efectivo?.total || 0
})

const totalEsperado = computed(() => {
  if (backendTotalEsperado.value !== null) return backendTotalEsperado.value
  return baseCaja.value + totalEfectivo.value
})

const diferencia = computed(() => {
  if (backendDiferencia.value !== null) return backendDiferencia.value
  if (efectivoContado.value === null) return 0
  return efectivoContado.value - totalEsperado.value
})

const applyCajaData = (data: any) => {
  cajaAbierta.value = Boolean(data?.abierta)
  cajeroActual.value = data?.cajero || ''
  horaApertura.value = data?.horaApertura || ''
  horaCierre.value = data?.horaCierre || ''
  baseCaja.value = Number(data?.base || 0)
  efectivoContado.value = data?.efectivoContado == null
    ? null
    : Number(data.efectivoContado)
  backendTotalVentas.value = data?.totalVentas == null ? null : Number(data.totalVentas)
  backendTotalEfectivo.value = data?.totalEfectivo == null ? null : Number(data.totalEfectivo)
  backendTotalEsperado.value = data?.totalEsperado == null ? null : Number(data.totalEsperado)
  backendTotalTransacciones.value = data?.totalTransacciones == null ? null : Number(data.totalTransacciones)
  backendDiferencia.value = data?.diferencia == null ? null : Number(data.diferencia)
}

// Métodos
const getOfflineTransactionsKey = () => `${cashSessionKey.value}_transactions`
const getOfflineHistoryKey = () => `${cashSessionKey.value}_history`

const saveCajaState = () => {
  const session = {
    cajaAbierta: cajaAbierta.value,
    cajeroActual: cajeroActual.value,
    horaApertura: horaApertura.value,
    horaCierre: horaCierre.value,
    baseCaja: baseCaja.value,
    efectivoContado: efectivoContado.value,
    clientSessionId: cashSessionClientId.value,
    syncStatus: cashSessionSyncStatus.value,
    backendSessionId: cashSessionServerId.value,
    updatedAt: new Date().toISOString()
  }

  localStorage.setItem(cashSessionKey.value, JSON.stringify(session))
}

const persistOfflineTransactions = () => {
  localStorage.setItem(getOfflineTransactionsKey(), JSON.stringify(transacciones.value))
}

const loadOfflineTransactions = () => {
  try {
    const raw = localStorage.getItem(getOfflineTransactionsKey())
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const persistOfflineHistory = () => {
  localStorage.setItem(getOfflineHistoryKey(), JSON.stringify(historialCajas.value))
}

const loadOfflineHistory = () => {
  try {
    const raw = localStorage.getItem(getOfflineHistoryKey())
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const loadPersistedCajaState = () => {
  try {
    const saved = localStorage.getItem(cashSessionKey.value)
    if (!saved) return

    const session = JSON.parse(saved)
    cajaAbierta.value = !!session.cajaAbierta
    cajeroActual.value = session.cajeroActual || ''
    horaApertura.value = session.horaApertura || ''
    horaCierre.value = session.horaCierre || ''
    baseCaja.value = Number(session.baseCaja || 0)
    efectivoContado.value = session.efectivoContado == null ? null : Number(session.efectivoContado)
    cashSessionClientId.value = session.clientSessionId || ''
    cashSessionSyncStatus.value = session.syncStatus === 'pending' ? 'pending' : 'synced'
    cashSessionServerId.value = session.backendSessionId || null
  } catch (err) {
    console.error('Error cargando estado persistido de caja:', err)
  }
}

const loadCajaStatus = async () => {
  try {
    const response = await api.get('/caja/status')
    if (response.data.success) {
      const data = response.data.data
      if (!data?.abierta && cajaAbierta.value && cashSessionSyncStatus.value === 'pending') {
        error.value = null
        return
      }
      applyCajaData(data)
      cashSessionClientId.value = data?.clientSessionId || ''
      cashSessionSyncStatus.value = 'synced'
      cashSessionServerId.value = data?.id || null
      if (!data?.abierta) {
        error.value = 'No hay una caja abierta para este usuario. Abre la caja para ver ventas y totales reales.'
      } else {
        error.value = null
      }
      saveCajaState()
    }
  } catch (err: any) {
    console.error('Error loading caja status:', err)
    loadPersistedCajaState()
    if (isBackendUnavailable(err)) {
      error.value = null
      successMessage.value = '📴 Modo offline: la caja continúa con el último estado local disponible.'
      return
    }
    error.value = 'No se pudo cargar el estado de caja. Verifica que el backend esté disponible y que el usuario esté autenticado.'
  }
}

const loadTransacciones = async () => {
  try {
    isLoadingTransactions.value = true
    salesNotice.value = null
    const response = await api.get('/caja/ventas')
    if (response.data.success) {
      transacciones.value = (response.data.data || []).map((transaction: any) => ({
        ...transaction,
        id: transaction.codigoTransaccion,
        cantidadItems: transaction.items?.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0),
        tipoPago: transaction.paymentMethod,
        montoTotal: transaction.total
      }))

      if (!transacciones.value.length && !cajaAbierta.value) {
        error.value = 'No hay ventas asociadas a la caja actual. La sesión debe estar abierta y debe existir al menos una venta registrada.'
      }

      // Calcular métodos de pago
      metodoPago.value = {
        efectivo: { count: 0, total: 0 },
        tarjeta: { count: 0, total: 0 },
        cheque: { count: 0, total: 0 },
        transferencia: { count: 0, total: 0 }
      }

      transacciones.value.forEach(t => {
        const tipo = (t.tipoPago || 'efectivo').toLowerCase()
        const metodo = tipo === 'cash' || tipo === 'money' ? 'efectivo' : tipo
        if (metodo in metodoPago.value) {
          metodoPago.value[metodo].count++
          metodoPago.value[metodo].total += t.montoTotal || 0
        }
      })

      persistOfflineTransactions()
    }
  } catch (err: any) {
    console.error('Error loading transacciones:', err)
    if (isBackendUnavailable(err)) {
      transacciones.value = loadOfflineTransactions()
      error.value = null
      salesNotice.value = transacciones.value.length
        ? 'No fue posible actualizar las ventas. Mostramos la copia guardada en este dispositivo; los datos se actualizarán cuando el servicio vuelva a estar disponible.'
        : 'No fue posible conectar con el servicio de ventas y no hay una copia local disponible. Las ventas nuevas se conservarán en este dispositivo para sincronizarlas más tarde.'
    } else {
      error.value = 'No pudimos cargar las ventas. Comprueba tu sesión e inténtalo de nuevo.'
    }
  } finally {
    isLoadingTransactions.value = false
  }
}

const loadHistorial = async () => {
  try {
    isLoadingHistorial.value = true
    const response = await api.get('/caja/history')
    if (response.data.success) {
      historialCajas.value = response.data.data || []
      persistOfflineHistory()
    }
  } catch (err: any) {
    console.error('Error loading historial:', err)
    const offline = !navigator.onLine || /network|offline|failed to fetch|fetch|timeout|ERR_NETWORK|ECONNABORTED/i.test(String(err?.message || ''))
    if (offline) {
      historialCajas.value = loadOfflineHistory()
    }
  } finally {
    isLoadingHistorial.value = false
  }
}

const openCaja = () => {
  baseCajaInput.value = 0
  showOpenModal.value = true
}

const closeOpenModal = () => {
  showOpenModal.value = false
  baseCajaInput.value = null
}

const openCajaLocally = async () => {
  const employeeNumber = authStore.currentUser?.numeroEmpleado
  if (employeeNumber == null) {
    error.value = 'No se pudo identificar al cajero para guardar la apertura local.'
    return
  }

  try {
    const queued = await enqueueCashOpening({
      baseCaja: Number(baseCajaInput.value || 0),
      cajero: authStore.currentUser?.nombreEmpleado || 'Sistema',
      numeroEmpleado: employeeNumber
    }, employeeNumber)

    baseCaja.value = Number(baseCajaInput.value || 0)
    cajaAbierta.value = true
    cajeroActual.value = authStore.currentUser?.nombreEmpleado || 'Sistema'
    horaApertura.value = new Date().toLocaleString('es-ES')
    horaCierre.value = ''
    cashSessionClientId.value = queued.clientSessionId
    cashSessionSyncStatus.value = 'pending'
    cashSessionServerId.value = null
    successMessage.value = '📴 Caja abierta localmente. La apertura quedó guardada y se sincronizará antes que las ventas al recuperar el backend.'
    saveCajaState()
    closeOpenModal()
  } catch (queueError: any) {
    error.value = `No se pudo guardar la apertura local: ${queueError?.message || 'Error de almacenamiento'}`
  }
}

const handleOpenCaja = async () => {
  try {
    isProcessing.value = true
    error.value = null
    successMessage.value = null

    if (!baseCajaInput.value || baseCajaInput.value <= 0) {
      error.value = 'Debe ingresar una base de caja válida'
      return
    }

    if (!navigator.onLine) {
      await openCajaLocally()
      return
    }

    const response = await api.post('/caja/open', {
      baseCaja: baseCajaInput.value,
      cajero: authStore.currentUser?.nombreEmpleado || 'Sistema',
      numeroEmpleado: authStore.currentUser?.numeroEmpleado
    })

    if (response.data.success) {
      successMessage.value = 'Caja abierta correctamente'
      baseCaja.value = baseCajaInput.value
      cajaAbierta.value = true
      cajeroActual.value = authStore.currentUser?.nombreEmpleado || 'Sistema'
      horaApertura.value = new Date().toLocaleString('es-ES')
      horaCierre.value = ''
      cashSessionClientId.value = response.data.data?.clientSessionId || ''
      cashSessionSyncStatus.value = 'synced'
      cashSessionServerId.value = response.data.data?.id || null
      saveCajaState()
      closeOpenModal()
      loadCajaStatus()
      loadTransacciones()
    } else {
      error.value = response.data.message || 'Error al abrir caja'
    }
  } catch (err: any) {
    if (isBackendUnavailable(err)) {
      await openCajaLocally()
      return
    }
    error.value = err.message || 'Error al procesar la solicitud'
    saveCajaState()
  } finally {
    isProcessing.value = false
  }
}

const closeCaja = () => {
  showCloseModal.value = true
}

const closeCloseModal = () => {
  showCloseModal.value = false
}

const handleCloseCaja = async () => {
  try {
    isProcessing.value = true
    error.value = null
    successMessage.value = null

    const response = await api.post('/caja/close', {
      efectivoContado: efectivoContado.value
    })

    if (response.data.success) {
      successMessage.value = 'Caja cerrada correctamente'
      applyCajaData(response.data.data)
      saveCajaState()
      closeCloseModal()
      loadCajaStatus()
      loadHistorial()
      efectivoContado.value = null
    } else {
      error.value = response.data.message || 'Error al cerrar caja'
    }
  } catch (err: any) {
    const offline = !navigator.onLine || /network|offline|failed to fetch|fetch|timeout|ERR_NETWORK|ECONNABORTED/i.test(String(err?.message || ''))
    if (offline) {
      cajaAbierta.value = false
      horaCierre.value = new Date().toLocaleString('es-ES')
      successMessage.value = '📴 Modo offline: la caja quedó cerrada localmente y se sincronizará después.'
      saveCajaState()
      closeCloseModal()
      persistOfflineHistory()
      return
    }
    error.value = err.message || 'Error al procesar la solicitud'
  } finally {
    isProcessing.value = false
  }
}

const saveArqueo = async () => {
  try {
    isProcessing.value = true
    error.value = null
    successMessage.value = null

    const response = await api.post('/caja/arqueo', {
      efectivoContado: efectivoContado.value
    })

    if (response.data.success) {
      successMessage.value = 'Arqueo guardado correctamente'
      applyCajaData(response.data.data)
      saveCajaState()
      await loadHistorial()
    } else {
      error.value = response.data.message || 'Error al guardar arqueo'
    }
  } catch (err: any) {
    const offline = !navigator.onLine || /network|offline|failed to fetch|fetch|timeout|ERR_NETWORK|ECONNABORTED/i.test(String(err?.message || ''))
    if (offline) {
      backendDiferencia.value = efectivoContado.value !== null ? efectivoContado.value - totalEsperado.value : 0
      successMessage.value = '📴 Modo offline: arqueo guardado localmente y pendiente de sincronización.'
      saveCajaState()
      persistOfflineHistory()
      return
    }
    error.value = err.message || 'Error al procesar la solicitud'
  } finally {
    isProcessing.value = false
  }
}

const limpiarArqueo = () => {
  efectivoContado.value = null
  backendDiferencia.value = null
}

const formatMetodoPago = (metodo: string): string => {
  const map: Record<string, string> = {
    efectivo: '💵 Efectivo',
    tarjeta: '💳 Tarjeta',
    cheque: '📄 Cheque',
    transferencia: '💻 Transferencia'
  }
  return map[metodo] || metodo
}

const formatTime = (dateString: string): string => {
  try {
    return new Date(dateString).toLocaleTimeString('es-ES', {
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch {
    return '-'
  }
}

const formatDate = (dateString: string): string => {
  try {
    return new Date(dateString).toLocaleDateString('es-ES')
  } catch {
    return '-'
  }
}

// Load on mount
onMounted(() => {
  loadPersistedCajaState()
  loadCajaStatus()
  loadTransacciones()
  loadHistorial()

  const handleConnectionChange = () => {
    isOnline.value = navigator.onLine
    if (isOnline.value) {
      successMessage.value = '🌐 Conexión restaurada. Se reanudará la sincronización.'
    }
  }

  window.addEventListener('online', handleConnectionChange)
  window.addEventListener('offline', handleConnectionChange)

  // Refresh every 30 seconds
  const interval = setInterval(() => {
    loadCajaStatus()
    loadTransacciones()
  }, 30000)

  onUnmounted(() => {
    clearInterval(interval)
    window.removeEventListener('online', handleConnectionChange)
    window.removeEventListener('offline', handleConnectionChange)
  })
})
</script>

<style scoped>
.caja-page {
  max-width: 1400px;
  margin: 0 auto;
  padding: 2rem 1rem 3rem;
  min-height: 100vh;
  background:
    radial-gradient(circle at top left, rgba(59, 130, 246, 0.12), transparent 28%),
    linear-gradient(180deg, #f5f9fd 0%, #edf4f9 100%);
}

.hero-header {
  background: linear-gradient(135deg, #11233d 0%, #1d4e89 48%, #0f172a 100%);
  border-radius: 24px;
  padding: 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.12);
  margin-bottom: 1.25rem;
}

.eyebrow {
  margin: 0 0 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.7);
}

.page-header h1 {
  margin: 0;
  color: white;
  font-size: clamp(1.8rem, 3vw, 2.7rem);
}

.header-actions {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.connection-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.55rem 0.9rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 700;
  margin-bottom: 1rem;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
}

.connection-badge.online {
  background: rgba(34, 197, 94, 0.12);
  color: #166534;
}

.connection-badge.offline {
  background: rgba(239, 68, 68, 0.12);
  color: #991b1b;
}

.summary-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.summary-card {
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 18px;
  padding: 1.1rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  box-shadow: 0 10px 25px rgba(15, 23, 42, 0.05);
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
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #64748b;
}

.summary-card strong {
  font-size: 1.8rem;
  line-height: 1.1;
  color: #0f172a;
}

.summary-card small {
  color: #64748b;
}

.caja-status {
  margin-bottom: 1rem;
}

.caja-status :deep(.card) {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 20px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
}

.caja-status :deep(.card-header) {
  padding: 1rem 1.2rem;
  background: linear-gradient(180deg, #f8fafc 0%, #eef6ff 100%);
  border-bottom: 1px solid #ebf1f5;
  color: #173758;
  font-size: 0.95rem;
  font-weight: 800;
}

.caja-status :deep(.card-body) {
  padding: 1rem;
}

.status-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}

.status-item {
  display: flex;
  flex-direction: column;
  padding: 0.9rem;
  background: linear-gradient(180deg, #f8fbff 0%, #f1f7ff 100%);
  border: 1px solid #dfeaf8;
  border-left: 4px solid #1677d2;
  border-radius: 12px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.status-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 18px rgba(23, 55, 88, 0.08);
}

.status-item .label {
  color: #66809b;
  font-size: 0.7rem;
  margin-bottom: 0.35rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.status-item .value {
  font-size: 1.05rem;
  font-weight: 700;
  color: #0f172a;
}

.status-item .value.abierta {
  color: #15803d;
}

.status-item .value.cerrada {
  color: #b91c1c;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}

.summary-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.85rem;
  background: linear-gradient(135deg, #f8fbfe, #edf6fb);
  border: 1px solid #dceaf3;
  border-radius: 12px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.summary-item:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 16px rgba(23, 55, 88, 0.08);
}

.summary-item .label {
  color: #66809b;
  font-size: 0.78rem;
  font-weight: 600;
}

.summary-item .amount {
  font-size: 1.2rem;
  font-weight: 800;
  color: #0f172a;
}

.summary-item .amount.cash {
  color: #15803d;
}

.payment-methods {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.7rem;
}

.payment-method {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.4rem;
  padding: 0.8rem 0.9rem;
  background: linear-gradient(180deg, #fffdf5 0%, #fffaf0 100%);
  border: 1px solid #f4e3b1;
  border-left: 4px solid #f59e0b;
  border-radius: 12px;
}

.method-name {
  font-weight: 700;
  color: #334155;
}

.method-count {
  color: #64748b;
  font-size: 0.82rem;
}

.method-amount {
  font-size: 0.95rem;
  font-weight: 800;
  color: #b45309;
}

.loading {
  text-align: center;
  padding: 1.5rem;
  color: #64748b;
  font-weight: 600;
  animation: caja-pulse 1.4s ease-in-out infinite;
}

.transactions-list,
.historial-list {
  max-height: 290px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.transactions-header,
.historial-header {
  display: grid;
  gap: 0.65rem;
  padding: 0.6rem 0.75rem;
  background: linear-gradient(135deg, #122b47 0%, #1c3f68 100%);
  color: white;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  border-radius: 10px 10px 0 0;
  margin-bottom: 0.5rem;
}

.transactions-header {
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
}

.historial-header {
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
}

.transaction-row,
.historial-row {
  display: grid;
  gap: 0.65rem;
  padding: 0.65rem 0.75rem;
  border-bottom: 1px solid #e8eff4;
  align-items: center;
  font-size: 0.78rem;
}

.transaction-row {
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
}

.historial-row {
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr 1fr;
}

.transaction-row:hover,
.historial-row:hover {
  background: #f1f8fc;
  transform: translateX(2px);
  transition: background 0.2s ease, transform 0.2s ease;
}

.arqueo-container {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  padding: 0.5rem 0;
}

.arqueo-section {
  padding: 0.8rem;
  background: linear-gradient(180deg, #f8fbfe 0%, #f2f7fc 100%);
  border: 1px solid #dceaf3;
  border-radius: 12px;
  border-top: 3px solid #1677d2;
}

.arqueo-section h3 {
  margin: 0 0 0.75rem;
  color: #173758;
  font-size: 0.92rem;
}

.arqueo-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.55rem 0;
  border-bottom: 1px solid #e8eef5;
}

.arqueo-item.total {
  border-bottom: none;
  border-top: 2px solid #334155;
  padding-top: 0.75rem;
  font-weight: 800;
  margin-top: 0.75rem;
}

.arqueo-item.positive {
  color: #15803d;
}

.arqueo-item.negative {
  color: #b91c1c;
}

.arqueo-input {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.arqueo-input label {
  font-weight: 600;
  color: #334155;
}

.arqueo-input input {
  padding: 0.75rem;
  border: 1px solid #c8dbea;
  border-radius: 10px;
  font-size: 0.95rem;
  color: #173758;
  background: white;
}

.arqueo-input input:focus,
.form-group input:focus {
  outline: none;
  border-color: #1677d2;
  box-shadow: 0 0 0 3px rgba(22, 119, 210, 0.12);
}

.cuadratura-ok,
.cuadratura-error {
  padding: 0.7rem;
  border-radius: 8px;
  text-align: center;
  font-weight: 700;
  margin-top: 0.65rem;
}

.cuadratura-ok {
  background: #dcfce7;
  color: #166534;
}

.cuadratura-error {
  background: #fee2e2;
  color: #991b1b;
}

.arqueo-actions {
  display: flex;
  gap: 0.6rem;
  margin-top: 1rem;
  justify-content: flex-end;
}

.modal-form {
  padding: 1rem 0;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.form-group label {
  font-weight: 600;
  color: #334155;
}

.form-group input {
  padding: 0.75rem;
  border: 1px solid #dbe3ee;
  border-radius: 8px;
  font-size: 1rem;
}

.close-confirmation {
  padding: 1rem 0;
}

.close-confirmation p {
  margin: 0.5rem 0;
}

.close-confirmation .info {
  color: #1d4ed8;
  font-weight: 600;
}

.operations-container {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.operations-container :deep(.card) {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 20px;
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.06);
}

.operations-container :deep(.card-header) {
  padding: 0.8rem 1rem;
  background: linear-gradient(180deg, #f8fafc 0%, #eef6ff 100%);
  border-bottom: 1px solid #ebf1f5;
  color: #173758;
  font-size: 0.92rem;
  font-weight: 800;
}

.operations-container :deep(.card-body) {
  padding: 0.85rem;
}

@media (max-width: 760px) {
  .caja-page {
    padding: 1rem 0.7rem;
  }

  .page-header,
  .hero-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.8rem;
  }

  .header-actions,
  .header-actions :deep(.btn) {
    width: 100%;
  }

  .status-grid,
  .summary-grid,
  .payment-methods,
  .arqueo-container {
    grid-template-columns: 1fr;
  }

  .transactions-list,
  .historial-list {
    overflow-x: auto;
  }

  .transactions-header,
  .transaction-row {
    min-width: 620px;
  }

  .historial-header,
  .historial-row {
    min-width: 760px;
  }

  .arqueo-actions {
    flex-direction: column;
  }

  .arqueo-actions :deep(.btn) {
    width: 100%;
  }
}

@media (max-width: 1050px) and (min-width: 761px) {
  .status-grid,
  .summary-grid,
  .payment-methods {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .arqueo-container {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.col-id { grid-column: 1; }
.col-hora { grid-column: 2; }
.col-items { grid-column: 3; }
.col-metodo { grid-column: 4; }
.col-monto { grid-column: 5; }
.col-fecha { grid-column: 1; }
.col-cajero { grid-column: 2; }
.col-apertura { grid-column: 3; }
.col-cierre { grid-column: 4; }
.col-total { grid-column: 5; }
.col-diferencia { grid-column: 6; }

.col-diferencia.ok {
  color: #16a34a;
  font-weight: 700;
}

.col-diferencia.error {
  color: #dc2626;
  font-weight: 700;
}

.mt-4 {
  margin-top: 0 !important;
}

/* Visual hierarchy for the cashier's daily workflow. */
.caja-page {
  max-width: 1180px;
  padding: 1.5rem clamp(1rem, 3vw, 2.5rem) 3.5rem;
  background: #f6f8f7;
  color: #173b3a;
}

.caja-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 2rem;
  margin-bottom: 1.1rem;
  padding: clamp(1.35rem, 4vw, 2.25rem);
  border-radius: 10px;
  background: #173b3a;
  box-shadow: 0 16px 30px rgba(23, 59, 58, .16);
}

.hero-copy .eyebrow { color: #9dd7c2; }
.hero-description { max-width: 34rem; margin: .65rem 0 0; color: #c5ded7; line-height: 1.5; }
.hero-status { display: flex; align-items: center; gap: .8rem; min-width: 21rem; padding: .85rem 1rem; border: 1px solid rgba(255,255,255,.18); border-radius: 8px; background: rgba(255,255,255,.08); color: #fff; }
.hero-status small { display: block; margin-bottom: .15rem; color: #b3cec7; font-size: .72rem; }
.hero-status strong { display: block; font-size: 1.05rem; }
.hero-status :deep(.btn) { margin-left: auto; white-space: nowrap; }
.status-dot, .connection-dot { display: inline-block; width: .65rem; height: .65rem; border-radius: 50%; }
.status-dot.is-open, .connection-dot { background: #55d69c; box-shadow: 0 0 0 4px rgba(85,214,156,.15); }
.status-dot.is-closed { background: #f5b35d; box-shadow: 0 0 0 4px rgba(245,179,93,.15); }
.caja-toolbar { display: flex; align-items: center; gap: 1rem; min-height: 2.5rem; margin-bottom: 1.2rem; }
.connection-badge { margin: 0; padding: .4rem .7rem; border-radius: 6px; font-size: .78rem; box-shadow: none; }
.connection-badge .connection-dot { width: .45rem; height: .45rem; margin-right: .45rem; box-shadow: none; }
.connection-badge.offline .connection-dot { background: #dc6b58; }
.next-step { margin: 0; color: #58706f; font-size: .88rem; }
.section-block { padding: 1.25rem; border: 1px solid #dce7e4; border-radius: 9px; background: #fff; box-shadow: 0 5px 16px rgba(23,59,58,.045); }
.section-intro { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
.section-kicker { margin: 0 0 .25rem; color: #16806b; font-size: .68rem; font-weight: 800; letter-spacing: .11em; text-transform: uppercase; }
.section-intro h2 { margin: 0; color: #173b3a; font-size: 1.2rem; }
.section-note { color: #718685; font-size: .82rem; }
.section-description { margin: .4rem 0 0; color: #718685; font-size: .88rem; }
.day-overview { border-top: 4px solid #16806b; }
.summary-grid { gap: .7rem; }
.summary-item { display: block; min-height: 7.3rem; padding: 1rem; border: 1px solid #e0ebe8; border-radius: 7px; background: #f7faf9; }
.summary-item:hover { transform: none; box-shadow: none; }
.summary-item.featured { background: #edf8f3; border-color: #b9e1d1; }
.summary-item.cash-card { background: #fff8ed; border-color: #f2ddb8; }
.summary-item .label { display: block; margin-bottom: .45rem; color: #627876; font-size: .72rem; text-transform: uppercase; }
.summary-item .amount { display: block; color: #173b3a; font-size: 1.35rem; }
.summary-item small { display: block; margin-top: .4rem; color: #80918f; font-size: .78rem; }
.summary-item .amount.cash { color: #a95c17; }
.payment-block, .transactions-block, .count-block, .history-block { margin-top: .9rem; }
.payment-methods { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.payment-method { display: block; padding: .85rem; border: 1px solid #e4ebe9; border-left: 3px solid #d7a247; border-radius: 7px; background: #fffdf8; }
.payment-method .method-name, .payment-method .method-count, .payment-method .method-amount { display: block; }
.payment-method .method-count { margin: .25rem 0; }
.payment-method .method-amount { color: #173b3a; }
.transactions-list, .historial-list { max-height: 320px; border: 1px solid #e1ebe9; border-radius: 7px; }
.transactions-header, .historial-header { border-radius: 0; margin: 0; background: #edf4f2; color: #50706c; }
.transaction-row, .historial-row { color: #304f4c; }
.transaction-row:hover, .historial-row:hover { background: #f5faf8; transform: none; }
.arqueo-container { gap: .8rem; padding: 0; }
.arqueo-section { position: relative; padding: 1rem; border: 1px solid #dfeae7; border-top: 0; border-radius: 7px; background: #f8fbfa; }
.arqueo-section h3 { padding-left: 2rem; }
.step-number { position: absolute; top: 1rem; left: 1rem; display: grid; width: 1.35rem; height: 1.35rem; place-items: center; border-radius: 50%; background: #d8eee7; color: #16806b; font-size: .75rem; font-weight: 800; }
.arqueo-input input { border-color: #b9d6ce; }
.arqueo-actions { justify-content: flex-start; padding-top: 1rem; border-top: 1px solid #e3ece9; }
.history-block .section-intro { margin-bottom: .8rem; }

@media (max-width: 760px) {
  .caja-page { padding: 1rem .7rem 2rem; }
  .caja-hero { align-items: stretch; flex-direction: column; gap: 1.2rem; }
  .hero-status { min-width: 0; }
  .hero-status :deep(.btn) { width: auto; }
  .caja-toolbar, .section-intro { align-items: flex-start; flex-direction: column; }
  .summary-grid, .payment-methods, .arqueo-container { grid-template-columns: 1fr; }
  .summary-item { min-height: auto; }
  .arqueo-actions { align-items: stretch; flex-direction: column; }
  .arqueo-actions :deep(.btn) { width: 100%; }
  .transactions-list, .historial-list { overflow-x: auto; }
}

@keyframes caja-pulse {
  0%, 100% { opacity: 0.65; }
  50% { opacity: 1; }
}
</style>
