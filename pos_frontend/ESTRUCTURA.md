# Estructura de Carpetas del Proyecto Vue 3

## Vista General

```
vue3-app/
├── src/
│   ├── components/          # Componentes Vue reutilizables
│   │   ├── common/         # Componentes base (Button, Input, etc)
│   │   ├── pos/            # Componentes específicos del módulo POS
│   │   ├── reports/        # Componentes de reportes
│   │   └── auth/           # Componentes de autenticación
│   ├── pages/              # Páginas completas
│   │   ├── LoginPage.vue
│   │   ├── HomePage.vue
│   │   ├── PosPage.vue
│   │   ├── ReportsPage.vue
│   │   └── NotFoundPage.vue
│   ├── services/           # Servicios de API y lógica
│   │   ├── http.ts        # Cliente HTTP con Axios
│   │   ├── authService.ts
│   │   ├── productService.ts
│   │   └── transactionService.ts
│   ├── stores/             # Pinia stores (manejo de estado)
│   │   ├── authStore.ts
│   │   ├── productStore.ts
│   │   ├── cartStore.ts
│   │   └── transactionStore.ts
│   ├── composables/        # Composables reutilizables
│   │   └── useForm.ts
│   ├── db/                 # Manejo de IndexedDB
│   │   └── indexedDB.ts
│   ├── utils/              # Funciones auxiliares
│   │   └── helpers.ts
│   ├── types/              # Tipos TypeScript
│   │   └── index.ts
│   ├── router/             # Configuración de Vue Router
│   │   └── index.ts
│   ├── assets/
│   │   ├── css/
│   │   │   └── main.css
│   │   └── images/
│   ├── main.ts            # Entrada principal
│   └── App.vue            # Componente raíz
├── index.html             # Archivo HTML principal
├── vite.config.ts         # Configuración de Vite
├── tsconfig.json          # Configuración de TypeScript
├── tsconfig.node.json
├── package.json           # Dependencias del proyecto
├── .gitignore
└── README.md
```

## Propósito de Cada Carpeta

### `/src/components/common`
Componentes reutilizables que se usan en toda la aplicación:
- `Button.vue` - Botones personalizados
- `Input.vue` - Campos de entrada
- `Card.vue` - Contenedores de tarjetas
- `Modal.vue` - Modales
- `DataTable.vue` - Tablas de datos
- `Alert.vue` - Alertas

### `/src/components/pos`
Componentes específicos del módulo POS (aún por crear)

### `/src/pages`
Páginas completas que representan rutas:
- `LoginPage.vue` - Autenticación
- `HomePage.vue` - Dashboard
- `PosPage.vue` - Sistema de punto de venta
- `ReportsPage.vue` - Reportes

### `/src/services`
Servicios que manejan la lógica de negocio y comunicación con el backend:
- `http.ts` - Cliente HTTP centralizado
- `authService.ts` - Autenticación
- `productService.ts` - Productos
- `transactionService.ts` - Transacciones

### `/src/stores`
Pinia stores para manejo de estado global:
- `authStore.ts` - Datos del usuario
- `productStore.ts` - Catálogo
- `cartStore.ts` - Carrito
- `transactionStore.ts` - Transacciones

### `/src/composables`
Lógica reutilizable para componentes:
- `useForm.ts` - Manejo de formularios
- Futuro: `useAsync.ts`, `usePagination.ts`

### `/src/db`
Manejo de IndexedDB para datos locales:
- `indexedDB.ts` - Manager de base de datos local

### `/src/utils`
Funciones auxiliares:
- `helpers.ts` - Formateo, validación, generación de códigos

### `/src/types`
Definiciones de tipos TypeScript:
- `index.ts` - Interfaces de User, Product, Transaction, etc.

## Patrones de Desarrollo

### 1. Componente Reutilizable
```vue
<!-- Button.vue -->
<template>
  <button :class="['btn', `btn-${variant}`]">
    <slot>{{ label }}</slot>
  </button>
</template>

<script setup lang="ts">
interface Props {
  label?: string
  variant?: 'primary' | 'secondary'
}

withDefaults(defineProps<Props>(), {
  variant: 'primary'
})
</script>
```

### 2. Servicio
```ts
// productService.ts
class ProductService {
  async getProducts(page = 1): Promise<Product[]> {
    const response = await http.get<Product[]>('/products', {
      params: { page }
    })
    return response.data || []
  }
}
```

### 3. Pinia Store
```ts
// productStore.ts
export const useProductStore = defineStore('products', () => {
  const products = ref<Product[]>([])
  
  const loadProducts = async () => {
    products.value = await productService.getProducts()
  }
  
  return { products, loadProducts }
})
```

### 4. Composable
```ts
// useForm.ts
export const useForm = (initialValues) => {
  const values = reactive(initialValues)
  const validate = () => { /* ... */ }
  return { values, validate }
}
```

### 5. Página
```vue
<!-- PosPage.vue -->
<script setup lang="ts">
import { useProductStore } from '@/stores/productStore'

const productStore = useProductStore()
productStore.loadProducts()
</script>
```

## Flujo de Datos

```
Usuario Interactúa
    ↓
Componente Vue
    ↓
Composable / Store (Pinia)
    ↓
Servicio (Service)
    ↓
Cliente HTTP (Axios)
    ↓
Backend PHP/API
    ↓
MySQL
```

## Archivo TypeScript → Base de Datos

```
PosPage.vue (Componente)
    ↓
useCartStore() (Pinia)
    ↓
cartStore.addItem(product)
    ↓
transactionService.createTransaction()
    ↓
http.post('/transactions', data)
    ↓
Backend: /api/transactions (PHP)
    ↓
MySQL: INSERT INTO transactions
```

## Cómo Agregar una Nueva Funcionalidad

1. **Crear tipo**: `src/types/index.ts`
2. **Crear servicio**: `src/services/newService.ts`
3. **Crear store**: `src/stores/newStore.ts`
4. **Crear componentes**: `src/components/newFeature/`
5. **Crear página**: `src/pages/NewPage.vue`
6. **Agregar ruta**: `src/router/index.ts`
7. **Integrar en componentes**: Importar y usar

## Convenciones

- **Componentes**: PascalCase (Button.vue, LoginForm.vue)
- **Variables**: camelCase (userName, productId)
- **Constantes**: UPPER_SNAKE_CASE (API_URL, MAX_ITEMS)
- **Archivos**: snake-case (auth-service.ts) o PascalCase (Button.vue)
- **Rutas**: kebab-case (/pos-page, /reports)
