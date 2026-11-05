<template>
  <section class="subscription-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">CUENTA DE {{ organizationName }}</p>
        <h1>Suscripción del POS</h1>
        <p v-if="isAdmin">Administra el acceso mensual de tu organización.</p>
        <p v-else>Consulta el plan SaaS y el estado de acceso de tu organización.</p>
      </div>
      <button class="secondary-button" type="button" :disabled="loading" @click="load">
        {{ loading ? 'Actualizando…' : 'Actualizar estado' }}
      </button>
    </header>

    <p v-if="notice" class="notice success" role="status">{{ notice }}</p>
    <p v-if="errorMessage" class="notice error" role="alert">{{ errorMessage }}</p>

    <section v-if="isSuperAdmin" class="panel global-management">
      <div class="section-heading">
        <div>
          <p class="eyebrow">ADMINISTRACIÓN GLOBAL</p>
          <h2>Plan SaaS y organizaciones</h2>
        </div>
        <button class="secondary-button" type="button" :disabled="loadingOrganizations" @click="loadOrganizations">
          {{ loadingOrganizations ? 'Actualizando…' : 'Actualizar organizaciones' }}
        </button>
      </div>

      <div class="global-plan-form">
        <label>
          Nombre del plan
          <input v-model="editableName" maxlength="120" type="text" />
        </label>
        <label>
          Descripción
          <input v-model="editableDescription" maxlength="255" type="text" />
        </label>
        <label>
          Precio mensual (MXN)
          <input v-model.number="editableAmount" min="1" step="0.01" type="number" />
        </label>
        <label class="checkbox-label">
          <input v-model="editablePlanActive" type="checkbox" />
          Plan publicado y disponible para contratar
        </label>
        <div class="global-plan-actions">
          <span class="status-badge" :class="plan?.is_active ? 'active' : 'inactive'">
            {{ plan?.is_active ? 'Plan activo' : 'Plan desactivado' }}
          </span>
          <button class="primary-button" type="button" :disabled="savingPrice || !planChanged" @click="savePlan">
            {{ savingPrice ? 'Guardando…' : 'Guardar plan SaaS' }}
          </button>
        </div>
      </div>
      <p class="hint">Cambiar el precio crea un nuevo precio recurrente en Stripe; las suscripciones existentes conservan sus condiciones.</p>
      <p v-if="!plan?.stripe_configured" class="hint">
        Configuración Stripe pendiente: el plan y las suscripciones existentes se pueden administrar, pero no se pueden crear o cambiar precios ni cobrar en línea hasta configurar las claves del backend.
      </p>

      <div class="organization-list">
        <h3>Suscripciones por organización</h3>
        <p v-if="loadingOrganizations && !organizations.length" class="hint">Cargando organizaciones…</p>
        <p v-else-if="!organizations.length" class="hint">No hay organizaciones registradas.</p>
        <div v-else class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Organización</th>
                <th>Estado</th>
                <th>Contratado desde</th>
                <th>Acceso hasta</th>
                <th>Origen</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="organization in organizations" :key="organization.organization_id">
                <td>{{ organization.organization_name }} <small>#{{ organization.organization_id }}</small></td>
                <td>
                  <span class="status-badge" :class="organization.access_allowed ? 'active' : 'inactive'">
                    {{ organizationStatusText(organization) }}
                  </span>
                </td>
                <td>{{ formatDate(organization.current_period_start) || '—' }}</td>
                <td>{{ formatDate(organization.current_period_end) || '—' }}</td>
                <td>{{ organization.stripe_managed ? 'Stripe' : organization.subscription_id ? 'Manual' : 'Sin plan' }}</td>
                <td class="organization-actions">
                  <div v-if="canManageManualDates(organization)" class="expiration-control">
                    <label class="expiration-label" :for="`start-${organization.organization_id}`">
                      Fecha de contratación / inicio
                    </label>
                    <input
                      :id="`start-${organization.organization_id}`"
                      v-model="startDates[organization.organization_id]"
                      type="date"
                      :disabled="managingOrganizationId === organization.organization_id"
                    />
                    <label class="expiration-label" :for="`expiration-${organization.organization_id}`">
                      Fecha de vencimiento
                    </label>
                    <input
                      :id="`expiration-${organization.organization_id}`"
                      v-model="expirationDates[organization.organization_id]"
                      type="date"
                      :min="startDates[organization.organization_id] || minimumExpirationDate"
                      :disabled="managingOrganizationId === organization.organization_id"
                    />
                    <button
                      class="table-action"
                      type="button"
                      :disabled="!isSubscriptionPeriodValid(organization.organization_id) || managingOrganizationId === organization.organization_id"
                      @click="setOrganizationAccess(organization, organization.access_allowed ? 'set_period' : 'activate')"
                    >
                      {{ managingOrganizationId === organization.organization_id
                        ? 'Procesando…'
                        : organization.access_allowed ? 'Guardar fechas' : 'Programar / activar plan' }}
                    </button>
                  </div>
                  <button
                    v-else-if="organization.stripe_managed"
                    class="table-action"
                    type="button"
                    disabled
                    title="Stripe administra el ciclo de cobro y la fecha de vencimiento."
                  >
                    Vigencia de Stripe
                  </button>
                  <button
                    v-if="organization.access_allowed"
                    class="table-action danger"
                    type="button"
                    :disabled="managingOrganizationId === organization.organization_id"
                    @click="setOrganizationAccess(organization, 'deactivate')"
                  >
                    {{ managingOrganizationId === organization.organization_id ? 'Procesando…' : 'Desactivar acceso' }}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>

    <div v-if="loading && !subscriptionData" class="panel loading">Cargando suscripción…</div>

    <div v-else class="subscription-grid">
      <article class="panel plan-card">
        <div class="card-heading">
          <div>
            <p class="eyebrow">{{ subscription ? 'PLAN SAAS DE TU ORGANIZACIÓN' : 'PLAN SAAS DISPONIBLE' }}</p>
            <h2>{{ plan?.name || 'Plan mensual' }}</h2>
          </div>
          <span class="status-badge" :class="accessAllowed ? 'active' : 'inactive'">
            {{ accessAllowed ? 'Activa' : statusLabel }}
          </span>
        </div>

        <p class="plan-description">{{ plan?.description || 'Acceso al sistema POS con renovación mensual.' }}</p>
        <p class="price">
          {{ formattedPrice }}
          <span>/ mes</span>
        </p>
        <p v-if="subscription?.current_period_end" class="period">
          {{ subscription.cancel_at_period_end ? 'Acceso hasta' : 'Próxima renovación' }}:
          <strong>{{ formattedPeriodEnd }}</strong>
        </p>

        <div class="actions">
          <button
            v-if="!accessAllowed && isAdmin && plan?.stripe_configured"
            class="secondary-button"
            type="button"
            :disabled="checkingPayment"
            @click="refreshPaymentStatus"
          >
            {{ checkingPayment ? 'Verificando en Stripe…' : 'Volver a verificar y activar plan contratado' }}
          </button>
          <button
            v-if="!accessAllowed"
            class="primary-button"
            type="button"
            :disabled="checkingOut || !plan?.checkout_available || !plan?.is_active"
            @click="startCheckout"
          >
            {{ checkingOut ? 'Abriendo pago…' : subscription ? 'Renovar con Stripe' : 'Contratar plan SaaS' }}
          </button>
          <button
            v-if="isAdmin && accessAllowed && !subscription?.cancel_at_period_end"
            class="secondary-button"
            type="button"
            :disabled="canceling"
            @click="cancelSubscription"
          >
            {{ canceling ? 'Procesando…' : 'Cancelar al final del periodo' }}
          </button>
        </div>
        <p v-if="!plan?.stripe_configured" class="hint">
          Stripe no está configurado en el backend. Añade STRIPE_SECRET_KEY al entorno del servidor para verificar pagos.
        </p>
        <p v-else-if="!plan?.webhook_configured && !accessAllowed" class="hint">
          La confirmación automática del webhook no está configurada. Si ya contrataste el plan, usa “Volver a verificar” para consultar directamente tu pago en Stripe y activar el acceso.
        </p>
        <p v-else-if="!plan?.is_active" class="hint">
          El plan está desactivado temporalmente. Contacta al superadministrador.
        </p>
        <p v-else-if="!plan?.checkout_available" class="hint">
          {{ isSuperAdmin ? 'Guarda el plan para crear el precio recurrente en Stripe y habilitar el pago.' : 'El superadministrador debe configurar el plan y el precio para habilitar el pago.' }}
        </p>
      </article>

      <aside class="panel access-card">
        <h2>Acceso al sistema</h2>
        <p v-if="accessAllowed">
          Tu organización tiene acceso al POS{{ subscription?.cancel_at_period_end ? ' hasta que termine el periodo pagado' : '' }}.
        </p>
        <p v-else>
          El acceso a las funciones del POS está pausado hasta que se active o renueve la suscripción.
        </p>
        <p v-if="!isAdmin && !accessAllowed && plan?.checkout_available" class="hint">
          Puedes iniciar la contratación para tu organización. Se usará el correo de tu usuario o el correo de contacto registrado para la organización.
        </p>
        <p v-if="subscription?.status === 'past_due'" class="hint">
          Stripe reporta un pago pendiente. Contacta al administrador para revisar el método de pago.
        </p>
      </aside>
    </div>

    <section class="panel payment-history">
      <div class="section-heading">
        <div>
          <p class="eyebrow">PAGOS PERSISTENTES</p>
          <h2>Historial de pagos</h2>
        </div>
        <button class="secondary-button" type="button" :disabled="loadingPayments" @click="loadPayments">
          {{ loadingPayments ? 'Actualizando…' : 'Actualizar pagos' }}
        </button>
      </div>
      <p v-if="loadingPayments && !payments.length" class="hint">Cargando pagos…</p>
      <p v-else-if="!payments.length" class="hint">Aún no hay pagos confirmados para esta organización.</p>
      <div v-else class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Factura</th>
              <th>Importe</th>
              <th>Estado</th>
              <th>Comprobante</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="payment in payments" :key="payment.invoice_id">
              <td>{{ formatDate(payment.paid_at) || '—' }}</td>
              <td>{{ payment.invoice_number || payment.invoice_id }}</td>
              <td>{{ formatPaymentAmount(payment.amount, payment.currency) }}</td>
              <td><span class="status-badge active">{{ statusText(payment.status) }}</span></td>
              <td>
                <a v-if="payment.invoice_url" :href="payment.invoice_url" target="_blank" rel="noopener noreferrer">
                  Ver factura
                </a>
                <span v-else>—</span>
                <button
                  v-if="isAdmin"
                  class="table-action payment-print-button"
                  type="button"
                  @click="printPayment(payment)"
                >
                  Imprimir comprobante
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section v-if="printingPayment" class="receipt-print" aria-label="Comprobante de pago">
      <header class="receipt-header">
        <p>Suscripción SaaS del POS</p>
        <h1>Comprobante de pago</h1>
      </header>
      <dl class="receipt-details">
        <div>
          <dt>Organización</dt>
          <dd>{{ organizationName }}</dd>
        </div>
        <div>
          <dt>Concepto</dt>
          <dd>Suscripción SaaS</dd>
        </div>
        <div>
          <dt>Factura</dt>
          <dd>{{ printingPayment.invoice_number || printingPayment.invoice_id }}</dd>
        </div>
        <div v-if="printingPayment.subscription_id">
          <dt>Referencia de suscripción</dt>
          <dd>{{ printingPayment.subscription_id }}</dd>
        </div>
        <div>
          <dt>Fecha de pago</dt>
          <dd>{{ formatDate(printingPayment.paid_at) || '—' }}</dd>
        </div>
        <div>
          <dt>Estado</dt>
          <dd>{{ statusText(printingPayment.status) }}</dd>
        </div>
      </dl>
      <p class="receipt-total">
        <span>Total pagado</span>
        <strong>{{ formatPaymentAmount(printingPayment.amount, printingPayment.currency) }}</strong>
      </p>
      <footer class="receipt-footer">Pago procesado a través de Stripe.</footer>
    </section>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/services/api'

interface SubscriptionPlan {
  code: string
  name: string
  description: string | null
  amount: number
  currency: string
  interval_unit: string
  interval_count: number
  is_active: boolean
  has_stripe_price: boolean
  stripe_configured: boolean
  webhook_configured: boolean
  checkout_available: boolean
  stripe_price_id?: string | null
}

interface Subscription {
  status: string
  amount: number | null
  currency: string | null
  interval_unit: string | null
  interval_count: number | null
  current_period_end: string | null
  cancel_at_period_end: boolean
}

interface SubscriptionResponse {
  plan: SubscriptionPlan | null
  subscription: Subscription | null
  status: string
  access_allowed: boolean
}

interface OrganizationSubscription {
  organization_id: number
  organization_name: string
  subscription_id: number | null
  status: string
  current_period_start: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
  stripe_managed: boolean
  access_allowed: boolean
}

interface SubscriptionPayment {
  invoice_id: string
  subscription_id: string | null
  invoice_number: string | null
  amount: number
  currency: string
  status: string
  paid_at: string | null
  invoice_url: string | null
}

const route = useRoute()
const authStore = useAuthStore()
const subscriptionData = ref<SubscriptionResponse | null>(null)
const editableAmount = ref(599)
const editableName = ref('Suscripción mensual')
const editableDescription = ref('Acceso mensual al sistema POS')
const editablePlanActive = ref(true)
const organizations = ref<OrganizationSubscription[]>([])
const startDates = ref<Record<number, string>>({})
const expirationDates = ref<Record<number, string>>({})
const payments = ref<SubscriptionPayment[]>([])
const printingPayment = ref<SubscriptionPayment | null>(null)
const loading = ref(false)
const loadingOrganizations = ref(false)
const loadingPayments = ref(false)
const savingPrice = ref(false)
const checkingOut = ref(false)
const checkingPayment = ref(false)
const canceling = ref(false)
const managingOrganizationId = ref<number | null>(null)
const minimumExpirationDate = new Date().toISOString().slice(0, 10)
const errorMessage = ref('')
const notice = ref('')

const plan = computed(() => subscriptionData.value?.plan || null)
const subscription = computed(() => subscriptionData.value?.subscription || null)
const accessAllowed = computed(() => subscriptionData.value?.access_allowed === true)
const isAdmin = computed(() => ['admin', 'superadmin'].includes(authStore.currentUser?.role || ''))
const isSuperAdmin = computed(() => authStore.currentUser?.role === 'superadmin')
const organizationName = computed(() => authStore.currentOrganization?.name || 'ORGANIZACIÓN')
const planChanged = computed(() => (
  Number(editableAmount.value) !== Number(plan.value?.amount || 0)
  || editableName.value.trim() !== (plan.value?.name || '')
  || editableDescription.value.trim() !== (plan.value?.description || '')
  || editablePlanActive.value !== (plan.value?.is_active ?? true)
  || (!plan.value?.has_stripe_price && plan.value?.stripe_configured)
))
const formattedPrice = computed(() => new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: subscription.value?.currency || plan.value?.currency || 'MXN'
}).format(Number(subscription.value?.amount ?? plan.value?.amount ?? 0)))
const formattedPeriodEnd = computed(() => subscription.value?.current_period_end
  ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(new Date(subscription.value.current_period_end))
  : '')
const statusLabel = computed(() => ({
  inactive: 'Sin suscripción',
  past_due: 'Pago pendiente',
  canceled: 'Cancelada',
  unpaid: 'Impaga',
  incomplete: 'Pago incompleto',
  incomplete_expired: 'Pago expirado',
  paused: 'Pausada',
  expired: 'Vencida'
}[subscriptionData.value?.status || 'inactive'] || 'Sin acceso'))

function responseData<T>(response: any): T {
  return response?.data?.data ?? response?.data ?? response
}

async function load() {
  loading.value = true
  errorMessage.value = ''
  try {
    await authStore.loadCurrentUser()
    const response = await api.get('/suscripciones')
    subscriptionData.value = responseData<SubscriptionResponse>(response)
    await loadPayments()
    editableAmount.value = Number(subscriptionData.value.plan?.amount || 599)
    editableName.value = subscriptionData.value.plan?.name || 'Suscripción mensual'
    editableDescription.value = subscriptionData.value.plan?.description || ''
    editablePlanActive.value = subscriptionData.value.plan?.is_active ?? true
    if (isSuperAdmin.value) await loadOrganizations()
    if (route.query.checkout === 'success' && !subscriptionData.value.access_allowed) {
      await refreshPaymentStatus()
    } else if (route.query.checkout === 'success' && subscriptionData.value.access_allowed) {
      notice.value = 'Suscripción activada correctamente.'
    } else if (route.query.checkout === 'cancel') {
      notice.value = 'El proceso de pago se canceló. Puedes volver a intentarlo cuando quieras.'
    }
  } catch (error: any) {
    errorMessage.value = error.message || 'No se pudo consultar la suscripción.'
  } finally {
    loading.value = false
  }
}

async function loadOrganizations() {
  if (!isSuperAdmin.value) return
  loadingOrganizations.value = true
  try {
    const response = await api.get('/suscripciones/admin/organizations')
    organizations.value = responseData<OrganizationSubscription[]>(response)
    startDates.value = Object.fromEntries(organizations.value.map(organization => ([
      organization.organization_id,
      dateInputValue(organization.current_period_start) || minimumExpirationDate
    ])))
    expirationDates.value = Object.fromEntries(organizations.value.map(organization => {
      const currentExpiration = dateInputValue(organization.current_period_end)
      const minExpiration = startDates.value[organization.organization_id] > minimumExpirationDate
        ? startDates.value[organization.organization_id]
        : minimumExpirationDate
      const defaultExpiration = dateInputValue(new Date(
        Math.max(Date.now() + 30 * 86400000, new Date(`${minExpiration}T00:00:00.000Z`).getTime() + 30 * 86400000)
      ).toISOString())
      return [
        organization.organization_id,
        currentExpiration && currentExpiration >= minExpiration ? currentExpiration : defaultExpiration
      ]
    }))
  } catch (error: any) {
    errorMessage.value = error.message || 'No se pudieron cargar las suscripciones de las organizaciones.'
  } finally {
    loadingOrganizations.value = false
  }
}

async function loadPayments() {
  loadingPayments.value = true
  try {
    const response = await api.get('/suscripciones/payments')
    payments.value = responseData<SubscriptionPayment[]>(response)
  } catch (error: any) {
    errorMessage.value = error.message || 'No se pudo cargar el historial de pagos.'
  } finally {
    loadingPayments.value = false
  }
}

async function savePlan() {
  if (!isSuperAdmin.value || !planChanged.value) return
  savingPrice.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    await api.put('/suscripciones/admin/plan', {
      name: editableName.value.trim(),
      description: editableDescription.value.trim(),
      amount: Number(editableAmount.value),
      is_active: editablePlanActive.value,
      provision_price: !plan.value?.has_stripe_price && plan.value?.stripe_configured
    })
    await load()
    notice.value = 'El plan SaaS se actualizó correctamente.'
  } catch (error: any) {
    errorMessage.value = error.message || 'No se pudo actualizar el precio.'
  } finally {
    savingPrice.value = false
  }
}

async function setOrganizationAccess(
  organization: OrganizationSubscription,
  action: 'activate' | 'set_period' | 'deactivate'
) {
  if (!isSuperAdmin.value || managingOrganizationId.value !== null) return
  const start = startDates.value[organization.organization_id]
  const expiration = expirationDates.value[organization.organization_id]
  const confirmation = action === 'activate'
    ? `¿Programar la membresía de ${organization.organization_name} desde el ${start} hasta el ${expiration}?`
    : action === 'set_period'
      ? `¿Actualizar las fechas del plan de ${organization.organization_name}? Inicio: ${start}; vencimiento: ${expiration}.`
    : `¿Desactivar el acceso de ${organization.organization_name}? Si tiene una suscripción en Stripe, también se cancelará inmediatamente.`
  if (!window.confirm(confirmation)) return

  managingOrganizationId.value = organization.organization_id
  errorMessage.value = ''
  notice.value = ''
  try {
    await api.patch(`/suscripciones/admin/organizations/${organization.organization_id}/subscription`, {
      action,
      ...(action === 'activate' || action === 'set_period'
        ? { current_period_start: start, current_period_end: expiration }
        : {})
    })
    await loadOrganizations()
    notice.value = action === 'activate'
      ? `El plan de ${organization.organization_name} quedó programado desde ${start} hasta ${expiration}.`
      : action === 'set_period'
        ? `Se actualizaron las fechas del plan de ${organization.organization_name}.`
        : `Se desactivó el acceso de ${organization.organization_name}.`
  } catch (error: any) {
    errorMessage.value = error.message || 'No se pudo actualizar la suscripción de la organización.'
  } finally {
    managingOrganizationId.value = null
  }
}

function canManageManualDates(organization: OrganizationSubscription) {
  if (!organization.stripe_managed) return true
  return !organization.access_allowed && ['canceled', 'expired', 'incomplete_expired'].includes(organization.status)
}

function isSubscriptionPeriodValid(organizationId: number) {
  const start = startDates.value[organizationId]
  const expiration = expirationDates.value[organizationId]
  return Boolean(start && expiration && expiration >= start && expiration >= minimumExpirationDate)
}

function organizationStatusText(organization: OrganizationSubscription) {
  if (organization.access_allowed) return 'Activa'
  const startDate = dateInputValue(organization.current_period_start)
  if (organization.status === 'active' && startDate > minimumExpirationDate) return 'Programada'
  return statusText(organization.status)
}

function dateInputValue(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10)
}

function statusText(status: string) {
  return ({
    paid: 'Pagado',
    inactive: 'Sin suscripción',
    past_due: 'Pago pendiente',
    canceled: 'Cancelada',
    unpaid: 'Impaga',
    incomplete: 'Pago incompleto',
    incomplete_expired: 'Pago expirado',
    paused: 'Pausada',
    expired: 'Vencida',
    suspended: 'Suspendida'
  } as Record<string, string>)[status] || 'Sin acceso'
}

function formatDate(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date)
}

function formatPaymentAmount(amount: number, currency: string) {
  return new Intl.NumberFormat('es-MX', {
    style: 'currency',
    currency: currency || 'MXN'
  }).format(Number(amount || 0))
}

async function printPayment(payment: SubscriptionPayment) {
  if (!isAdmin.value) return
  printingPayment.value = payment
  await nextTick()
  window.print()
}

function clearPrintedPayment() {
  printingPayment.value = null
}

async function startCheckout() {
  if (checkingOut.value) return
  checkingOut.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    const response = await api.post('/suscripciones/checkout', {}, {
      headers: { 'Idempotency-Key': crypto.randomUUID() }
    })
    const result = responseData<{ checkout_url: string }>(response)
    if (!result?.checkout_url) throw new Error('Stripe no devolvió el enlace de pago.')
    window.location.assign(result.checkout_url)
  } catch (error: any) {
    errorMessage.value = error.message || 'No se pudo iniciar el pago.'
  } finally {
    checkingOut.value = false
  }
}

async function refreshPaymentStatus() {
  if (checkingPayment.value || !plan.value?.stripe_configured) return
  checkingPayment.value = true
  errorMessage.value = ''
  try {
    const response = await api.post('/suscripciones/reconcile')
    const result = responseData<SubscriptionResponse & { payment_confirmed: boolean }>(response)
    subscriptionData.value = result
    if (result.payment_confirmed) {
      notice.value = 'Pago confirmado con Stripe. La suscripción ya está activa.'
    } else {
      notice.value = 'Stripe todavía no confirma el pago. Si acabas de pagar, espera un momento y vuelve a verificar.'
    }
    await loadPayments()
    if (isSuperAdmin.value) await loadOrganizations()
  } catch (error: any) {
    errorMessage.value = error.message || 'No se pudo verificar el pago con Stripe.'
  } finally {
    checkingPayment.value = false
  }
}

async function cancelSubscription() {
  if (!isAdmin.value || canceling.value || !window.confirm('¿Cancelar la renovación al terminar el periodo ya pagado?')) return
  canceling.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    await api.post('/suscripciones/cancel')
    await load()
    notice.value = 'La renovación se cancelará al final del periodo actual.'
  } catch (error: any) {
    errorMessage.value = error.message || 'No se pudo cancelar la renovación.'
  } finally {
    canceling.value = false
  }
}

onMounted(() => {
  window.addEventListener('afterprint', clearPrintedPayment)
  void load()
})

onUnmounted(() => {
  window.removeEventListener('afterprint', clearPrintedPayment)
})
</script>

<style scoped>
.receipt-print {
  display: none;
}

.subscription-page {
  width: min(100%, 1100px);
  margin: 0 auto;
  padding: clamp(1rem, 3vw, 2rem);
  color: #17241d;
}

.page-header,
.card-heading,
.price-editor,
.actions,
.section-heading,
.global-plan-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.page-header {
  margin-bottom: 1.5rem;
}

.page-header h1,
.card-heading h2 {
  margin: 0.2rem 0;
}

.page-header p,
.plan-description,
.period,
.access-card p {
  color: #617067;
}

.eyebrow {
  margin: 0;
  color: #28714a;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.subscription-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(240px, 0.8fr);
  align-items: start;
  gap: 1rem;
}

.global-management {
  margin-bottom: 1rem;
}

.payment-history {
  margin-top: 1rem;
}

.section-heading {
  margin-bottom: 1.2rem;
}

.section-heading h2 {
  margin: 0.2rem 0;
}

.global-plan-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.global-plan-form label {
  display: grid;
  gap: 0.45rem;
  font-size: 0.88rem;
  font-weight: 700;
}

.global-plan-form input:not([type="checkbox"]) {
  width: 100%;
  padding: 0.7rem 0.8rem;
  border: 1px solid #ccd8cf;
  border-radius: 0.6rem;
  font: inherit;
}

.global-plan-form .checkbox-label {
  display: flex;
  align-items: center;
  grid-column: 1 / -1;
}

.global-plan-actions {
  grid-column: 1 / -1;
  justify-content: flex-start;
  flex-wrap: wrap;
}

.organization-list {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #e8eee9;
}

.organization-list h3 {
  margin: 0 0 1rem;
}

.table-scroll {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.86rem;
}

th,
td {
  padding: 0.75rem;
  border-bottom: 1px solid #e8eee9;
  white-space: nowrap;
}

th {
  color: #53665a;
  font-size: 0.76rem;
  text-transform: uppercase;
}

td small {
  display: block;
  margin-top: 0.2rem;
  color: #758279;
}

.table-action {
  padding: 0.5rem 0.7rem;
  color: #fff;
  background: #236b43;
  font-size: 0.78rem;
}

.organization-actions {
  min-width: 13rem;
}

.expiration-control {
  display: grid;
  gap: 0.45rem;
  margin-bottom: 0.45rem;
}

.expiration-control input {
  min-width: 9.5rem;
  padding: 0.45rem;
  border: 1px solid #ccd8cf;
  border-radius: 0.4rem;
  font: inherit;
}

.expiration-label {
  color: #53665a;
  font-size: 0.76rem;
  font-weight: 700;
  text-transform: uppercase;
}

.table-action.danger {
  background: #a53d35;
}

.panel {
  padding: clamp(1.1rem, 2vw, 1.6rem);
  border: 1px solid #dfe8e2;
  border-radius: 1rem;
  background: #fff;
  box-shadow: 0 12px 35px rgba(23, 36, 29, 0.06);
}

.loading {
  color: #617067;
}

.status-badge {
  padding: 0.4rem 0.7rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 750;
}

.status-badge.active {
  color: #17603a;
  background: #e7f6ec;
}

.status-badge.inactive {
  color: #805c0c;
  background: #fff3d4;
}

.plan-description {
  margin: 1rem 0;
}

.price {
  margin: 0.8rem 0 0;
  color: #183c2b;
  font-size: clamp(2.2rem, 6vw, 3.2rem);
  font-weight: 800;
}

.price span {
  color: #66776c;
  font-size: 1rem;
  font-weight: 500;
}

.period {
  font-size: 0.9rem;
}

.admin-controls {
  display: grid;
  gap: 0.55rem;
  margin: 1.5rem 0 1rem;
  padding-top: 1.2rem;
  border-top: 1px solid #e8eee9;
}

.admin-controls label {
  font-size: 0.88rem;
  font-weight: 700;
}

.price-editor input {
  width: 100%;
  min-width: 0;
  padding: 0.7rem 0.8rem;
  border: 1px solid #ccd8cf;
  border-radius: 0.6rem;
  font: inherit;
}

button {
  padding: 0.7rem 1rem;
  border: 0;
  border-radius: 0.6rem;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.primary-button,
.price-editor button {
  color: #fff;
  background: #236b43;
}

.secondary-button {
  color: #244b34;
  border: 1px solid #cbd9ce;
  background: #fff;
}

.admin-controls small,
.hint {
  color: #66776c;
  font-size: 0.82rem;
  line-height: 1.5;
}

.actions {
  justify-content: flex-start;
  flex-wrap: wrap;
  margin-top: 1.2rem;
}

.access-card h2 {
  margin-top: 0;
}

.notice {
  margin: 0 0 1rem;
  padding: 0.8rem 1rem;
  border-radius: 0.65rem;
}

.notice.success {
  color: #17603a;
  background: #e7f6ec;
}

.notice.error {
  color: #8d2929;
  background: #fff0ef;
}

@media (max-width: 720px) {
  .page-header,
  .card-heading,
  .section-heading {
    align-items: flex-start;
    flex-direction: column;
  }

  .subscription-grid {
    grid-template-columns: 1fr;
  }

  .global-plan-form {
    grid-template-columns: 1fr;
  }
}

.subscription-page {
  --ink: #17243a;
  --muted: #64748b;
  --line: #e2e8f0;
  --green: #16835d;
  --green-dark: #116747;
  width: min(100%, 1240px);
  padding: clamp(1.1rem, 3vw, 2.5rem);
  color: var(--ink);
  background:
    radial-gradient(ellipse at 92% 0%, rgba(216, 229, 255, 0.42), transparent 28rem),
    #f5f7fb;
}

.page-header {
  position: relative;
  overflow: hidden;
  min-height: 190px;
  margin-bottom: 1.5rem;
  padding: clamp(1.5rem, 4vw, 2.6rem);
  border: 1px solid #253b5b;
  border-radius: 1.25rem;
  background: linear-gradient(115deg, #14233b 0%, #1b3555 65%, #24516a 100%);
  box-shadow: 0 18px 38px rgba(19, 38, 64, 0.15);
}

.page-header::after {
  position: absolute;
  top: -8rem;
  right: -3rem;
  width: 23rem;
  height: 23rem;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 50%;
  box-shadow: 0 0 0 2.4rem rgba(255, 255, 255, 0.035), 0 0 0 5rem rgba(255, 255, 255, 0.025);
  content: "";
  pointer-events: none;
}

.page-header > div,
.page-header > button {
  position: relative;
  z-index: 1;
}

.page-header h1 {
  margin: 0.55rem 0 0.35rem;
  color: #fff;
  font-size: clamp(1.8rem, 4vw, 2.45rem);
  font-weight: 760;
  letter-spacing: -0.045em;
}

.page-header p:not(.eyebrow) {
  max-width: 38rem;
  margin: 0.5rem 0 0;
  color: #c4d2e3;
  font-size: 0.96rem;
  line-height: 1.65;
}

.page-header .eyebrow {
  color: #83d6b1;
}

.page-header .secondary-button {
  align-self: flex-end;
  border-color: rgba(255, 255, 255, 0.35);
  color: #fff;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(8px);
}

.page-header .secondary-button:hover {
  background: rgba(255, 255, 255, 0.18);
}

.subscription-grid {
  grid-template-columns: minmax(0, 1.65fr) minmax(260px, 0.85fr);
  gap: 1.15rem;
}

.panel {
  border-color: var(--line);
  border-radius: 1.1rem;
  box-shadow: 0 8px 26px rgba(24, 42, 69, 0.055);
}

.plan-card {
  position: relative;
  overflow: hidden;
  padding: clamp(1.35rem, 3vw, 2rem);
  background: linear-gradient(145deg, #fff 0%, #fff 72%, #f0faf6 100%);
}

.plan-card::after {
  position: absolute;
  top: -6.5rem;
  right: -5rem;
  width: 15rem;
  height: 15rem;
  border: 1px solid rgba(22, 131, 93, 0.12);
  border-radius: 50%;
  box-shadow: 0 0 0 1.5rem rgba(22, 131, 93, 0.035);
  content: "";
  pointer-events: none;
}

.card-heading {
  position: relative;
  z-index: 1;
  align-items: flex-start;
  gap: 0.8rem;
}

.card-heading h2 {
  margin-top: 0.45rem;
  color: var(--ink);
  font-size: clamp(1.35rem, 3vw, 1.7rem);
  letter-spacing: -0.025em;
}

.eyebrow {
  color: var(--green-dark);
  font-size: 0.68rem;
  letter-spacing: 0.12em;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex: 0 0 auto;
  padding: 0.45rem 0.75rem;
  border: 1px solid transparent;
  font-size: 0.76rem;
}

.status-badge.active {
  border-color: #b7e5d1;
  color: #126a48;
  background: #e8f8f0;
}

.status-badge.inactive {
  border-color: #f0d79d;
  color: #835c0a;
  background: #fff7e5;
}

.plan-description {
  max-width: 39rem;
  margin: 1rem 0 1.35rem;
  color: var(--muted);
  line-height: 1.65;
}

.price {
  margin: 0;
  color: #126a48;
  font-size: clamp(2.5rem, 7vw, 3.65rem);
  font-weight: 800;
  letter-spacing: -0.065em;
  line-height: 1.08;
}

.price span {
  color: var(--muted);
  font-size: 0.95rem;
  font-weight: 550;
  letter-spacing: 0;
}

.period {
  margin: 0.85rem 0 0;
  color: var(--muted);
  font-size: 0.88rem;
}

.period strong {
  color: var(--ink);
}

.actions {
  position: relative;
  z-index: 1;
  justify-content: flex-start;
  flex-wrap: wrap;
  margin-top: 1.5rem;
  padding-top: 1.35rem;
  border-top: 1px solid #e8edf2;
}

button {
  min-height: 2.7rem;
  border-radius: 0.65rem;
  transition: background-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

button:not(:disabled):hover {
  transform: translateY(-1px);
}

button:focus-visible,
a:focus-visible,
input:focus-visible {
  outline: 3px solid rgba(59, 130, 246, 0.38);
  outline-offset: 2px;
}

.primary-button,
.table-action:not(.danger),
.price-editor button {
  color: #fff;
  background: var(--green);
  box-shadow: 0 5px 12px rgba(22, 131, 93, 0.16);
}

.primary-button:not(:disabled):hover,
.table-action:not(.danger):not(:disabled):hover,
.price-editor button:not(:disabled):hover {
  background: var(--green-dark);
  box-shadow: 0 7px 16px rgba(22, 131, 93, 0.22);
}

.secondary-button {
  border-color: #d3dce7;
  color: #30425a;
  background: #fff;
}

.secondary-button:not(:disabled):hover {
  border-color: #aab9ca;
  background: #f8fafc;
}

.hint {
  position: relative;
  z-index: 1;
  color: #66768b;
  line-height: 1.6;
}

.access-card {
  position: relative;
  overflow: hidden;
  min-height: 100%;
  padding: clamp(1.35rem, 3vw, 1.7rem);
  border-color: #253b5b;
  color: #eaf1f8;
  background: linear-gradient(150deg, #1a2e49, #14243a);
  box-shadow: 0 12px 30px rgba(19, 38, 64, 0.15);
}

.access-card::before {
  display: grid;
  width: 2.75rem;
  height: 2.75rem;
  margin-bottom: 1.2rem;
  border: 1px solid rgba(131, 214, 177, 0.28);
  border-radius: 0.85rem;
  color: #8be0b9;
  background: rgba(131, 214, 177, 0.1);
  content: "✓";
  font-size: 1.3rem;
  font-weight: 800;
  place-items: center;
}

.access-card h2 {
  margin: 0 0 0.6rem;
  color: #fff;
  font-size: 1.15rem;
}

.access-card p {
  color: #c3d0df;
  font-size: 0.9rem;
  line-height: 1.7;
}

.access-card .hint {
  margin-top: 1rem;
  padding: 0.8rem;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 0.7rem;
  color: #d3dfeb;
  background: rgba(255, 255, 255, 0.06);
}

.global-management,
.payment-history {
  margin-top: 1.15rem;
}

.global-management {
  margin-bottom: 1.15rem;
}

.section-heading {
  margin-bottom: 1.3rem;
}

.section-heading h2 {
  margin: 0.35rem 0 0;
  color: var(--ink);
  font-size: 1.3rem;
  letter-spacing: -0.025em;
}

.global-plan-form label {
  color: #34445a;
  font-size: 0.84rem;
}

.global-plan-form input:not([type="checkbox"]),
.expiration-control input {
  border-color: #d7e0e9;
  border-radius: 0.65rem;
  color: var(--ink);
  background: #fbfcfe;
}

.global-plan-form input:not([type="checkbox"]):focus,
.expiration-control input:focus {
  border-color: #5da98b;
  outline: 3px solid rgba(22, 131, 93, 0.12);
}

.organization-list {
  border-color: var(--line);
}

.organization-list h3 {
  color: var(--ink);
  font-size: 1rem;
}

table {
  color: #34445a;
}

th,
td {
  border-color: #edf1f5;
}

th {
  color: #66768b;
  font-size: 0.7rem;
  letter-spacing: 0.055em;
}

tbody tr:hover {
  background: #f8fafc;
}

td a {
  color: #13744f;
  font-weight: 700;
  text-decoration: none;
}

td a:hover {
  text-decoration: underline;
}

.payment-print-button {
  display: block;
  margin-top: 0.5rem;
}

.table-action.danger {
  background: #bb4949;
}

.table-action.danger:not(:disabled):hover {
  background: #a53d35;
}

@media print {
  @page {
    margin: 18mm;
  }

  :global(body *) {
    visibility: hidden !important;
  }

  .receipt-print,
  .receipt-print * {
    visibility: visible !important;
  }

  .subscription-page {
    width: auto;
    margin: 0;
    padding: 0;
    color: #17241d;
  }

  .subscription-page > :not(.receipt-print) {
    display: none !important;
  }

  .receipt-print {
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: block !important;
    width: 100%;
    background: #fff;
    font-family: Arial, sans-serif;
  }

  .receipt-header {
    padding-bottom: 1rem;
    border-bottom: 2px solid #236b43;
  }

  .receipt-header p {
    margin: 0 0 0.5rem;
    color: #53665a;
    font-size: 0.9rem;
  }

  .receipt-header h1 {
    margin: 0;
    font-size: 1.6rem;
  }

  .receipt-details {
    margin: 1.5rem 0;
  }

  .receipt-details > div {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.7rem 0;
    border-bottom: 1px solid #dfe8e2;
  }

  .receipt-details dt {
    color: #53665a;
  }

  .receipt-details dd {
    margin: 0;
    text-align: right;
    overflow-wrap: anywhere;
  }

  .receipt-total {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding-top: 1rem;
    border-top: 2px solid #236b43;
    font-size: 1.1rem;
  }

  .receipt-footer {
    margin-top: 2rem;
    color: #53665a;
    font-size: 0.85rem;
  }
}

.notice {
  border: 1px solid transparent;
  border-radius: 0.75rem;
}

.notice.success {
  border-color: #b7e5d1;
}

.notice.error {
  border-color: #f0c4c1;
}

@media (max-width: 720px) {
  .subscription-page {
    padding: 1rem;
  }

  .page-header {
    min-height: 0;
    padding: 1.4rem;
    border-radius: 1rem;
  }

  .page-header::after {
    top: -10rem;
    right: -13rem;
  }

  .page-header .secondary-button {
    align-self: flex-start;
  }

  .subscription-grid {
    grid-template-columns: 1fr;
  }

  .access-card {
    min-height: auto;
  }

  .section-heading {
    width: 100%;
  }
}
</style>
