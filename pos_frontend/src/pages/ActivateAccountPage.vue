<template>
  <main class="activation-page">
    <header class="activation-brand">
      <RouterLink to="/"><span>L</span> LEMARQUET <b>POS</b></RouterLink>
    </header>
    <section class="activation-card">
      <template v-if="activated">
        <div class="activation-icon success-icon">✓</div>
        <p class="eyebrow">CUENTA ACTIVADA</p>
        <h1>Ya puedes acceder a tu POS.</h1>
        <p class="intro">Tu contraseña se guardó correctamente. Inicia sesión con el nombre de usuario recibido por correo.</p>
        <RouterLink class="primary-button" to="/login">Ir a iniciar sesión <span>→</span></RouterLink>
      </template>
      <template v-else>
        <div class="activation-icon">L</div>
        <p class="eyebrow">ACTIVA TU CUENTA DE ADMINISTRADOR</p>
        <h1>Elige una contraseña segura.</h1>
        <p class="intro">El enlace es de un solo uso y vence en 24 horas. Después de guardarla, podrás iniciar sesión y gestionar tu organización.</p>
        <div v-if="errorMessage" class="error-message" role="alert">{{ errorMessage }}</div>
        <form @submit.prevent="activate">
          <label>
            Nueva contraseña
            <input v-model="password" autocomplete="new-password" type="password" minlength="10" maxlength="200" required />
          </label>
          <small class="password-hint">Usa al menos 10 caracteres.</small>
          <label>
            Confirmar contraseña
            <input v-model="confirmation" autocomplete="new-password" type="password" minlength="10" maxlength="200" required />
          </label>
          <button class="primary-button" type="submit" :disabled="submitting || !token">
            {{ submitting ? 'Activando…' : 'Guardar contraseña y activar' }} <span>→</span>
          </button>
        </form>
        <p v-if="!token" class="expired-message">Este enlace no incluye un token de activación válido. Usa el enlace completo que recibiste por correo.</p>
      </template>
      <RouterLink v-if="!activated" class="back-link" to="/">Volver al inicio</RouterLink>
    </section>
    <footer>La contraseña no se envía por correo. Este enlace es privado y de un solo uso.</footer>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '@/services/api'

const route = useRoute()
const token = computed(() => typeof route.query.token === 'string' ? route.query.token : '')
const password = ref('')
const confirmation = ref('')
const errorMessage = ref('')
const submitting = ref(false)
const activated = ref(false)

async function activate() {
  errorMessage.value = ''
  if (!token.value) {
    errorMessage.value = 'El enlace de activación no es válido.'
    return
  }
  if (password.value.length < 10) {
    errorMessage.value = 'La contraseña debe tener al menos 10 caracteres.'
    return
  }
  if (password.value !== confirmation.value) {
    errorMessage.value = 'Las contraseñas no coinciden.'
    return
  }

  submitting.value = true
  try {
    await api.post('/auth/activate-account', {
      token: token.value,
      password: password.value
    })
    activated.value = true
    password.value = ''
    confirmation.value = ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : 'No se pudo activar la cuenta.'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.activation-page { display: flex; min-height: 100%; flex-direction: column; align-items: center; padding: 0 20px 24px; background: #f5f7fb; color: #1e2b43; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
.activation-brand { width: min(100%, 470px); padding: 1.2rem 0; }
.activation-brand a { display: inline-flex; align-items: center; gap: 0.45rem; color: #26334b; font-size: 0.78rem; font-weight: 850; letter-spacing: 0.07em; text-decoration: none; }
.activation-brand a > span { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: #1d2b4d; color: #fff; font-size: 1rem; font-style: italic; }
.activation-brand b { color: #3158d8; font-size: 0.65rem; }
.activation-card { width: min(100%, 470px); margin: auto; padding: 2.2rem; border: 1px solid #e6eaf1; border-radius: 14px; background: #fff; box-shadow: 0 18px 50px #25355312; }
.activation-icon { display: grid; place-items: center; width: 46px; height: 46px; margin-bottom: 1.1rem; border-radius: 13px; background: #eef2ff; color: #4767d1; font-size: 1.2rem; font-weight: 850; font-style: italic; }
.success-icon { background: #e8f5ed; color: #338456; font-style: normal; }
.eyebrow { margin: 0; color: #6277bb; font-size: 0.62rem; font-weight: 800; letter-spacing: 0.12em; }
.activation-card h1 { margin: 0.5rem 0; color: #1f2c44; font-size: 1.85rem; letter-spacing: -0.045em; line-height: 1.15; }
.intro { margin: 0 0 1.35rem; color: #778397; font-size: 0.78rem; line-height: 1.7; }
.activation-card form { display: grid; gap: 0.85rem; }
.activation-card label { display: grid; gap: 0.4rem; color: #49566c; font-size: 0.7rem; font-weight: 700; }
.activation-card input { min-height: 43px; padding: 0.65rem 0.75rem; border: 1px solid #dfe4ec; border-radius: 7px; outline: none; font: inherit; font-size: 0.78rem; }
.activation-card input:focus { border-color: #7088df; box-shadow: 0 0 0 3px #3158d81b; }
.password-hint { margin-top: -0.65rem; color: #8792a4; font-size: 0.62rem; }
.primary-button { display: inline-flex; min-height: 45px; align-items: center; justify-content: space-between; gap: 1rem; margin-top: 0.35rem; padding: 0.75rem 1rem; border: 0; border-radius: 8px; background: #3158d8; color: #fff; font: inherit; font-size: 0.75rem; font-weight: 750; text-decoration: none; cursor: pointer; }
.primary-button:disabled { background: #9daadd; cursor: not-allowed; }
.error-message, .expired-message { margin: 0 0 1rem; padding: 0.7rem; border-radius: 7px; background: #fff0ef; color: #a93630; font-size: 0.69rem; line-height: 1.5; }
.expired-message { margin: 1rem 0 0; }
.back-link { display: inline-block; margin-top: 1.2rem; color: #66748c; font-size: 0.68rem; text-decoration: none; }
.activation-page footer { width: min(100%, 470px); margin-top: 1rem; color: #8a94a5; font-size: 0.62rem; text-align: center; }
@media (max-width: 520px) { .activation-card { padding: 1.45rem; } }
</style>
