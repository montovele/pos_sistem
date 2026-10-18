<template>
  <div v-if="show" :class="['alert', `alert-${type}`]">
    <div class="alert-content">
      <span class="alert-icon">{{ getIcon() }}</span>
      <div class="alert-message">
        <slot>{{ message }}</slot>
      </div>
      <button v-if="dismissible" class="alert-close" @click="close">×</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface Props {
  message?: string
  type?: 'success' | 'error' | 'warning' | 'info'
  dismissible?: boolean
  autoClose?: boolean
  duration?: number
}

const props = withDefaults(defineProps<Props>(), {
  type: 'info',
  dismissible: true,
  autoClose: false,
  duration: 5000
})

const show = ref(true)

onMounted(() => {
  if (props.autoClose) {
    setTimeout(() => {
      show.value = false
    }, props.duration)
  }
})

const close = () => {
  show.value = false
}

const getIcon = () => {
  switch (props.type) {
    case 'success':
      return '✓'
    case 'error':
      return '✕'
    case 'warning':
      return '⚠'
    case 'info':
      return 'ℹ'
    default:
      return ''
  }
}
</script>

<style scoped>
.alert {
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
  border-left: 4px solid;
  animation: slideInDown 0.3s ease-out;
}

@keyframes slideInDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.alert-content {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

.alert-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
  line-height: 1.5;
}

.alert-message {
  flex: 1;
  line-height: 1.5;
}

.alert-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  opacity: 0.7;
  flex-shrink: 0;
  transition: opacity 0.3s;
}

.alert-close:hover {
  opacity: 1;
}

.alert-success {
  background-color: #d4edda;
  color: #155724;
  border-left-color: #28a745;
}

.alert-error {
  background-color: #f8d7da;
  color: #721c24;
  border-left-color: #dc3545;
}

.alert-warning {
  background-color: #fff3cd;
  color: #856404;
  border-left-color: #ffc107;
}

.alert-info {
  background-color: #d1ecf1;
  color: #0c5460;
  border-left-color: #17a2b8;
}
</style>
