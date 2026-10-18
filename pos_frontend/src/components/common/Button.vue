<template>
  <button
    :type="props.type"
    :class="[
      'btn',
      `btn-${props.variant}`,
      `btn-${props.size}`,
      { 'btn-loading': props.isLoading }
    ]"
    :disabled="props.isLoading || props.disabled"
    @click="$emit('click')"
  >
    <span v-if="props.isLoading" class="spinner"></span>
    <slot>{{ props.label }}</slot>
  </button>
</template>

<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    label?: string
    variant?: 'primary' | 'secondary' | 'danger' | 'success'
    size?: 'small' | 'medium' | 'large'
    isLoading?: boolean
    disabled?: boolean
    type?: 'button' | 'submit' | 'reset'
  }>(),
  {
    variant: 'primary',
    size: 'medium',
    type: 'button'
  }
)

defineEmits<{
  click: []
}>()
</script>

<style scoped>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.3s ease;
  min-height: 40px;
}

.btn-primary {
  background-color: #42b983;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background-color: #369970;
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(66, 185, 131, 0.4);
}

.btn-secondary {
  background-color: #2c3e50;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background-color: #1a252f;
}

.btn-danger {
  background-color: #e74c3c;
  color: white;
}

.btn-danger:hover:not(:disabled) {
  background-color: #c0392b;
}

.btn-success {
  background-color: #27ae60;
  color: white;
}

.btn-success:hover:not(:disabled) {
  background-color: #229954;
}

.btn-small {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
  min-height: 32px;
}

.btn-medium {
  padding: 0.75rem 1.5rem;
}

.btn-large {
  padding: 1rem 2rem;
  font-size: 1.125rem;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-loading {
  position: relative;
}

.spinner {
  display: inline-block;
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
