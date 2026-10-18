<template>
  <div class="card">
    <div v-if="title" class="card-header">{{ title }}</div>
    <div class="card-body">
      <slot></slot>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title?: string
}>()
</script>

<style scoped>
.card {
  background: white;
  border-radius: 8px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  transition: box-shadow 0.3s ease;
}

.card:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.card-header {
  padding: 1rem 1.5rem;
  background-color: #f5f5f5;
  border-bottom: 1px solid #eee;
  font-size: 1.125rem;
  font-weight: 600;
  color: #2c3e50;
}

.card-body {
  padding: 1.5rem;
  color: #555;
}
</style>
