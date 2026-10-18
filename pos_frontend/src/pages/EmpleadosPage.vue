<template>
  <div class="empleados-page">
    <div class="page-header">
      <h1>👥 Gestión de Empleados</h1>
      <Button
        label="+ Agregar Empleado"
        variant="primary"
        @click="openModal()"
      />
    </div>

    <!-- Filtros y búsqueda -->
    <Card title="Filtros" class="filters-card">
      <div class="filters-container">
        <Input
          v-model="searchTerm"
          placeholder="Buscar por nombre o número de empleado..."
          type="text"
        />
        <select v-model="selectedRole" class="role-select">
          <option value="">Todos los roles</option>
          <option value="admin">Administrador</option>
          <option value="cajero">Cajero</option>
          <option value="gerente">Gerente</option>
          <option value="vendedor">Vendedor</option>
        </select>
        <Button
          label="🔄 Refrescar"
          variant="secondary"
          size="small"
          @click="loadEmpleados"
        />
      </div>
    </Card>

    <!-- Alert de estado -->
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

    <!-- Tabla de empleados -->
    <Card title="Empleados Registrados" class="mt-4">
      <div v-if="isLoading" class="loading">
        ⏳ Cargando empleados...
      </div>
      <Alert
        v-else-if="!filteredEmpleados.length"
        type="info"
        message="No hay empleados registrados"
      />
      <DataTable
        v-else
        :columns="tableColumns"
        :rows="filteredEmpleados"
        :striped="true"
      >
        <template #role="{ row }">
          <span class="role-badge" :class="row.rol">
            {{ row.rol }}
          </span>
        </template>
        <template #estado="{ row }">
          <span class="estado-badge" :class="row.activo ? 'activo' : 'inactivo'">
            {{ row.activo ? 'Activo' : 'Inactivo' }}
          </span>
        </template>
        <template #actions="{ row }">
          <div class="actions-cell">
            <Button
              label="✏️ Editar"
              variant="secondary"
              size="small"
              @click="openModal(row)"
            />
            <Button
              label="🗑️ Eliminar"
              variant="danger"
              size="small"
              @click="confirmDelete(row)"
            />
          </div>
        </template>
      </DataTable>
    </Card>

    <!-- Modal de agregar/editar empleado -->
    <Modal
      :is-open="showModal"
      :title="editingEmpleado ? '✏️ Editar Empleado' : '➕ Agregar Empleado'"
      :show-confirm="false"
      @close="closeModal"
    >
      <form @submit.prevent="handleSubmit" class="empleado-form">
        <div v-if="editingEmpleado" class="employee-summary">
          <div class="employee-avatar">{{ formData.nombre.charAt(0).toUpperCase() || '?' }}</div>
          <div>
            <strong>{{ formData.nombre }} {{ formData.apellido }}</strong>
            <span>@{{ formData.username }} · {{ formData.activo ? 'Cuenta activa' : 'Cuenta inactiva' }}</span>
          </div>
          <span class="summary-role" :class="formData.rol">{{ formData.rol || 'Sin rol' }}</span>
        </div>

        <div class="form-section">
          <div class="section-heading">
            <span class="section-kicker">01</span>
            <div>
              <h3>Datos personales</h3>
              <p>Información visible del empleado.</p>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label for="employee-first-name">Nombre <span>*</span></label>
              <Input id="employee-first-name" v-model="formData.nombre" placeholder="Ej: Juan" type="text" required />
            </div>
            <div class="form-group">
              <label for="employee-last-name">Apellido</label>
              <Input id="employee-last-name" v-model="formData.apellido" placeholder="Ej: Pérez" type="text" />
            </div>
            <div class="form-group">
              <label for="employee-number">Número de empleado</label>
              <Input
                id="employee-number"
                v-model="formData.cedula"
                :placeholder="editingEmpleado ? 'Asignado automáticamente' : 'Se asignará al guardar'"
                type="text"
                readonly
              />
              <small class="field-hint">
                {{ editingEmpleado ? 'Este número identifica al empleado y no se puede modificar.' : 'El sistema asignará el siguiente número disponible.' }}
              </small>
            </div>
            <div class="form-group">
              <label for="employee-phone">Teléfono</label>
              <Input id="employee-phone" v-model="formData.telefono" placeholder="Ej: 5551234567" type="tel" />
            </div>
            <div class="form-group form-group-wide">
              <label for="employee-email">Email <span>*</span></label>
              <Input id="employee-email" v-model="formData.email" placeholder="Ej: juan@empresa.com" type="email" required />
            </div>
          </div>
        </div>

        <div class="form-section">
          <div class="section-heading">
            <span class="section-kicker">02</span>
            <div>
              <h3>Acceso y permisos</h3>
              <p>Controla cómo ingresa y qué puede hacer.</p>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label for="employee-username">Usuario <span>*</span></label>
              <Input id="employee-username" v-model="formData.username" placeholder="Ej: juan.perez" type="text" required />
            </div>
            <div class="form-group">
              <label for="employee-organization">Organización <span>*</span></label>
              <Input id="employee-organization" v-model.number="formData.organizationId" placeholder="Ej: 1" type="number" min="1" required />
            </div>
            <div class="form-group">
              <label for="employee-role">Rol <span>*</span></label>
              <select id="employee-role" v-model="formData.rol" required class="role-select">
                <option value="">Seleccionar rol</option>
                <option value="admin">Administrador</option>
                <option value="cajero">Cajero</option>
                <option value="gerente">Gerente</option>
                <option value="vendedor">Vendedor</option>
              </select>
            </div>
            <div class="form-group">
              <label for="employee-password">Contraseña {{ editingEmpleado ? '(opcional)' : '*' }}</label>
              <Input id="employee-password" v-model="formData.password" placeholder="Contraseña inicial" type="password" :required="!editingEmpleado" />
            </div>
          </div>
          <div class="account-status">
            <div>
              <strong>Estado de la cuenta</strong>
              <span>{{ formData.activo ? 'Puede iniciar sesión y operar en el sistema.' : 'No puede iniciar sesión hasta reactivarse.' }}</span>
            </div>
            <label class="switch-label">
              <input v-model="formData.activo" type="checkbox" />
              <span class="switch-track"></span>
              <b>{{ formData.activo ? 'Activo' : 'Inactivo' }}</b>
            </label>
          </div>
        </div>

        <div class="form-actions">
          <Button
            label="Cancelar"
            variant="secondary"
            @click="closeModal"
          />
          <Button
            label="Guardar"
            variant="primary"
            type="submit"
            :disabled="isSubmitting"
          />
        </div>
      </form>
    </Modal>

    <!-- Modal de confirmación de eliminación -->
    <Modal
      :is-open="showDeleteModal"
      title="⚠️ Confirmar Eliminación"
      @close="closeDeleteModal"
    >
      <div class="delete-confirmation">
        <p>¿Está seguro de que desea eliminar al empleado <strong>{{ empleadoToDelete?.nombre }}</strong>?</p>
        <p class="warning">Esta acción no se puede deshacer.</p>
      </div>
      <template #footer>
        <Button
          label="Cancelar"
          variant="secondary"
          @click="closeDeleteModal"
        />
        <Button
          label="Eliminar"
          variant="danger"
          :disabled="isDeleting"
          @click="handleDelete"
        />
      </template>
    </Modal>

    <!-- Estadísticas -->
    <div class="stats-container mt-4">
      <Card title="📊 Estadísticas" class="stats-card">
        <div class="stats-grid">
          <div class="stat">
            <span class="stat-label">Total Empleados:</span>
            <span class="stat-value">{{ empleados.length }}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Activos:</span>
            <span class="stat-value">{{ empleadosActivos }}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Inactivos:</span>
            <span class="stat-value">{{ empleadosInactivos }}</span>
          </div>
          <div class="stat">
            <span class="stat-label">Cajeros:</span>
            <span class="stat-value">{{ empleadosPorRol.cajero }}</span>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import Card from '@/components/common/Card.vue'
import Button from '@/components/common/Button.vue'
import Input from '@/components/common/Input.vue'
import Alert from '@/components/common/Alert.vue'
import Modal from '@/components/common/Modal.vue'
import DataTable from '@/components/common/DataTable.vue'
import { api } from '@/services/api'

interface Empleado {
  id?: string
  username: string
  nombre: string
  apellido: string
  cedula: string
  email: string
  telefono?: string
  organizationId: number
  rol: string
  password?: string
  activo: boolean
  createdAt?: string
  updatedAt?: string
}

// Stores
const authStore = useAuthStore()

// Estado
const empleados = ref<Empleado[]>([])
const showModal = ref(false)
const showDeleteModal = ref(false)
const editingEmpleado = ref<Empleado | null>(null)
const empleadoToDelete = ref<Empleado | null>(null)
const searchTerm = ref('')
const selectedRole = ref('')
const error = ref<string | null>(null)
const successMessage = ref<string | null>(null)
const isLoading = ref(false)
const isSubmitting = ref(false)
const isDeleting = ref(false)

// Formulario
const formData = ref<Empleado>({
  username: '',
  nombre: '',
  apellido: '',
  cedula: '',
  email: '',
  telefono: '',
  organizationId: 1,
  rol: '',
  activo: true
})

// Columnas de tabla
const tableColumns = [
  { key: 'username', label: 'Usuario', width: '15%' },
  { key: 'nombre', label: 'Nombre', width: '22%' },
  { key: 'apellido', label: 'Apellido', width: '18%' },
  { key: 'cedula', label: 'Número de empleado', width: '15%' },
  { key: 'email', label: 'Email', width: '25%' },
  { key: 'rol', label: 'Rol', width: '15%', slot: 'role' },
  { key: 'estado', label: 'Estado', width: '10%', slot: 'estado' },
  { key: 'actions', label: 'Acciones', width: '15%', slot: 'actions' }
]

// Computed
const filteredEmpleados = computed(() => {
  return empleados.value.filter(emp => {
    const matchSearch = emp.nombre.toLowerCase().includes(searchTerm.value.toLowerCase()) ||
                       emp.cedula.includes(searchTerm.value) ||
                       emp.email.toLowerCase().includes(searchTerm.value.toLowerCase())
    const matchRole = !selectedRole.value || emp.rol === selectedRole.value
    return matchSearch && matchRole
  })
})

const empleadosActivos = computed(() => {
  return empleados.value.filter(e => e.activo).length
})

const empleadosInactivos = computed(() => {
  return empleados.value.filter(e => !e.activo).length
})

const empleadosPorRol = computed(() => {
  const roles = {
    admin: 0,
    cajero: 0,
    gerente: 0,
    vendedor: 0
  }
  empleados.value.forEach(emp => {
    if (emp.rol in roles) {
      roles[emp.rol as keyof typeof roles]++
    }
  })
  return roles
})

// Métodos
const loadEmpleados = async () => {
  try {
    isLoading.value = true
    error.value = null
    const response: any = await api.get('/employees', {
      params: {
        search: searchTerm.value || undefined,
        role: selectedRole.value === 'cajero'
          ? 'cashier'
          : selectedRole.value === 'gerente'
            ? 'manager'
            : selectedRole.value || undefined,
        active: undefined
      }
    })

    const rows = Array.isArray(response?.data) ? response.data : Array.isArray(response?.data?.data) ? response.data.data : []
    empleados.value = rows.map((employee: any) => {
      const fullName = String(employee.nombreEmpleado || employee.nombre || employee.username || '').trim()
      const nameParts = fullName.split(/\s+/)
      const firstName = employee.nombre || employee.firstName || nameParts.shift() || ''
      const lastName = employee.apellido || employee.lastName || nameParts.join(' ')

      return {
      id: employee.id,
      username: employee.username || '',
      nombre: firstName,
      apellido: lastName,
      cedula: String(employee.cedula || employee.employeeNumber || employee.numeroEmpleado || ''),
      email: employee.email || '',
      telefono: employee.telefono || employee.phone || '',
      organizationId: Number(employee.organizationId || employee.organization_id || 1),
      rol: employee.rol || (employee.role === 'manager' ? 'gerente' : employee.role === 'admin' ? 'admin' : 'cajero'),
      activo: employee.activo ?? employee.active ?? true,
      ...employee
      }
    })
  } catch (err: any) {
    error.value = err.message || 'Error al conectar con el servidor'
    console.error('Error loading empleados:', err)
  } finally {
    isLoading.value = false
  }
}

const openModal = (empleado?: Empleado) => {
  if (empleado) {
    editingEmpleado.value = empleado
    formData.value = {
      ...empleado,
      username: empleado.username || '',
      nombre: empleado.nombre || '',
      apellido: empleado.apellido || '',
      cedula: String(empleado.cedula || ''),
      email: empleado.email || '',
      telefono: empleado.telefono || '',
      organizationId: Number(empleado.organizationId || 1),
      rol: empleado.rol || 'cajero',
      activo: empleado.activo ?? true,
      password: ''
    }
  } else {
    editingEmpleado.value = null
    formData.value = {
      username: '',
      nombre: '',
      apellido: '',
      cedula: '',
      email: '',
      telefono: '',
      organizationId: 1,
      rol: '',
      activo: true
    }
  }
  showModal.value = true
}

const closeModal = () => {
  showModal.value = false
  editingEmpleado.value = null
  formData.value = {
      username: '',
    nombre: '',
      apellido: '',
    cedula: '',
    email: '',
    telefono: '',
      organizationId: 1,
    rol: '',
    activo: true
  }
}

const handleSubmit = async () => {
  try {
    isSubmitting.value = true
    error.value = null
    successMessage.value = null

    if (!formData.value.nombre || !formData.value.username || !formData.value.email || !formData.value.organizationId || !formData.value.rol || (!editingEmpleado.value && !formData.value.password)) {
      error.value = 'Todos los campos obligatorios deben estar completos'
      return
    }

    const payload: Record<string, any> = {
      nombreEmpleado: `${formData.value.nombre} ${formData.value.apellido}`.trim(),
      nombre: formData.value.nombre,
      apellido: formData.value.apellido,
      firstName: formData.value.nombre,
      lastName: formData.value.apellido,
      username: formData.value.username,
      email: formData.value.email,
      telefono: formData.value.telefono,
      phone: formData.value.telefono,
      role: formData.value.rol === 'gerente' ? 'manager' : formData.value.rol === 'cajero' ? 'cashier' : formData.value.rol,
      rol: formData.value.rol,
      active: formData.value.activo,
      activo: formData.value.activo,
      organizationId: formData.value.organizationId
    }

    if (editingEmpleado.value) {
      payload.employeeNumber = formData.value.cedula
      payload.numeroEmpleado = formData.value.cedula
    }

    if (formData.value.password) {
      payload.password = formData.value.password
      payload.temporaryPassword = formData.value.password
    }

    const response: any = editingEmpleado.value
      ? await api.patch(`/employees/${editingEmpleado.value.id}`, payload)
      : await api.post('/employees', payload)

    const result = response?.data && response.data.data ? response.data.data : response.data
    if (response?.data?.success !== false) {
      successMessage.value = editingEmpleado.value ? 'Empleado actualizado correctamente' : 'Empleado creado correctamente'
      setTimeout(() => {
        closeModal()
        loadEmpleados()
      }, 1500)
    } else {
      error.value = response.data.message || 'Error al guardar empleado'
    }
  } catch (err: any) {
    error.value = err.message || 'Error al procesar la solicitud'
    console.error('Error submitting empleado:', err)
  } finally {
    isSubmitting.value = false
  }
}

const confirmDelete = (empleado: Empleado) => {
  empleadoToDelete.value = empleado
  showDeleteModal.value = true
}

const closeDeleteModal = () => {
  showDeleteModal.value = false
  empleadoToDelete.value = null
}

const handleDelete = async () => {
  if (!empleadoToDelete.value?.id) return

  try {
    isDeleting.value = true
    error.value = null
    successMessage.value = null

    const response: any = await api.post(`/employees/${empleadoToDelete.value.id}/deactivate`)

    if (response?.data?.success !== false) {
      successMessage.value = 'Empleado desactivado correctamente'
      setTimeout(() => {
        closeDeleteModal()
        loadEmpleados()
      }, 1500)
    } else {
      error.value = response.data.message || 'Error al eliminar empleado'
    }
  } catch (err: any) {
    error.value = err.message || 'Error al procesar la solicitud'
    console.error('Error deleting empleado:', err)
  } finally {
    isDeleting.value = false
  }
}

// Load on mount
onMounted(() => {
  loadEmpleados()
})
</script>

<style scoped>
.empleados-page {
  padding: 2rem;
  max-width: 1400px;
  margin: 0 auto;
  background: #f5f5f5;
  min-height: 100vh;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
}

.page-header h1 {
  font-size: 2rem;
  margin: 0;
  color: #333;
}

.filters-card {
  margin-bottom: 2rem;
}

.filters-container {
  display: grid;
  grid-template-columns: 1fr auto auto;
  gap: 1rem;
  align-items: end;
}

.role-select {
  width: 100%;
  min-height: 42px;
  padding: 0.65rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  background: #fff;
  color: #1e293b;
  font-size: 0.95rem;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.actions-cell {
  display: flex;
  gap: 0.5rem;
}

.role-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 500;
}

.role-badge.admin {
  background: #dc3545;
  color: white;
}

.role-badge.cajero {
  background: #007bff;
  color: white;
}

.role-badge.gerente {
  background: #28a745;
  color: white;
}

.role-badge.vendedor {
  background: #ffc107;
  color: #333;
}

.estado-badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.85rem;
  font-weight: 500;
}

.estado-badge.activo {
  background: #d4edda;
  color: #155724;
}

.estado-badge.inactivo {
  background: #f8d7da;
  color: #721c24;
}

.empleado-form {
  display: grid;
  gap: 1.15rem;
}

.empleados-page :deep(.modal-content) {
  width: min(760px, 100%);
  max-height: 90vh;
}

.empleados-page :deep(.modal-body) {
  max-height: calc(90vh - 150px);
  overflow-y: auto;
}

.employee-summary {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding: 0.8rem 0.9rem;
  border: 1px solid #dbeafe;
  border-radius: 12px;
  background: #eff6ff;
}

.employee-avatar {
  display: grid;
  place-items: center;
  width: 2.7rem;
  height: 2.7rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #1d4ed8;
  color: #fff;
  font-weight: 700;
  font-size: 1.1rem;
}

.employee-summary div:nth-child(2) {
  display: grid;
  gap: 0.2rem;
  min-width: 0;
}

.employee-summary strong {
  overflow: hidden;
  color: #172554;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.employee-summary span:not(.summary-role) {
  color: #475569;
  font-size: 0.82rem;
}

.summary-role {
  margin-left: auto;
  padding: 0.3rem 0.65rem;
  border-radius: 999px;
  background: #dbeafe;
  color: #1e40af;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: capitalize;
  white-space: nowrap;
}

.summary-role.admin { background: #fee2e2; color: #991b1b; }
.summary-role.gerente { background: #dcfce7; color: #166534; }
.summary-role.vendedor { background: #fef3c7; color: #92400e; }

.form-section {
  padding: 1rem;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  background: #fff;
}

.section-heading {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  margin-bottom: 1rem;
}

.section-kicker {
  color: #2563eb;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.section-heading h3 {
  margin: 0;
  color: #172554;
  font-size: 0.98rem;
}

.section-heading p {
  margin: 0.2rem 0 0;
  color: #64748b;
  font-size: 0.78rem;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.9rem;
}

.form-group-wide {
  grid-column: 1 / -1;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  margin-bottom: 0.4rem;
  color: #334155;
  font-size: 0.8rem;
  font-weight: 700;
}

.form-group label span {
  color: #dc2626;
}

.field-hint {
  margin-top: 0.35rem;
  color: #64748b;
  font-size: 0.72rem;
  line-height: 1.35;
}

.form-group input,
.form-group select {
  min-height: 42px;
  box-sizing: border-box;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #007bff;
  box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.25);
}

.form-group input[readonly] {
  border-color: #dbeafe;
  background: #f8fafc;
  color: #475569;
  cursor: not-allowed;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  cursor: pointer;
}

.checkbox-label input {
  width: auto;
  margin: 0;
}

.account-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e2e8f0;
}

.account-status div {
  display: grid;
  gap: 0.25rem;
}

.account-status strong {
  color: #334155;
  font-size: 0.85rem;
}

.account-status div span {
  color: #64748b;
  font-size: 0.75rem;
}

.switch-label {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  color: #334155;
  cursor: pointer;
  font-size: 0.8rem;
  white-space: nowrap;
}

.switch-label input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.switch-track {
  position: relative;
  display: inline-block;
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: #cbd5e1;
  transition: background 0.2s ease;
}

.switch-track::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  content: '';
  transition: transform 0.2s ease;
}

.switch-label input:checked + .switch-track {
  background: #16a34a;
}

.switch-label input:checked + .switch-track::after {
  transform: translateX(16px);
}

.form-actions {
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
  padding-top: 0.25rem;
}

.delete-confirmation {
  padding: 1rem 0;
}

.delete-confirmation p {
  margin: 0.5rem 0;
  font-size: 1rem;
}

.delete-confirmation .warning {
  color: #dc3545;
  font-weight: 500;
}

.stats-container {
  margin-top: 2rem;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.stat {
  display: flex;
  flex-direction: column;
  padding: 1.5rem;
  background: #f9f9f9;
  border-left: 4px solid #007bff;
  border-radius: 4px;
}

.stat-label {
  color: #666;
  font-size: 0.9rem;
  margin-bottom: 0.5rem;
}

.stat-value {
  font-size: 2rem;
  font-weight: bold;
  color: #333;
}

.mt-4 {
  margin-top: 2rem;
}

@media (max-width: 640px) {
  .empleados-page {
    padding: 1rem;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .form-group-wide {
    grid-column: auto;
  }

  .employee-summary,
  .account-status {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .summary-role {
    margin-left: 3.5rem;
  }

  .form-actions {
    flex-direction: column-reverse;
  }

  .form-actions :deep(button) {
    width: 100%;
  }
}
</style>
