# 📝 EJEMPLOS - FASE 2: Componentes POS Avanzados

## 🎯 Resumen de Fase 2

Has completado exitosamente la **Fase 2 de refactorización Vue 3**, que incluye:

✅ **ProductCatalog.vue** - Catálogo profesional de productos  
✅ **CartItem.vue** - Items individuales del carrito  
✅ **PaymentForm.vue** - Formulario de pago completo  
✅ **useProductSearch.ts** - Composable para búsqueda avanzada  
✅ **useLocalCart.ts** - Composable para persistencia offline  
✅ **PosPage.vue actualizado** - Integración completa  

---

## 📦 COMPONENTES CREADOS

### 1. ProductCatalog.vue

**Ubicación:** `src/components/pos/ProductCatalog.vue`

**Características:**
- Búsqueda por código, nombre o ambos
- Filtrado por categoría
- Debounce automático (300ms)
- Grid responsivo
- Stock indicators
- Agregar al carrito directo

**Props:** Ninguna (usa el composable internamente)

**Eventos:**
```typescript
emit('select', product)    // Cuando se selecciona un producto
emit('add', product)       // Cuando se agrega al carrito
```

**Ejemplo de uso:**
```vue
<template>
  <ProductCatalog
    @select="handleSelect"
    @add="handleAdd"
  />
</template>

<script setup lang="ts">
import ProductCatalog from '@/components/pos/ProductCatalog.vue'
import type { Product } from '@/types'

const handleSelect = (product: Product) => {
  console.log('Producto seleccionado:', product.nombreProd)
}

const handleAdd = (product: Product) => {
  console.log('Agregado al carrito:', product.nombreProd)
}
</script>
```

**Métodos internos:**
- `handleSearch()` - Realiza búsqueda con debounce
- `handleClearSearch()` - Limpia la búsqueda
- `selectProduct()` - Emite evento select
- `addToCart()` - Agrega producto al carrito

**Validaciones:**
- Solo permite agregar productos con stock > 0
- Muestra indicadores de stock bajo (< 10)
- Formatea precios automáticamente

---

### 2. CartItem.vue

**Ubicación:** `src/components/pos/CartItem.vue`

**Características:**
- Controles de cantidad (+/-)
- Precios unitario y total
- Indicador de stock disponible
- Botón eliminar
- Actualización automática

**Props:**
```typescript
item: CartItem  // Requerido: el item del carrito
```

**Eventos:**
```typescript
emit('remove', itemId)              // Cuando se elimina item
emit('update', itemId, quantity)    // Cuando cambia cantidad
```

**Ejemplo de uso:**
```vue
<template>
  <CartItem
    v-for="item in cartItems"
    :key="item.id"
    :item="item"
    @remove="handleRemove"
    @update="handleUpdate"
  />
</template>

<script setup lang="ts">
import CartItem from '@/components/pos/CartItem.vue'

const cartItems = ref([
  {
    id: '1',
    product: { nombreProd: 'Producto 1', price: 100 },
    quantity: 2,
    priceTot: 200
  }
])

const handleRemove = (itemId: string) => {
  cartItems.value = cartItems.value.filter(i => i.id !== itemId)
}

const handleUpdate = (itemId: string, quantity: number) => {
  const item = cartItems.value.find(i => i.id === itemId)
  if (item) item.quantity = quantity
}
</script>
```

**Métodos internos:**
- `handleQuantityChange()` - Valida y actualiza cantidad
- `increaseQuantity()` - Incrementa cantidad
- `decreaseQuantity()` - Decrementa cantidad
- `handleRemove()` - Emite evento de eliminación

---

### 3. PaymentForm.vue

**Ubicación:** `src/components/pos/PaymentForm.vue`

**Características:**
- 4 métodos de pago (efectivo, tarjeta, cheque, transferencia)
- Formulario dinámico según método
- Validación de datos
- Procesamiento simulado
- Modal de éxito

**Props:**
```typescript
total: number
subtotal: number
tax: number
items: CartItem[]
```

**Eventos:**
```typescript
emit('success', transactionCode)  // Pago exitoso
emit('cancel')                    // Canceló pago
```

**Ejemplo de uso:**
```vue
<template>
  <PaymentForm
    v-if="showPayment"
    :total="100"
    :subtotal="86"
    :tax="14"
    :items="cartItems"
    @success="handleSuccess"
    @cancel="handleCancel"
  />
</template>

<script setup lang="ts">
import PaymentForm from '@/components/pos/PaymentForm.vue'

const showPayment = ref(false)

const handleSuccess = (code: string) => {
  console.log('Pago exitoso:', code)
  showPayment.value = false
}

const handleCancel = () => {
  showPayment.value = false
}
</script>
```

**Métodos de pago soportados:**
- **Efectivo (cash)** - Sin validación adicional
- **Tarjeta (card)** - Requiere número, vencimiento, CVV
- **Cheque (cheque)** - Requiere número y banco
- **Transferencia (transfer)** - Genera código de referencia

**Validaciones:**
- Número de tarjeta: 16 dígitos
- Vencimiento: MM/YY
- CVV: 3 dígitos
- Cheque: número y banco requeridos

---

## 🪝 COMPOSABLES CREADOS

### 1. useProductSearch.ts

**Ubicación:** `src/composables/useProductSearch.ts`

**Características:**
- Búsqueda con debounce
- Filtrado local
- Filtrado por categoría
- Búsqueda por código o nombre

**Retorna:**
```typescript
{
  searchQuery: Ref<string>           // Texto de búsqueda actual
  searchType: Ref<'code'|'name'|'all'>
  selectedCategory: Ref<number|null>
  filteredProducts: Computed<Product[]>
  search(query: string): void
  searchByCode(code: string): Promise<Product|null>
  searchByCategory(categoryId: number): Promise
  clearSearch(): void
  isLoading: Computed<boolean>
  error: Computed<string|null>
}
```

**Ejemplo de uso:**
```typescript
<script setup lang="ts">
import { useProductSearch } from '@/composables/useProductSearch'

const { 
  searchQuery, 
  filteredProducts, 
  search,
  clearSearch 
} = useProductSearch()

const handleSearch = (e: Event) => {
  const query = (e.target as HTMLInputElement).value
  search(query)  // Búsqueda automática con debounce
}

// Usar productos filtrados
console.log(filteredProducts.value)
</script>
```

**Características internas:**
- Debounce de 300ms
- Búsqueda local en el array (antes de server)
- Integración con productStore
- Manejo automático de errores

---

### 2. useLocalCart.ts

**Ubicación:** `src/composables/useLocalCart.ts`

**Características:**
- Persistencia en IndexedDB
- Sincronización offline/online
- Tracking de cambios
- Estados de sincronización

**Retorna:**
```typescript
{
  // Estado
  isSynced: Ref<boolean>
  syncError: Ref<string|null>
  pendingChanges: Ref<number>
  hasChanges: Computed<boolean>
  syncStatus: Computed<string>
  
  // Métodos
  loadFromLocal(): Promise<void>
  saveToLocal(): Promise<void>
  syncWithServer(endpoint: string): Promise<void>
  addItemAndTrack(product, quantity): Promise<void>
  updateItemAndTrack(itemId, quantity): Promise<void>
  removeItemAndTrack(itemId): Promise<void>
  clearAndSync(): Promise<void>
  
  // Computed
  cartItems: Computed<CartItem[]>
  cartTotal: Computed<number>
}
```

**Ejemplo de uso:**
```typescript
<script setup lang="ts">
import { useLocalCart } from '@/composables/useLocalCart'

const {
  loadFromLocal,
  saveToLocal,
  syncWithServer,
  cartItems,
  syncStatus,
  isSynced
} = useLocalCart()

// En mount
onMounted(async () => {
  await loadFromLocal()  // Restaurar carrito guardado
})

// Cuando se agrega item
const addProductToCart = async (product, qty) => {
  // Esto actualiza el store y guarda en IndexedDB
  await addItemAndTrack(product, qty)
}

// Sincronizar cuando se recupera conexión
const syncOnOnline = async () => {
  if (!isSynced.value) {
    await syncWithServer('/api/sync-cart')
  }
}

// Mostrar estado
console.log(syncStatus.value)  // "Sincronizado", "Error...", etc
</script>
```

---

## 🔄 FLUJO DE DATOS EN FASE 2

### Flujo: Agregar Producto al Carrito

```
1. Usuario hace clic en "Agregar" en ProductCatalog
2. ProductCatalog.vue emite evento 'add' con el producto
3. PosPage.vue recibe evento y muestra feedback
4. Internamente, ProductCatalog llamó a cartStore.addItem()
5. CartItem.vue se renderiza con el nuevo item
6. useLocalCart guarda en IndexedDB automáticamente
```

### Flujo: Modificar Cantidad

```
1. Usuario incrementa/decrementa en CartItem.vue
2. CartItem emite evento 'update'
3. cartStore.updateItemQuantity() actualiza cantidad y priceTot
4. CartItem se re-renderiza con nuevos valores
5. useLocalCart persiste cambios en IndexedDB
6. PosPage.vue actualiza totales automáticamente
```

### Flujo: Procesar Pago

```
1. Usuario hace clic en "Pagar"
2. PosPage muestra PaymentForm.vue
3. Usuario selecciona método de pago
4. PaymentForm valida datos
5. Al confirmar:
   - PaymentForm.vue crea transacción en transactionStore
   - Simula procesamiento (1.5s)
   - Emite 'success' con transactionCode
   - PosPage muestra modal de éxito
   - cartStore.clear() limpia carrito
   - cartItems en IndexedDB se vacían
```

---

## 🎨 EJEMPLO COMPLETO: Mini POS

Aquí está el flujo completo de cómo interactúan todos los componentes:

```vue
<template>
  <div class="mini-pos">
    <!-- 1. Catálogo de productos -->
    <div class="catalog-section">
      <ProductCatalog
        @select="onProductSelect"
        @add="onProductAdd"
      />
    </div>

    <!-- 2. Carrito de compras -->
    <div class="cart-section">
      <h3>Mi Carrito ({{ cartItems.length }} items)</h3>
      
      <CartItem
        v-for="item in cartItems"
        :key="item.id"
        :item="item"
        @remove="onRemoveItem"
        @update="onUpdateItem"
      />
      
      <div class="cart-totals">
        <p>Total: ${{ formatCurrency(total) }}</p>
      </div>

      <!-- 3. Pago -->
      <PaymentForm
        v-if="showPayment"
        :total="total"
        :subtotal="subtotal"
        :tax="tax"
        :items="cartItems"
        @success="onPaymentSuccess"
        @cancel="showPayment = false"
      />
      <button v-else @click="showPayment = true">Pagar</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import ProductCatalog from '@/components/pos/ProductCatalog.vue'
import CartItem from '@/components/pos/CartItem.vue'
import PaymentForm from '@/components/pos/PaymentForm.vue'
import { useCartStore } from '@/stores/cartStore'
import { useLocalCart } from '@/composables/useLocalCart'
import { formatCurrency } from '@/utils/helpers'

const cartStore = useCartStore()
const { loadFromLocal } = useLocalCart()
const showPayment = ref(false)

const cartItems = computed(() => cartStore.items)
const total = computed(() => cartStore.total)
const subtotal = computed(() => cartStore.subtotal)
const tax = computed(() => cartStore.tax)

// Handlers
const onProductSelect = (product) => {
  console.log('Seleccionado:', product.nombreProd)
}

const onProductAdd = (product) => {
  console.log('Agregado:', product.nombreProd)
}

const onRemoveItem = (itemId) => {
  // Ya se removió del store automáticamente
  console.log('Removido item:', itemId)
}

const onUpdateItem = (itemId, qty) => {
  console.log('Actualizado item:', itemId, 'nueva cantidad:', qty)
}

const onPaymentSuccess = (code) => {
  console.log('Pago exitoso! Código:', code)
  showPayment.value = false
}

// Load saved cart on mount
onMounted(() => {
  loadFromLocal()
})
</script>
```

---

## 💡 MEJORES PRÁCTICAS

### 1. Usar ProductCatalog correctamente

```vue
<!-- ✅ CORRECTO: Usar en PosPage o vista principal -->
<ProductCatalog @select="handleSelect" @add="handleAdd" />

<!-- ❌ EVITAR: Pasar todos los props manualmente -->
<ProductCatalog 
  :products="products"
  :search="search"
  @select="handleSelect"
/>
<!-- El composable maneja esto automáticamente -->
```

### 2. CartItem debe estar dentro de un v-for

```vue
<!-- ✅ CORRECTO: Iterar items del carrito -->
<CartItem
  v-for="item in cartStore.items"
  :key="item.id"
  :item="item"
/>

<!-- ❌ EVITAR: Usar CartItem sin v-for -->
<CartItem :item="singleItem" />  <!-- No es su propósito -->
```

### 3. PaymentForm debe estar condicionado

```vue
<!-- ✅ CORRECTO: Mostrar solo cuando hay items -->
<PaymentForm
  v-if="cartStore.items.length > 0"
  :total="cartStore.total"
  :subtotal="cartStore.subtotal"
  :tax="cartStore.tax"
  :items="cartStore.items"
/>

<!-- ❌ EVITAR: Mostrar sin validar carrito -->
<PaymentForm v-if="true" />  <!-- Roto si no hay items -->
```

### 4. useLocalCart debe cargarse en mount

```typescript
// ✅ CORRECTO: Cargar carrito guardado
onMounted(async () => {
  await loadFromLocal()
})

// ❌ EVITAR: Olvidar cargar
// Los cambios no se persisten
```

---

## 🧪 PRUEBAS MANUALES

### Test 1: Búsqueda de Productos
1. Abre la página POS
2. Escribe un código de producto en el buscador
3. Verifica que se filtre en tiempo real
4. Cambia a búsqueda por nombre
5. Verifica que funciona correctamente

### Test 2: Agregar Productos
1. Haz clic en "Agregar" en un producto
2. Verifica que aparece en el carrito
3. Agrega el mismo producto otra vez
4. Verifica que incrementa cantidad
5. Revisa los totales

### Test 3: Modificar Cantidad
1. Incrementa cantidad con botón +
2. Verifica que se actualiza priceTot
3. Decrementa con botón -
4. Digita cantidad en el input
5. Verifica que se guarda

### Test 4: Eliminar Items
1. Haz clic en el botón X de un item
2. Verifica que se elimina del carrito
3. Revisa que los totales se actualizan
4. Intenta eliminar último item
5. Verifica que carrito está vacío

### Test 5: Procesar Pago
1. Agrega 3 productos
2. Haz clic en "Pagar"
3. Selecciona método de pago
4. Completa datos según el método
5. Haz clic en "Confirmar Pago"
6. Verifica que se muestre modal de éxito
7. Verifica que carrito se limpie

### Test 6: Persistencia Offline
1. Agrega productos al carrito
2. Abre DevTools → Application → IndexedDB
3. Verifica que hay datos en "cartItems" store
4. Recarga la página
5. Verifica que carrito se restaura
6. Cambia productos
7. Cierra navegador sin confirmar
8. Reabre y verifica que datos se mantienen

---

## 📊 ESTADÍSTICAS DE FASE 2

| Componente | Líneas | Características |
|-----------|--------|-----------------|
| ProductCatalog.vue | 280 | Búsqueda, filtrado, grid |
| CartItem.vue | 200 | Cantidad, precios, eliminar |
| PaymentForm.vue | 350 | 4 métodos, validación, éxito |
| useProductSearch.ts | 85 | Debounce, filtrado local |
| useLocalCart.ts | 120 | Persistencia, sincronización |
| **TOTAL** | **1035** | **Componentes completos** |

---

## 🚀 PRÓXIMOS PASOS (Fase 3)

Después de validar que Fase 2 funciona correctamente, puedes:

1. **Crear useReports** - Para análisis y reportes
2. **Crear useOfflineSync** - Para sincronización automática
3. **Agregar EmpleadosPage** - Gestión de usuarios
4. **Agregar CajaPage** - Arqueo de caja
5. **Crear tests unitarios** - Validar componentes

---

## 📖 RECURSOS

- [PosPage.vue actualizada](src/pages/PosPage.vue) - Integración completa
- [ProductCatalog.vue](src/components/pos/ProductCatalog.vue) - Componente catálogo
- [CartItem.vue](src/components/pos/CartItem.vue) - Componente item
- [PaymentForm.vue](src/components/pos/PaymentForm.vue) - Componente pago
- [useProductSearch.ts](src/composables/useProductSearch.ts) - Composable búsqueda
- [useLocalCart.ts](src/composables/useLocalCart.ts) - Composable carrito

---

## ✅ VALIDACIÓN

Antes de continuar a Fase 3, verifica que:

- [ ] ProductCatalog funciona y busca correctamente
- [ ] CartItem actualiza cantidad y precio
- [ ] PaymentForm valida datos según método
- [ ] Carrito se persiste en IndexedDB
- [ ] PosPage muestra todos los componentes
- [ ] No hay errores en console
- [ ] La UI es responsive en móviles

---

**Última actualización:** Agosto 2026  
**Fase:** 2 ✅ COMPLETADA  
**Siguiente:** Fase 3 - Composables Avanzados

🎉 **¡Felicidades! Fase 2 completada exitosamente** 🎉
