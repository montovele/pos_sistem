<template>
  <div class="cart-item">
    <!-- Información del producto -->
    <div class="item-info">
      <div class="item-header">
        <h4 class="item-name">{{ item.product.nombreProd }}</h4>
        <button class="remove-btn" @click="handleRemove" title="Eliminar">✕</button>
      </div>
      <p class="item-code">{{ item.product.codigoProd }}</p>
    </div>

    <!-- Controles -->
    <div class="item-controls">
      <!-- Cantidad -->
      <div class="quantity-control">
        <button
          class="qty-btn"
          @click="decreaseQuantity"
          :disabled="isWeightedItem ? item.quantity <= 0.1 : item.quantity <= 1"
        >
          −
        </button>
        <input
          v-model.number="quantity"
          @input="handleQuantityChange"
          type="number"
          class="qty-input"
          :min="isWeightedItem ? 0.001 : 1"
          :step="isWeightedItem ? 0.001 : 1"
          max="999"
        />
        <button class="qty-btn" @click="increaseQuantity">+</button>
      </div>

      <!-- Precios -->
      <div class="price-info">
        <div class="price-row">
          <span class="label">Unitario:</span>
          <span class="price">{{ formatCurrency(item.product.price) }}</span>
        </div>
        <div class="price-row total">
          <span class="label">Total:</span>
          <span class="price">{{ formatCurrency(item.priceTot) }}</span>
        </div>
      </div>
    </div>

    <!-- Stock info -->
    <div class="stock-info">
      <span class="unit-badge">{{ isWeightedItem ? 'KG' : 'PZA' }}</span>
      <span :class="['stock-badge', { low: item.product.stock < 5 }]">
        {{ isWeightedItem ? 'Precio por kg' : `${item.product.stock} disponibles` }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCartStore } from '@/stores/cartStore'
import { formatCurrency, isWeightedProduct } from '@/utils/helpers'
import type { CartItem } from '@/types'

const props = defineProps<{
  item: CartItem
}>()

const emit = defineEmits<{
  remove: [itemId: string]
  update: [itemId: string, quantity: number]
}>()

const cartStore = useCartStore()
const quantity = ref(props.item.quantity)
const isWeightedItem = computed(() => isWeightedProduct(props.item.product))

// Sincronizar cantidad cuando cambia el prop
watch(
  () => props.item.quantity,
  (newQuantity) => {
    quantity.value = newQuantity
  }
)

// Métodos
const handleQuantityChange = () => {
  if (quantity.value <= 0) {
    quantity.value = isWeightedItem.value ? 0.001 : 1
  }
  if (quantity.value > 999) {
    quantity.value = 999
  }
  
  cartStore.updateItemQuantity(props.item.id, quantity.value)
  emit('update', props.item.id, quantity.value)
}

const increaseQuantity = () => {
  if (quantity.value < 999) {
    const step = isWeightedItem.value ? 0.1 : 1
    quantity.value = Number((quantity.value + step).toFixed(3))
    handleQuantityChange()
  }
}

const decreaseQuantity = () => {
  const step = isWeightedItem.value ? 0.1 : 1
  if (quantity.value > step) {
    quantity.value = Number((quantity.value - step).toFixed(3))
    handleQuantityChange()
  }
}

const handleRemove = () => {
  cartStore.removeItem(props.item.id)
  emit('remove', props.item.id)
}
</script>

<style scoped>
.cart-item {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.35rem 0.6rem;
  padding: 0.55rem 0.65rem;
  background: #fff;
  border: 1px solid #e1eaf2;
  border-radius: 8px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.cart-item:hover {
  border-color: #83b9df;
  box-shadow: 0 3px 10px rgba(23, 55, 88, 0.08);
}

/* Header item */
.item-info {
  min-width: 0;
}

.item-header {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.item-name {
  margin: 0;
  overflow: hidden;
  font-size: 0.78rem;
  font-weight: 700;
  color: #173758;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.remove-btn {
  background: #fff1f0;
  color: #bf4b42;
  border: none;
  border-radius: 4px;
  width: 24px;
  height: 24px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.78rem;
  font-weight: bold;
  transition: all 0.2s ease;
  flex-shrink: 0;
}

.remove-btn:hover {
  background: #ef5350;
  color: white;
}

.item-code {
  margin: 0;
  overflow: hidden;
  font-size: 0.62rem;
  color: #7890a8;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Controles */
.item-controls {
  display: flex;
  grid-column: 1 / -1;
  justify-content: space-between;
  gap: 0.55rem;
  align-items: center;
}

/* Cantidad */
.quantity-control {
  display: flex;
  align-items: center;
  border: 1px solid #e0e0e0;
  border-radius: 5px;
  background: #f5f9fc;
}

.qty-btn {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 1rem;
  color: #1677d2;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.qty-btn:hover:not(:disabled) {
  background: #f0f0f0;
  color: #764ba2;
}

.qty-btn:disabled {
  color: #ccc;
  cursor: not-allowed;
}

.qty-input {
  width: 30px;
  border: none;
  background: transparent;
  text-align: center;
  font-weight: 600;
  font-size: 0.75rem;
  color: #2c3e50;
}

.qty-input:focus {
  outline: none;
}

/* Precios */
.price-info {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  text-align: right;
  flex: 1;
}

.price-row {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  font-size: 0.7rem;
}

.price-row.total {
  padding-top: 0;
  font-weight: 700;
}

.label {
  color: #7890a8;
}

.price {
  color: #173758;
  font-weight: 600;
}

.price-row.total .price {
  color: #0b7a75;
  font-size: 0.78rem;
}

/* Stock info */
.stock-info {
  display: flex;
  grid-column: 1 / -1;
  align-items: center;
  justify-content: flex-end;
  gap: 0.4rem;
}

.unit-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 2.1rem;
  padding: 0.18rem 0.5rem;
  border-radius: 12px;
  background: rgba(22, 119, 210, 0.08);
  color: #1677d2;
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.stock-badge {
  font-size: 0.62rem;
  padding: 0.15rem 0.5rem;
  background: #e8f5e9;
  color: #2e7d32;
  border-radius: 12px;
  font-weight: 500;
}

.stock-badge.low {
  background: #fff3e0;
  color: #e65100;
}

/* Responsive */
@media (max-width: 768px) {
  .item-header {
    gap: 0.35rem;
  }
}
</style>
