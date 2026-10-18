<template>
  <div class="modal-overlay" v-if="isOpen" @click.self="close">
    <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div class="modal-glow"></div>
      <div class="modal-header">
        <div class="title-wrap">
          <span class="header-badge">✓</span>
          <h2 id="modal-title">{{ title }}</h2>
        </div>
        <button class="close-btn" @click="close" aria-label="Cerrar modal">×</button>
      </div>

      <div class="modal-body">
        <slot></slot>
      </div>

      <div class="modal-footer">
        <slot name="footer">
          <Button
            variant="secondary"
            label="Cancelar"
            @click="close"
          />
          <Button
            v-if="showConfirm"
            :variant="confirmVariant"
            :label="confirmLabel"
            :is-loading="isLoading"
            @click="confirm"
          />
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import Button from './Button.vue'

withDefaults(
  defineProps<{
    isOpen: boolean
    title?: string
    showConfirm?: boolean
    confirmLabel?: string
    confirmVariant?: 'primary' | 'danger' | 'success'
    isLoading?: boolean
  }>(),
  {
    title: 'Modal',
    showConfirm: true,
    confirmLabel: 'Confirmar',
    confirmVariant: 'primary',
    isLoading: false
  }
)

const emit = defineEmits<{
  close: []
  confirm: []
}>()

const close = () => emit('close')
const confirm = () => emit('confirm')
</script>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(8, 15, 26, 0.46);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  z-index: 1000;
  animation: fadeIn 0.25s ease-out;
}

.modal-content {
  position: relative;
  width: min(520px, 100%);
  max-height: 80vh;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 24px;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(239, 247, 255, 0.95));
  box-shadow: 0 25px 70px rgba(11, 34, 59, 0.28);
  animation: modalRise 0.38s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.modal-glow {
  position: absolute;
  inset: -20% 30% auto auto;
  width: 200px;
  height: 200px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(56, 189, 125, 0.35), rgba(56, 189, 125, 0));
  pointer-events: none;
  animation: pulseGlow 2.8s ease-in-out infinite;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes modalRise {
  from {
    opacity: 0;
    transform: translateY(-20px) scale(0.96);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes pulseGlow {
  0%, 100% { transform: scale(0.9); opacity: 0.7; }
  50% { transform: scale(1.12); opacity: 1; }
}

.modal-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 1.35rem 1.4rem 1rem;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.28), rgba(255, 255, 255, 0));
}

.title-wrap {
  display: flex;
  align-items: center;
  gap: 0.8rem;
}

.header-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.1rem;
  height: 2.1rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #2ec27e, #22c55e);
  color: white;
  font-size: 1.1rem;
  box-shadow: 0 12px 25px rgba(34, 197, 94, 0.3);
  animation: popIn 0.5s ease-out;
}

@keyframes popIn {
  0% { transform: scale(0.6); opacity: 0; }
  60% { transform: scale(1.12); }
  100% { transform: scale(1); opacity: 1; }
}

.modal-header h2 {
  margin: 0;
  font-size: clamp(1.1rem, 2vw, 1.45rem);
  color: #102d4c;
  letter-spacing: -0.02em;
}

.close-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  color: #52657a;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: #eff6ff;
  color: #102d4c;
  transform: rotate(90deg);
}

.modal-body {
  position: relative;
  padding: 1.4rem;
  background: linear-gradient(180deg, rgba(255,255,255,0.15), rgba(247,250,252,0.75));
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.8rem;
  padding: 0.9rem 1.4rem 1.35rem;
  border-top: 1px solid rgba(148, 163, 184, 0.18);
  background: rgba(255, 255, 255, 0.08);
}

@media (max-width: 540px) {
  .modal-header,
  .modal-body,
  .modal-footer {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .modal-footer {
    flex-direction: column-reverse;
  }

  .modal-footer :deep(*) {
    width: 100%;
  }
}
</style>
