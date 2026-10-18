<template>
  <div id="app" class="app-container">
    <nav class="navbar" v-if="isAuthenticated && route.path !== '/pos'" aria-label="Navegación principal">
      <router-link to="/" class="brand-block" aria-label="Ir al inicio">
        <span class="brand-mark">N</span>
        <span class="brand-copy">
          <strong>LEMARQUET</strong>
          <small>Panel operativo</small>
        </span>
      </router-link>

      <div class="navbar-menu">
        <router-link
          v-for="item in visibleMenuItems"
          :key="item.to"
          :to="item.to"
          exact-active-class="router-link-exact-active"
        >
          {{ item.label }}
        </router-link>
      </div>

      <div class="navbar-account">
        <div class="organization-context" v-if="organizationName">
          <small>Empresa</small>
          <strong>{{ organizationName }}</strong>
        </div>
        <div class="account-copy">
          <strong>{{ authStore.currentUser?.nombreEmpleado || 'Usuario' }}</strong>
          <small>{{ roleLabel }}</small>
        </div>
        <button @click="logout" class="btn-logout" type="button">Salir</button>
      </div>
    </nav>

    <div class="connection-status" :class="isOnline ? 'is-online' : 'is-offline'" role="status" aria-live="polite">
      <span class="connection-indicator" aria-hidden="true"></span>
      <transition name="connection-label" mode="out-in">
        <strong :key="isOnline ? 'online' : 'offline'">{{ isOnline ? 'Sistema en línea' : 'Modo sin conexión' }}</strong>
      </transition>
      <span v-if="!isOnline" class="connection-detail">Los cambios se guardan en este dispositivo y se sincronizarán al volver la red.</span>
    </div>

    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useAuthStore } from '@/stores/authStore'
import { useRouter, useRoute } from 'vue-router'

const authStore = useAuthStore()
const router = useRouter()
const route = useRoute()
const isOnline = ref(typeof navigator === 'undefined' || navigator.onLine)

const updateConnectionStatus = () => {
  isOnline.value = navigator.onLine
}

const isAuthenticated = computed(() => authStore.isAuthenticated)
const isAdmin = computed(() => authStore.currentUser?.role === 'admin')
const roleLabel = computed(() => isAdmin.value ? 'Administrador' : 'Cajero')
const organizationName = computed(() => authStore.currentOrganization?.name || authStore.currentUser?.organizationName || 'Empresa no identificada')

const menuItems = [
  { label: 'Inicio', to: '/' },
  { label: 'POS', to: '/pos' },
  { label: 'Caja', to: '/caja' },
  { label: 'Facturas', to: '/facturas', adminOnly: true },
  { label: 'Inventario', to: '/inventario', adminOnly: true },
  { label: 'Reportes', to: '/reports', adminOnly: true },
  { label: 'Empleados', to: '/empleados', adminOnly: true },
  { label: 'Configuración', to: '/settings', adminOnly: true }
]

const visibleMenuItems = computed(() => menuItems.filter(item => !item.adminOnly || isAdmin.value))

onMounted(() => {
  window.addEventListener('online', updateConnectionStatus)
  window.addEventListener('offline', updateConnectionStatus)
})

onUnmounted(() => {
  window.removeEventListener('online', updateConnectionStatus)
  window.removeEventListener('offline', updateConnectionStatus)
})

const logout = async () => {
  await authStore.logout()
  router.push('/login')
}
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  min-height: 0;
  position: relative;
}

.connection-banner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  min-height: 3.15rem;
  padding: 0.5rem 1rem;
  background: #fff4d6;
  border-bottom: 1px solid #e7bd53;
  color: #563d08;
}

.connection-banner > div {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: center;
  gap: 0.25rem 0.55rem;
  text-align: center;
}

.connection-banner strong {
  font-size: 0.78rem;
}

.connection-banner > div > span {
  font-size: 0.74rem;
}

.connection-status {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 0.45rem;
  min-height: 2.35rem;
  padding: 0.4rem 1rem;
  border: 1px solid transparent;
  border-radius: 0;
  font-size: 0.7rem;
  transition: color 0.25s ease, background-color 0.25s ease, border-color 0.25s ease;
}

.connection-status.is-online {
  color: #17603a;
  background: #eaf7ef;
  border-color: #b9e1c7;
}

.connection-status.is-offline {
  color: #704d09;
  background: #fff4d6;
  border-color: #e7bd53;
  justify-content: flex-start;
}

.connection-status strong {
  font-size: 0.72rem;
  font-weight: 750;
}

.connection-detail {
  color: inherit;
  font-size: 0.72rem;
}

.connection-indicator {
  width: 0.48rem;
  height: 0.48rem;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #23864e;
  box-shadow: 0 0 0 3px rgba(35, 134, 78, 0.13);
}

.is-offline .connection-indicator {
  background: #c18213;
  box-shadow: 0 0 0 3px rgba(193, 130, 19, 0.14);
  animation: connection-pulse 1.8s ease-in-out infinite;
}

.connection-label-enter-active,
.connection-label-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.connection-label-enter-from {
  opacity: 0;
  transform: translateY(0.25rem);
}

.connection-label-leave-to {
  opacity: 0;
  transform: translateY(-0.25rem);
}

@keyframes connection-pulse {
  50% { box-shadow: 0 0 0 5px rgba(193, 130, 19, 0.08); }
}

.navbar {
  display: flex;
  align-items: center;
  gap: 1.5rem;
  min-height: 4.25rem;
  padding: 0.7rem 1.5rem;
  background: #ffffff;
  color: #172033;
  border-bottom: 1px solid #dfe5ed;
  box-shadow: 0 3px 12px rgba(23, 32, 51, 0.07);
}

.brand-block {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.brand-mark {
  display: flex;
  width: 2.2rem;
  height: 2.2rem;
  border-radius: 0.55rem;
  align-items: center;
  justify-content: center;
  background: #1d4ed8;
  color: #fff;
  font-weight: 900;
  font-size: 1rem;
  box-shadow: 0 3px 7px rgba(29, 78, 216, 0.22);
}

.brand-block strong {
  display: block;
  font-size: 0.91rem;
  letter-spacing: 0.08em;
}

.brand-block small {
  display: block;
  color: #718096;
  font-size: 0.56rem;
  letter-spacing: 0.04em;
}

.navbar-menu {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  flex-wrap: wrap;
  flex: 1;
}

.navbar-menu a {
  color: #536174;
  text-decoration: none;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.65rem 0.72rem;
  border-radius: 0.4rem;
  transition: background 0.2s ease, color 0.2s ease;
}

.navbar-menu a:hover,
.navbar-menu a.router-link-exact-active {
  background: #e8efff;
  color: #1d4ed8;
}

.navbar-account {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding-left: 1rem;
  border-left: 1px solid #e2e8f0;
}

.organization-context {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 10rem;
  color: #475569;
}

.organization-context small,
.organization-context strong {
  display: block;
  line-height: 1.2;
}

.organization-context small {
  font-size: 0.58rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #718096;
}

.organization-context strong {
  font-size: 0.76rem;
  color: #1e293b;
}

.account-copy {
  min-width: 7rem;
  text-align: right;
}

.account-copy strong,
.account-copy small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-copy strong {
  color: #263449;
  font-size: 0.78rem;
}

.account-copy small {
  margin-top: 0.15rem;
  color: #718096;
  font-size: 0.67rem;
}

.btn-logout {
  background: transparent;
  border: 1px solid #cbd5e1;
  border-radius: 0.4rem;
  padding: 0.52rem 0.75rem;
  color: #475569;
  font-size: 0.76rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.2s ease, border-color 0.2s ease, color 0.2s ease;
}

.btn-logout:hover {
  background: #f8fafc;
  border-color: #94a3b8;
  color: #1e293b;
}

.main-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

@media (max-width: 760px) {
  .connection-status {
    justify-content: flex-start;
    padding-right: 0.7rem;
    padding-left: 0.7rem;
  }

  .navbar {
    align-items: flex-start;
    flex-direction: column;
    gap: 0.65rem;
    padding: 0.8rem 1rem;
  }

  .navbar-menu {
    width: 100%;
    justify-content: flex-start;
  }

  .navbar-account {
    width: 100%;
    justify-content: flex-end;
    padding-left: 0;
    border-left: 0;
  }
}
</style>
