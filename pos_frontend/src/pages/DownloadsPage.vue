<template>
  <section class="downloads-page">
    <header class="page-header">
      <div>
        <p class="eyebrow">APLICACIONES PARA TU NEGOCIO</p>
        <h1>Descargas</h1>
        <p>Descarga el instalador del agente de hardware para Windows.</p>
      </div>
      <button class="secondary-button" type="button" :disabled="loading" @click="loadInstallers">
        {{ loading ? 'Actualizando…' : 'Actualizar lista' }}
      </button>
    </header>

    <p v-if="errorMessage" class="notice error" role="alert">{{ errorMessage }}</p>
    <p v-if="notice" class="notice success" role="status">{{ notice }}</p>

    <div v-if="loading && !installers.length" class="panel empty-state" role="status">
      Cargando instaladores…
    </div>
    <div v-else-if="!installers.length" class="panel empty-state">
      No hay instaladores disponibles por el momento.
    </div>
    <div v-else class="installer-list">
      <article v-for="installer in installers" :key="installer.name" class="panel installer-card">
        <div class="installer-icon" aria-hidden="true">EXE</div>
        <div class="installer-details">
          <h2>{{ installer.name }}</h2>
          <p>Instalador de Windows · {{ formatBytes(installer.size) }}</p>
          <small>Actualizado: {{ formatDate(installer.updatedAt) }}</small>
        </div>
        <button
          class="primary-button download-button"
          type="button"
          :disabled="downloadingName === installer.name"
          @click="downloadInstaller(installer)"
        >
          {{ downloadingName === installer.name ? 'Descargando…' : 'Descargar' }}
        </button>
      </article>
    </div>

    <p class="installation-note">
      Después de descargarlo, abre el instalador y sigue las instrucciones en pantalla.
      La instalación actual es por usuario y no requiere privilegios de administrador.
    </p>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { api } from '@/services/api'

interface Installer {
  name: string
  size: number
  updatedAt: string
}

const installers = ref<Installer[]>([])
const loading = ref(false)
const downloadingName = ref('')
const errorMessage = ref('')
const notice = ref('')

const loadInstallers = async () => {
  loading.value = true
  errorMessage.value = ''
  notice.value = ''
  try {
    const response = await api.get('/suscripciones/instaladores')
    installers.value = Array.isArray(response.data?.data) ? response.data.data : []
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudieron cargar los instaladores.'
  } finally {
    loading.value = false
  }
}

const downloadInstaller = async (installer: Installer) => {
  downloadingName.value = installer.name
  errorMessage.value = ''
  notice.value = ''
  try {
    const response = await api.get(
      `/suscripciones/instaladores/${encodeURIComponent(installer.name)}/descargar`,
      { responseType: 'blob' }
    )
    const blobUrl = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = installer.name
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
    notice.value = 'La descarga del instalador comenzó.'
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudo descargar el instalador.'
  } finally {
    downloadingName.value = ''
  }
}

const formatBytes = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)) - 1, units.length - 1)
  return `${(bytes / 1024 ** (unitIndex + 1)).toFixed(1)} ${units[unitIndex]}`
}

const formatDate = (date: string) => new Date(date).toLocaleString()

onMounted(loadInstallers)
</script>

<style scoped>
.downloads-page {
  max-width: 960px;
  margin: 0 auto;
  padding: 1.5rem;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.page-header h1 {
  margin: 0.2rem 0 0.4rem;
  color: #172033;
  font-size: 1.8rem;
}

.page-header p:not(.eyebrow) {
  margin: 0;
  color: #687386;
}

.eyebrow {
  margin: 0;
  color: #53647d;
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.08em;
}

.panel {
  border: 1px solid #e1e6ee;
  border-radius: 0.9rem;
  background: #fff;
  box-shadow: 0 8px 24px rgba(23, 32, 51, 0.06);
}

.installer-list {
  display: grid;
  gap: 0.8rem;
}

.installer-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
}

.installer-icon {
  display: grid;
  width: 3.2rem;
  height: 3.2rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 0.8rem;
  background: #eaf1ff;
  color: #2456a6;
  font-size: 0.78rem;
  font-weight: 800;
}

.installer-details {
  min-width: 0;
  flex: 1;
}

.installer-details h2 {
  overflow-wrap: anywhere;
  margin: 0 0 0.25rem;
  color: #172033;
  font-size: 1rem;
}

.installer-details p,
.installer-details small {
  display: block;
  margin: 0.2rem 0 0;
  color: #687386;
}

.empty-state {
  padding: 2rem;
  color: #687386;
  text-align: center;
}

.installation-note {
  margin: 1rem 0 0;
  color: #687386;
  font-size: 0.88rem;
  line-height: 1.5;
}

.notice {
  margin: 0 0 1rem;
  padding: 0.8rem 1rem;
  border-radius: 0.7rem;
}

.notice.error {
  background: #fff0ef;
  color: #9c2d25;
}

.notice.success {
  background: #eaf7ef;
  color: #17603a;
}

.primary-button,
.secondary-button {
  min-height: 2.5rem;
  padding: 0.55rem 0.9rem;
  border: 0;
  border-radius: 0.6rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}

.primary-button {
  background: #2456a6;
  color: #fff;
}

.secondary-button {
  border: 1px solid #d5dce7;
  background: #fff;
  color: #34445c;
}

.primary-button:disabled,
.secondary-button:disabled {
  cursor: wait;
  opacity: 0.65;
}

@media (max-width: 600px) {
  .downloads-page {
    padding: 1rem;
  }

  .page-header {
    align-items: stretch;
    flex-direction: column;
  }

  .installer-card {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .download-button {
    width: 100%;
  }
}
</style>
