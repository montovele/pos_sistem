<template>
  <div class="login-page">
    <div class="login-container">
      <Card title="Iniciar Sesión">
        <Alert
          v-if="error"
          type="error"
          :message="error"
          dismissible
        />

        <form @submit.prevent="handleSubmit">
          <Input
            v-model="username"
            label="Usuario"
            type="text"
            placeholder="Ingresa tu usuario"
            required
            :error="formErrors.username"
            @blur="() => setFieldTouched('username')"
          />

          <Input
            v-model="password"
            label="Contraseña"
            type="password"
            placeholder="Ingresa tu contraseña"
            required
            :error="formErrors.password"
            @blur="() => setFieldTouched('password')"
          />

          <Button
            label="Iniciar Sesión"
            variant="primary"
            size="large"
            type="submit"
            :is-loading="isLoading"
          />
        </form>
      </Card>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'
import Card from '@/components/common/Card.vue'
import Input from '@/components/common/Input.vue'
import Button from '@/components/common/Button.vue'
import Alert from '@/components/common/Alert.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const isLoading = ref(false)
const error = ref<string | null>(null)
const formErrors = reactive({ username: '', password: '' })

const setFieldTouched = (field: string) => {
  // Mark field as touched for validation
}

const validateForm = (): boolean => {
  formErrors.username = !username.value ? 'Usuario es requerido' : ''
  formErrors.password = !password.value ? 'Contraseña es requerida' : ''
  return !formErrors.username && !formErrors.password
}

const handleSubmit = async () => {
  if (!validateForm()) return

  isLoading.value = true
  error.value = null

  try {
    const success = await authStore.login(username.value, password.value)
    if (success) {
      const redirect = route.query.redirect as string || '/'
      router.push(redirect)
    } else {
      error.value = authStore.error || 'Error al iniciar sesión'
    }
  } catch (err: any) {
    error.value = err.message || 'Error desconocido'
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 1rem;
}

.login-container {
  width: 100%;
  max-width: 400px;
}

form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}
</style>
