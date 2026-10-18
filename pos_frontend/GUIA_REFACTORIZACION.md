# GUÍA DE REFACTORIZACIÓN: jQuery → Vue 3

## Introducción

Esta guía muestra cómo migrar el código existente del sistema POS de jQuery a Vue 3 de manera modular y progresiva.

---

## SECCIÓN 1: Patrones de Migración

### Patrón 1: Eliminación de jQuery

#### ❌ ANTES (jQuery)
```javascript
// pos.php / scripts/loadServer.js
function loadServer() {
  var code = $("#test").val();
  
  $.ajax({
    type: "POST",
    url: "ajax/server.php",
    data: { codigo: code },
    success: function(response) {
      console.log(response);
      $("#nuevoProd").html(response);
      $("#test").val("");
    },
    error: function() {
      $("#alerta").html("Error en búsqueda");
    }
  });
}
```

#### ✅ DESPUÉS (Vue 3)
```typescript
// src/composables/useProductSearch.ts
import { ref } from 'vue'
import productService from '@/services/productService'

export const useProductSearch = () => {
  const searchCode = ref('')
  const product = ref(null)
  const error = ref<string | null>(null)
  const isLoading = ref(false)

  const search = async () => {
    if (!searchCode.value.trim()) return

    isLoading.value = true
    error.value = null

    try {
      product.value = await productService.getProductByCode(searchCode.value)
      searchCode.value = ''
    } catch (err: any) {
      error.value = err.message || 'Error en búsqueda'
    } finally {
      isLoading.value = false
    }
  }

  return { searchCode, product, error, isLoading, search }
}
```

```vue
<!-- src/pages/PosPage.vue -->
<template>
  <div>
    <Input
      v-model="searchCode"
      placeholder="Ingresa código del producto"
      @keyup.enter="search"
    />
    
    <Alert v-if="error" type="error" :message="error" />
    
    <div v-if="product" class="product-found">
      <h3>{{ product.nombreProd }}</h3>
      <p>Precio: {{ formatCurrency(product.price) }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useProductSearch } from '@/composables/useProductSearch'
import { formatCurrency } from '@/utils/helpers'

const { searchCode, product, error, search } = useProductSearch()
</script>
```

---

### Patrón 2: IndexedDB → Composable

#### ❌ ANTES (IndexedDB Manual)
```javascript
// scripts/sendToServer.js
function sentToServe() {
  var openRequest = window.indexedDB.open("asistencia");
  
  openRequest.onsuccess = function (event) {
    const active = openRequest.result;
    const data = active.transaction(["tempcar"], "readwrite");
    const almacen = data.objectStore("tempcar");
    
    var elementos = [];
    almacen.openCursor().onsuccess = function (e) {
      const result = e.target.result;
      if (result === null) return;
      elementos.push(result.value);
      result.continue();
    };
    
    // Procesar elementos...
  };
}
```

#### ✅ DESPUÉS (Vue 3 Composable)
```typescript
// src/composables/useLocalCart.ts
import { ref, reactive } from 'vue'
import { useIndexedDB } from '@/db/indexedDB'

export const useLocalCart = () => {
  const { dbManager } = useIndexedDB()
  const cartItems = ref([])
  const isLoading = ref(false)

  const loadCart = async () => {
    isLoading.value = true
    try {
      cartItems.value = await dbManager.getAllItems('cartItems')
    } finally {
      isLoading.value = false
    }
  }

  const addToCart = async (item: CartItem) => {
    await dbManager.addItem('cartItems', item)
    await loadCart()
  }

  const clearCart = async () => {
    await dbManager.clearStore('cartItems')
    cartItems.value = []
  }

  const syncWithServer = async () => {
    if (cartItems.value.length === 0) return

    try {
      const response = await transactionService.createTransaction(
        cartItems.value,
        getTotalPrice()
      )
      await clearCart()
      return response
    } catch (error) {
      console.error('Sync failed:', error)
      throw error
    }
  }

  return {
    cartItems,
    isLoading,
    loadCart,
    addToCart,
    clearCart,
    syncWithServer
  }
}
```

---

### Patrón 3: AJAX con Promises → Servicios Axios

#### ❌ ANTES (Callbacks)
```javascript
// ajax/sendToServer.js
function sincronizarInformacion(array) {
  $.ajax({
    type: "POST",
    url: "ajax/sendToServerV2.php",
    data: { datos: JSON.stringify(array) },
    dataType: "json",
    success: function(response) {
      if (response.success) {
        console.log("Sincronizado");
        clearInterval(intervalo);
      }
    },
    error: function() {
      console.log("Error de sincronización");
    }
  });
}
```

#### ✅ DESPUÉS (Async/Await)
```typescript
// src/services/syncService.ts
import http from './http'
import type { CartItem } from '@/types'

class SyncService {
  async syncTransactions(items: CartItem[]): Promise<any> {
    try {
      const response = await http.post('/sync/transactions', {
        datos: JSON.stringify(items),
        timestamp: Date.now()
      })
      
      if (response.success) {
        console.log('Transacciones sincronizadas')
        return response.data
      }
    } catch (error) {
      console.error('Error de sincronización:', error)
      throw error
    }
  }

  async retrySync(items: CartItem[], maxAttempts = 3): Promise<any> {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.syncTransactions(items)
      } catch (error) {
        if (attempt === maxAttempts) throw error
        // Esperar antes de reintentar
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
      }
    }
  }
}

export default new SyncService()
```

---

## SECCIÓN 2: Componentes Específicos del POS

### Componente: Carrito de Compras

#### ❌ ANTES (jQuery)
```html
<!-- pos.php -->
<div id="productos">
  <!-- Generado dinámicamente por jQuery -->
</div>

<div id="elementos">
  <!-- Carrito mostrado aquí -->
</div>
```

```javascript
// scripts/loadAll.js
function loadAll() {
  $.ajax({
    type: "POST",
    url: "ajax/server.php",
    success: function(html) {
      $("#nuevoProd").html(html);
    }
  });
}
```

#### ✅ DESPUÉS (Vue 3 Modular)
```vue
<!-- src/components/pos/ProductCatalog.vue -->
<template>
  <Card title="Catálogo de Productos">
    <div class="search-bar">
      <Input
        v-model="searchQuery"
        placeholder="Buscar por código..."
        @input="handleSearch"
      />
    </div>

    <div v-if="isLoading" class="loading">Cargando...</div>

    <div v-else class="products-grid">
      <div
        v-for="product in products"
        :key="product.id"
        class="product-card"
        @click="addToCart(product)"
      >
        <img v-if="product.image" :src="product.image" :alt="product.nombreProd" />
        <div class="product-info">
          <h4>{{ product.nombreProd }}</h4>
          <p class="code">{{ product.codigoProd }}</p>
          <p class="price">{{ formatCurrency(product.price) }}</p>
        </div>
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useProductStore } from '@/stores/productStore'
import { useCartStore } from '@/stores/cartStore'
import { formatCurrency } from '@/utils/helpers'
import Card from '@/components/common/Card.vue'
import Input from '@/components/common/Input.vue'

const productStore = useProductStore()
const cartStore = useCartStore()
const searchQuery = ref('')

const products = computed(() => productStore.products)
const isLoading = computed(() => productStore.isLoading)

const handleSearch = async () => {
  if (searchQuery.value) {
    await productStore.searchProducts(searchQuery.value)
  } else {
    await productStore.loadProducts()
  }
}

const addToCart = (product) => {
  cartStore.addItem(product, 1)
}

// Cargar productos al montar el componente
productStore.loadProducts()
</script>

<style scoped>
.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 1rem;
}

.product-card {
  background: #f9f9f9;
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1rem;
  cursor: pointer;
  transition: all 0.3s;
}

.product-card:hover {
  border-color: #42b983;
  transform: translateY(-4px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
}

.product-info h4 {
  margin: 0.5rem 0 0 0;
  font-size: 0.95rem;
}

.code {
  font-size: 0.85rem;
  color: #999;
}

.price {
  color: #42b983;
  font-weight: bold;
  font-size: 1.125rem;
}
</style>
```

```vue
<!-- src/components/pos/ShoppingCart.vue -->
<template>
  <Card title="Carrito de Compras">
    <Alert
      v-if="!cartStore.items.length"
      type="info"
      message="El carrito está vacío"
    />

    <div v-else class="cart-wrapper">
      <div class="cart-items">
        <CartItem
          v-for="item in cartStore.items"
          :key="item.id"
          :item="item"
          @remove="cartStore.removeItem(item.id)"
          @update-quantity="updateQuantity"
        />
      </div>

      <div class="cart-summary">
        <div class="summary-row">
          <span>Subtotal:</span>
          <span>{{ formatCurrency(cartStore.subtotal) }}</span>
        </div>
        <div class="summary-row">
          <span>IVA (16%):</span>
          <span>{{ formatCurrency(cartStore.tax) }}</span>
        </div>
        <div class="summary-row total">
          <span>Total:</span>
          <span>{{ formatCurrency(cartStore.total) }}</span>
        </div>
      </div>

      <div class="cart-actions">
        <Button
          label="Limpiar"
          variant="secondary"
          @click="cartStore.clear"
        />
        <Button
          label="Procesar Pago"
          variant="primary"
          @click="processCheckout"
        />
      </div>
    </div>
  </Card>
</template>

<script setup lang="ts">
import { useCartStore } from '@/stores/cartStore'
import { useTransactionStore } from '@/stores/transactionStore'
import { formatCurrency } from '@/utils/helpers'

const cartStore = useCartStore()
const transactionStore = useTransactionStore()

const updateQuantity = (itemId: string, quantity: number) => {
  cartStore.updateItemQuantity(itemId, quantity)
}

const processCheckout = async () => {
  try {
    await transactionStore.createTransaction(
      cartStore.items,
      cartStore.total
    )
    cartStore.clear()
    alert('¡Pago procesado exitosamente!')
  } catch (error) {
    alert('Error al procesar el pago')
  }
}
</script>
```

---

## SECCIÓN 3: Autenticación y Sesión

#### ❌ ANTES (jQuery + localStorage)
```javascript
// scripts/login.js
function validarLogin() {
  var username = $("#username").val();
  var password = $("#password").val();

  $.ajax({
    url: "login_pos.php",
    type: "POST",
    data: { usuario: username, contrasena: password },
    success: function(response) {
      if (response.success) {
        localStorage.setItem("user", JSON.stringify(response.user));
        localStorage.setItem("token", response.token);
        window.location.href = "pos.php";
      }
    }
  });
}
```

#### ✅ DESPUÉS (Vue 3 + Pinia)
```vue
<!-- src/pages/LoginPage.vue -->
<template>
  <div class="login-container">
    <Card title="Iniciar Sesión">
      <Alert v-if="error" type="error" :message="error" />

      <form @submit.prevent="handleLogin">
        <Input
          v-model="username"
          label="Usuario"
          type="text"
          required
        />

        <Input
          v-model="password"
          label="Contraseña"
          type="password"
          required
        />

        <Button
          label="Iniciar Sesión"
          type="submit"
          :is-loading="isLoading"
        />
      </form>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/authStore'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')
const isLoading = ref(false)
const error = ref<string | null>(null)

const handleLogin = async () => {
  isLoading.value = true
  error.value = null

  try {
    const success = await authStore.login(username.value, password.value)
    if (success) {
      router.push('/')
    } else {
      error.value = 'Credenciales inválidas'
    }
  } catch (err: any) {
    error.value = err.message
  } finally {
    isLoading.value = false
  }
}
</script>
```

---

## SECCIÓN 4: Manejo de Reportes

#### ❌ ANTES (jQuery + PHP)
```javascript
// scripts/generarReporte.js
function generarReporte() {
  var fechaInicial = $("#datepicker1").val();
  var fechaFinal = $("#datepicker2").val();

  $.ajax({
    type: "POST",
    url: "reporte.php",
    data: {
      fechaInicial: fechaInicial,
      fechaFinal: fechaFinal
    },
    success: function(html) {
      $("#reporteContainer").html(html);
    }
  });
}
```

#### ✅ DESPUÉS (Vue 3 Composable)
```typescript
// src/composables/useReports.ts
import { ref, reactive } from 'vue'
import transactionService from '@/services/transactionService'
import type { ReportData, Transaction } from '@/types'

export const useReports = () => {
  const reportData = ref<ReportData | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const filters = reactive({
    startDate: '',
    endDate: ''
  })

  const generateReport = async () => {
    if (!filters.startDate || !filters.endDate) {
      error.value = 'Selecciona ambas fechas'
      return
    }

    isLoading.value = true
    error.value = null

    try {
      const transactions = await transactionService.getTransactionHistory(
        filters.startDate,
        filters.endDate
      )

      // Calcular estadísticas
      const totalSales = transactions.reduce((sum, t) => sum + t.total, 0)
      const totalItems = transactions.reduce((sum, t) => {
        return sum + t.items.reduce((s, i) => s + i.quantity, 0)
      }, 0)

      reportData.value = {
        totalSales,
        totalItems,
        transactions,
        averageTicket: totalSales / transactions.length,
        topProducts: [],
        timestamp: Date.now()
      }
    } catch (err: any) {
      error.value = err.message
    } finally {
      isLoading.value = false
    }
  }

  return {
    reportData,
    isLoading,
    error,
    filters,
    generateReport
  }
}
```

---

## SECCIÓN 5: Migración Paso a Paso

### Orden Recomendado de Migración

1. **Servicios HTTP** (Sin UI)
   - Crear `http.ts` ✓
   - Crear `authService.ts` ✓
   - Crear `productService.ts` ✓
   - Crear `transactionService.ts` ✓

2. **Stores Pinia** (Sin UI)
   - Crear `authStore.ts` ✓
   - Crear `productStore.ts` ✓
   - Crear `cartStore.ts` ✓
   - Crear `transactionStore.ts` ✓

3. **Componentes Base** (Reutilizables)
   - Crear `Button.vue` ✓
   - Crear `Input.vue` ✓
   - Crear `Card.vue` ✓
   - Crear `Modal.vue` ✓
   - Crear `Alert.vue` ✓

4. **Páginas Principales**
   - `LoginPage.vue` (Más simple) ✓
   - `HomePage.vue` (Dashboard) ✓
   - `PosPage.vue` (Más complejo) ✓
   - `ReportsPage.vue` (Datos) ✓

5. **Componentes Específicos del POS** (Aún por crear)
   - `ProductCatalog.vue`
   - `ShoppingCart.vue`
   - `CartItem.vue`
   - `PaymentForm.vue`

6. **Composables Avanzados** (Lógica reutilizable)
   - `useProductSearch.ts`
   - `useLocalCart.ts`
   - `useReports.ts`

---

## SECCIÓN 6: Checklist de Migración

### Por Cada Funcionalidad:

- [ ] Crear tipos TypeScript en `src/types/`
- [ ] Crear servicio en `src/services/`
- [ ] Crear store Pinia en `src/stores/`
- [ ] Crear composables en `src/composables/` (si aplica)
- [ ] Crear componentes en `src/components/`
- [ ] Crear o actualizar página en `src/pages/`
- [ ] Agregar ruta en `src/router/index.ts`
- [ ] Escribir tests unitarios
- [ ] Escribir E2E tests
- [ ] Validar con navegador
- [ ] Sincronizar con IndexedDB (si aplica)

### Por Cada Migración Completada:

- [ ] Eliminar archivo jQuery antiguo
- [ ] Actualizar referencias en HTML
- [ ] Validar en navegador
- [ ] Probar offline
- [ ] Probar sincronización

---

## SECCIÓN 7: Troubleshooting Común

### Problema: Los datos no se sincronizan
**Solución**: Verificar que el store está usando `persistedState` correctamente
```typescript
export const useCartStore = defineStore('cart', () => {
  // Implementar persistencia
}, {
  persist: true // Agregar si usas pinia-plugin-persistedstate
})
```

### Problema: CORS error
**Solución**: Configurar proxy en `vite.config.ts`
```typescript
proxy: {
  '/api': {
    target: 'http://localhost:8000',
    changeOrigin: true
  }
}
```

### Problema: Navegación no funciona
**Solución**: Asegurar que el router está configurado en `main.ts`
```typescript
app.use(router)
```

---

## REFERENCIAS

- [Vue 3 Docs](https://vuejs.org)
- [Pinia Docs](https://pinia.vuejs.org)
- [Vue Router](https://router.vuejs.org)
- [Axios Docs](https://axios-http.com)
- [TypeScript Handbook](https://www.typescriptlang.org/docs)
