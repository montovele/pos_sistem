<template>
  <div class="home-page">
    <div class="container">
      <header class="hero-panel">
        <div class="hero-copy">
          <span class="eyebrow">Panel principal</span>
          <h1>Bienvenido, {{ authStore.user?.nombreEmpleado || 'Usuario' }}</h1>
          <p>
            Gestiona ventas, revisa reportes y controla el flujo del negocio desde una sola vista.
          </p>
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

      <section class="stats-row">
        <div v-for="stat in stats" :key="stat.label" class="stat-card" :class="stat.tone">
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

        <Card title="Reportes" class="dashboard-card feature-card">
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

        <Card title="Facturas" class="dashboard-card feature-card">
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
import Card from '@/components/common/Card.vue'
import Button from '@/components/common/Button.vue'

const authStore = useAuthStore()

const stats = [
  { label: 'Ventas del día', value: '0', caption: 'Registros recientes', tone: 'primary' },
  { label: 'Facturas', value: '0', caption: 'Emitidas hoy', tone: 'success' },
  { label: 'Estado', value: 'Activo', caption: 'Operación estable', tone: 'neutral' }
]

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
  padding: 2.5rem 0 3rem;
  background:
    radial-gradient(circle at top left, rgba(66, 185, 131, 0.12), transparent 35%),
    linear-gradient(180deg, #f7fafb 0%, #eef4f8 100%);
  min-height: calc(100vh - 64px);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
}

.hero-panel {
  background: linear-gradient(135deg, #1d3557 0%, #2a5c8c 45%, #0f172a 100%);
  border-radius: 24px;
  padding: 2rem;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
  margin-bottom: 1.75rem;
}

.hero-copy {
  max-width: 620px;
}

.eyebrow {
  display: inline-block;
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #dfeefb;
  padding: 0.45rem 0.8rem;
  border-radius: 999px;
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 0.8rem;
}

.hero-copy h1 {
  margin: 0;
  color: #ffffff;
  font-size: clamp(2rem, 3vw, 3rem);
  line-height: 1.1;
  font-weight: 800;
}

.hero-copy p {
  margin: 0.85rem 0 0;
  color: rgba(255, 255, 255, 0.8);
  font-size: 1.05rem;
  line-height: 1.6;
}

.hero-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.85rem;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: rgba(67, 209, 146, 0.12);
  border: 1px solid rgba(67, 209, 146, 0.35);
  color: #dffdf1;
  padding: 0.55rem 0.9rem;
  border-radius: 999px;
  font-weight: 600;
}

.dot {
  width: 0.6rem;
  height: 0.6rem;
  background: #4ade80;
  border-radius: 50%;
  box-shadow: 0 0 0 5px rgba(74, 222, 128, 0.15);
}

.hero-metric {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 16px;
  padding: 0.85rem 1rem;
  min-width: 150px;
  text-align: left;
}

.hero-metric span {
  display: block;
  color: rgba(255, 255, 255, 0.72);
  font-size: 0.75rem;
  margin-bottom: 0.25rem;
}

.hero-metric strong {
  color: white;
  font-size: 1.2rem;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 18px;
  padding: 1.1rem 1.25rem;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05);
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.stat-card.primary {
  border-top: 4px solid #42b983;
}

.stat-card.success {
  border-top: 4px solid #10b981;
}

.stat-card.neutral {
  border-top: 4px solid #3b82f6;
}

.stat-label {
  font-size: 0.8rem;
  color: #64748b;
  letter-spacing: 0.02em;
}

.stat-card strong {
  font-size: 1.9rem;
  line-height: 1;
  color: #0f172a;
}

.stat-card small {
  color: #64748b;
}

.dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
  gap: 1.5rem;
}

:deep(.card) {
  height: 100%;
  border-radius: 20px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
  background: rgba(255, 255, 255, 0.96);
}

:deep(.card-header) {
  padding: 1.1rem 1.4rem;
  font-size: 1.15rem;
  font-weight: 700;
  background: linear-gradient(180deg, #f8fafc 0%, #eef4ff 100%);
  border-bottom: 1px solid #edf2f7;
  color: #1f2937;
}

:deep(.card-body) {
  padding: 1.4rem;
}

.dashboard-card {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

.card-intro {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.icon-badge {
  width: 3rem;
  height: 3rem;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.4rem;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.icon-pos {
  background: linear-gradient(135deg, #d1fae5, #a7f3d0);
}

.icon-reports {
  background: linear-gradient(135deg, #dbeafe, #bfdbfe);
}

.icon-invoice {
  background: linear-gradient(135deg, #fef3c7, #fde68a);
}

.pill {
  background: #eef2ff;
  color: #4338ca;
  border: 1px solid #c7d2fe;
  border-radius: 999px;
  padding: 0.35rem 0.7rem;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.feature-card p {
  flex: 1;
  margin: 0 0 1rem;
  color: #475569;
  line-height: 1.6;
}

.feature-list {
  list-style: none;
  padding: 0;
  margin: 0 0 1.25rem;
  display: grid;
  gap: 0.55rem;
}

.feature-list li {
  position: relative;
  padding-left: 1.3rem;
  color: #334155;
  font-size: 0.95rem;
}

.feature-list li::before {
  content: '✓';
  position: absolute;
  left: 0;
  color: #22c55e;
  font-weight: 700;
}

.profile-card :deep(.card-body) {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.user-profile {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.25rem 0;
}

.avatar-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar {
  width: 4rem;
  height: 4rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #1d3557 0%, #2a9d8f 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.1rem;
  font-weight: 700;
  box-shadow: 0 10px 24px rgba(45, 96, 123, 0.2);
}

.user-detail {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 0.7rem;
}

.meta-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  border-bottom: 1px solid #edf2f7;
  padding-bottom: 0.4rem;
}

.meta-label {
  color: #64748b;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.meta-row strong {
  color: #0f172a;
  font-size: 0.96rem;
  text-align: right;
}

.empty-state {
  color: #64748b;
  font-style: italic;
}

@media (max-width: 700px) {
  .hero-panel {
    flex-direction: column;
    align-items: flex-start;
    gap: 1.2rem;
  }

  .hero-side {
    width: 100%;
    align-items: flex-start;
  }

  .user-profile {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
