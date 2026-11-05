<template>
  <div class="settings-page">
    <!-- Header -->
    <div class="page-header">
      <h1>⚙️ Configuración</h1>
      <p>Gestiona la configuración del sistema POS</p>
    </div>

    <!-- Tabs de configuración -->
    <div class="tabs-container">
      <div class="tabs">
        <button
          v-for="tab in tabs"
          :key="tab"
          @click="activeTab = tab"
          :class="{ active: activeTab === tab }"
          class="tab-button"
        >
          {{ getTabLabel(tab) }}
        </button>
      </div>
    </div>

    <!-- Contenido por tab -->
    <div class="settings-content">
      <!-- 1. Configuración General -->
      <div v-if="activeTab === 'general'" class="settings-section">
        <h2>Configuración General</h2>

        <div class="form-group">
          <label>Nombre de Negocio</label>
          <input v-model="settings.businessName" type="text" placeholder="Nombre de tu negocio" :disabled="isLoadingSettings" />
        </div>

        <div class="form-group">
          <label>RUC / NIT</label>
          <input v-model="settings.businessRuc" type="text" placeholder="Identificación fiscal" :disabled="isLoadingSettings" />
        </div>

        <div class="form-group">
          <label>Email de Contacto</label>
          <input v-model="settings.email" type="email" placeholder="email@negocio.com" :disabled="isLoadingSettings" />
        </div>

        <div class="form-group">
          <label>Teléfono</label>
          <input v-model="settings.phone" type="tel" placeholder="Teléfono de contacto" :disabled="isLoadingSettings" />
        </div>

        <div class="form-group">
          <label>Dirección</label>
          <textarea v-model="settings.address" placeholder="Dirección completa del negocio" :disabled="isLoadingSettings"></textarea>
        </div>

        <p v-if="isLoadingSettings" class="empty-state">Cargando información registrada de la organización...</p>
        <button @click="saveSettings" class="btn-save" :disabled="isLoadingSettings || isSavingSettings">
          {{ isSavingSettings ? 'Guardando...' : '💾 Guardar Cambios' }}
        </button>
      </div>

      <!-- 2. Usuarios y Roles -->
      <div v-if="activeTab === 'users'" class="settings-section">
        <h2>Gestión de Usuarios</h2>

        <div class="users-list">
          <div class="user-item" v-for="user in users" :key="user.id">
            <div class="user-info">
              <h3>{{ user.nombreEmpleado }}</h3>
              <p>{{ user.email }}</p>
              <span :class="'role-badge ' + user.role">{{ roleLabel(user.role) }}</span>
            </div>
          </div>
          <p v-if="isLoadingUsers" class="empty-state">Cargando usuarios de la organización...</p>
          <p v-else-if="!users.length" class="empty-state">No hay usuarios registrados en esta organización.</p>
        </div>
        <RouterLink class="btn-primary manage-users-link" to="/empleados">Ir a gestión de empleados</RouterLink>
      </div>

      <!-- 3. Empresa / Negocio -->
      <div v-if="activeTab === 'company'" class="settings-section">
        <h2>Información de la Empresa</h2>

        <div class="info-card">
          <h3>{{ settings.businessName }}</h3>
          <p><strong>RUC/NIT:</strong> {{ settings.businessRuc }}</p>
          <p><strong>Email:</strong> {{ settings.email }}</p>
          <p><strong>Teléfono:</strong> {{ settings.phone }}</p>
          <p><strong>Dirección:</strong> {{ settings.address }}</p>
        </div>

        <h3>Estadísticas</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">{{ organizationSummary.employeesCount }}</div>
            <div class="stat-label">Empleados</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ organizationSummary.activeCashiersCount }}</div>
            <div class="stat-label">Cajeros activos</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ organizationSummary.productsCount }}</div>
            <div class="stat-label">Productos</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">{{ organizationSummary.transactionsCount }}</div>
            <div class="stat-label">Transacciones</div>
          </div>
        </div>
      </div>

      <!-- 4. Impresoras -->
      <div v-if="activeTab === 'printers'" class="settings-section">
        <h2>Configuración de Impresoras</h2>

        <div class="printers-list">
          <div class="printer-item" v-for="printer in printers" :key="printer.id">
            <div class="printer-info">
              <h3>{{ printer.name }}</h3>
              <p>Modelo: {{ printer.model }}</p>
              <p>Estado: <span :class="'status ' + (printer.connected ? 'online' : 'offline')">
                {{ printer.connected ? '🟢 Conectada' : '🔴 Desconectada' }}
              </span></p>
            </div>
            <div class="printer-actions">
              <button @click="testPrinter" :disabled="isTestingPrinter" class="btn-small">
                {{ isTestingPrinter ? '⏳ Probando...' : '🖨️ Prueba' }}
              </button>
            </div>
          </div>
          <p v-if="isLoadingPrinters" class="empty-state">Consultando el agente local...</p>
          <p v-else-if="printerError" class="empty-state">{{ printerError }}</p>
          <p v-else-if="!printers.length" class="empty-state">El agente local no reportó impresoras conectadas.</p>
        </div>

        <p v-if="printersSimulated" class="empty-state">El agente está en modo simulado; no representa una impresora física.</p>
      </div>

      <!-- 5. Respaldos -->
      <div v-if="activeTab === 'backups'" class="settings-section">
        <h2>Respaldos y Recuperación</h2>

        <div class="backup-info">
          <p>
            <strong>Último respaldo:</strong> {{ lastBackupDate }}
          </p>
          <p>
            <strong>Respaldos disponibles:</strong> {{ backups.length }}
          </p>
        </div>

        <div class="backup-actions">
          <label for="backup-format">Formato del respaldo</label>
          <select id="backup-format" v-model="backupFormat" class="backup-format-select">
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="xlsx">Excel (XLSX)</option>
          </select>
          <label for="download-format">Formato de descarga</label>
          <select id="download-format" v-model="downloadFormat" class="backup-format-select">
            <option value="json">JSON</option>
            <option value="csv">CSV</option>
            <option value="xlsx">Excel (XLSX)</option>
          </select>

          <button @click="createBackup" :disabled="isBackingUp" class="btn-primary">
            {{ isBackingUp ? '⏳ Respaldando...' : '💾 Crear Respaldo Ahora' }}
          </button>

          <button @click="downloadBackup(backups[0]?.id, downloadFormat)" :disabled="!backups.length" class="btn-secondary">
            📥 Descargar último en {{ downloadFormat.toUpperCase() }}
          </button>

        </div>

        <h3>Historial de Respaldos</h3>
        <div class="backups-list">
          <div v-for="backup in backups" :key="backup.id" class="backup-item">
            <span>{{ backup.date }} · {{ backup.format.toUpperCase() }} · {{ backup.size }}</span>
            <div class="backup-item-actions">
              <button @click="downloadBackup(backup.id, downloadFormat)" class="btn-small">📥 Descargar</button>
              <button @click="restoreBackup(backup.id)" class="btn-small">↩️ Restaurar</button>
            </div>
          </div>
          <p v-if="!backups.length" class="empty-state">No hay respaldos registrados para esta organización.</p>
        </div>
      </div>
    </div>

    <!-- Alert messages -->
    <div v-if="successMessage" class="alert alert-success">
      ✅ {{ successMessage }}
    </div>
    <div v-if="errorMessage" class="alert alert-error">
      ❌ {{ errorMessage }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { api } from '@/services/api'
import { hardwareAgent } from '@/services/hardwareAgent'

const authStore = useAuthStore()

// Estado
const activeTab = ref<'general' | 'users' | 'company' | 'printers' | 'backups'>('general')
const successMessage = ref('')
const errorMessage = ref('')
const isLoadingSettings = ref(false)
const isSavingSettings = ref(false)
const isLoadingUsers = ref(false)
const isLoadingPrinters = ref(false)
const printerError = ref('')
const printersSimulated = ref(false)

const tabs = ['general', 'users', 'company', 'printers', 'backups'] as const

// Settings generales
const settings = ref({
  businessName: '',
  businessRuc: '',
  email: '',
  phone: '',
  address: ''
})

// Usuarios
const users = ref<Array<{ id: number; nombreEmpleado: string; email: string; role: string; active: boolean }>>([])

// Impresoras
const printers = ref<Array<{ id: string; name: string; model: string; connected: boolean }>>([])
const isTestingPrinter = ref(false)
const organizationSummary = ref({
  employeesCount: 0,
  activeCashiersCount: 0,
  productsCount: 0,
  transactionsCount: 0
})

// Respaldos
const isBackingUp = ref(false)
const backupFormat = ref<'json' | 'csv' | 'xlsx'>('json')
const downloadFormat = ref<'json' | 'csv' | 'xlsx'>('json')
const lastBackupDate = ref('Sin respaldos')
const backups = ref<Array<{ id: number; format: 'json' | 'csv' | 'xlsx'; date: string; size: string }>>([])

// Computed
// Métodos
const getTabLabel = (tab: string) => {
  const labels: Record<string, string> = {
    general: '🏢 General',
    users: '👥 Usuarios',
    company: '🏪 Empresa',
    printers: '🖨️ Impresoras',
    backups: '💾 Respaldos'
  }
  return labels[tab] || tab
}

const loadOrganizationSettings = async () => {
  isLoadingSettings.value = true
  try {
    const response: any = await api.get('/organization/settings')
    const data = response?.data?.data || response?.data || {}
    settings.value = {
      businessName: data.general?.name || '',
      businessRuc: data.general?.taxId || '',
      email: data.general?.email || '',
      phone: data.general?.phone || '',
      address: data.general?.address || ''
    }
  } catch (err: any) {
    errorMessage.value = err.message || 'No se pudo cargar la configuración de la empresa'
  } finally {
    isLoadingSettings.value = false
  }
}

const loadUsers = async () => {
  isLoadingUsers.value = true
  try {
    const response: any = await api.get('/employees')
    const rows = Array.isArray(response?.data) ? response.data : Array.isArray(response?.data?.data) ? response.data.data : []
    users.value = rows.map((user: any) => ({
      id: user.id,
      nombreEmpleado: user.nombreEmpleado || user.nombre || user.username,
      email: user.email,
      role: user.role || user.rol || 'cashier',
      active: user.active ?? user.activo ?? true
    }))
  } catch (err: any) {
    errorMessage.value = err.message || 'No se pudo cargar los empleados'
  } finally {
    isLoadingUsers.value = false
  }
}

const loadOrganizationSummary = async () => {
  try {
    const response: any = await api.get('/organization/summary')
    const summary = response?.data?.data || response?.data || {}
    organizationSummary.value = {
      employeesCount: Number(summary.employeesCount || 0),
      activeCashiersCount: Number(summary.activeCashiersCount || 0),
      productsCount: Number(summary.productsCount || 0),
      transactionsCount: Number(summary.transactionsCount || 0)
    }
  } catch (err: any) {
    errorMessage.value = err.message || 'No se pudieron cargar las estadísticas de la organización'
  }
}

const roleLabel = (role: string) => ({
  admin: 'Administrador',
  superadmin: 'Superadministrador',
  cashier: 'Cajero',
  manager: 'Gerente',
  vendedor: 'Vendedor'
}[role] || role)

const saveSettings = async () => {
  isSavingSettings.value = true
  errorMessage.value = ''
  try {
    const response: any = await api.patch('/organization', {
      name: settings.value.businessName,
      taxId: settings.value.businessRuc,
      email: settings.value.email,
      phone: settings.value.phone,
      address: settings.value.address
    })
    const organization = response?.data?.data || response?.data
    settings.value = {
      businessName: organization?.name ?? settings.value.businessName,
      businessRuc: organization?.taxId ?? settings.value.businessRuc,
      email: organization?.email ?? settings.value.email,
      phone: organization?.phone ?? settings.value.phone,
      address: organization?.address ?? settings.value.address
    }
    await authStore.refreshOrganization()
    successMessage.value = 'Configuración guardada correctamente'
    setTimeout(() => {
      successMessage.value = ''
    }, 3000)
  } catch (err: any) {
    errorMessage.value = err.message || 'Error al guardar la configuración'
  } finally {
    isSavingSettings.value = false
  }
}

const loadPrinterStatus = async () => {
  isLoadingPrinters.value = true
  printerError.value = ''
  try {
    const health: any = await hardwareAgent.health()
    const reportedPrinters = Array.isArray(health?.printers)
      ? health.printers
      : health?.printer
        ? [health.printer]
        : []
    printers.value = reportedPrinters.map((printer: any, index: number) => ({
      id: String(printer.id || printer.name || `printer-${index}`),
      name: String(printer.name || 'Impresora sin nombre'),
      model: String(printer.model || 'Modelo no reportado'),
      connected: Boolean(printer.connected ?? printer.active)
    }))
    printersSimulated.value = health?.simulated === true
  } catch {
    printers.value = []
    printerError.value = 'No se pudo consultar el agente local. Verifica que esté iniciado en este equipo.'
  } finally {
    isLoadingPrinters.value = false
  }
}

const testPrinter = async () => {
  if (isTestingPrinter.value) return

  isTestingPrinter.value = true
  successMessage.value = ''
  errorMessage.value = ''

  try {
    await hardwareAgent.testPrint()
    successMessage.value = 'Impresión de prueba enviada correctamente'
  } catch (error: any) {
    const code = String(error?.code || '').toUpperCase()
    const message = String(error?.message || '').toLowerCase()

    if (code === 'INVALID_AGENT_TOKEN' || code === 'UNAUTHORIZED_AGENT' || code === 'INVALID_TOKEN') {
      errorMessage.value = 'Token del agente inválido'
    } else if (code === 'PRINTER_UNAVAILABLE' || message.includes('printer') || message.includes('impresora')) {
      errorMessage.value = 'La impresora no está disponible'
    } else {
      errorMessage.value = 'No se pudo conectar con el agente local'
    }
  } finally {
    isTestingPrinter.value = false
  }
}

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`
}

const loadBackups = async () => {
  try {
    const response: any = await api.get('/backups')
    const rows = Array.isArray(response?.data?.data) ? response.data.data : []
    backups.value = rows.map((backup: any) => ({
      id: Number(backup.id),
      format: backup.format || 'json',
      date: new Date(backup.createdAt).toLocaleString(),
      size: formatBytes(Number(backup.size || 0))
    }))
    lastBackupDate.value = backups.value[0]?.date || 'Sin respaldos'
  } catch (error: any) {
    errorMessage.value = error.message || 'No se pudieron cargar los respaldos'
  }
}

const createBackup = async () => {
  isBackingUp.value = true
  try {
    await api.post('/backups', { format: backupFormat.value })
    await loadBackups()
    successMessage.value = 'Respaldo creado exitosamente'
    setTimeout(() => {
      successMessage.value = ''
    }, 3000)
  } catch (error) {
    errorMessage.value = 'Error al crear respaldo'
    setTimeout(() => {
      errorMessage.value = ''
    }, 3000)
  } finally {
    isBackingUp.value = false
  }
}

const downloadBackup = async (backupId?: number, format: 'json' | 'csv' | 'xlsx' = 'json') => {
  if (!backupId) return

  try {
    const response = await api.get(`/backups/${backupId}/download`, {
      params: { format },
      responseType: 'blob'
    })
    const blobUrl = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = `respaldo-${backupId}.${format}`
    link.click()
    URL.revokeObjectURL(blobUrl)
    successMessage.value = 'Descarga de respaldo iniciada'
  } catch (error: any) {
    errorMessage.value = error.message || 'No se pudo descargar el respaldo'
  }
}

const restoreBackup = async (backupId: number) => {
  if (confirm('¿Estás seguro de que deseas restaurar este respaldo? Se perderán datos recientes.')) {
    try {
      await api.post(`/backups/${backupId}/restore`)
      await loadBackups()
      successMessage.value = 'Respaldo restaurado correctamente'
    } catch (error: any) {
      errorMessage.value = error.message || 'No se pudo restaurar el respaldo'
    }
  }
}

onMounted(async () => {
  await Promise.all([
    loadOrganizationSettings(),
    loadUsers(),
    loadOrganizationSummary(),
    loadPrinterStatus(),
    loadBackups()
  ])
})
</script>

<style scoped>
.settings-page {
  padding: 20px;
  background: #f5f5f5;
  min-height: 100vh;
}

.page-header {
  margin-bottom: 30px;
}

.page-header h1 {
  font-size: 28px;
  margin-bottom: 5px;
  color: #333;
}

.page-header p {
  color: #666;
}

/* Tabs */
.tabs-container {
  background: white;
  border-radius: 8px;
  margin-bottom: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.tabs {
  display: flex;
  gap: 0;
  padding: 0;
}

.tab-button {
  padding: 15px 20px;
  border: none;
  background: white;
  cursor: pointer;
  font-size: 14px;
  border-bottom: 3px solid transparent;
  transition: all 0.3s;
  flex: 1;
  text-align: center;
}

.tab-button:hover {
  background: #f9f9f9;
}

.tab-button.active {
  border-bottom-color: #007bff;
  color: #007bff;
  font-weight: 600;
}

/* Contenido */
.settings-content {
  background: white;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.settings-section h2 {
  font-size: 20px;
  margin-bottom: 20px;
  color: #333;
  border-bottom: 1px solid #eee;
  padding-bottom: 10px;
}

.settings-section h3 {
  font-size: 16px;
  margin-top: 20px;
  margin-bottom: 15px;
  color: #555;
}

/* Formularios */
.form-group {
  margin-bottom: 15px;
}

.form-group label {
  display: block;
  margin-bottom: 5px;
  font-weight: 500;
  color: #333;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.form-group textarea {
  resize: vertical;
  min-height: 80px;
}

.logo-preview {
  margin-top: 10px;
  max-width: 150px;
  height: auto;
  border-radius: 4px;
}

/* Usuarios */
.users-list {
  margin-bottom: 20px;
  border: 1px solid #eee;
  border-radius: 4px;
  overflow: hidden;
}

.user-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid #eee;
}

.user-item:last-child {
  border-bottom: none;
}

.user-info h3 {
  margin: 0 0 5px 0;
  font-size: 16px;
}

.user-info p {
  margin: 0;
  color: #666;
  font-size: 13px;
}

.role-badge {
  display: inline-block;
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  margin-top: 5px;
}

.role-badge.admin {
  background: #ff6b6b;
  color: white;
}

.role-badge.manager {
  background: #4ecdc4;
  color: white;
}

.role-badge.cashier {
  background: #95e1d3;
  color: #333;
}

.user-actions {
  display: flex;
  gap: 10px;
}

/* Modal */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  padding: 30px;
  border-radius: 8px;
  max-width: 400px;
  width: 90%;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
}

.modal h3 {
  margin-top: 0;
}

.modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

/* Impresoras */
.printers-list {
  margin-bottom: 20px;
  border: 1px solid #eee;
  border-radius: 4px;
  overflow: hidden;
}

.printer-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border-bottom: 1px solid #eee;
}

.printer-item:last-child {
  border-bottom: none;
}

.printer-info h3 {
  margin: 0 0 5px 0;
}

.printer-info p {
  margin: 5px 0;
  color: #666;
  font-size: 13px;
}

.status {
  font-weight: 600;
}

.status.online {
  color: #27ae60;
}

.status.offline {
  color: #e74c3c;
}

.printer-actions {
  display: flex;
  gap: 10px;
}

/* Empresa */
.info-card {
  background: #f9f9f9;
  padding: 20px;
  border-radius: 4px;
  margin-bottom: 20px;
  border-left: 4px solid #007bff;
}

.info-card h3 {
  margin-top: 0;
}

.info-card p {
  margin: 5px 0;
  color: #666;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 15px;
}

.stat-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px;
  border-radius: 8px;
  text-align: center;
}

.stat-value {
  font-size: 32px;
  font-weight: bold;
  margin-bottom: 5px;
}

.stat-label {
  font-size: 13px;
  opacity: 0.9;
}

/* Respaldos */
.backup-info {
  background: #f0f8ff;
  padding: 15px;
  border-radius: 4px;
  margin-bottom: 20px;
  border-left: 4px solid #3498db;
}

.backup-info p {
  margin: 5px 0;
  color: #333;
}

.backup-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 20px;
}

.backups-list {
  border: 1px solid #eee;
  border-radius: 4px;
  overflow: hidden;
}

.backup-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 15px;
  border-bottom: 1px solid #eee;
  font-size: 13px;
}

.backup-item:last-child {
  border-bottom: none;
}

/* Botones */
.btn-primary,
.btn-secondary,
.btn-save,
.btn-danger,
.btn-small {
  padding: 10px 15px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary {
  background: #007bff;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #0056b3;
}

.btn-secondary {
  background: #6c757d;
  color: white;
}

.btn-secondary:hover {
  background: #545b62;
}

.btn-save {
  background: #28a745;
  color: white;
}

.btn-save:hover {
  background: #218838;
}

.btn-danger {
  background: #dc3545;
  color: white;
}

.btn-danger:hover {
  background: #c82333;
}

.btn-small {
  padding: 5px 10px;
  font-size: 12px;
  background: #6c757d;
  color: white;
}

.btn-small:hover {
  background: #545b62;
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Alertas */
.alert {
  padding: 15px;
  border-radius: 4px;
  margin-top: 20px;
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 1001;
  animation: slideIn 0.3s ease;
}

.alert-success {
  background: #d4edda;
  color: #155724;
  border: 1px solid #c3e6cb;
}

.alert-error {
  background: #f8d7da;
  color: #721c24;
  border: 1px solid #f5c6cb;
}

@keyframes slideIn {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

/* Responsive */
@media (max-width: 768px) {
  .tabs {
    flex-wrap: wrap;
  }

  .tab-button {
    flex: 1 1 50%;
  }

  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .user-item,
  .printer-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .user-actions,
  .printer-actions {
    width: 100%;
    margin-top: 10px;
  }
}
</style>
