<template>
  <transition name="toast-fade">
    <div v-if="visible" :class="['toast', `toast-${type}`]" role="status" aria-live="polite">
      <div class="toast-content">
        <span class="toast-icon">{{ icon }}</span>
        <span>{{ message }}</span>
      </div>
      <button class="toast-close" @click="close">×</button>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    visible?: boolean
    message?: string
    type?: 'success' | 'error' | 'warning' | 'info'
  }>(),
  {
    visible: false,
    type: 'info',
    message: ''
  }
)

const emit = defineEmits<{
  close: []
}>()

const icon = computed(() => {
  switch (props.type) {
    case 'success': return '✓'
    case 'error': return '✕'
    case 'warning': return '⚠'
    default: return 'ℹ'
  }
})

const close = () => emit('close')
</script>

<style scoped>
.toast {
  position: fixed;
  right: 1rem;
  top: 1rem;
  z-index: 2000;
  min-width: 260px;
  max-width: 360px;
  padding: 0.9rem 1rem;
  border-radius: 12px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.15);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  color: #0f172a;
  background: white;
  border-left: 5px solid #2563eb;
}

.toast-success {
  border-left-color: #16a34a;
  background: #f0fdf4;
}

.toast-error {
  border-left-color: #dc2626;
  background: #fef2f2;
}

.toast-warning {
  border-left-color: #f59e0b;
  background: #fff7ed;
}

.toast-info {
  border-left-color: #2563eb;
  background: #eff6ff;
}

.toast-content {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-weight: 600;
}

.toast-icon {
  font-size: 1.1rem;
}

.toast-close {
  background: transparent;
  border: none;
  font-size: 1.3rem;
  cursor: pointer;
  opacity: 0.7;
}

.toast-fade-enter-active,
.toast-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.toast-fade-enter-from,
.toast-fade-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
