# INSTALACIÓN Y CONFIGURACIÓN

## 1️⃣ Requisitos Previos

- **Node.js**: v16 o superior
- **npm**: v8 o superior (o yarn)
- **Git**: para control de versiones
- **VS Code** (recomendado)

Verificar versiones:
```bash
node --version      # v16+
npm --version       # v8+
git --version       # 2.0+
```

---

## 2️⃣ Clonar el Proyecto

```bash
# Si aún no lo has hecho
cd c:\Users\ssaxx\OneDrive\Documents\pos

# El proyecto está en vue3-app/
cd vue3-app
```

---

## 3️⃣ Instalar Dependencias

```bash
# Instalar todas las dependencias
npm install

# Alternativa con yarn
yarn install
```

**Tiempo estimado**: 2-5 minutos según conexión

---

## 4️⃣ Configuración del Ambiente

### Crear archivo `.env`

```bash
# Copiar el template
cp .env.example .env
```

### Editar `.env` con valores reales

```env
# Backend API
VITE_API_URL=http://localhost:8000/api

# Timeouts
VITE_API_TIMEOUT=30000

# Aplicación
VITE_APP_NAME=POS System
VITE_ENV=development
```

### Alternativa: Sin archivo .env
El proyecto funciona con valores por defecto.

---

## 5️⃣ Iniciar Servidor de Desarrollo

```bash
npm run dev
```

**Salida esperada**:
```
  VITE v4.4.9  dev server running at:

  ➜  Local:   http://localhost:5173/
  ➜  press h to show help
```

Abrir en navegador: `http://localhost:5173`

---

## 6️⃣ Verificar Instalación

### Checklist de Verificación

- [ ] Página carga sin errores
- [ ] Console no muestra errores
- [ ] Página de login es visible
- [ ] Estilos se cargan correctamente
- [ ] Vue DevTools funciona

### Troubleshooting

#### Error: "Cannot find module 'vue'"
```bash
# Solución
npm install
npm run dev
```

#### Port 5173 en uso
```bash
# Usar puerto diferente
npm run dev -- --port 3000
```

#### Errores de TypeScript
```bash
# Verificar tipos
npm run type-check
```

---

## 7️⃣ Configuración del Backend

### URL de API

En desarrollo, el proxy está configurado en `vite.config.ts`:

```typescript
proxy: {
  '/api': {
    target: 'http://localhost:8000',
    changeOrigin: true
  }
}
```

### Cambiar Backend

#### Opción 1: Editar vite.config.ts
```typescript
target: 'http://tu-backend.com:8000'
```

#### Opción 2: Usar variable de ambiente
```env
VITE_API_URL=http://tu-backend.com:8000/api
```

Luego en `src/services/http.ts`:
```typescript
baseURL: import.meta.env.VITE_API_URL || '/api'
```

---

## 8️⃣ Configuración de IDE (VS Code)

### Extensiones Recomendadas

```
Extensions to install:

1. Volar - Vue 3 Language Support
2. TypeScript Vue Plugin (Volar)
3. ESLint
4. Prettier - Code formatter
5. Thunder Client (para test API)
6. Vue 3 Snippets
```

Comando rápido (buscar en Extensions):
- "Volar"
- "Prettier"
- "ESLint"

### Configuración de Workspace

Crear `.vscode/settings.json`:

```json
{
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": true,
  "[vue]": {
    "editor.defaultFormatter": "Vue.volar"
  },
  "typescript.enablePromptUseWorkspaceTsdk": true
}
```

---

## 9️⃣ Primeros Pasos

### 1. Explorar la Estructura
```bash
cd src/
# Ver carpetas
ls -la
```

### 2. Leer la Documentación
```bash
# Documentación principal
cat README.md

# Estructura
cat ESTRUCTURA.md

# Guía de refactorización
cat GUIA_REFACTORIZACION.md
```

### 3. Revisar Código de Ejemplo
- Página: `src/pages/LoginPage.vue`
- Componente: `src/components/common/Button.vue`
- Store: `src/stores/authStore.ts`
- Servicio: `src/services/authService.ts`

### 4. Probar la App
1. Ir a `http://localhost:5173/login`
2. (La autenticación es mock, cualquier usuario funciona)
3. Hacer click en "Iniciar Sesión"
4. Explorar las otras páginas

---

## 🔟 Scripts Disponibles

```bash
# Desarrollo
npm run dev           # Inicia servidor con HMR

# Build
npm run build         # Compila para producción
npm run preview       # Pre-visualiza el build

# Linting
npm run lint          # Ejecuta ESLint y arregla problemas

# TypeScript
npm run type-check    # Verifica errores de tipos
```

---

## 1️⃣1️⃣ Debugging

### Console del Navegador

```javascript
// En la consola del navegador:

// Ver store de autenticación
$pinia.state.value.auth

// Ver todos los stores
$pinia.state.value

// Ver historial de requestsaxios
// (solo si habilitas en http.ts)
window.__axios_logs__
```

### Vue DevTools

1. Instalar extensión de Chrome
2. Abrir DevTools (F12)
3. Ir a tab "Vue"
4. Inspeccionar componentes y stores

### Network Tab

1. Abrir DevTools (F12)
2. Ir a tab "Network"
3. Ver requests HTTP
4. Inspeccionar headers y responses

---

## 1️⃣2️⃣ Comandos Git Útiles

```bash
# Ver estado
git status

# Ver cambios
git diff

# Hacer commit
git add .
git commit -m "feat: description"

# Ver ramas
git branch

# Crear nueva rama
git checkout -b feature/mi-feature

# Cambiar de rama
git checkout main
git checkout develop
```

---

## 1️⃣3️⃣ Estructura de Carpetas Rápida

```
vue3-app/
├── src/
│   ├── components/  (Componentes Vue)
│   ├── pages/       (Páginas/Rutas)
│   ├── services/    (HTTP, API)
│   ├── stores/      (Pinia - Estado)
│   ├── composables/ (Lógica reutilizable)
│   ├── db/          (IndexedDB)
│   ├── utils/       (Funciones auxiliares)
│   ├── types/       (Tipos TypeScript)
│   ├── router/      (Vue Router)
│   └── assets/      (Estilos, imágenes)
├── package.json
├── vite.config.ts
├── tsconfig.json
└── README.md
```

Ver más en [ESTRUCTURA.md](./ESTRUCTURA.md)

---

## 1️⃣4️⃣ Desarrollo Local

### Cambios en Tiempo Real

Vite proporciona HMR (Hot Module Replacement):
- Editar archivos
- Los cambios aparecen automáticamente
- Estado se preserva

### Trabajar sin Backend

Para desarrollo sin backend real:

1. Mock data en stores:
```typescript
// src/stores/productStore.ts
const mockProducts = [
  { id: 1, nombre: 'Producto 1', precio: 100 },
  { id: 2, nombre: 'Producto 2', precio: 200 }
]
```

2. Retornar datos mock:
```typescript
const loadProducts = async () => {
  products.value = mockProducts
}
```

---

## 1️⃣5️⃣ Próximos Pasos

1. ✅ Instalación completada
2. 👉 Leer [ESTRUCTURA.md](./ESTRUCTURA.md)
3. 👉 Leer [GUIA_REFACTORIZACION.md](./GUIA_REFACTORIZACION.md)
4. 👉 Explorar código en `src/pages/LoginPage.vue`
5. 👉 Crear nuevo componente
6. 👉 Integrar con backend

---

## ❓ FAQ

### P: ¿Qué versión de Node se recomienda?
**R**: v16 o v18 LTS. Evitar versiones impares.

### P: ¿Puedo usar yarn en lugar de npm?
**R**: Sí, totalmente. `yarn install` y `yarn dev`

### P: ¿Cómo cambiar el puerto?
**R**: `npm run dev -- --port 3000`

### P: ¿Dónde están los logs?
**R**: Consola del navegador (F12) y terminal

### P: ¿Se puede usar en Windows?
**R**: Sí, completamente compatible. Usar PowerShell o Git Bash.

---

## 📞 Soporte

- Documentación: Ver archivos `.md`
- Código ejemplo: Ver `src/pages/` y `src/components/`
- Problemas: Revisar console (F12) y terminal

---

**Setup completado** 🎉

Ahora puedes:
- Iniciar desarrollo con `npm run dev`
- Leer documentación
- Crear nuevas funcionalidades
- Integrar con backend
