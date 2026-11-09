<template>
  <div class="analytics-page">
    <div class="analytics-container">
      <header class="page-header">
        <div>
          <p class="eyebrow">{{ organizationName }}</p>
          <h1>Estadísticas de ventas</h1>
          <p class="subtitle">Resumen del desempeño de tu organización.</p>
        </div>
        <div class="date-filters">
          <label>
            <span>Desde</span>
            <input v-model="dates.startDate" type="date" :max="dates.endDate">
          </label>
          <label>
            <span>Hasta</span>
            <input v-model="dates.endDate" type="date" :min="dates.startDate">
          </label>
          <button type="button" class="refresh-button" :disabled="isGenerating" @click="refresh">
            {{ isGenerating ? 'Cargando…' : 'Actualizar' }}
          </button>
        </div>
      </header>

      <p v-if="error" class="error-message" role="alert">{{ error }}</p>
      <div v-if="isGenerating && !report" class="loading-state" role="status">Cargando estadísticas…</div>

      <template v-if="report">
        <section class="metrics-grid" aria-label="Indicadores de ventas">
          <article class="metric-card metric-primary">
            <span>Ventas totales</span>
            <strong>{{ currency(report.totalSales) }}</strong>
            <small>En el periodo seleccionado</small>
          </article>
          <article class="metric-card">
            <span>Transacciones</span>
            <strong>{{ report.totalTransactions }}</strong>
            <small>Tickets completados</small>
          </article>
          <article class="metric-card">
            <span>Ticket promedio</span>
            <strong>{{ currency(report.averageTicket) }}</strong>
            <small>Venta por transacción</small>
          </article>
          <article class="metric-card">
            <span>Artículos vendidos</span>
            <strong>{{ quantity(report.totalItems) }}</strong>
            <small>Unidades en tickets</small>
          </article>
          <article class="metric-card">
            <span>Descuentos</span>
            <strong>{{ currency(totalDiscounts) }}</strong>
            <small>Importe aplicado</small>
          </article>
        </section>

        <section class="content-grid">
          <article class="panel trend-panel">
            <div class="panel-heading">
              <div>
                <h2>Tendencia diaria</h2>
                <p>{{ showRecentTrend ? 'Últimos 14 días del rango seleccionado' : 'Ventas por día en el rango seleccionado' }}</p>
              </div>
              <strong>{{ currency(report.totalSales) }}</strong>
            </div>
            <div v-if="dailySales.length" class="chart" role="img" aria-label="Gráfica de ventas diarias">
              <div v-for="day in dailySales" :key="day.date" class="chart-column">
                <span class="bar-value">{{ compactCurrency(day.sales) }}</span>
                <div class="bar-track">
                  <div class="bar" :style="{ height: `${barHeight(day.sales)}%` }"></div>
                </div>
                <span class="bar-label">{{ day.label }}</span>
              </div>
            </div>
            <p v-else class="empty-state">No hay ventas en este periodo.</p>
          </article>

          <article class="panel">
            <div class="panel-heading">
              <div>
                <h2>Métodos de pago</h2>
                <p>Distribución por importe</p>
              </div>
            </div>
            <ul v-if="paymentMethods.length" class="rank-list">
              <li v-for="method in paymentMethods" :key="method.name">
                <div class="rank-copy">
                  <span>{{ method.label }}</span>
                  <strong>{{ currency(method.total) }}</strong>
                </div>
                <div class="progress-track">
                  <div class="progress-bar" :style="{ width: `${methodPercentage(method.total)}%` }"></div>
                </div>
                <small>{{ method.count }} transacciones</small>
              </li>
            </ul>
            <p v-else class="empty-state">No hay datos de pagos en este periodo.</p>
          </article>

          <article class="panel">
            <div class="panel-heading">
              <div>
                <h2>Productos más vendidos</h2>
                <p>Ordenados por unidades</p>
              </div>
            </div>
            <ol v-if="report.topProducts.length" class="table-list">
              <li v-for="(product, index) in report.topProducts.slice(0, 5)" :key="product.code || product.name">
                <span class="list-index">{{ index + 1 }}</span>
                <span class="item-name">{{ product.name }}</span>
                <strong>{{ quantity(product.quantity) }} uds.</strong>
                <small>{{ currency(product.total) }}</small>
              </li>
            </ol>
            <p v-else class="empty-state">No hay productos vendidos en este periodo.</p>
          </article>

          <article class="panel">
            <div class="panel-heading">
              <div>
                <h2>Desempeño de cajeros</h2>
                <p>Mayores ventas en el periodo</p>
              </div>
            </div>
            <ol v-if="report.topCashiers.length" class="table-list cashier-list">
              <li v-for="(cashier, index) in report.topCashiers.slice(0, 5)" :key="cashier.name">
                <span class="list-index">{{ index + 1 }}</span>
                <span class="item-name">{{ cashier.name }}</span>
                <strong>{{ currency(cashier.sales) }}</strong>
                <small>{{ cashier.count }} tickets</small>
              </li>
            </ol>
            <p v-else class="empty-state">No hay ventas de cajeros en este periodo.</p>
          </article>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useReports } from '@/composables/useReports'
import { formatCurrency } from '@/utils/helpers'

const authStore = useAuthStore()
const { currentReport: report, generateReport, isGenerating, error } = useReports()

const formatDate = (date: Date) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return localDate.toISOString().slice(0, 10)
}

const today = new Date()
const startDate = new Date()
startDate.setDate(today.getDate() - 6)
const dates = reactive({
  startDate: formatDate(startDate),
  endDate: formatDate(today)
})

const organizationName = computed(() =>
  authStore.currentOrganization?.name || authStore.currentUser?.organizationName || 'Organización'
)
const totalDiscounts = computed(() => report.value?.totalDiscounts || 0)

const dailySales = computed(() => Object.entries(report.value?.dailyDistribution || {})
  .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
  .slice(-14)
  .map(([date, sales]) => ({
    date,
    label: new Date(`${date}T00:00:00`).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }),
    sales: Number(sales)
  })))
const showRecentTrend = computed(() =>
  new Date(`${dates.endDate}T00:00:00`).getTime() -
  new Date(`${dates.startDate}T00:00:00`).getTime() >= 14 * 24 * 60 * 60 * 1000
)

const paymentLabels: Record<string, string> = {
  cash: 'Efectivo',
  card: 'Tarjeta',
  transfer: 'Transferencia',
  check: 'Cheque',
  other: 'Otro'
}

const paymentMethods = computed(() => Object.entries(report.value?.paymentMethods || {})
  .filter(([, value]) => value.count > 0)
  .map(([name, value]) => ({ name, label: paymentLabels[name] || name, ...value }))
  .sort((a, b) => b.total - a.total))

const maxDailySales = computed(() => Math.max(...dailySales.value.map(day => day.sales), 0))
const barHeight = (sales: number) => maxDailySales.value ? Math.max(6, sales / maxDailySales.value * 100) : 0
const methodTotal = computed(() => paymentMethods.value.reduce((sum, method) => sum + method.total, 0))
const methodPercentage = (total: number) => methodTotal.value ? total / methodTotal.value * 100 : 0
const currency = (value: number) => formatCurrency(Number(value || 0))
const compactCurrency = (value: number) => new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN',
  notation: 'compact',
  maximumFractionDigits: 1
}).format(value)
const quantity = (value: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(Number(value || 0))

const refresh = async () => {
  await generateReport({ startDate: dates.startDate, endDate: dates.endDate })
}

onMounted(() => {
  void refresh()
})
</script>

<style scoped>
.analytics-page {
  min-height: 100%;
  padding: 1.5rem 1rem 3rem;
  background: #f4f7fb;
}

.analytics-container {
  display: grid;
  gap: 1.25rem;
  max-width: 1440px;
  margin: 0 auto;
}

.page-header,
.date-filters,
.panel-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.page-header {
  flex-wrap: wrap;
}

.eyebrow {
  margin: 0 0 0.3rem;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

h1,
h2,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 0.35rem;
  color: #14213d;
  font-size: clamp(1.6rem, 3vw, 2.1rem);
}

.subtitle,
.panel-heading p {
  margin-bottom: 0;
  color: #64748b;
  font-size: 0.86rem;
}

.date-filters {
  flex-wrap: wrap;
}

.date-filters label {
  display: grid;
  gap: 0.3rem;
  color: #475569;
  font-size: 0.75rem;
  font-weight: 650;
}

.date-filters input {
  min-height: 2.5rem;
  padding: 0.45rem 0.6rem;
  border: 1px solid #d5deea;
  border-radius: 0.65rem;
  background: white;
  color: #172033;
  font: inherit;
}

.refresh-button {
  align-self: end;
  min-height: 2.5rem;
  padding: 0.55rem 1rem;
  border: 0;
  border-radius: 0.65rem;
  background: #174e82;
  color: white;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.refresh-button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.85rem;
}

.metric-card,
.panel {
  border: 1px solid #e3eaf2;
  border-radius: 1rem;
  background: white;
  box-shadow: 0 8px 24px rgba(27, 46, 75, 0.04);
}

.metric-card {
  display: grid;
  gap: 0.65rem;
  min-width: 0;
  padding: 1rem;
}

.metric-card > span {
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 700;
}

.metric-card strong {
  overflow: hidden;
  color: #172033;
  font-size: clamp(1.2rem, 2vw, 1.65rem);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.metric-card small {
  color: #94a3b8;
  font-size: 0.72rem;
}

.metric-primary {
  border-color: #174e82;
  background: linear-gradient(140deg, #123f6a, #1d679e);
}

.metric-primary > span,
.metric-primary strong,
.metric-primary small {
  color: white;
}

.content-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1rem;
}

.panel {
  min-width: 0;
  padding: 1.2rem;
}

.panel-heading {
  align-items: flex-start;
  margin-bottom: 1.2rem;
}

.panel-heading h2 {
  margin-bottom: 0.3rem;
  color: #172033;
  font-size: 1rem;
}

.panel-heading > strong {
  color: #174e82;
  font-size: 0.9rem;
}

.chart {
  display: flex;
  align-items: end;
  gap: clamp(0.35rem, 1.5vw, 0.9rem);
  min-height: 13rem;
  padding-top: 1.25rem;
  overflow-x: auto;
}

.chart-column {
  display: grid;
  flex: 1 0 2.5rem;
  grid-template-rows: 1.1rem 1fr 1.2rem;
  gap: 0.4rem;
  height: 12rem;
  text-align: center;
}

.bar-value,
.bar-label {
  color: #64748b;
  font-size: 0.65rem;
  white-space: nowrap;
}

.bar-track {
  display: flex;
  align-items: end;
  height: 100%;
  border-radius: 0.4rem 0.4rem 0 0;
  background: #f1f5f9;
}

.bar {
  width: 100%;
  min-height: 0.25rem;
  border-radius: 0.4rem 0.4rem 0 0;
  background: linear-gradient(180deg, #45a3d8, #174e82);
}

.rank-list,
.table-list {
  display: grid;
  gap: 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rank-copy {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  color: #334155;
  font-size: 0.82rem;
}

.progress-track {
  height: 0.45rem;
  margin: 0.5rem 0 0.3rem;
  overflow: hidden;
  border-radius: 99px;
  background: #eaf0f6;
}

.progress-bar {
  height: 100%;
  border-radius: inherit;
  background: #3a8fc2;
}

.rank-list small,
.table-list small {
  color: #8492a6;
  font-size: 0.7rem;
}

.table-list li {
  display: grid;
  grid-template-columns: 1.5rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.2rem 0.65rem;
  color: #334155;
  font-size: 0.8rem;
}

.list-index {
  display: grid;
  width: 1.4rem;
  height: 1.4rem;
  place-items: center;
  border-radius: 50%;
  background: #edf4fa;
  color: #174e82;
  font-size: 0.7rem;
  font-weight: 750;
}

.item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-list strong,
.table-list small {
  grid-column: 3;
  text-align: right;
}

.table-list small {
  grid-row: 2;
}

.empty-state,
.loading-state {
  padding: 1rem 0;
  color: #64748b;
  font-size: 0.85rem;
}

.error-message {
  margin: 0;
  color: #b42318;
}

@media (max-width: 1050px) {
  .metrics-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .analytics-page {
    padding: 1rem 0.75rem 2rem;
  }

  .date-filters {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }

  .refresh-button {
    grid-column: 1 / -1;
  }

  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .metric-primary {
    grid-column: 1 / -1;
  }

  .content-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 380px) {
  .metrics-grid {
    grid-template-columns: 1fr;
  }

  .metric-primary {
    grid-column: auto;
  }
}
</style>
