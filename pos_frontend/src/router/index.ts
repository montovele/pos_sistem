import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

// Pages
const LoginPage = () => import('@/pages/LoginPage.vue')
const HomePage = () => import('@/pages/HomePage.vue')
const PosPage = () => import('@/pages/PosPage.vue')
const ReportsPage = () => import('@/pages/ReportsPage.vue')
const EmpleadosPage = () => import('@/pages/EmpleadosPage.vue')
const CajaPage = () => import('@/pages/CajaPage.vue')
const SettingsPage = () => import('@/pages/SettingsPage.vue')
const FacturasPage = () => import('@/pages/FacturasPage.vue')
const FacturaDetallePage = () => import('@/pages/FacturaDetallePage.vue')
const InventoryPage = () => import('@/pages/InventoryPage.vue')
const NotFoundPage = () => import('@/pages/NotFoundPage.vue')

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: LoginPage,
    meta: { requiresAuth: false }
  },
  {
    path: '/',
    name: 'Home',
    component: HomePage,
    meta: { requiresAuth: true }
  },
  {
    path: '/pos',
    name: 'POS',
    component: PosPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/reports',
    name: 'Reports',
    component: ReportsPage,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/facturas',
    name: 'Facturas',
    component: FacturasPage,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/facturas/:id',
    name: 'FacturaDetalle',
    component: FacturaDetallePage,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/inventario',
    name: 'Inventory',
    component: InventoryPage,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/inventario/importar',
    name: 'InventoryImport',
    component: InventoryPage,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/inventario/reportes',
    name: 'InventoryReports',
    component: InventoryPage,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/inventario/movimientos',
    name: 'InventoryMovements',
    component: InventoryPage,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/empleados',
    name: 'Empleados',
    component: EmpleadosPage,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/caja',
    name: 'Caja',
    component: CajaPage,
    meta: { requiresAuth: true }
  },
  {
    path: '/settings',
    name: 'Settings',
    component: SettingsPage,
    meta: { requiresAuth: true, requiresAdmin: true }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: NotFoundPage
  }
]

const router = createRouter({
  history: createWebHistory(),
  routes
})

// Route guard for authentication
router.beforeEach(async (to, from) => {
  const authStore = useAuthStore()

  // Check if route requires authentication
  const requiresAuth = to.meta.requiresAuth !== false

  if (requiresAuth) {
    if (!authStore.isAuthenticated) {
      // Try to load current user from token
      const isValid = await authStore.loadCurrentUser()
      if (!isValid) {
        return {
          name: 'Login',
          query: { redirect: to.fullPath }
        }
      }
    }
    if (to.meta.requiresAdmin && authStore.currentUser?.role !== 'admin') {
      return { name: 'Home' }
    }
  } else if (to.name === 'Login' && authStore.isAuthenticated) {
    // Redirect to home if already logged in
    return { name: 'Home' }
  }
})

export default router
