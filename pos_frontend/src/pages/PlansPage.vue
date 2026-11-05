<template>
  <main class="plans-page">
    <header class="plans-nav">
      <RouterLink class="brand" to="/" aria-label="Volver a LEMARQUET POS">
        <span class="brand-mark">L</span>
        <span>LEMARQUET <b>POS</b></span>
      </RouterLink>
      <RouterLink to="/login" class="login-link">¿Ya tienes cuenta? <strong>Iniciar sesión</strong></RouterLink>
    </header>

    <section class="plans-intro">
      <span class="eyebrow"><i></i> Contratación para tu negocio</span>
      <h1>Conoce el plan.<br /><span>Elige cómo empezar.</span></h1>
      <p>Consulta el plan disponible para tu organización. Puedes hacerlo como invitado; el acceso de administrador se crea cuando Stripe confirma el pago.</p>
    </section>

    <section class="checkout-layout" aria-label="Plan y registro">
      <article class="plan-card">
        <div class="plan-card-top">
          <div class="plan-icon">L</div>
          <span class="plan-status" :class="{ unavailable: !plan?.is_active }">
            {{ loadingPlan ? 'Consultando plan' : plan?.is_active ? 'Disponible' : 'No disponible' }}
          </span>
        </div>
        <p class="plan-label">PLAN PARA TU ORGANIZACIÓN</p>
        <h2>{{ plan?.name || 'Plan POS' }}</h2>
        <p class="plan-description">{{ plan?.description || 'Acceso a las herramientas de venta y administración de LEMARQUET POS.' }}</p>
        <div class="plan-price">
          <strong>{{ formattedPrice }}</strong>
          <span>/ {{ intervalLabel }}</span>
        </div>
        <div class="plan-divider"></div>
        <ul class="included-list">
          <li><span>✓</span> Punto de venta y registro de ventas</li>
          <li><span>✓</span> Control de caja y arqueo de turno</li>
          <li><span>✓</span> Catálogo e inventario para tu organización</li>
          <li><span>✓</span> Reportes y administración según el rol</li>
          <li><span>✓</span> Un usuario administrador inicial</li>
        </ul>
        <div class="plan-note">
          <span>i</span>
          <p>El acceso a las funciones del sistema se activa con la suscripción. Los dispositivos de hardware requieren configuración compatible.</p>
        </div>
      </article>

      <article class="registration-card">
        <div v-if="checkoutState === 'form'">
          <div class="form-heading">
            <span class="step-tag">TU REGISTRO</span>
            <h2>Empieza con los datos de tu negocio.</h2>
            <p>Primero puedes ver el plan. Para continuar al pago, indícanos a qué negocio y persona preparar el acceso.</p>
          </div>

          <div v-if="notice" class="notice notice-info" role="status">{{ notice }}</div>
          <div v-if="errorMessage" class="notice notice-error" role="alert">{{ errorMessage }}</div>

          <form class="registration-form" @submit.prevent="startCheckout">
            <label>
              Nombre del negocio
              <input v-model.trim="form.businessName" autocomplete="organization" maxlength="100" placeholder="Ej. Mi tienda" required />
            </label>
            <div class="name-fields">
              <label>
                Nombre
                <input v-model.trim="form.firstName" autocomplete="given-name" maxlength="100" placeholder="Tu nombre" required />
              </label>
              <label>
                Apellido
                <input v-model.trim="form.lastName" autocomplete="family-name" maxlength="100" placeholder="Tu apellido" required />
              </label>
            </div>
            <label>
              Correo electrónico
              <input v-model.trim="form.email" autocomplete="email" type="email" maxlength="150" placeholder="tu@negocio.com" required />
              <small>Usaremos este correo para enviarte el enlace seguro para activar tu cuenta.</small>
            </label>
            <label>
              Teléfono <span class="optional">(opcional)</span>
              <input v-model.trim="form.phone" autocomplete="tel" type="tel" maxlength="20" placeholder="Tu teléfono de contacto" />
            </label>

            <label class="terms-row">
              <input v-model="acceptedTerms" type="checkbox" required />
              <span>Confirmo que estos datos son correctos y autorizo que se usen para crear la cuenta de mi organización después de confirmar el pago.</span>
            </label>

            <button
              class="submit-button"
              type="submit"
              :disabled="submitting || !plan?.checkout_available || !plan?.is_active || loadingPlan"
            >
              {{ submitting ? 'Preparando el pago…' : 'Continuar al pago seguro' }}
              <span aria-hidden="true">→</span>
            </button>
            <p v-if="!loadingPlan && !plan?.checkout_available" class="configuration-note">
              {{ plan?.is_active ? 'La contratación en línea aún no está habilitada. Contacta al administrador del servicio.' : 'El plan está temporalmente deshabilitado. Vuelve a consultar más tarde.' }}
            </p>
            <p class="secure-note"><span>▣</span> El pago se procesa en Stripe. No guardamos los datos de tu tarjeta.</p>
          </form>
        </div>

        <div v-else-if="checkoutState === 'success'" class="result-state" role="status">
          <div class="result-icon result-success">{{ paymentState === 'account_ready' ? '✓' : '↻' }}</div>
          <span class="step-tag">PAGO RECIBIDO</span>
          <h2>{{ paymentState === 'account_ready' ? 'Tu acceso está en camino.' : 'Estamos confirmando tu contratación.' }}</h2>
          <div v-if="notice" class="notice notice-info" role="status">{{ notice }}</div>
          <div v-if="errorMessage" class="notice notice-error" role="alert">{{ errorMessage }}</div>
          <p v-if="paymentState === 'account_ready'">La cuenta de administrador ya está creada. Revisa tu correo para recibir el nombre de usuario y el enlace de un solo uso para definir tu contraseña.</p>
          <p v-else-if="paymentState === 'email_pending'">El pago fue confirmado y estamos preparando el correo de activación. Revisa tu bandeja de entrada en unos minutos.</p>
          <p v-else>Cuando Stripe confirme el pago, crearemos la organización y su cuenta de administrador. Te enviaremos las instrucciones al correo que registraste.</p>
          <p v-if="plan && !plan.webhook_configured" class="result-hint">La confirmación automática no está disponible ahora. Puedes verificar aquí el pago directamente con Stripe.</p>
          <p class="result-hint">Si no ves el mensaje, revisa la carpeta de correo no deseado. El enlace de activación vence en 24 horas.</p>
          <form v-if="route.query.session_id" class="resend-form" @submit.prevent="resendAccountEmail">
            <label>
              Correo usado al contratar
              <input v-model.trim="resendEmailAddress" type="email" autocomplete="email" maxlength="150" required placeholder="tu@negocio.com" />
            </label>
            <button class="refresh-button" type="submit" :disabled="resendingEmail || !plan?.stripe_configured">
              {{ resendingEmail ? 'Enviando correo…' : 'Reenviar correo de acceso' }}
            </button>
            <p class="result-hint">Por seguridad, confirma el mismo correo que registraste al contratar. El enlace anterior dejará de funcionar.</p>
          </form>
          <button v-if="paymentState !== 'account_ready'" class="refresh-button" type="button" :disabled="reconcilingPayment || !plan?.stripe_configured" @click="reconcileCheckout">
            {{ reconcilingPayment ? 'Verificando en Stripe…' : 'Verificar y activar mi contratación' }}
          </button>
          <button v-if="paymentState !== 'account_ready'" class="refresh-button" type="button" :disabled="checkingPayment" @click="checkCheckoutStatus">
            {{ checkingPayment ? 'Consultando…' : 'Actualizar estado' }}
          </button>
          <RouterLink class="back-link" to="/">Volver al inicio</RouterLink>
        </div>

        <div v-else class="result-state" role="status">
          <div class="result-icon result-cancel">↩</div>
          <span class="step-tag">PAGO NO COMPLETADO</span>
          <h2>No se realizó ningún cargo desde esta página.</h2>
          <p>Puedes volver al plan e iniciar el proceso de pago cuando estés listo. Si solo querías consultar, no necesitas una cuenta para hacerlo.</p>
          <button class="refresh-button" type="button" @click="checkoutState = 'form'">Volver a los planes</button>
        </div>
      </article>
    </section>

    <section class="signup-explainer">
      <div><span class="step-number">01</span><p><strong>Consulta como invitado</strong><small>Revisa el plan sin iniciar sesión ni crear una cuenta.</small></p></div>
      <span class="explainer-arrow">→</span>
      <div><span class="step-number">02</span><p><strong>Registra tu negocio</strong><small>Déjanos los datos necesarios para preparar tu organización.</small></p></div>
      <span class="explainer-arrow">→</span>
      <div><span class="step-number">03</span><p><strong>Confirma y activa</strong><small>Tras confirmar el pago, recibirás por correo un enlace seguro.</small></p></div>
    </section>

    <footer class="plans-footer">
      <RouterLink to="/">LEMARQUET POS</RouterLink>
      <span>Tu cuenta se crea después de la confirmación del pago.</span>
    </footer>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/services/api'

interface PublicPlan {
  name: string
  description: string | null
  amount: number
  currency: string
  interval_unit: string
  interval_count: number
  is_active: boolean
  checkout_available: boolean
  stripe_configured: boolean
  webhook_configured: boolean
}

type CheckoutState = 'form' | 'success' | 'cancel'
type PaymentState = 'processing' | 'email_pending' | 'account_ready'

const route = useRoute()
const plan = ref<PublicPlan | null>(null)
const loadingPlan = ref(true)
const submitting = ref(false)
const checkingPayment = ref(false)
const reconcilingPayment = ref(false)
const resendingEmail = ref(false)
const resendEmailAddress = ref('')
const errorMessage = ref('')
const notice = ref('')
const acceptedTerms = ref(false)
const checkoutState = ref<CheckoutState>('form')
const paymentState = ref<PaymentState>('processing')
const form = reactive({
  businessName: '',
  firstName: '',
  lastName: '',
  email: '',
  phone: ''
})
let checkoutStatusTimer: ReturnType<typeof setInterval> | null = null

const responseData = <T>(response: any): T => response?.data?.data ?? response?.data ?? response
const formattedPrice = computed(() => {
  if (!plan.value) return '—'
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: plan.value.currency || 'MXN'
  }).format(Number(plan.value.amount || 0))
})
const intervalLabel = computed(() => {
  if (!plan.value) return 'mes'
  const count = Number(plan.value.interval_count || 1)
  const unit = plan.value.interval_unit === 'year' ? 'año' : 'mes'
  return count === 1 ? unit : `${count} ${unit}${unit === 'mes' ? 'es' : 's'}`
})

async function loadPlan() {
  loadingPlan.value = true
  errorMessage.value = ''
  try {
    const response = await api.get('/suscripciones/public/plan')
    plan.value = responseData<PublicPlan | null>(response)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudo consultar el plan disponible.'
  } finally {
    loadingPlan.value = false
  }
}

async function startCheckout() {
  if (submitting.value || !plan.value?.checkout_available || !acceptedTerms.value) return
  submitting.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    const response = await api.post('/suscripciones/public/checkout', {
      businessName: form.businessName,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone
    }, {
      headers: { 'Idempotency-Key': crypto.randomUUID() }
    })
    const result = responseData<{ checkout_url: string }>(response)
    if (!result?.checkout_url) throw new Error('No se recibió el enlace seguro de pago.')
    window.location.assign(result.checkout_url)
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudo preparar el pago.'
  } finally {
    submitting.value = false
  }
}

async function checkCheckoutStatus() {
  const sessionId = typeof route.query.session_id === 'string' ? route.query.session_id : ''
  if (!sessionId) return
  checkingPayment.value = true
  try {
    const response = await api.get(`/suscripciones/public/checkout-status/${encodeURIComponent(sessionId)}`)
    const result = responseData<{ status: PaymentState }>(response)
    paymentState.value = result.status
  } catch {
    notice.value = 'La confirmación puede tardar un poco. Vuelve a consultar en unos instantes.'
  } finally {
    checkingPayment.value = false
  }
}

async function reconcileCheckout() {
  const sessionId = typeof route.query.session_id === 'string' ? route.query.session_id : ''
  if (!sessionId || reconcilingPayment.value) return
  reconcilingPayment.value = true
  notice.value = ''
  try {
    const response = await api.post(`/suscripciones/public/reconcile-checkout/${encodeURIComponent(sessionId)}`)
    const result = responseData<{ payment_confirmed: boolean; status: PaymentState }>(response)
    if (result.payment_confirmed) {
      paymentState.value = result.status
      notice.value = result.status === 'account_ready'
        ? 'Pago verificado y cuenta de administrador activada. Revisa tu correo.'
        : 'Pago verificado. El correo con el acceso está en preparación.'
    } else {
      notice.value = 'Stripe todavía no confirma el pago. Espera un momento y vuelve a verificar.'
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudo verificar el pago en Stripe.'
  } finally {
    reconcilingPayment.value = false
  }
}

async function resendAccountEmail() {
  const sessionId = typeof route.query.session_id === 'string' ? route.query.session_id : ''
  if (!sessionId || !resendEmailAddress.value || resendingEmail.value) return
  resendingEmail.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    const response = await api.post(
      `/suscripciones/public/resend-account-email/${encodeURIComponent(sessionId)}`,
      { email: resendEmailAddress.value }
    )
    const result = responseData<{ payment_confirmed: boolean; email_sent: boolean }>(response)
    if (!result.payment_confirmed || !result.email_sent) {
      throw new Error('Stripe no confirmó una contratación pagada para esos datos.')
    }
    paymentState.value = 'account_ready'
    notice.value = 'El correo de acceso se envió nuevamente. Revisa tu bandeja de entrada y correo no deseado.'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudo reenviar el correo de acceso.'
  } finally {
    resendingEmail.value = false
  }
}

onMounted(async () => {
  await loadPlan()
  if (route.query.checkout === 'success') {
    checkoutState.value = 'success'
    await checkCheckoutStatus()
    checkoutStatusTimer = setInterval(() => {
      if (paymentState.value === 'account_ready') return
      void checkCheckoutStatus()
    }, 5000)
  } else if (route.query.checkout === 'cancel') {
    checkoutState.value = 'cancel'
  }
})

onUnmounted(() => {
  if (checkoutStatusTimer) clearInterval(checkoutStatusTimer)
})
</script>

<style scoped>
.plans-page { min-height: 100%; padding: 0 24px 30px; background: #f7f8fb; color: #1d2940; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.plans-nav { display: flex; width: min(1120px, 100%); min-height: 76px; align-items: center; justify-content: space-between; gap: 1rem; margin-inline: auto; }
.brand { display: inline-flex; align-items: center; gap: 0.6rem; color: #1d2940; font-size: 0.82rem; font-weight: 850; letter-spacing: 0.07em; text-decoration: none; }
.brand-mark { display: grid; place-items: center; width: 35px; height: 35px; border-radius: 10px; background: #1d2b4d; color: #fff; font-size: 1rem; font-style: italic; }
.brand b { color: #3158d8; font-size: 0.68rem; }
.login-link { color: #748095; font-size: 0.75rem; text-decoration: none; }
.login-link strong { margin-left: 0.25rem; color: #3158d8; }
.plans-intro { max-width: 720px; margin: 3.2rem auto 2.2rem; text-align: center; }
.eyebrow, .step-tag { color: #536caf; font-size: 0.64rem; font-weight: 800; letter-spacing: 0.13em; }
.eyebrow { display: inline-flex; align-items: center; gap: 0.45rem; padding: 0.45rem 0.7rem; border: 1px solid #e3e9fa; border-radius: 999px; background: #f2f5ff; letter-spacing: 0.03em; font-size: 0.72rem; }
.eyebrow i { width: 7px; height: 7px; border-radius: 50%; background: #4568d4; }
.plans-intro h1 { margin: 1rem 0 0.8rem; color: #1d2940; font-size: clamp(2.5rem, 5vw, 3.8rem); font-weight: 800; letter-spacing: -0.06em; line-height: 1.05; }
.plans-intro h1 span { color: #6074a4; }
.plans-intro > p { max-width: 590px; margin: 0 auto; color: #768196; font-size: 0.9rem; line-height: 1.75; }
.checkout-layout { display: grid; grid-template-columns: 0.9fr 1.1fr; gap: 1rem; width: min(930px, 100%); align-items: stretch; margin: 0 auto; }
.plan-card, .registration-card { border: 1px solid #e7eaf0; border-radius: 14px; background: #fff; box-shadow: 0 16px 42px #23334e0b; }
.plan-card { padding: 1.55rem; }
.plan-card-top { display: flex; align-items: center; justify-content: space-between; }
.plan-icon { display: grid; place-items: center; width: 42px; height: 42px; border-radius: 12px; background: #1d2b4d; color: #fff; font-size: 1.2rem; font-weight: 800; font-style: italic; }
.plan-status { padding: 0.35rem 0.55rem; border-radius: 999px; background: #eaf6ef; color: #388359; font-size: 0.63rem; font-weight: 700; }
.plan-status.unavailable { background: #fff3e7; color: #a36a20; }
.plan-label { margin: 1.4rem 0 0.45rem; color: #8190a7; font-size: 0.6rem; font-weight: 800; letter-spacing: 0.12em; }
.plan-card h2 { margin: 0; color: #27344b; font-size: 1.45rem; letter-spacing: -0.035em; }
.plan-description { min-height: 40px; margin: 0.5rem 0 1.3rem; color: #7a8598; font-size: 0.76rem; line-height: 1.6; }
.plan-price { display: flex; align-items: baseline; gap: 0.4rem; }
.plan-price strong { color: #1f2c46; font-size: 2rem; letter-spacing: -0.05em; }
.plan-price span { color: #7a8598; font-size: 0.77rem; }
.plan-divider { height: 1px; margin: 1.3rem 0; background: #edf0f4; }
.included-list { display: grid; gap: 0.78rem; margin: 0; padding: 0; list-style: none; }
.included-list li { display: flex; gap: 0.55rem; color: #58657a; font-size: 0.73rem; line-height: 1.5; }
.included-list li span { color: #37865c; font-weight: 900; }
.plan-note { display: flex; gap: 0.55rem; margin-top: 1.5rem; padding: 0.72rem; border-radius: 8px; background: #f7f8fb; }
.plan-note > span { display: grid; place-items: center; width: 17px; height: 17px; flex: 0 0 auto; border-radius: 50%; background: #e8edf7; color: #66779b; font-size: 0.65rem; font-weight: 800; }
.plan-note p { margin: 0; color: #778297; font-size: 0.63rem; line-height: 1.6; }
.registration-card { padding: 1.65rem; }
.form-heading h2, .result-state h2 { margin: 0.45rem 0 0.45rem; color: #26334b; font-size: 1.47rem; letter-spacing: -0.035em; line-height: 1.25; }
.form-heading p, .result-state > p { margin: 0; color: #778397; font-size: 0.76rem; line-height: 1.65; }
.registration-form { display: grid; gap: 0.92rem; margin-top: 1.25rem; }
.registration-form label { display: grid; gap: 0.38rem; color: #48566e; font-size: 0.69rem; font-weight: 700; }
.registration-form input:not([type="checkbox"]) { width: 100%; min-height: 42px; padding: 0.65rem 0.75rem; border: 1px solid #dfe4ec; border-radius: 7px; outline: none; background: #fff; color: #28354c; font: inherit; font-size: 0.75rem; transition: border-color 0.18s ease, box-shadow 0.18s ease; }
.registration-form input:focus { border-color: #7088df; box-shadow: 0 0 0 3px #3158d81b; }
.registration-form input::placeholder { color: #a6afbd; }
.registration-form label small { color: #8792a4; font-size: 0.62rem; font-weight: 500; line-height: 1.5; }
.optional { color: #929cad; font-weight: 500; }
.name-fields { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
.terms-row { display: flex !important; grid-template-columns: 16px 1fr; align-items: flex-start; gap: 0.5rem !important; color: #778397 !important; font-size: 0.63rem !important; font-weight: 500 !important; line-height: 1.55; }
.terms-row input { width: 15px; height: 15px; flex: 0 0 auto; margin: 1px 0 0; accent-color: #3158d8; }
.submit-button { display: flex; min-height: 47px; align-items: center; justify-content: space-between; gap: 0.7rem; margin-top: 0.2rem; padding: 0.8rem 1rem; border: 0; border-radius: 8px; background: #3158d8; color: #fff; font: inherit; font-size: 0.77rem; font-weight: 750; cursor: pointer; transition: background 0.18s ease, transform 0.18s ease; }
.submit-button:hover:not(:disabled) { transform: translateY(-1px); background: #264bc5; }
.submit-button:disabled { background: #9daadd; cursor: not-allowed; }
.secure-note { margin: -0.15rem 0 0; color: #8792a3; font-size: 0.62rem; text-align: center; }
.secure-note span { margin-right: 0.25rem; color: #528369; }
.configuration-note { margin: -0.15rem 0 0; color: #956622; font-size: 0.64rem; line-height: 1.5; }
.notice { margin-top: 0.8rem; padding: 0.65rem 0.75rem; border-radius: 7px; font-size: 0.69rem; line-height: 1.5; }
.notice-info { background: #edf2ff; color: #415a9f; }
.notice-error { background: #fff0ef; color: #a93630; }
.result-state { display: flex; min-height: 430px; flex-direction: column; align-items: flex-start; justify-content: center; }
.result-icon { display: grid; place-items: center; width: 50px; height: 50px; margin-bottom: 1.2rem; border-radius: 15px; font-size: 1.35rem; font-weight: 800; }
.result-success { background: #e9f6ef; color: #338458; }
.result-cancel { background: #fff3e7; color: #a46a24; }
.result-state h2 { max-width: 390px; margin-bottom: 0.7rem; font-size: 1.8rem; }
.result-state > p { max-width: 420px; }
.result-hint { margin-top: 0.75rem !important; font-size: 0.67rem !important; }
.resend-form { display: grid; width: 100%; gap: 0.6rem; margin-top: 1.2rem; padding: 1rem; border: 1px solid #e7eaf0; border-radius: 9px; background: #fafbfe; }
.resend-form label { display: grid; gap: 0.4rem; color: #48566e; font-size: 0.69rem; font-weight: 700; }
.resend-form input { width: 100%; min-height: 42px; padding: 0.65rem 0.75rem; border: 1px solid #dfe4ec; border-radius: 7px; outline: none; background: #fff; color: #28354c; font: inherit; font-size: 0.75rem; }
.resend-form input:focus { border-color: #7088df; box-shadow: 0 0 0 3px #3158d81b; }
.refresh-button { min-height: 39px; margin-top: 1rem; padding: 0.6rem 0.8rem; border: 1px solid #dfe4ec; border-radius: 7px; background: #fff; color: #47556d; font: inherit; font-size: 0.69rem; font-weight: 700; cursor: pointer; }
.back-link { margin-top: 1rem; color: #526bc1; font-size: 0.7rem; font-weight: 700; text-decoration: none; }
.signup-explainer { display: flex; width: min(930px, 100%); align-items: center; justify-content: space-between; gap: 0.7rem; margin: 1.5rem auto 0; padding: 1rem 1.25rem; border: 1px solid #e9ecf2; border-radius: 10px; background: #fff; }
.signup-explainer > div { display: flex; align-items: center; gap: 0.6rem; }
.step-number { display: grid; place-items: center; width: 27px; height: 27px; flex: 0 0 auto; border-radius: 8px; background: #eef2ff; color: #4a65c4; font-size: 0.67rem; font-weight: 800; }
.signup-explainer p { display: grid; gap: 0.18rem; margin: 0; }
.signup-explainer strong { color: #43516a; font-size: 0.66rem; }
.signup-explainer small { color: #8a94a5; font-size: 0.59rem; line-height: 1.4; }
.explainer-arrow { color: #a4adbb; font-size: 0.8rem; }
.plans-footer { display: flex; width: min(930px, 100%); justify-content: space-between; gap: 1rem; margin: 1.8rem auto 0; color: #949eae; font-size: 0.63rem; }
.plans-footer a { color: #6b7891; font-weight: 750; text-decoration: none; }
@media (max-width: 760px) {
  .checkout-layout { grid-template-columns: 1fr; max-width: 540px; }
  .plans-intro { margin-top: 2.3rem; }
  .plan-description { min-height: 0; }
  .result-state { min-height: 340px; }
}
@media (max-width: 560px) {
  .plans-page { padding-inline: 16px; }
  .plans-nav { min-height: 65px; }
  .brand { font-size: 0.7rem; }
  .brand-mark { width: 31px; height: 31px; }
  .login-link { max-width: 126px; font-size: 0.65rem; text-align: right; }
  .plans-intro { margin-top: 2rem; }
  .plans-intro h1 { font-size: 2.65rem; }
  .plans-intro > p { font-size: 0.8rem; }
  .plan-card, .registration-card { padding: 1.15rem; }
  .signup-explainer { align-items: flex-start; flex-direction: column; gap: 0.8rem; padding: 1rem; }
  .explainer-arrow { display: none; }
  .plans-footer { flex-direction: column; }
}
</style>
