<template>
  <div class="home-page">
    <div class="container">
      <header class="hero-panel">
        <div class="hero-copy">
          <span class="eyebrow">Panel principal</span>
          <h1>Bienvenido, {{ authStore.user?.nombreEmpleado || 'Usuario' }}</h1>
          <p>{{ homeDescription }}</p>
        </div>

        <div class="hero-side">
          <div class="status-badge">
            <span class="dot"></span>
            Sistema operativo
          </div>
          <div class="hero-metric">
            <span>Turno actual</span>
            <strong>Matutino</strong>
          </div>
        </div>
      </header>

      <section class="stats-row" :class="{ 'stats-row-compact': !isAdmin }">
        <div v-for="stat in visibleStats" :key="stat.label" class="stat-card" :class="stat.tone">
          <span class="stat-label">{{ stat.label }}</span>
          <strong>{{ stat.value }}</strong>
          <small>{{ stat.caption }}</small>
        </div>
      </section>

      <div class="dashboard-grid">
        <Card title="Sistema POS" class="dashboard-card feature-card">
          <div class="card-intro">
            <div class="icon-badge icon-pos">🛒</div>
            <span class="pill">Operación</span>
          </div>

          <p>Inicia ventas con un flujo ágil, carrito inteligente y control completo del punto de venta.</p>

          <ul class="feature-list">
            <li>Carrito optimizado</li>
            <li>Pagos y cobros</li>
            <li>Ventas en tiempo real</li>
          </ul>

          <Button
            label="Ir a POS"
            variant="primary"
            @click="$router.push('/pos')"
          />
        </Card>

        <Card v-if="isAdmin" title="Reportes" class="dashboard-card feature-card">
          <div class="card-intro">
            <div class="icon-badge icon-reports">📊</div>
            <span class="pill">Estadísticas</span>
          </div>

          <p>Consulta ventas, transacciones y tendencias para tomar decisiones con mayor certeza.</p>

          <ul class="feature-list">
            <li>Indicadores por día</li>
            <li>Reporte de caja</li>
            <li>Análisis de ventas</li>
          </ul>

          <Button
            label="Ver Reportes"
            variant="secondary"
            @click="$router.push('/reports')"
          />
        </Card>

        <Card v-if="isAdmin" title="Facturas" class="dashboard-card feature-card">
          <div class="card-intro">
            <div class="icon-badge icon-invoice">🧾</div>
            <span class="pill">Documentos</span>
          </div>

          <p>Revisa y gestiona facturas de forma organizada, rápida y con mejor trazabilidad.</p>

          <ul class="feature-list">
            <li>Facturas activas</li>
            <li>Detalle de ventas</li>
            <li>Historial de cobros</li>
          </ul>

          <Button
            label="Ver Facturas"
            variant="success"
            @click="$router.push('/facturas')"
          />
        </Card>

        <Card title="Información del Usuario" class="dashboard-card profile-card">
          <div v-if="authStore.user" class="user-profile">
            <div class="avatar-wrap">
              <div class="avatar">{{ getInitials(authStore.user.nombreEmpleado || authStore.user.username) }}</div>
            </div>

            <div class="user-detail">
              <div class="meta-row">
                <span class="meta-label">Usuario</span>
                <strong>{{ authStore.user.username }}</strong>
              </div>
              <div class="meta-row">
                <span class="meta-label">Rol</span>
                <strong>{{ authStore.user.role }}</strong>
              </div>
              <div class="meta-row">
                <span class="meta-label">Empleado</span>
                <strong>{{ authStore.user.numeroEmpleado }}</strong>
              </div>
            </div>
          </div>

          <div v-else class="empty-state">No hay información del usuario disponible.</div>
        </Card>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAuthStore } from '@/stores/authStore'
import { computed } from 'vue'
import Card from '@/components/common/Card.vue'
import Button from '@/components/common/Button.vue'

const authStore = useAuthStore()

const isAdmin = computed(() => ['admin', 'superadmin'].includes(authStore.currentUser?.role || ''))
const homeDescription = computed(() => isAdmin.value
  ? 'Gestiona ventas, revisa reportes y controla el flujo del negocio desde una sola vista.'
  : 'Inicia ventas y consulta la información de tu cuenta desde una sola vista.')
const stats = [
  { label: 'Ventas del día', value: '0', caption: 'Registros recientes', tone: 'primary' },
  { label: 'Facturas', value: '0', caption: 'Emitidas hoy', tone: 'success' },
  { label: 'Estado', value: 'Activo', caption: 'Operación estable', tone: 'neutral' }
]
const visibleStats = computed(() => stats.filter((stat) => isAdmin.value || stat.label !== 'Facturas'))

const getInitials = (value: string) => {
  return value
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() || '')
    .join('')
}
</script>

<style scoped>
.home-page {
  min-height: 100%;
  padding: 1.5rem 0 2rem;
  background: #f3f5f7;
}

.container {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 1.5rem;
}

.hero-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
  margin-bottom: 1rem;
  padding: 1.25rem 1.5rem;
  border: 1px solid #dfe4ea;
  border-radius: 10px;
  background: #fff;
}

.hero-copy {
  min-width: 0;
  max-width: 700px;
}

.eyebrow {
  display: block;
  margin-bottom: 0.35rem;
  color: #687586;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.hero-copy h1 {
  margin: 0;
  color: #1d2939;
  font-size: clamp(1.45rem, 2.4vw, 1.9rem);
  line-height: 1.25;
  font-weight: 700;
}

.hero-copy p {
  margin: 0.4rem 0 0;
  color: #667085;
  font-size: 0.88rem;
  line-height: 1.5;
}

.hero-side {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 0.75rem;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.65rem;
  border: 1px solid #cce8d7;
  border-radius: 6px;
  background: #f1faf4;
  color: #246b43;
  font-size: 0.76rem;
  font-weight: 650;
}

.dot {
  width: 0.48rem;
  height: 0.48rem;
  background: #2f9e5b;
  border-radius: 50%;
}

.hero-metric {
  padding-left: 0.9rem;
  border-left: 1px solid #e4e7ec;
}

.hero-metric span {
  display: block;
  margin-bottom: 0.15rem;
  color: #667085;
  font-size: 0.68rem;
}

.hero-metric strong {
  color: #344054;
  font-size: 0.86rem;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.stats-row-compact { grid-template-columns: repeat(2, minmax(0, 1fr)); }

.stat-card {
  min-width: 0;
  padding: 0.85rem 1rem;
  border: 1px solid #dfe4ea;
  border-radius: 8px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.stat-label {
  color: #667085;
  font-size: 0.74rem;
  font-weight: 600;
}

.stat-card strong {
  color: #1d2939;
  font-size: 1.55rem;
  line-height: 1;
}

.stat-card small {
  color: #8490a0;
  font-size: 0.7rem;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

:deep(.card) {
  height: 100%;
  border: 1px solid #dfe4ea;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
}

:deep(.card-header) {
  padding: 0.8rem 1rem;
  border-bottom: 1px solid #eaecf0;
  background: #fff;
  color: #344054;
  font-size: 0.9rem;
  font-weight: 700;
}

:deep(.card-body) {
  padding: 1rem;
}

.dashboard-card {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  min-width: 0;
}

.card-intro {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.7rem;
}

.icon-badge {
  display: flex;
  flex: 0 0 auto;
  width: 2.5rem;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  background: #f8fafc;
  font-size: 1.15rem;
}

.icon-pos,
.icon-reports,
.icon-invoice {
  background: #f8fafc;
}

.pill {
  max-width: 100%;
  padding: 0.28rem 0.55rem;
  border: 1px solid #e4e7ec;
  border-radius: 5px;
  background: #f9fafb;
  color: #667085;
  font-size: 0.64rem;
  font-weight: 650;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.feature-card p {
  flex: 1;
  margin: 0 0 0.75rem;
  color: #667085;
  font-size: 0.82rem;
  line-height: 1.5;
}

.feature-list {
  display: grid;
  gap: 0.35rem;
  margin: 0 0 0.9rem;
  padding: 0;
  list-style: none;
}

.feature-list li {
  position: relative;
  padding-left: 1.1rem;
  color: #475467;
  font-size: 0.78rem;
}

.feature-list li::before {
  position: absolute;
  left: 0;
  color: #26834a;
  content: '✓';
  font-weight: 700;
}

.feature-card :deep(button) {
  min-height: 2.35rem;
  border-radius: 6px;
  font-size: 0.78rem;
}

.profile-card :deep(.card-body) {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.user-profile {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  min-width: 0;
}

.avatar-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar {
  display: flex;
  width: 3rem;
  height: 3rem;
  align-items: center;
  justify-content: center;
  border: 1px solid #cbd9ef;
  border-radius: 50%;
  background: #eaf0fa;
  color: #315b91;
  font-size: 0.95rem;
  font-weight: 700;
}

.user-detail {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 0.5rem;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid #f0f1f3;
}

.meta-label {
  color: #8490a0;
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.meta-row strong {
  overflow: hidden;
  color: #344054;
  font-size: 0.78rem;
  text-overflow: ellipsis;
  text-align: right;
  white-space: nowrap;
}

.empty-state {
  color: #667085;
  font-size: 0.82rem;
}

@media (max-width: 900px) {
  .container { padding: 0 1rem; }
  .dashboard-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .home-page { padding-top: 1rem; }
  .container { padding: 0 0.75rem; }
  .hero-panel {
    flex-direction: column;
    align-items: flex-start;
    gap: 0.9rem;
    padding: 1rem;
  }

  .hero-side {
    width: 100%;
    justify-content: space-between;
  }

  .stats-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .stat-card:last-child { grid-column: 1 / -1; }
  .dashboard-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
