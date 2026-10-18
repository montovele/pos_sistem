<template>
  <div class="inventory-page">
    <header class="inventory-header">
      <div>
        <p class="eyebrow">Operación y existencias</p>
        <h1>Inventario</h1>
        <p class="subtitle">Inventario real filtrado por la sesión/organización del usuario autenticado.</p>
      </div>
      <div class="header-actions">
      <button v-if="isAdmin" class="primary-button" type="button" @click="openCreate">+ Producto</button>
      <button class="refresh-button" type="button" :disabled="inventoryStore.isLoading" @click="refresh">
        {{ inventoryStore.isLoading ? 'Actualizando...' : 'Actualizar' }}
      </button>
      </div>
    </header>

    <nav class="inventory-tabs" aria-label="Secciones de inventario">
      <router-link to="/inventario">Existencias</router-link>
      <router-link v-if="isAdmin" to="/inventario/importar">Importar</router-link>
      <router-link v-if="isAdmin" to="/inventario/reportes">Reportes</router-link>
      <router-link v-if="isAdmin" to="/inventario/movimientos">Movimientos</router-link>
    </nav>

    <div v-if="notice" class="notice" :class="noticeType" role="status">{{ notice }}</div>

    <section v-if="activeTab === 'import' && isAdmin" class="feature-panel">
      <div class="section-heading"><div><p class="eyebrow">Carga masiva</p><h2>Importar inventario</h2><p>Valida primero con dry-run y confirma solo las filas aceptadas por el backend.</p></div></div>
      <div class="import-controls"><label>Formato<select v-model="importSource"><option value="csv">CSV</option><option value="json">JSON</option><option value="xlsx">XLSX</option></select></label><label>Archivo<input type="file" :accept="acceptTypes" @change="selectFile" /></label></div>
      <div v-if="importSource === 'csv'" class="template-box">
        <div><strong>¿Necesitas una plantilla?</strong><p>Descarga un archivo CSV con las columnas compatibles con el backend y una fila de ejemplo.</p></div>
        <button class="secondary-button" type="button" @click="downloadCsvTemplate">Descargar plantilla CSV</button>
      </div>
      <p class="hint">Máximo 10 MB y 10.000 filas. Unidades compatibles: PZA, KG, LT, CAJA, M, ROLLO, L, PAQUETE, ML y PAR.</p>
      <div v-if="selectedFile" class="file-chip"><strong>{{ selectedFile.name }}</strong><span>{{ formatBytes(selectedFile.size) }}</span><button class="text-button" type="button" @click="clearImport">Quitar</button></div>
      <div v-if="importError" class="message error" role="alert">{{ importError }}</div>
      <button class="primary-button" type="button" :disabled="!selectedFile || isImporting" @click="previewImport">{{ isImporting ? 'Validando...' : 'Validar y previsualizar' }}</button>
      <div v-if="importResult" class="import-result"><div class="result-grid"><div><strong>{{ importResult.totalRows }}</strong><span>Total</span></div><div class="good"><strong>{{ importResult.validRows }}</strong><span>Válidas</span></div><div class="bad"><strong>{{ importResult.invalidRows }}</strong><span>Inválidas</span></div><div class="bad"><strong>{{ importResult.duplicates }}</strong><span>Duplicadas</span></div></div><p class="result-status">{{ importResult.dryRun ? 'Vista previa sin persistencia.' : `Importación completada: ${importResult.importedRows} filas.` }} <span v-if="importResult.auditId">Auditoría #{{ importResult.auditId }}</span></p><div v-if="importResult.dryRun && importResult.validRows" class="confirm-row"><button class="primary-button" type="button" :disabled="isImporting" @click="confirmImport">Confirmar importación</button><span>Solo se guardarán las filas válidas.</span></div><div v-if="importResult.rows?.some(row => row.status !== 'valid')" class="row-errors"><strong>Filas que requieren atención</strong><div v-for="row in importResult.rows.filter(row => row.status !== 'valid').slice(0, 20)" :key="row.index"><b>Fila {{ row.index + 1 }} · {{ row.sku || 'sin SKU' }}</b><span>{{ row.status }}: {{ row.errors.join(', ') || 'duplicada' }}</span></div></div></div>
    </section>

    <section v-else-if="activeTab === 'reports' && isAdmin" class="feature-panel">
      <div class="section-heading"><div><p class="eyebrow">Lectura ejecutiva</p><h2>Reportes de inventario</h2><p>Valor, unidades y alertas calculados por el backend.</p></div><div class="report-actions"><button class="secondary-button" type="button" :disabled="!inventoryStore.summary || isGeneratingPdf" @click="exportInventoryPdf">{{ isGeneratingPdf ? 'Generando PDF...' : 'Generar PDF' }}</button><button class="refresh-button" type="button" :disabled="inventoryStore.isLoadingReports" @click="loadReports">Actualizar reporte</button></div></div>
      <div v-if="inventoryStore.isLoadingReports" class="table-state">Cargando reportes...</div><template v-else-if="inventoryStore.summary"><div class="report-kpis"><div><span>Artículos</span><strong>{{ inventoryStore.summary.totalItems }}</strong></div><div><span>Unidades</span><strong>{{ formatNumber(inventoryStore.summary.totalUnits) }}</strong></div><div><span>Costo</span><strong>{{ formatCurrency(inventoryStore.summary.inventoryCost) }}</strong></div><div><span>Valor de venta</span><strong>{{ formatCurrency(inventoryStore.summary.inventoryValue) }}</strong></div></div><div class="report-columns"><div><h3>Stock bajo</h3><div v-if="!inventoryStore.lowStockItems.length" class="table-state">No hay alertas activas.</div><div v-for="item in inventoryStore.lowStockItems" :key="item.id" class="alert-row"><span><strong>{{ item.name }}</strong><small>{{ item.sku }} · {{ item.warehouse }}</small></span><b>{{ formatNumber(item.stock) }} / {{ formatNumber(item.minStock) }}</b></div></div><div><h3>Por almacén</h3><div v-for="row in inventoryStore.summary.byWarehouse" :key="row.warehouse" class="alert-row"><span><strong>{{ row.warehouse }}</strong><small>{{ row.items }} productos · {{ formatNumber(row.units) }} unidades</small></span><b>{{ formatCurrency(row.inventoryCost) }}</b></div></div></div><div class="imports-history"><h3>Últimas importaciones</h3><div v-if="!inventoryStore.imports.length" class="table-state">Todavía no hay importaciones registradas.</div><div v-for="entry in inventoryStore.imports.slice(0, 5)" :key="String(entry.id)" class="alert-row"><span><strong>{{ String(entry.source || 'archivo').toUpperCase() }}</strong><small>Auditoría #{{ entry.id }} · {{ formatDate(String(entry.createdAt || '')) }}</small></span><b>{{ entry.importedRows || 0 }} filas</b></div></div></template>
    </section>

    <section v-else-if="activeTab === 'movements' && isAdmin" class="feature-panel"><div class="section-heading"><div><p class="eyebrow">Trazabilidad</p><h2>Movimientos</h2><p>Entradas, salidas y ajustes registrados por el backend.</p></div><button class="primary-button" type="button" @click="movementOpen = true">+ Registrar movimiento</button></div><div class="inventory-toolbar compact"><label>SKU<input v-model="movementSearch" placeholder="SKU-001" /></label><label>Almacén<input v-model="movementWarehouse" placeholder="PRINCIPAL" /></label><button class="refresh-button" type="button" @click="loadMovements">Buscar</button></div><div class="table-scroll"><table><thead><tr><th>Fecha</th><th>SKU</th><th>Almacén</th><th>Tipo</th><th class="numeric">Cantidad</th><th class="numeric">Antes</th><th class="numeric">Después</th><th>Usuario</th></tr></thead><tbody><tr v-for="movement in filteredMovements" :key="movement.id"><td>{{ formatDate(movement.createdAt) }}</td><td>{{ movement.sku }}</td><td>{{ movement.warehouse }}</td><td>{{ movementLabel(movement.movementType) }}</td><td class="numeric">{{ formatNumber(movement.quantity) }}</td><td class="numeric">{{ formatNumber(movement.stockBefore) }}</td><td class="numeric">{{ formatNumber(movement.stockAfter) }}</td><td>{{ movement.username || '-' }}</td></tr><tr v-if="!filteredMovements.length"><td colspan="8" class="table-state">No hay movimientos.</td></tr></tbody></table></div></section>

    <section v-if="activeTab === 'list'" class="summary-grid" aria-label="Resumen de inventario">
      <div class="summary-item">
        <span class="summary-label">Productos visibles</span>
        <strong>{{ inventoryStore.total }}</strong>
      </div>
      <div class="summary-item warning">
        <span class="summary-label">Stock bajo</span>
        <strong>{{ inventoryStore.isLoadingLowStock ? '...' : inventoryStore.lowStockCount }}</strong>
      </div>
      <div class="summary-item">
        <span class="summary-label">Página actual</span>
        <strong>{{ inventoryStore.currentPage }} / {{ inventoryStore.totalPages }}</strong>
      </div>
    </section>

    <section v-if="activeTab === 'list'" class="inventory-toolbar" aria-label="Filtros de inventario">
      <label class="search-field">
        <span>Buscar</span>
        <input v-model="searchInput" type="search" placeholder="SKU, nombre, categoría o almacén" />
      </label>
      <label class="per-page-field">
        <span>Mostrar</span>
        <select v-model.number="inventoryStore.perPage" @change="loadItems(1)">
          <option :value="10">10</option>
          <option :value="20">20</option>
          <option :value="50">50</option>
        </select>
      </label>
    </section>

    <div v-if="activeTab === 'list' && inventoryStore.error" class="message error" role="alert">
      <span>{{ inventoryStore.error }}</span>
      <button type="button" @click="refresh">Reintentar</button>
    </div>

    <div v-if="activeTab === 'list' && inventoryStore.lowStockError" class="message warning-message" role="status">
      {{ inventoryStore.lowStockError }}
    </div>

    <section v-if="activeTab === 'list'" class="table-shell" aria-label="Listado de inventario">
      <div v-if="inventoryStore.isLoading" class="table-state">Cargando inventario...</div>
      <div v-else-if="!inventoryStore.items.length" class="table-state">
        No hay productos que coincidan con la búsqueda.
      </div>
      <div v-else class="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Producto</th>
              <th>SKU</th>
              <th>Almacén</th>
              <th>Unidad</th>
              <th class="numeric">Stock</th>
              <th class="numeric">Mínimo</th>
              <th class="numeric">Precio</th>
              <th>Estado</th>
              <th v-if="isAdmin">Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in inventoryStore.items" :key="item.id">
              <td>
                <strong>{{ item.name }}</strong>
                <small v-if="item.category">{{ item.category }}</small>
              </td>
              <td class="muted">{{ item.sku }}</td>
              <td>{{ item.warehouse }}</td>
              <td>{{ item.unit }}</td>
              <td class="numeric" :class="{ 'low-value': isLowStock(item) }">{{ formatNumber(item.stock) }}</td>
              <td class="numeric muted">{{ formatNumber(item.minStock) }}</td>
              <td class="numeric">{{ formatCurrency(item.price) }}</td>
              <td><span :class="['status', item.active ? 'active' : 'inactive']">{{ item.active ? 'Activo' : 'Inactivo' }}</span></td>
              <td v-if="isAdmin"><button class="text-button" type="button" @click="openEdit(item)">Editar</button></td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer class="table-footer">
        <span>{{ inventoryStore.total }} registros</span>
        <div class="pagination">
          <button type="button" :disabled="inventoryStore.currentPage <= 1 || inventoryStore.isLoading" @click="loadItems(inventoryStore.currentPage - 1)">Anterior</button>
          <button type="button" :disabled="inventoryStore.currentPage >= inventoryStore.totalPages || inventoryStore.isLoading" @click="loadItems(inventoryStore.currentPage + 1)">Siguiente</button>
        </div>
      </footer>
    </section>

    <p v-if="isAdmin && activeTab === 'list'" class="admin-note">Las operaciones quedan auditadas por el backend y respetan la unicidad SKU + almacén.</p>

    <div v-if="productOpen" class="modal-backdrop" @click.self="productOpen = false"><form class="modal" @submit.prevent="saveProduct"><div class="modal-header"><div><p class="eyebrow">Catálogo</p><h2>{{ editingItem ? 'Editar producto' : 'Nuevo producto' }}</h2></div><button type="button" class="close" aria-label="Cerrar" @click="productOpen = false">×</button></div><div class="form-grid"><label>SKU<input v-model.trim="productDraft.sku" required /></label><label>Nombre<input v-model.trim="productDraft.name" required /></label><label>Categoría<input v-model.trim="productDraft.category" /></label><label>Unidad<select v-model="productDraft.unit"><option value="PZA">PZA</option><option value="KG">KG</option><option value="LT">LT</option><option value="L">L</option><option value="ML">ML</option><option value="CAJA">CAJA</option><option value="M">M</option><option value="ROLLO">ROLLO</option><option value="PAQUETE">PAQUETE</option><option value="PAR">PAR</option></select></label><label>Stock<input v-model.number="productDraft.stock" type="number" min="0" step="0.001" required /></label><label>Stock mínimo<input v-model.number="productDraft.minStock" type="number" min="0" step="0.001" required /></label><label>Costo<input v-model.number="productDraft.cost" type="number" min="0" step="0.01" required /></label><label>Precio de venta<input v-model.number="productDraft.price" type="number" min="0" step="0.01" required /></label><label>Almacén<input v-model.trim="productDraft.warehouse" required /></label><label>Proveedor<input v-model.trim="productDraft.supplier" /></label><label>Código de barras<input v-model.trim="productDraft.barcode" /></label><label class="check"><input v-model="productDraft.active" type="checkbox" /> Producto activo</label></div><div v-if="formError" class="message error">{{ formError }}</div><div class="modal-actions"><button class="refresh-button" type="button" @click="productOpen = false">Cancelar</button><button class="primary-button" type="submit" :disabled="isSaving">{{ isSaving ? 'Guardando...' : 'Guardar producto' }}</button></div></form></div>
    <div v-if="movementOpen" class="modal-backdrop" @click.self="movementOpen = false"><form class="modal narrow" @submit.prevent="saveMovement"><div class="modal-header"><div><p class="eyebrow">Trazabilidad</p><h2>Registrar movimiento</h2></div><button type="button" class="close" aria-label="Cerrar" @click="movementOpen = false">×</button></div><div class="form-grid"><label>SKU<input v-model.trim="movementDraft.sku" required /></label><label>Almacén<input v-model.trim="movementDraft.warehouse" required /></label><label>Tipo<select v-model="movementDraft.movementType"><option value="ENTRY">Entrada</option><option value="EXIT">Salida</option><option value="ADJUSTMENT">Ajuste</option></select></label><label>Cantidad<input v-model.number="movementDraft.quantity" type="number" min="0.001" step="0.001" required /></label><label class="full">Motivo<input v-model.trim="movementDraft.reason" /></label></div><div v-if="formError" class="message error">{{ formError }}</div><div class="modal-actions"><button class="refresh-button" type="button" @click="movementOpen = false">Cancelar</button><button class="primary-button" type="submit" :disabled="isSaving">Registrar</button></div></form></div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import { useInventoryStore } from '@/stores/inventoryStore'
import inventoryService from '@/services/inventoryService'
import type { InventoryItem } from '@/types'
import type { ImportResult, MovementType } from '@/types'
import { generateInventoryReportPdf } from '@/composables/inventoryReportPdf'

const route = useRoute()
const authStore = useAuthStore()
const inventoryStore = useInventoryStore()
const searchInput = ref('')
let searchTimer: ReturnType<typeof setTimeout> | undefined

const isAdmin = computed(() => authStore.currentUser?.role === 'admin')
const activeTab = computed(() => route.path.endsWith('/importar') ? 'import' : route.path.endsWith('/reportes') ? 'reports' : route.path.endsWith('/movimientos') ? 'movements' : 'list')
const notice = ref('')
const noticeType = ref('success')
const productOpen = ref(false)
const movementOpen = ref(false)
const editingItem = ref<InventoryItem | null>(null)
const isSaving = ref(false)
const formError = ref('')
const productDraft = reactive<Partial<InventoryItem>>({ sku: '', name: '', category: '', unit: 'PZA', stock: 0, minStock: 0, cost: 0, price: 0, warehouse: 'PRINCIPAL', supplier: '', barcode: '', active: true })
const movementDraft = reactive<{ sku: string; warehouse: string; movementType: MovementType; quantity: number; reason: string }>({ sku: '', warehouse: 'PRINCIPAL', movementType: 'ENTRY', quantity: 1, reason: '' })
const importSource = ref<'csv' | 'json' | 'xlsx'>('csv')
const selectedFile = ref<File | null>(null)
const importResult = ref<ImportResult | null>(null)
const importError = ref('')
const isImporting = ref(false)
const isGeneratingPdf = ref(false)
let importPayload: { csv?: string; rows?: unknown; file?: File } | null = null
const movementSearch = ref('')
const movementWarehouse = ref('')
const acceptTypes = computed(() => importSource.value === 'csv' ? '.csv,text/csv' : importSource.value === 'json' ? '.json,application/json' : '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
const filteredMovements = computed(() => inventoryStore.movements.filter(item => (!movementSearch.value || item.sku.toLowerCase().includes(movementSearch.value.toLowerCase())) && (!movementWarehouse.value || item.warehouse.toLowerCase().includes(movementWarehouse.value.toLowerCase()))))

const formatNumber = (value: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 }).format(value)
const formatCurrency = (value: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value)
const isLowStock = (item: InventoryItem) => item.stock <= item.minStock

const loadItems = (page: number) => inventoryStore.loadItems(page)
const refresh = async () => {
  await Promise.all([inventoryStore.loadItems(1), inventoryStore.loadLowStock()])
  if (activeTab.value === 'reports' && isAdmin.value) await loadReports()
}

const notify = (message: string, type = 'success') => { notice.value = message; noticeType.value = type; window.setTimeout(() => { notice.value = '' }, 4500) }
const formatBytes = (size: number) => `${(size / 1024 / 1024).toFixed(2)} MB`
const formatDate = (value?: string) => value ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '-'
const movementLabel = (value: MovementType) => ({ ENTRY: 'Entrada', EXIT: 'Salida', ADJUSTMENT: 'Ajuste', IMPORT: 'Importación' })[value]
const loadReports = async () => { try { await inventoryStore.loadReports() } catch (error: any) { notify(error.message || 'No se pudieron cargar los reportes', 'error') } }
const exportInventoryPdf = () => {
  if (!inventoryStore.summary) return
  isGeneratingPdf.value = true
  try {
    generateInventoryReportPdf({
      summary: inventoryStore.summary,
      lowStockItems: inventoryStore.lowStockItems,
      imports: inventoryStore.imports.map(entry => ({
        id: typeof entry.id === 'number' || typeof entry.id === 'string' ? entry.id : undefined,
        source: typeof entry.source === 'string' ? entry.source : undefined,
        createdAt: typeof entry.createdAt === 'string' ? entry.createdAt : undefined,
        importedRows: typeof entry.importedRows === 'number' ? entry.importedRows : undefined
      }))
    })
    notify('PDF de inventario generado correctamente.')
  } catch (error: any) {
    notify(error.message || 'No se pudo generar el PDF', 'error')
  } finally {
    isGeneratingPdf.value = false
  }
}
const loadMovements = async () => { try { inventoryStore.movements = await inventoryService.getMovements({ sku: movementSearch.value || undefined, warehouse: movementWarehouse.value || undefined }) } catch (error: any) { notify(error.message || 'No se pudieron cargar los movimientos', 'error') } }
const resetDraft = () => Object.assign(productDraft, { sku: '', name: '', category: '', unit: 'PZA', stock: 0, minStock: 0, cost: 0, price: 0, warehouse: 'PRINCIPAL', supplier: '', barcode: '', active: true })
const openCreate = () => { editingItem.value = null; resetDraft(); formError.value = ''; productOpen.value = true }
const openEdit = (item: InventoryItem) => { editingItem.value = item; Object.assign(productDraft, item); formError.value = ''; productOpen.value = true }
const saveProduct = async () => { isSaving.value = true; formError.value = ''; try { await inventoryStore.saveItem(productDraft, editingItem.value?.id); productOpen.value = false; notify(editingItem.value ? 'Producto actualizado.' : 'Producto creado.') } catch (error: any) { formError.value = error.message || 'No se pudo guardar el producto' } finally { isSaving.value = false } }
const selectFile = (event: Event) => { const file = (event.target as HTMLInputElement).files?.[0]; importError.value = ''; importResult.value = null; if (!file) return; if (file.size > 10 * 1024 * 1024) { importError.value = 'El archivo supera el límite de 10 MB.'; selectedFile.value = null; return } selectedFile.value = file }
const clearImport = () => { selectedFile.value = null; importResult.value = null; importPayload = null }
const downloadCsvTemplate = () => {
  const csv = [
    'sku,nombre,unidad,stock,stock_minimo,costo,precio_venta,almacen,categoria,proveedor,barcode,active',
    'SKU-EJEMPLO-001,Cafe molido,PZA,25,5,18.50,29.99,PRINCIPAL,Bebidas,Proveedor Demo,750000000001,true'
  ].join('\r\n')
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'plantilla-inventario.csv'
  link.click()
  URL.revokeObjectURL(url)
}
const previewImport = async () => { if (!selectedFile.value) return; isImporting.value = true; importError.value = ''; try { const file = selectedFile.value; if (importSource.value === 'csv') { importPayload = { csv: await file.text() }; importResult.value = await inventoryService.importCsv(file.name, importPayload.csv, true) } else if (importSource.value === 'json') { const rows = JSON.parse(await file.text()); importPayload = { rows }; importResult.value = await inventoryService.importJson(rows, true) } else { importPayload = { file }; importResult.value = await inventoryService.importXlsx(file, true) } } catch (error: any) { importError.value = error.message || 'No se pudo validar el archivo' } finally { isImporting.value = false } }
const confirmImport = async () => { if (!importPayload || !selectedFile.value) return; isImporting.value = true; try { if (importSource.value === 'csv') importResult.value = await inventoryService.importCsv(selectedFile.value.name, importPayload.csv || '', false); else if (importSource.value === 'json') importResult.value = await inventoryService.importJson(importPayload.rows, false); else importResult.value = await inventoryService.importXlsx(importPayload.file!, false); notify('Importación guardada correctamente.'); await refresh() } catch (error: any) { importError.value = error.message || 'No se pudo completar la importación' } finally { isImporting.value = false } }
const saveMovement = async () => { isSaving.value = true; formError.value = ''; try { await inventoryService.createMovement(movementDraft); movementOpen.value = false; notify('Movimiento registrado.'); await Promise.all([loadMovements(), refresh()]) } catch (error: any) { formError.value = error.message || 'No se pudo registrar el movimiento' } finally { isSaving.value = false } }

watch(searchInput, (value) => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    inventoryStore.setSearch(value)
    loadItems(1)
  }, 300)
})

onMounted(refresh)
watch(() => route.path, () => { if (activeTab.value === 'reports' && isAdmin.value) void loadReports(); if (activeTab.value === 'movements' && isAdmin.value) void loadMovements() })
onMounted(() => { if (activeTab.value === 'reports' && isAdmin.value) void loadReports(); if (activeTab.value === 'movements' && isAdmin.value) void loadMovements() })
</script>

<style scoped>
.inventory-page {
  min-height: 100%;
  padding: 2.25rem clamp(1rem, 4vw, 3.5rem);
  background: linear-gradient(135deg, #f6f9fc 0%, #eef5f3 100%);
  color: #183044;
}

.inventory-header, .inventory-toolbar, .table-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.inventory-header { margin-bottom: 1.75rem; }
.eyebrow { margin-bottom: .35rem; color: #0b806e; font-size: .72rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; }
h1 { margin: 0; color: #102a43; font-size: clamp(2rem, 4vw, 3.2rem); }
.subtitle { margin-top: .5rem; color: #617486; }
.refresh-button, .pagination button, .message button { border: 0; border-radius: .45rem; padding: .7rem 1rem; background: #0b806e; color: white; font-weight: 700; cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .5; }
.summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 1rem; margin-bottom: 1.25rem; }
.summary-item { padding: 1.1rem 1.25rem; border: 1px solid #d9e5e3; border-radius: .5rem; background: rgba(255,255,255,.82); }
.summary-item.warning { border-color: #f1d39a; background: #fff9ed; }
.summary-label { display: block; margin-bottom: .45rem; color: #687d8c; font-size: .78rem; }
.summary-item strong { color: #102a43; font-size: 1.55rem; }
.inventory-toolbar { justify-content: flex-start; margin-bottom: 1rem; padding: 1rem; border: 1px solid #d9e5e3; border-radius: .5rem; background: white; }
.search-field { flex: 1; max-width: 38rem; }
.search-field span, .per-page-field span { display: block; margin-bottom: .35rem; color: #526b7a; font-size: .78rem; font-weight: 700; }
input, select { width: 100%; border: 1px solid #c5d5d9; border-radius: .4rem; padding: .72rem .8rem; color: #183044; background: #fbfdfd; font: inherit; }
.per-page-field { width: 9rem; }
.message { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem; padding: .85rem 1rem; border-radius: .4rem; }
.error { border: 1px solid #efb7b2; background: #fff2f1; color: #a33a32; }
.warning-message { border: 1px solid #f1d39a; background: #fff9ed; color: #8b5b12; }
.table-shell { overflow: hidden; border: 1px solid #d9e5e3; border-radius: .5rem; background: white; box-shadow: 0 10px 30px rgba(30, 65, 78, .07); }
.table-scroll { overflow-x: auto; }
table { width: 100%; min-width: 760px; border-collapse: collapse; }
th, td { padding: .9rem 1rem; border-bottom: 1px solid #e8eeee; text-align: left; white-space: nowrap; }
th { color: #607988; background: #f6faf9; font-size: .72rem; letter-spacing: .06em; text-transform: uppercase; }
td strong, td small { display: block; }
td small, .muted { color: #738894; font-size: .8rem; }
.numeric { text-align: right; }
.low-value { color: #b35c17; font-weight: 800; }
.status { display: inline-block; border-radius: 999px; padding: .28rem .6rem; font-size: .75rem; font-weight: 800; }
.status.active { background: #dcf5e9; color: #147047; }
.status.inactive { background: #edf0f1; color: #6e7d84; }
.table-state { padding: 3.5rem 1rem; color: #6b7f8b; text-align: center; }
.table-footer { padding: .9rem 1rem; color: #6b7f8b; font-size: .82rem; }
.pagination { display: flex; gap: .5rem; }
.pagination button { padding: .55rem .8rem; background: #e8f1ef; color: #176557; }
.admin-note { margin-top: 1rem; color: #71838d; font-size: .8rem; }
.header-actions { display: flex; align-items: center; gap: .6rem; }
.primary-button { border: 0; border-radius: .45rem; padding: .7rem 1rem; background: #0b806e; color: #fff; font: inherit; font-weight: 700; cursor: pointer; }
.primary-button:disabled { cursor: not-allowed; opacity: .5; }
.inventory-tabs { display: flex; gap: .35rem; margin-bottom: 1.35rem; border-bottom: 1px solid #d7e5e2; }
.inventory-tabs a { padding: .75rem 1rem; color: #607988; text-decoration: none; font-weight: 700; }
.inventory-tabs a.router-link-active { color: #087f70; border-bottom: 3px solid #087f70; }
.notice { margin-bottom: 1rem; padding: .85rem 1rem; border-radius: .4rem; border: 1px solid #b9e4d4; background: #edfbf4; color: #176b4e; }
.notice.error { border-color: #efb7b2; background: #fff2f1; color: #a33a32; }
.feature-panel { display: flex; flex-direction: column; gap: 1.2rem; padding: 1.2rem; border: 1px solid #d9e5e3; border-radius: .5rem; background: rgba(255,255,255,.92); }
.section-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.report-actions { display: flex; align-items: center; gap: .6rem; }
.section-heading h2 { margin: 0; color: #102a43; font-size: 1.45rem; }
.section-heading p:not(.eyebrow) { margin: .5rem 0 0; color: #617486; }
.import-controls { display: grid; grid-template-columns: 12rem 1fr; gap: 1rem; }
.import-controls label, .form-grid label { display: flex; flex-direction: column; gap: .35rem; color: #526b7a; font-size: .78rem; font-weight: 700; }
.hint, .result-status { color: #71838d; font-size: .85rem; }
.template-box { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: .9rem 1rem; border: 1px solid #cde3df; border-radius: .45rem; background: #f2faf8; }
.template-box strong { color: #176557; }
.template-box p { margin: .25rem 0 0; color: #617486; font-size: .84rem; }
.secondary-button { border: 1px solid #0b806e; border-radius: .45rem; padding: .65rem .9rem; background: #fff; color: #087f70; font: inherit; font-weight: 700; cursor: pointer; white-space: nowrap; }
.file-chip { display: flex; align-items: center; gap: 1rem; padding: .85rem 1rem; border: 1px solid #d9e5e3; border-radius: .4rem; background: #f7fbfa; }
.file-chip span { color: #71838d; }
.text-button { border: 0; background: transparent; color: #087f70; font: inherit; font-weight: 800; cursor: pointer; }
.import-result { padding-top: 1rem; border-top: 1px solid #e1ece9; }
.result-grid, .report-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: .75rem; }
.result-grid > div, .report-kpis > div { padding: .8rem; border-radius: .4rem; background: #f3f8f7; }
.result-grid strong, .result-grid span, .report-kpis strong, .report-kpis span { display: block; }
.result-grid strong, .report-kpis strong { font-size: 1.35rem; }
.result-grid span, .report-kpis span { color: #687d8c; font-size: .75rem; }
.result-grid .good { background: #e8f7ef; color: #176b4e; }
.result-grid .bad { background: #fff4ed; color: #a45c25; }
.confirm-row { display: flex; align-items: center; gap: 1rem; padding: .85rem 1rem; border: 1px solid #d9e5e3; border-radius: .4rem; background: #f7fbfa; }
.confirm-row span { color: #71838d; font-size: .82rem; }
.row-errors { display: flex; flex-direction: column; gap: .6rem; margin-top: 1rem; }
.row-errors div { display: flex; justify-content: space-between; gap: 1rem; padding: .65rem; background: #fff7f3; font-size: .82rem; }
.row-errors span { color: #a45c25; }
.report-kpis > div { background: #f6faf9; }
.report-columns { display: grid; grid-template-columns: repeat(2, 1fr); gap: 2rem; }
.report-columns h3 { margin: 0 0 .8rem; color: #102a43; }
.alert-row { display: flex; justify-content: space-between; gap: 1rem; padding: .75rem 0; border-bottom: 1px solid #e8eeee; }
.alert-row small { display: block; margin-top: .2rem; color: #71838d; }
.inventory-toolbar.compact { align-items: flex-end; }
.inventory-toolbar.compact label { display: flex; flex-direction: column; gap: .35rem; color: #526b7a; font-size: .78rem; font-weight: 700; }
.modal-backdrop { position: fixed; inset: 0; z-index: 10; display: grid; place-items: center; padding: 1rem; background: rgba(16,42,67,.45); }
.modal { width: min(720px, 100%); max-height: 90vh; overflow: auto; padding: 1.4rem; border-radius: .6rem; background: #fff; box-shadow: 0 24px 70px rgba(16,42,67,.3); }
.modal.narrow { width: min(560px, 100%); }
.modal-header, .modal-actions { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
.close { border: 0; background: transparent; color: #607988; font-size: 1.8rem; cursor: pointer; }
.form-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin: 1.3rem 0; }
.form-grid .full { grid-column: 1 / -1; }
.check { flex-direction: row !important; align-items: center; align-self: end; }
.check input { width: auto; }
.modal-actions { justify-content: flex-end; padding-top: 1rem; border-top: 1px solid #e8eeee; }

@media (max-width: 680px) {
  .inventory-header { align-items: flex-start; flex-direction: column; }
  .summary-grid { grid-template-columns: 1fr; }
  .inventory-toolbar { align-items: stretch; flex-direction: column; }
  .search-field, .per-page-field { max-width: none; width: 100%; }
  .table-footer { align-items: flex-start; flex-direction: column; }
  .header-actions, .section-heading, .confirm-row, .report-actions { align-items: stretch; flex-direction: column; }
  .template-box { align-items: stretch; flex-direction: column; }
  .inventory-tabs { overflow-x: auto; }
  .inventory-tabs a { white-space: nowrap; }
  .import-controls, .form-grid, .report-columns { grid-template-columns: 1fr; }
  .result-grid, .report-kpis { grid-template-columns: repeat(2, 1fr); }
  .row-errors div { align-items: flex-start; flex-direction: column; }
}
</style>
