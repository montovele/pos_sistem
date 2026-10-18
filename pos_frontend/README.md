# POS System Vue 3

Sistema de Punto de Venta completamente refactorizado a Vue 3 con arquitectura modular, TypeScript y Pinia.

## 🚀 Inicio Rápido

### Requisitos
- Node.js 16+ 
- npm o yarn

### Instalación

```bash
# 1. Clonar/Descargar el proyecto
cd vue3-app

# 2. Instalar dependencias
npm install

# 3. Crear archivo .env (opcional)
cp .env.example .env

# 4. Iniciar servidor de desarrollo
npm run dev
```

El proyecto estará disponible en `http://localhost:5173`

### Build para Producción

```bash
npm run build
```

---

## 📁 Estructura del Proyecto

```
vue3-app/
├── src/
│   ├── components/          # Componentes Vue reutilizables
│   ├── pages/              # Páginas principales
│   ├── services/           # Servicios de API
│   ├── stores/             # Pinia stores
│   ├── composables/        # Lógica reutilizable
│   ├── db/                 # IndexedDB
│   ├── utils/              # Funciones auxiliares
│   ├── types/              # Tipos TypeScript
│   ├── router/             # Vue Router
│   ├── assets/             # Estilos e imágenes
│   ├── main.ts            # Entrada de la app
│   └── App.vue            # Componente raíz
├── index.html             # HTML principal
├── vite.config.ts         # Configuración de Vite
├── tsconfig.json          # Configuración de TypeScript
└── package.json           # Dependencias
```

Ver [ESTRUCTURA.md](./ESTRUCTURA.md) para detalles completos.

---

## 📚 Documentación

- **[ESTRUCTURA.md](./ESTRUCTURA.md)** - Explicación detallada de la estructura del proyecto
- **[GUIA_REFACTORIZACION.md](./GUIA_REFACTORIZACION.md)** - Guía de cómo migrar jQuery → Vue 3

---

## 🏗️ Arquitectura

### Flujo de Datos

```
Componente Vue
    ↓
Composable / Store (Pinia)
    ↓
Servicio (Service)
    ↓
HTTP Client (Axios)
    ↓
Backend API
```

### Stack Tecnológico

- **Frontend**: Vue 3 (Composition API)
- **Estado Global**: Pinia
- **Routing**: Vue Router 4
- **HTTP Client**: Axios
- **Tipado**: TypeScript
- **Build Tool**: Vite
- **Estilos**: CSS personalizado (sin framework)
- **BD Local**: IndexedDB

---

## 🔐 Autenticación

El sistema utiliza JWT para autenticación:

```typescript
// Login automático
const authStore = useAuthStore()
await authStore.login(username, password)

// El token se persiste en localStorage
// Los requests incluyen: Authorization: Bearer {token}

// Logout
await authStore.logout()
```

---

## 🛒 Funcionalidades Principales

### 1. Sistema de Login
- Autenticación con usuario/contraseña
- Persistencia de sesión
- Guards de rutas

### 2. Catálogo de Productos
- Búsqueda por código
- Búsqueda por nombre
- Filtrado por categoría

### 3. Carrito de Compras
- Agregar/eliminar productos
- Modificar cantidades
- Cálculo automático de totales y IVA
- Persistencia local

### 4. Transacciones
- Crear transacciones
- Confirmar compras
- Historial de transacciones

### 5. Reportes
- Reportes por fechas
- Estadísticas de ventas
- Exportación de datos

---

## 🔄 Sincronización Offline/Online

El sistema utiliza IndexedDB para mantener datos locales:

```typescript
// Cargar datos locales
const { dbManager } = useIndexedDB()
const items = await dbManager.getAllItems('cartItems')

// Sincronizar con servidor
await syncService.syncTransactions(items)

// Datos persisten incluso sin conexión
```

---

## 🧪 Testing

### Tests Unitarios (Vitest)
```bash
npm run test
```

### Tests E2E (Playwright)
```bash
npm run test:e2e
```

---

## 📋 Scripts Disponibles

```bash
# Desarrollo
npm run dev          # Inicia servidor de desarrollo

# Build
npm run build        # Compila para producción

# Preview
npm run preview      # Vista previa del build

# Linting
npm run lint         # Ejecuta ESLint

# Type Check
npm run type-check   # Verifica tipos TypeScript
```

---

## 🔗 Integración Backend

### URL Base
Por defecto usa `/api` como prefijo. Configurar en `vite.config.ts`:

```typescript
proxy: {
  '/api': {
    target: 'http://backend.local:8000',
    changeOrigin: true,
    rewrite: (path) => path.replace(/^\/api/, '')
  }
}
```

### Endpoints Esperados

```
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
GET    /api/auth/verify

GET    /api/products
GET    /api/products/:id
GET    /api/products/search

POST   /api/transactions
GET    /api/transactions/history
POST   /api/transactions/:id/confirm
POST   /api/transactions/:id/cancel
```

---

## 📦 Dependencias Principales

```json
{
  "vue": "^3.3.4",
  "vue-router": "^4.2.4",
  "pinia": "^2.1.6",
  "axios": "^1.4.0",
  "typescript": "^5.1.6"
}
```

---

## 🎨 Componentes Disponibles

### Common Components

```vue
<Button label="Click me" variant="primary" @click="handleClick" />
<Input v-model="username" label="Usuario" />
<Card title="Mi Tarjeta">Contenido</Card>
<Modal :is-open="showModal" @close="closeModal" />
<DataTable :columns="columns" :rows="data" />
<Alert type="success" message="¡Éxito!" />
```

---

## 🚀 Crear Nueva Funcionalidad

1. **Crear tipo** en `src/types/index.ts`
2. **Crear servicio** en `src/services/`
3. **Crear store** en `src/stores/`
4. **Crear componentes** en `src/components/`
5. **Crear página** en `src/pages/`
6. **Agregar ruta** en `src/router/index.ts`

Ejemplo:

```typescript
// 1. Tipo
export interface MyFeature {
  id: number
  name: string
}

// 2. Servicio
class MyService {
  async getFeatures() { /* ... */ }
}

// 3. Store
export const useMyStore = defineStore('my-feature', () => {
  const items = ref<MyFeature[]>([])
  const loadItems = async () => {
    items.value = await myService.getFeatures()
  }
  return { items, loadItems }
})

// 4. Componente
// src/components/MyFeature.vue

// 5. Página
// src/pages/MyFeaturePage.vue

// 6. Ruta
{
  path: '/my-feature',
  component: () => import('@/pages/MyFeaturePage.vue')
}
```

---

## 🐛 Debugging

### Vue DevTools
Instalar extensión de Chrome/Firefox para debugging visual

### Axios Logging
Los requests/responses se loguean en la consola automáticamente

### Pinia DevTools
Inspecciona el estado global en tiempo real

---

## 📱 Responsive Design

El proyecto está optimizado para:
- Desktop (1024px+)
- Tablet (768px - 1024px)
- Mobile (< 768px)

---

## 🔒 Seguridad

- Tokens JWT para autenticación
- CORS configurado en backend
- Headers de seguridad en Axios interceptors
- Validación de tipos con TypeScript

---

## 📝 Changelog

Ver [CHANGELOG.md](./CHANGELOG.md) para cambios recientes

---

## 🤝 Contribuir

Para agregar nuevas funcionalidades:

1. Crear branch: `git checkout -b feature/mi-funcionalidad`
2. Hacer cambios siguiendo la estructura modular
3. Escribir tests
4. Crear pull request

---

## 📞 Soporte

Para preguntas o problemas:
- Ver [GUIA_REFACTORIZACION.md](./GUIA_REFACTORIZACION.md)
- Ver [ESTRUCTURA.md](./ESTRUCTURA.md)
- Revisar ejemplos en `src/pages/`

---

## 📄 Licencia

Propietario - Todos los derechos reservados 2026

---

## 🎯 Próximas Funcionalidades

- [ ] Componentes específicos del POS (ProductCatalog, ShoppingCart)
- [ ] Composables avanzados (useProductSearch, useReports)
- [ ] Integración con Web Workers para sincronización
- [ ] Service Workers para offline completo
- [ ] Temas oscuro/claro
- [ ] Internacionalización (i18n)
- [ ] Dark mode
- [ ] Análiticas

---

**Última actualización:** Agosto 2026
