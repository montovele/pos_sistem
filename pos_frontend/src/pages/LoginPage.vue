<template>
  <main class="login-page">
    <header class="login-header">
      <RouterLink class="brand" to="/" aria-label="LEMARQUET POS, ir al inicio">
        <span class="brand-symbol">L</span>
        <span class="brand-name">LEMARQUET <b>POS</b></span>
      </RouterLink>
      <RouterLink class="plans-link" to="/planes">
        ¿Aún no tienes un plan? <span>Conoce las opciones <span aria-hidden="true">→</span></span>
      </RouterLink>
    </header>

    <section class="login-layout" aria-labelledby="login-title">
      <aside class="welcome-panel">
        <div class="welcome-content">
          <div class="welcome-badge"><span aria-hidden="true">✓</span> Tu negocio, en buenas manos</div>
          <h1>Qué gusto tenerte de vuelta.</h1>
          <p>Accede a tus herramientas de venta y continúa llevando tu negocio con claridad.</p>

          <div class="trust-card">
            <div class="trust-icon" aria-hidden="true">▦</div>
            <div>
              <strong>Todo en un solo lugar</strong>
              <span>Ventas, caja, inventario y reportes.</span>
            </div>
          </div>
        </div>

        <div class="welcome-footer">
          <span class="status-dot" aria-hidden="true"></span>
          Una forma más clara de llevar tu operación
        </div>
        <div class="panel-decoration panel-decoration-one" aria-hidden="true"></div>
        <div class="panel-decoration panel-decoration-two" aria-hidden="true"></div>
      </aside>

      <div class="form-panel">
        <div class="form-heading">
          <span class="form-kicker">ACCESO A TU CUENTA</span>
          <h2 id="login-title">Iniciar sesión</h2>
          <p>Ingresa tus datos para continuar a tu espacio de trabajo.</p>
        </div>

        <div v-if="error" class="login-error" role="alert">
          <span class="error-icon" aria-hidden="true">!</span>
          <span>{{ error }}</span>
        </div>

        <form class="login-form" @submit.prevent="handleSubmit">
          <label class="field">
            <span>Usuario</span>
            <input
              v-model="username"
              type="text"
              name="username"
              autocomplete="username"
              placeholder="Escribe tu usuario"
              required
              :aria-invalid="Boolean(formErrors.username)"
              :aria-describedby="formErrors.username ? 'username-error' : undefined"
              @blur="setFieldTouched('username')"
            />
            <small v-if="formErrors.username" id="username-error" class="field-error">{{ formErrors.username }}</small>
          </label>

          <label class="field">
            <span>Contraseña</span>
            <span class="password-control">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                name="password"
                autocomplete="current-password"
                placeholder="Escribe tu contraseña"
                required
                :aria-invalid="Boolean(formErrors.password)"
                :aria-describedby="formErrors.password ? 'password-error' : undefined"
                @blur="setFieldTouched('password')"
              />
              <button
                class="visibility-button"
                type="button"
                :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
                :aria-pressed="showPassword"
                @click="showPassword = !showPassword"
              >
                {{ showPassword ? 'Ocultar' : 'Mostrar' }}
              </button>
            </span>
            <small v-if="formErrors.password" id="password-error" class="field-error">{{ formErrors.password }}</small>
          </label>

          <Button
            class="submit-button"
            label="Entrar a mi cuenta"
            variant="primary"
            size="large"
            type="submit"
            :is-loading="isLoading"
          >
            <span>{{ isLoading ? 'Verificando acceso…' : 'Entrar a mi cuenta' }}</span>
            <span v-if="!isLoading" class="button-arrow" aria-hidden="true">→</span>
          </Button>
        </form>

        <div class="security-note">
          <span class="lock-icon" aria-hidden="true">⌑</span>
          <span>Tu acceso es privado. No compartas tu contraseña con otras personas.</span>
        </div>

        <RouterLink class="recovery-link" to="/recuperar-pago">¿Tienes un pago pendiente? Recupera tu contratación</RouterLink>
        <RouterLink class="home-link" to="/">← Volver al inicio</RouterLink>
      </div>
    </section>

    <footer class="login-footer">
      <span>LEMARQUET POS</span>
      <span>Una operación más ordenada, desde la primera venta.</span>
    </footer>
  </main>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import Button from '@/components/common/Button.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const isLoading = ref(false)
const error = ref<string | null>(null)
const formErrors = reactive({ username: '', password: '' })

const setFieldTouched = (field: 'username' | 'password') => {
  if (field === 'username') {
    formErrors.username = username.value.trim() ? '' : 'Ingresa tu usuario.'
  } else {
    formErrors.password = password.value ? '' : 'Ingresa tu contraseña.'
  }
}

const validateForm = (): boolean => {
  formErrors.username = username.value.trim() ? '' : 'Ingresa tu usuario.'
  formErrors.password = password.value ? '' : 'Ingresa tu contraseña.'
  return !formErrors.username && !formErrors.password
}

const handleSubmit = async () => {
  if (!validateForm()) return

  isLoading.value = true
  error.value = null

  try {
    const success = await authStore.login(username.value, password.value)
    if (success) {
      const redirect = route.query.redirect as string || '/inicio'
      router.push(redirect)
    } else {
      error.value = authStore.error || 'No pudimos iniciar sesión. Revisa tus datos e inténtalo de nuevo.'
    }
  } catch (err: unknown) {
    error.value = err instanceof Error ? err.message : 'Ocurrió un problema al iniciar sesión. Inténtalo de nuevo.'
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.login-page {
  --ink: #172033;
  --muted: #647084;
  --blue: #3158d8;
  display: flex;
  min-height: 100%;
  flex-direction: column;
  padding: 0 6.2%;
  background:
    radial-gradient(ellipse at 50% 42%, #fff 0%, #fff 35%, transparent 76%),
    #f4f6fb;
  color: var(--ink);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.login-header {
  display: flex;
  min-height: 86px;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
}

.brand {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  color: var(--ink);
  text-decoration: none;
}

.brand-symbol {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 12px;
  background: #1d2b4d;
  color: #fff;
  font-size: 1.2rem;
  font-weight: 850;
  font-style: italic;
}

.brand-name {
  font-size: 0.84rem;
  font-weight: 850;
  letter-spacing: 0.07em;
}

.brand-name b {
  margin-left: 0.3rem;
  color: var(--blue);
  font-size: 0.69rem;
  letter-spacing: 0.12em;
}

.plans-link {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  color: #7a8495;
  font-size: 0.73rem;
  text-decoration: none;
}

.plans-link > span {
  color: #3158d8;
  font-weight: 750;
}

.login-layout {
  display: grid;
  width: min(1050px, 100%);
  min-height: 570px;
  grid-template-columns: 0.93fr 1.07fr;
  margin: auto;
  overflow: hidden;
  border: 1px solid #e8ebf2;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 24px 70px #26395a12, 0 3px 10px #26395a08;
}

.welcome-panel {
  position: relative;
  display: flex;
  min-height: 570px;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
  padding: 3.2rem 2.8rem 2.2rem;
  background: linear-gradient(145deg, #1d2b4d 0%, #243a69 60%, #3158a1 100%);
  color: #fff;
}

.welcome-content,
.welcome-footer {
  position: relative;
  z-index: 1;
}

.welcome-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.48rem 0.75rem;
  border: 1px solid #ffffff2b;
  border-radius: 999px;
  background: #ffffff10;
  color: #e4eaff;
  font-size: 0.65rem;
  font-weight: 650;
}

.welcome-badge span {
  display: grid;
  width: 17px;
  height: 17px;
  place-items: center;
  border-radius: 50%;
  background: #b7ead0;
  color: #1d6848;
  font-size: 0.62rem;
  font-weight: 900;
}

.welcome-panel h1 {
  max-width: 350px;
  margin: 2rem 0 0.85rem;
  font-size: clamp(2rem, 3.4vw, 2.8rem);
  font-weight: 740;
  letter-spacing: -0.055em;
  line-height: 1.08;
}

.welcome-panel p {
  max-width: 320px;
  margin: 0;
  color: #d3dbed;
  font-size: 0.82rem;
  line-height: 1.75;
}

.trust-card {
  display: flex;
  max-width: 340px;
  align-items: center;
  gap: 0.85rem;
  margin-top: 2.4rem;
  padding: 1rem;
  border: 1px solid #ffffff21;
  border-radius: 12px;
  background: #ffffff0d;
  backdrop-filter: blur(8px);
}

.trust-icon {
  display: grid;
  width: 39px;
  height: 39px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 10px;
  background: #ffffff18;
  color: #d8e2ff;
  font-size: 1.2rem;
}

.trust-card div:last-child {
  display: grid;
  gap: 0.24rem;
}

.trust-card strong {
  font-size: 0.74rem;
  font-weight: 700;
}

.trust-card span {
  color: #d3dbed;
  font-size: 0.65rem;
}

.welcome-footer {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  color: #d3dbed;
  font-size: 0.65rem;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #8ed3ae;
  box-shadow: 0 0 0 4px #8ed3ae20;
}

.panel-decoration {
  position: absolute;
  width: 270px;
  height: 270px;
  border: 1px solid #ffffff0e;
  border-radius: 50%;
  pointer-events: none;
}

.panel-decoration-one {
  right: -155px;
  top: 8%;
  box-shadow: 0 0 0 35px #ffffff08, 0 0 0 70px #ffffff05;
}

.panel-decoration-two {
  bottom: -205px;
  left: 28%;
  width: 330px;
  height: 330px;
  box-shadow: 0 0 0 35px #ffffff07, 0 0 0 70px #ffffff04;
}

.form-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 3rem clamp(2.2rem, 6vw, 5rem);
}

.form-heading {
  margin-bottom: 1.7rem;
}

.form-kicker {
  color: #7183b8;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.13em;
}

.form-heading h2 {
  margin: 0.55rem 0 0.45rem;
  color: #1e2b43;
  font-size: 1.9rem;
  font-weight: 760;
  letter-spacing: -0.05em;
}

.form-heading p {
  margin: 0;
  color: #7a8495;
  font-size: 0.75rem;
  line-height: 1.6;
}

.login-form {
  display: grid;
  gap: 1.1rem;
}

.field {
  display: grid;
  gap: 0.48rem;
  color: #3e4a60;
  font-size: 0.69rem;
  font-weight: 700;
}

.field input {
  width: 100%;
  min-height: 48px;
  padding: 0.75rem 0.85rem;
  border: 1px solid #dfe4ec;
  border-radius: 8px;
  outline: none;
  background: #fff;
  color: #202b40;
  font: inherit;
  font-size: 0.77rem;
  font-weight: 450;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}

.field input::placeholder {
  color: #a0a8b6;
}

.field input:focus {
  border-color: #7189df;
  box-shadow: 0 0 0 3px #3158d81b;
}

.field input[aria-invalid="true"] {
  border-color: #d66b65;
}

.password-control {
  position: relative;
  display: block;
}

.password-control input {
  padding-right: 5rem;
}

.visibility-button {
  position: absolute;
  top: 50%;
  right: 0.8rem;
  padding: 0.3rem 0;
  transform: translateY(-50%);
  border: 0;
  background: transparent;
  color: #5269b0;
  font: inherit;
  font-size: 0.65rem;
  font-weight: 750;
  cursor: pointer;
}

.visibility-button:focus-visible,
.recovery-link:focus-visible,
.home-link:focus-visible,
.plans-link:focus-visible,
.brand:focus-visible {
  outline: 3px solid #8da3f3;
  outline-offset: 3px;
  border-radius: 4px;
}

.field-error {
  color: #ad3e38;
  font-size: 0.65rem;
  font-weight: 550;
}

.submit-button {
  width: 100%;
  min-height: 49px;
  justify-content: space-between;
  margin-top: 0.3rem;
  padding-inline: 1rem;
  border-radius: 8px;
  background: #3158d8;
  box-shadow: 0 7px 16px #3158d82a;
  font-size: 0.77rem;
  font-weight: 750;
  transition: background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.submit-button:hover:not(:disabled) {
  transform: translateY(-1px);
  background: #284bc1;
  box-shadow: 0 9px 20px #3158d83a;
}

.button-arrow {
  font-size: 1.1rem;
}

.security-note {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  margin-top: 1.4rem;
  color: #7d8798;
  font-size: 0.64rem;
  line-height: 1.55;
}

.lock-icon {
  color: #63816f;
  font-size: 0.85rem;
}

.login-error {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  margin: 0 0 1.1rem;
  padding: 0.75rem;
  border: 1px solid #f1cecb;
  border-radius: 8px;
  background: #fff7f6;
  color: #963b35;
  font-size: 0.69rem;
  line-height: 1.5;
}

.error-icon {
  display: grid;
  width: 17px;
  height: 17px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: #f7dedb;
  font-size: 0.65rem;
  font-weight: 850;
}

.home-link {
  align-self: flex-start;
  margin-top: 1.7rem;
  color: #68758a;
  font-size: 0.68rem;
  font-weight: 650;
  text-decoration: none;
}

.recovery-link {
  display: inline-block;
  align-self: flex-start;
  margin-top: 1.15rem;
  color: var(--blue);
  font-size: 0.68rem;
  font-weight: 700;
  text-decoration: none;
}

.recovery-link:hover {
  text-decoration: underline;
}

.home-link:hover {
  color: var(--blue);
}

.login-footer {
  display: flex;
  min-height: 64px;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  color: #9099a8;
  font-size: 0.62rem;
}

.login-footer span:first-child {
  font-weight: 800;
  letter-spacing: 0.08em;
}

@media (max-width: 760px) {
  .login-page {
    padding-inline: 1.25rem;
  }

  .login-header {
    min-height: 72px;
  }

  .login-layout {
    width: min(480px, 100%);
    min-height: auto;
    grid-template-columns: 1fr;
    margin-block: 1rem;
  }

  .welcome-panel {
    min-height: 235px;
    padding: 1.7rem;
  }

  .welcome-panel h1 {
    max-width: 320px;
    margin-top: 1.1rem;
    font-size: 2rem;
  }

  .welcome-panel p {
    max-width: 400px;
    font-size: 0.75rem;
  }

  .trust-card {
    display: none;
  }

  .welcome-footer {
    margin-top: 1.3rem;
  }

  .form-panel {
    padding: 2rem 1.7rem;
  }
}

@media (max-width: 480px) {
  .login-page {
    padding-inline: 1rem;
  }

  .login-header {
    min-height: 66px;
  }

  .brand-name {
    font-size: 0.72rem;
  }

  .brand-symbol {
    width: 34px;
    height: 34px;
  }

  .plans-link {
    display: block;
    max-width: 145px;
    text-align: right;
    font-size: 0.62rem;
    line-height: 1.5;
  }

  .plans-link > span {
    display: block;
  }

  .welcome-panel {
    min-height: 220px;
    padding: 1.4rem;
  }

  .welcome-panel h1 {
    font-size: 1.8rem;
  }

  .form-panel {
    padding: 1.7rem 1.35rem;
  }

  .form-heading h2 {
    font-size: 1.65rem;
  }

  .login-footer {
    min-height: 58px;
    flex-direction: column;
    justify-content: center;
    gap: 0.25rem;
    text-align: center;
  }
}

@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    scroll-behavior: auto !important;
    transition-duration: 0.01ms !important;
  }
}
</style>
