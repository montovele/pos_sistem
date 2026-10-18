<template>
  <div class="reports-page">
    <div class="container">
      <h1>Reportes</h1>
      
      <Card title="Filtros de Reportes" class="filters-card">
        <div class="filters">
          <Input
            v-model="filters.startDate"
            label="Fecha Inicio"
            type="date"
          />
          <Input
            v-model="filters.endDate"
            label="Fecha Fin"
            type="date"
          />
          <Input
            v-if="authStore.currentUser?.role === 'admin'"
            v-model.number="filters.cashierId"
            label="No. de Cajero (opcional)"
            type="number"
          />
          <Button
            label="Hoy"
            variant="secondary"
            :is-loading="isGenerating"
            @click="setTodayReport"
          />
          <Button
            label="Generar Reporte"
            variant="primary"
            :is-loading="isGenerating"
            @click="generateReport"
          />
        </div>
        <p v-if="error" class="error-message">{{ error }}</p>
      </Card>

      <div v-if="report" class="report-shell">
        <div class="report-tabs" role="tablist" aria-label="Secciones del reporte">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.id"
            :class="['tab-button', { active: activeTab === tab.id }]"
            @click="activeTab = tab.id"
          >
            <span>{{ tab.label }}</span>
          </button>
        </div>

        <div class="report-content">
          <section v-if="activeTab === 'overview'" class="tab-panel">
            <Card title="Resumen de Reportes">
              <div class="report-toolbar">
                <span>{{ report.totalTransactions }} transacciones encontradas · {{ scopeLabel }}</span>
                <div class="export-actions">
                  <Button label="Exportar CSV" variant="secondary" :disabled="isGenerating" @click="exportCSV" />
                  <Button label="Exportar JSON" variant="secondary" :disabled="isGenerating" @click="exportJSON" />
                  <Button label="Exportar PDF" variant="secondary" :disabled="isGenerating" @click="exportPDF" />
                </div>
              </div>
              <div class="summary-grid">
                <div class="summary-card">
                  <div class="summary-label">Total de Ventas</div>
                  <div class="summary-value">{{ formatCurrency(report.totalSales) }}</div>
                </div>
                <div class="summary-card">
                  <div class="summary-label">Total de Artículos</div>
                  <div class="summary-value">{{ report.totalItems }}</div>
                </div>
                <div class="summary-card">
                  <div class="summary-label">Ticket Promedio</div>
                  <div class="summary-value">{{ formatCurrency(report.averageTicket) }}</div>
                </div>
                <div class="summary-card shortage-card">
                  <div class="summary-label">Faltantes de Caja</div>
                  <div class="summary-value">{{ report.cashShortages.length }}</div>
                </div>
              </div>
            </Card>

            <Card title="Estado Final del Reporte">
              <div class="final-status" :class="report.finalStatus === 'CUADRADA' ? 'status-ok' : 'status-empty'">
                <strong>{{ report.finalStatus }}</strong>
                <span>Generado: {{ report.generatedAt }}</span>
              </div>
            </Card>
          </section>

          <section v-else-if="activeTab === 'cash'" class="tab-panel">
            <Card title="Faltantes de Caja">
              <DataTable :columns="shortageColumns" :rows="report.cashShortages" />
            </Card>
          </section>

          <section v-else-if="activeTab === 'transactions'" class="tab-panel">
            <Card v-if="filteredTransactions.length" title="Transacciones">
              <DataTable :columns="transactionColumns" :rows="paginatedTransactions" />
              <div class="transactions-pagination" aria-label="Paginación de transacciones">
                <span>Mostrando {{ transactionRangeStart }}-{{ transactionRangeEnd }} de {{ filteredTransactions.length }}</span>
                <div class="pagination-controls">
                  <button type="button" :disabled="transactionPage <= 1" @click="goToTransactionPage(transactionPage - 1)">Anterior</button>
                  <strong>Página {{ transactionPage }} de {{ transactionTotalPages }}</strong>
                  <button type="button" :disabled="transactionPage >= transactionTotalPages" @click="goToTransactionPage(transactionPage + 1)">Siguiente</button>
                </div>
              </div>
            </Card>
            <p v-else class="empty-message">No hay transacciones para mostrar en este rango.</p>
          </section>
        </div>
      </div>
      <p v-else-if="!isGenerating && !error" class="empty-message">Genera un reporte para ver los resultados.</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, onMounted, computed, ref } from 'vue'
import { useReports } from '@/composables/useReports'
import { useAuthStore } from '@/stores/authStore'
import Card from '@/components/common/Card.vue'
import Input from '@/components/common/Input.vue'
import Button from '@/components/common/Button.vue'
import DataTable from '@/components/common/DataTable.vue'
import { formatCurrency } from '@/utils/helpers'

const authStore = useAuthStore()

const filters = reactive<{
  startDate: string
  endDate: string
  cashierId?: number
}>({
  startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  endDate: new Date().toISOString().split('T')[0],
  cashierId: undefined
})

const {
  currentReport: report,
  filteredTransactions,
  filter,
  generateReport: createReport,
  isGenerating,
  error,
  exportToCSV,
  exportToJSON,
  exportToPDF
} = useReports()

const activeTab = ref<'overview' | 'cash' | 'transactions'>('overview')
const tabs = [
  { id: 'overview', label: 'Resumen' },
  { id: 'cash', label: 'Caja' },
  { id: 'transactions', label: 'Transacciones' }
] as const

const transactionPage = ref(1)
const transactionPageSize = 10
const transactionTotalPages = computed(() => Math.max(1, Math.ceil(filteredTransactions.value.length / transactionPageSize)))
const paginatedTransactions = computed(() => {
  const start = (transactionPage.value - 1) * transactionPageSize
  return filteredTransactions.value.slice(start, start + transactionPageSize)
})
const transactionRangeStart = computed(() => {
  if (!filteredTransactions.value.length) return 0
  return (transactionPage.value - 1) * transactionPageSize + 1
})
const transactionRangeEnd = computed(() => Math.min(
  transactionPage.value * transactionPageSize,
  filteredTransactions.value.length
))

const transactionColumns: Array<{
  key: string
  label: string
  format?: 'number' | 'date' | 'currency'
}> = [
  { key: 'codigoTransaccion', label: 'Código' },
  { key: 'codigoTicket', label: 'Ticket' },
  { key: 'fechaDeTrans', label: 'Fecha', format: 'date' },
  { key: 'total', label: 'Total', format: 'currency' },
  { key: 'status', label: 'Estado' }
]

const shortageColumns = [
  { key: 'cashier', label: 'Cajero' },
  { key: 'fechaCierre', label: 'Fecha de Cierre', format: 'date' as const },
  { key: 'totalEsperado', label: 'Esperado', format: 'currency' as const },
  { key: 'efectivoContado', label: 'Contado', format: 'currency' as const },
  { key: 'diferencia', label: 'Faltante', format: 'currency' as const }
]

const scopeLabel = computed(() => {
  if (authStore.currentUser?.role !== 'admin') {
    return `Cajero: ${authStore.currentUser?.nombreEmpleado || 'actual'}`
  }
  return filters.cashierId ? `Cajero: ${filters.cashierId}` : 'Vista global (Administrador)'
})

const formatDateInput = (date: Date) => {
  const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000))
  return localDate.toISOString().split('T')[0]
}

const setTodayReport = () => {
  const today = formatDateInput(new Date())
  filters.startDate = today
  filters.endDate = today
  void generateReport()
}

const generateReport = async () => {
  filter.value.startDate = filters.startDate
  filter.value.endDate = filters.endDate
  filter.value.cashierId = authStore.currentUser?.role === 'admin' ? filters.cashierId : authStore.currentUser?.numeroEmpleado

  try {
    await createReport({ ...filter.value })
    transactionPage.value = 1
  } catch {
    // El mensaje ya está disponible en el estado del composable.
  }
}

const goToTransactionPage = (page: number) => {
  if (page < 1 || page > transactionTotalPages.value) return
  transactionPage.value = page
}

const exportCSV = () => {
  if (!report.value) return
  exportToCSV(report.value, `reporte-${filters.startDate}-${filters.endDate}.csv`, filteredTransactions.value)
}

const exportJSON = () => {
  if (!report.value) return
  exportToJSON(report.value, `reporte-${filters.startDate}-${filters.endDate}.json`, filteredTransactions.value)
}

const exportPDF = () => {
  if (!report.value) return
  exportToPDF(report.value, `reporte-${filters.startDate}-${filters.endDate}.pdf`, filteredTransactions.value)
}

onMounted(() => {
  generateReport()
})
</script>

<style scoped>
.reports-page {
  min-height: auto;
  height: auto;
  padding: 0.7rem 0 0;
  overflow: visible;
  background: linear-gradient(180deg, #eef5fb 0%, #f7fafc 100%);
}

.container {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  max-width: 1280px;
  min-height: 0;
  margin: 0 auto;
  padding: 0 0.9rem;
}

h1 {
  color: #2c3e50;
  margin: 0;
  font-size: 1.6rem;
  letter-spacing: -0.03em;
}

.filters-card :deep(.card) {
  border-radius: 14px;
  box-shadow: 0 8px 18px rgba(15, 23, 42, 0.05);
}

.filters-card :deep(.card-header) {
  padding: 0.7rem 0.9rem;
  background: linear-gradient(135deg, #f8fbff 0%, #edf4fb 100%);
  border-bottom: 1px solid #e5edf5;
  font-size: 0.92rem;
  font-weight: 700;
  color: #1f2d3d;
}

.filters-card :deep(.card-body) {
  padding: 0.75rem 0.8rem;
}

.filters {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.2fr) minmax(120px, 0.9fr) auto auto;
  gap: 0.65rem;
  align-items: end;
}

.filters > * {
  min-width: 0;
}

.filters :deep(.btn) {
  min-height: 2.3rem;
  padding: 0.55rem 0.8rem;
  font-size: 0.72rem;
  border-radius: 10px;
}

.report-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.7rem;
  margin-bottom: 0.7rem;
  font-size: 0.76rem;
}

.export-actions {
  display: flex;
  gap: 0.45rem;
  flex-wrap: wrap;
}

.export-actions :deep(.btn) {
  min-height: 2.1rem;
  padding: 0.42rem 0.6rem;
  font-size: 0.7rem;
  border-radius: 8px;
}

.transactions-pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1rem;
  padding-top: 0.85rem;
  border-top: 1px solid #eaecf0;
  color: #667085;
  font-size: 0.82rem;
}

.pagination-controls {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.pagination-controls strong {
  color: #344054;
  font-size: 0.8rem;
  white-space: nowrap;
}

.pagination-controls button {
  padding: 0.45rem 0.7rem;
  border: 1px solid #d0d5dd;
  border-radius: 6px;
  background: #fff;
  color: #344054;
  cursor: pointer;
  font-size: 0.76rem;
  font-weight: 600;
}

.pagination-controls button:hover:not(:disabled) {
  border-color: #667eea;
  color: #4f46e5;
}

.pagination-controls button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.error-message {
  margin: 1rem 0 0;
  color: #b42318;
  font-weight: 500;
}

.empty-message {
  margin-top: 2rem;
  color: #667085;
  text-align: center;
}

.report-shell {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border: 1px solid #dfeaf3;
  border-radius: 16px;
  background: linear-gradient(180deg, #f8fbff 0%, #f3f7fb 100%);
  box-shadow: 0 10px 24px rgba(15, 23, 42, 0.06);
  overflow: visible;
}

.report-tabs {
  display: flex;
  gap: 0.35rem;
  padding: 0.55rem 0.6rem 0;
  border-bottom: 1px solid #e5edf5;
  background: rgba(255, 255, 255, 0.5);
  flex-shrink: 0;
}

.tab-button {
  appearance: none;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 10px 10px 0 0;
  background: transparent;
  color: #52657d;
  padding: 0.6rem 0.85rem;
  font-size: 0.7rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-button.active {
  background: linear-gradient(135deg, #0f172a 0%, #1d4e89 100%);
  color: white;
  box-shadow: 0 -8px 20px rgba(29, 78, 137, 0.12);
}

.report-content {
  display: block;
  gap: 0.7rem;
  min-height: 0;
  padding: 0.7rem;
  overflow: visible;
}

.tab-panel {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  min-height: 0;
  overflow: visible;
}

.tab-panel :deep(.card) {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.tab-panel :deep(.card-body) {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: visible;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.7rem;
  margin-top: 0.6rem;
}

.summary-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 0.9rem 0.7rem;
  border-radius: 10px;
  text-align: center;
}

.summary-label {
  font-size: 0.9rem;
  opacity: 0.9;
  margin-bottom: 0.5rem;
}

.summary-value {
  font-size: 1.75rem;
  font-weight: bold;
}

.shortage-card {
  background: linear-gradient(135deg, #c0392b 0%, #e67e22 100%);
}

.final-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 1rem;
  border-left: 4px solid;
}

.final-status span {
  color: #667085;
  font-size: 0.9rem;
}

.status-ok {
  background: #ecfdf3;
  border-color: #12b76a;
  color: #027a48;
}

.status-empty {
  background: #fffaeb;
  border-color: #f79009;
  color: #b54708;
}

@media (max-width: 900px) {
  .reports-page {
    height: auto;
    min-height: auto;
    overflow: auto;
  }

  .filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 600px) {
  .filters,
  .report-toolbar {
    grid-template-columns: 1fr;
    display: grid;
  }

  .report-tabs {
    overflow-x: auto;
    scrollbar-width: none;
  }

  .report-tabs::-webkit-scrollbar {
    display: none;
  }

  .tab-button {
    white-space: nowrap;
  }

  .summary-grid {
    grid-template-columns: 1fr;
  }

  .transactions-pagination {
    align-items: stretch;
    flex-direction: column;
  }

  .pagination-controls {
    justify-content: space-between;
  }
}
</style>
