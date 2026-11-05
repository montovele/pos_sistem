<template>
  <main class="recovery-page">
    <header class="recovery-nav">
      <RouterLink class="brand" to="/" aria-label="Volver a LEMARQUET POS">
        <span class="brand-mark">L</span>
        <span>LEMARQUET <b>POS</b></span>
      </RouterLink>
      <RouterLink to="/planes" class="back-link">Volver a los planes</RouterLink>
    </header>

    <section class="recovery-card">
      <div class="brand-mark large">L</div>
      <template v-if="!token">
        <span class="eyebrow">RECUPERACIÓN SEGURA</span>
        <h1>Encuentra tu contratación</h1>
        <p>Indica el correo que registraste. Si hay una contratación pendiente asociada, enviaremos un enlace seguro para revisar el pago.</p>
        <form class="recovery-form" @submit.prevent="requestRecovery">
          <label for="recovery-email">Correo electrónico</label>
          <input
            id="recovery-email"
            v-model.trim="email"
            type="email"
            maxlength="150"
            autocomplete="email"
            required
            placeholder="tu@negocio.com"
          />
          <button class="primary-button" type="submit" :disabled="submitting">
            {{ submitting ? 'Enviando solicitud…' : 'Enviar enlace de recuperación' }}
          </button>
        </form>
        <p v-if="notice" class="notice" role="status">{{ notice }}</p>
        <p v-if="errorMessage" class="notice error" role="alert">{{ errorMessage }}</p>
        <p class="privacy-note">Por seguridad, mostraremos el mismo mensaje tanto si encontramos una contratación como si no.</p>
      </template>

      <template v-else>
        <span class="eyebrow">ESTADO DE TU CONTRATACIÓN</span>
        <h1>{{ heading }}</h1>
        <p>{{ description }}</p>

        <div v-if="loading && !recovery" class="status-panel" role="status">Consultando de forma segura…</div>
        <div v-else-if="recovery" class="status-panel">
          <div class="status-row">
            <span>Pago</span>
            <strong>{{ paymentLabel }}</strong>
          </div>
          <div v-if="recovery.payment.reference" class="status-row">
            <span>Referencia</span>
            <strong>{{ recovery.payment.reference }}</strong>
          </div>
          <div v-if="recovery.payment.amount !== null" class="status-row">
            <span>Importe</span>
            <strong>{{ formattedAmount }}</strong>
          </div>
          <div v-if="recovery.payment.createdAt" class="status-row">
            <span>Inicio de contratación</span>
            <strong>{{ formattedDate(recovery.payment.createdAt) }}</strong>
          </div>
          <div class="status-row">
            <span>Cuenta</span>
            <strong>{{ accountLabel }}</strong>
          </div>
          <div class="status-row">
            <span>Suscripción</span>
            <strong>{{ subscriptionLabel }}</strong>
          </div>
          <div v-if="recovery.plan?.name" class="status-row">
            <span>Plan</span>
            <strong>{{ recovery.plan.name }}</strong>
          </div>
          <div class="status-row">
            <span>Última consulta</span>
            <strong>{{ lastCheckedLabel }}</strong>
          </div>
        </div>

        <p v-if="recovery?.status === 'activation_pending' && !recovery.account.emailSent" class="notice">
          El pago fue confirmado. Estamos preparando el correo con el acceso; también puedes solicitar un nuevo envío.
        </p>
        <p v-if="notice" class="notice" role="status">{{ notice }}</p>
        <p v-if="errorMessage" class="notice error" role="alert">{{ errorMessage }}</p>

        <div class="actions">
          <a v-if="recovery?.status === 'requires_action' && recovery.checkoutUrl" class="primary-button" :href="recovery.checkoutUrl" rel="noreferrer">
            Continuar pago seguro
          </a>
          <button v-else-if="recovery?.status === 'expired'" class="primary-button" type="button" :disabled="retrying" @click="retryPayment">
            {{ retrying ? 'Preparando nuevo pago…' : 'Intentar el pago nuevamente' }}
          </button>
          <button v-else-if="recovery?.status === 'active'" class="primary-button" type="button" @click="goToLogin">
            Iniciar sesión
          </button>
          <button
            v-else-if="recovery?.status === 'activation_pending'"
            class="secondary-button"
            type="button"
            :disabled="resending || refreshing"
            @click="resendAccountEmail"
          >
            {{ resending ? 'Enviando correo…' : 'Reenviar correo de acceso' }}
          </button>
          <button v-if="recovery?.status !== 'active'" class="secondary-button" type="button" :disabled="refreshing" @click="refreshStatus">
            {{ refreshing ? 'Consultando…' : 'Actualizar estado' }}
          </button>
        </div>
        <p class="privacy-note">El nuevo intento de pago solo se habilita cuando Stripe confirma que la sesión anterior expiró sin cobrar.</p>
        <RouterLink class="text-link" to="/recuperar-pago">Solicitar otro enlace seguro</RouterLink>
      </template>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '@/services/api'

interface RecoveryResult {
  status: 'pending' | 'requires_action' | 'approved' | 'activation_pending' | 'active' | 'expired'
  checkoutUrl: string | null
  payment: {
    reference?: string
    status: string
    amount: number | null
    currency: string
    createdAt: string | null
    updatedAt: string | null
  }
  subscription: { status: string }
  account: { status: string; emailSent: boolean }
  plan: { name: string; amount: number; currency: string } | null
  nextAction: string
}

const route = useRoute()
const router = useRouter()
const token = ref('')
const email = ref('')
const recovery = ref<RecoveryResult | null>(null)
const submitting = ref(false)
const loading = ref(false)
const refreshing = ref(false)
const retrying = ref(false)
const resending = ref(false)
const notice = ref('')
const errorMessage = ref('')
const lastChecked = ref<Date | null>(null)
let pollingTimer: ReturnType<typeof setInterval> | null = null
let pollingCount = 0

const responseData = <T>(response: any): T => response?.data?.data ?? response?.data ?? response
const formattedAmount = computed(() => {
  if (!recovery.value) return ''
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: recovery.value.payment.currency || 'MXN'
  }).format(Number(recovery.value.payment.amount || 0))
})
const lastCheckedLabel = computed(() => lastChecked.value
  ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(lastChecked.value)
  : 'Aún no consultado')
const paymentLabel = computed(() => {
  const status = recovery.value?.status
  if (status === 'requires_action') return 'Pago pendiente'
  if (status === 'approved' || status === 'activation_pending' || status === 'active') return 'Pago confirmado'
  if (status === 'expired') return 'Sesión expirada sin confirmación de pago'
  return 'En verificación'
})
const accountLabel = computed(() => {
  const status = recovery.value?.account.status
  if (status === 'active') return 'Activa'
  if (status === 'activation_pending') return recovery.value?.account.emailSent ? 'Lista para activar desde tu correo' : 'Activación pendiente'
  return 'Pendiente de confirmación de pago'
})
const subscriptionLabel = computed(() => {
  const status = recovery.value?.subscription.status
  if (status === 'active') return 'Activa'
  if (status === 'canceled' || status === 'incomplete_expired') return 'Finalizada'
  return 'Pendiente de confirmación'
})
const heading = computed(() => {
  const status = recovery.value?.status
  if (status === 'active') return 'Tu cuenta está activa'
  if (status === 'activation_pending') return 'Pago confirmado'
  if (status === 'requires_action') return 'Completa tu pago'
  if (status === 'expired') return 'La sesión de pago expiró'
  if (status === 'approved') return 'Estamos preparando tu cuenta'
  return 'Estamos verificando tu pago'
})
const description = computed(() => {
  const status = recovery.value?.status
  if (status === 'active') return 'La contratación y la activación están completas. Ya puedes entrar al sistema.'
  if (status === 'activation_pending') return 'Stripe confirmó el pago. La creación del acceso es un paso separado; revisa tu correo para establecer la contraseña.'
  if (status === 'requires_action') return 'Tu sesión de Stripe sigue abierta. Puedes continuar el pago sin crear otra sesión.'
  if (status === 'expired') return 'Stripe confirmó que la sesión expiró. Puedes iniciar un nuevo intento sin duplicar el cobro anterior.'
  return 'Stripe aún no confirma un resultado final. Actualizaremos el estado automáticamente; no vuelvas a pagar mientras esté en verificación.'
})

async function refreshStatus() {
  if (!token.value || refreshing.value) return
  refreshing.value = true
  errorMessage.value = ''
  try {
    const response = await api.get(`/suscripciones/public/payment-recovery/${encodeURIComponent(token.value)}`)
    recovery.value = responseData<RecoveryResult>(response)
    lastChecked.value = new Date()
    if (recovery.value.status === 'active' || recovery.value.status === 'requires_action' || recovery.value.status === 'expired') {
      stopPolling()
    } else {
      startPolling()
    }
  } catch (error) {
    stopPolling()
    errorMessage.value = error instanceof Error
      ? error.message
      : 'El enlace no es válido o venció. Solicita uno nuevo para continuar.'
  } finally {
    refreshing.value = false
    loading.value = false
  }
}

async function requestRecovery() {
  if (submitting.value) return
  submitting.value = true
  notice.value = ''
  errorMessage.value = ''
  try {
    await api.post('/suscripciones/public/payment-recovery', { email: email.value })
    notice.value = 'Si existe una contratación pendiente para ese correo, recibirás un enlace seguro en unos minutos.'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudo procesar la solicitud. Inténtalo más tarde.'
  } finally {
    submitting.value = false
  }
}

async function retryPayment() {
  if (!token.value || retrying.value) return
  retrying.value = true
  errorMessage.value = ''
  try {
    const response = await api.post(`/suscripciones/public/payment-recovery/${encodeURIComponent(token.value)}/retry`)
    const result = responseData<{ checkout_url: string }>(response)
    if (!result.checkout_url) throw new Error('Stripe no devolvió un enlace de pago válido.')
    window.location.assign(result.checkout_url)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudo iniciar un nuevo intento de pago.'
    await refreshStatus()
  } finally {
    retrying.value = false
  }
}

async function resendAccountEmail() {
  if (!token.value || resending.value) return
  resending.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    await api.post(`/suscripciones/public/payment-recovery/${encodeURIComponent(token.value)}/resend-account-email`)
    notice.value = 'El correo se envió nuevamente. Revisa tu bandeja de entrada y correo no deseado.'
    await refreshStatus()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudo reenviar el correo de activación.'
  } finally {
    resending.value = false
  }
}

function startPolling() {
  if (pollingTimer || pollingCount >= 20) return
  pollingTimer = setInterval(() => {
    pollingCount += 1
    if (pollingCount >= 20) stopPolling()
    else void refreshStatus()
  }, 15000)
}

function stopPolling() {
  if (pollingTimer) clearInterval(pollingTimer)
  pollingTimer = null
}

function formattedDate(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? 'No disponible'
    : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function goToLogin() {
  void router.push('/login')
}

onMounted(() => {
  token.value = typeof route.query.token === 'string' ? route.query.token : ''
  if (!token.value) return
  loading.value = true
  void router.replace({ path: route.path, query: {} }).then(refreshStatus)
})

onUnmounted(stopPolling)
</script>

<style scoped>
.recovery-page { min-height: 100vh; padding: 0 24px 40px; background: #f7f8fb; color: #1d2940; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.recovery-nav { display: flex; width: min(940px, 100%); min-height: 76px; align-items: center; justify-content: space-between; gap: 1rem; margin-inline: auto; }
.brand { display: inline-flex; align-items: center; gap: 0.6rem; color: #1d2940; font-size: 0.82rem; font-weight: 850; letter-spacing: 0.07em; text-decoration: none; }
.brand b { color: #3158d8; font-size: 0.68rem; }
.brand-mark { display: grid; place-items: center; width: 35px; height: 35px; border-radius: 10px; background: #1d2b4d; color: #fff; font-size: 1rem; font-style: italic; font-weight: 800; }
.brand-mark.large { width: 48px; height: 48px; margin-bottom: 1.4rem; border-radius: 14px; font-size: 1.25rem; }
.back-link, .text-link { color: #526bc1; font-size: 0.75rem; font-weight: 700; text-decoration: none; }
.recovery-card { width: min(520px, 100%); margin: clamp(2rem, 8vh, 5rem) auto 0; padding: clamp(1.4rem, 5vw, 2.4rem); border: 1px solid #e7eaf0; border-radius: 16px; background: #fff; box-shadow: 0 18px 48px #23334e0c; }
.eyebrow { color: #536caf; font-size: 0.64rem; font-weight: 800; letter-spacing: 0.13em; }
h1 { margin: 0.55rem 0 0.65rem; color: #26334b; font-size: clamp(1.7rem, 6vw, 2.15rem); letter-spacing: -0.045em; line-height: 1.15; }
.recovery-card > p { margin: 0; color: #778397; font-size: 0.78rem; line-height: 1.7; }
.recovery-form { display: grid; gap: 0.6rem; margin-top: 1.5rem; }
.recovery-form label { color: #48566e; font-size: 0.72rem; font-weight: 700; }
.recovery-form input { width: 100%; min-height: 44px; padding: 0.7rem 0.8rem; border: 1px solid #dfe4ec; border-radius: 7px; color: #28354c; font: inherit; font-size: 0.78rem; }
.recovery-form input:focus { border-color: #7088df; outline: 3px solid #3158d81b; }
.primary-button, .secondary-button { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; padding: 0.7rem 1rem; border: 0; border-radius: 8px; font: inherit; font-size: 0.74rem; font-weight: 750; text-align: center; text-decoration: none; cursor: pointer; }
.primary-button { background: #3158d8; color: #fff; }
.primary-button:disabled, .secondary-button:disabled { opacity: 0.6; cursor: not-allowed; }
.secondary-button { border: 1px solid #dfe4ec; background: #fff; color: #47556d; }
.privacy-note { margin-top: 1rem !important; color: #8993a3 !important; font-size: 0.65rem !important; }
.notice { margin-top: 1rem !important; padding: 0.75rem; border-radius: 7px; background: #edf2ff; color: #415a9f !important; font-size: 0.7rem !important; }
.notice.error { background: #fff0ef; color: #a93630 !important; }
.status-panel { display: grid; gap: 0; margin-top: 1.4rem; padding: 0.35rem 0.9rem; border: 1px solid #e7eaf0; border-radius: 9px; background: #fafbfe; }
.status-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; padding: 0.75rem 0; border-bottom: 1px solid #edf0f4; color: #778397; font-size: 0.69rem; }
.status-row:last-child { border-bottom: 0; }
.status-row strong { color: #35435c; font-weight: 700; text-align: right; }
.actions { display: grid; gap: 0.65rem; margin-top: 1.2rem; }
.text-link { display: inline-block; margin-top: 1.2rem; }
@media (max-width: 480px) { .recovery-page { padding-inline: 16px; } .status-row { flex-direction: column; gap: 0.25rem; } .status-row strong { text-align: left; } }
</style>
