<template>
  <div class="not-found">
    <div class="not-found-content">
      <h1>404</h1>
      <p>Página no encontrada</p>
      <Button
        label="Ir al inicio"
        variant="primary"
        @click="$router.push('/')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from '@/components/common/Button.vue'
</script>

<style scoped>
.not-found {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.not-found-content {
  text-align: center;
  background: white;
  padding: 3rem;
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

h1 {
  font-size: 4rem;
  margin: 0;
  color: #667eea;
}

p {
  font-size: 1.5rem;
  color: #666;
  margin: 1rem 0 2rem 0;
}
</style>
