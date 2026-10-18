import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/css/main.css'
import { useIndexedDB } from '@/db/indexedDB'
import { useTransactionStore } from '@/stores/transactionStore'
import { useAuthStore } from '@/stores/authStore'
import { syncPendingCashOpenings } from '@/services/cashSessionSync'

const { init } = useIndexedDB()
void init()

const app = createApp(App)
app.use(createPinia())
app.use(router)

const transactionStore = useTransactionStore()
const authStore = useAuthStore()
let syncInProgress = false

const syncPending = async () => {
  if (!navigator.onLine || syncInProgress) return

  syncInProgress = true
  try {
    const cashReady = await syncPendingCashOpenings(authStore.currentUser?.numeroEmpleado)
    if (!cashReady) {
      console.warn('La apertura de caja sigue pendiente; se intentará sincronizar las ventas y el backend validará la sesión abierta.')
    }

    await transactionStore.loadPendingTransactions()
    await transactionStore.syncPendingTransactions()
  } catch (error) {
    console.error('No se pudo completar el ciclo de sincronización offline:', error)
  } finally {
    syncInProgress = false
  }
}

void syncPending()

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void syncPending()
  })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      void syncPending()
    }
  })

  setInterval(() => {
    void syncPending()
  }, 30000)
}

app.mount('#app')
