# Actualización del frontend: organización y empresa activa

## 1. Objetivo

Actualizar el frontend para identificar correctamente la empresa del usuario autenticado y consumir inventario, movimientos, importaciones y transacciones dentro de ese contexto.

La organización no debe seleccionarse desde el body, query string o URL de las operaciones. El backend la determina mediante el token Bearer.

## 2. Relación de identificación

La relación principal es:

```text
usuarios.organization_id -> organizaciones.id
```

Representación en la sesión frontend:

| Campo | Uso |
|---|---|
| `user.id` | Identificador del usuario o empleado |
| `user.organizationId` | Identificador técnico de la empresa |
| `user.organizationName` | Nombre visible de la empresa |
| `user.role` | Permisos del usuario |
| `user.active` | Estado de la cuenta |

Ejemplo:

```json
{
  "id": 12,
  "username": "cajero.ventas",
  "organizationId": 7,
  "organizationName": "Comercializadora Norte",
  "role": "cashier",
  "active": true
}
```

`organizationId` es el valor que permite separar los datos. `organizationName` se usa para mostrar el contexto actual en la interfaz.

## 3. Flujo de autenticación

1. El usuario inicia sesión con usuario y contraseña.
2. El backend devuelve un token y los datos del usuario.
3. El frontend guarda el token y la sesión.
4. Cada petición protegida envía `Authorization: Bearer <token>`.
5. El backend resuelve el usuario y su `organizationId`.
6. El backend filtra y persiste los datos usando esa organización.

Ejemplo de respuesta de login:

```json
{
  "token": "db-token-12",
  "user": {
    "id": 12,
    "username": "cajero.ventas",
    "organizationId": 7,
    "organizationName": "Comercializadora Norte",
    "role": "cashier",
    "active": true
  }
}
```

## 4. Persistencia de sesión

Guardar una estructura estable en `localStorage`, Pinia u otra solución de estado:

```js
const session = {
  token: response.token,
  user: response.user
};

localStorage.setItem('pos.session', JSON.stringify(session));
```

Lectura segura:

```js
export function getSession() {
  try {
    return JSON.parse(localStorage.getItem('pos.session') || 'null');
  } catch {
    return null;
  }
}
```

No guardar una organización seleccionable por separado como fuente de autorización. La organización válida siempre es `session.user.organizationId` y proviene del backend.

## 5. Cliente HTTP

El cliente debe agregar el token a todas las rutas protegidas:

```js
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

export async function apiRequest(path, options = {}) {
  const session = JSON.parse(localStorage.getItem('pos.session') || 'null');
  const headers = {
    'Content-Type': 'application/json',
    ...(session?.token ? { Authorization: `Bearer ${session.token}` } : {}),
    ...(options.headers || {})
  };

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers
  });

  const body = await response.json().catch(() => ({}));
  if (response.status === 401) {
    localStorage.removeItem('pos.session');
    throw new Error('La sesión expiró');
  }

  if (!response.ok) {
    throw new Error(body.message || 'Error en la API');
  }

  return body;
}
```

## 6. Consulta de la empresa

Usar el endpoint para obtener los datos descriptivos de la empresa:

```text
GET /api/organization
```

La respuesta contiene, entre otros:

```json
{
  "success": true,
  "data": {
    "id": 7,
    "name": "Comercializadora Norte",
    "taxId": "XAXX010101000",
    "email": "contacto@empresa.local",
    "phone": "5550000000",
    "address": "Centro",
    "status": "active"
  }
}
```

El frontend debe comprobar que `data.id` coincide con `session.user.organizationId`. Si no coincide, debe mostrar un error de sesión y no continuar con operaciones de negocio.

## 7. Servicios de inventario

Los servicios no deben recibir ni agregar `organizationId` para autorizar la operación:

```js
export const inventoryService = {
  list(params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/inventario${query ? `?${query}` : ''}`);
  },

  getBySku(sku) {
    return apiRequest(`/inventario/${encodeURIComponent(sku)}`);
  },

  importCsv(payload) {
    return apiRequest('/inventario/import/csv', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  importJson(payload) {
    return apiRequest('/inventario/import/json', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  getMovements(params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/inventario/movimientos${query ? `?${query}` : ''}`);
  }
};
```

Los filtros permitidos son de operación, por ejemplo `page`, `perPage`, `search`, `sku` y `warehouse`. No usar `organizationId` para cambiar de empresa.

## 8. Importaciones y movimientos

Para CSV, JSON o XLSX el frontend únicamente envía el archivo, contenido y opciones de importación:

```js
await inventoryService.importCsv({
  filename: file.name,
  mimetype: file.type || 'text/csv',
  csv: csvText,
  dryRun: true
});
```

El backend registra automáticamente:

```text
inventario_importaciones.organization_id
inventario_movimientos.organization_id
inventario_items.organization_id
```

El frontend no debe crear ni modificar esos campos.

## 9. Transacciones

Al registrar una venta, enviar únicamente los datos de la operación:

```js
await apiRequest('/transactions', {
  method: 'POST',
  body: JSON.stringify({
    items,
    paymentMethod: 'cash',
    discount: 0
  })
});
```

No enviar:

```js
// Incorrecto
{
  organizationId: 7,
  items
}
```

La transacción queda asociada a la empresa del usuario autenticado en:

```text
transacciones.organization_id
```

## 10. Interfaz recomendada

Mostrar el contexto de empresa en el layout principal:

```vue
<template>
  <header class="organization-context">
    <span>{{ organization.name }}</span>
    <small>ID empresa: {{ organization.id }}</small>
  </header>
</template>

<script setup>
import { computed } from 'vue';

const session = JSON.parse(localStorage.getItem('pos.session') || 'null');
const organization = computed(() => ({
  id: session?.user?.organizationId || null,
  name: session?.user?.organizationName || 'Empresa no identificada'
}));
</script>
```

El ID puede mostrarse en una vista administrativa o de soporte. No es necesario mostrarlo en todas las pantallas operativas.

## 11. Permisos de interfaz

El frontend puede ocultar acciones según el rol, pero el backend siempre debe validar:

| Acción | Rol esperado |
|---|---|
| Consultar inventario | Usuario autenticado |
| Registrar venta | Usuario autenticado con caja abierta |
| Crear o editar inventario | `admin` |
| Importar CSV, JSON o XLSX | `admin` |
| Consultar movimientos | `admin` |
| Consultar reportes | `admin` |
| Editar configuración de empresa | `admin` |

Ocultar un botón no sustituye la autorización del backend.

## 12. Manejo de errores

El frontend debe tratar estos casos:

- `401`: borrar sesión y redirigir al login.
- `403`: mostrar que el rol no tiene permiso.
- `404`: indicar que el recurso no pertenece a la empresa actual o no existe.
- `409`: mostrar conflicto de stock o caja.
- `400`: mostrar errores de validación de archivo o datos.

No cambiar automáticamente el `organizationId` recibido en una respuesta para intentar continuar.

## 13. Checklist de implementación

- [ ] Guardar `token`, `organizationId` y `organizationName` después del login.
- [ ] Enviar Bearer token desde un cliente HTTP centralizado.
- [ ] Mostrar el nombre de la empresa en el layout.
- [ ] Consultar `GET /api/organization` al cargar la sesión.
- [ ] Validar que el ID de la organización coincida con la sesión.
- [ ] Eliminar `organizationId` de payloads, rutas y filtros de autorización.
- [ ] Consumir importaciones mediante el backend.
- [ ] No crear `organization_id` desde el frontend.
- [ ] Manejar `401`, `403`, `404`, `409` y `400`.
- [ ] Probar que un usuario no vea inventario, movimientos o transacciones de otra empresa.

## 14. Criterio de aceptación

La actualización está completa cuando:

1. El usuario puede ver claramente la empresa activa.
2. Cada petición protegida lleva el token Bearer.
3. Las operaciones funcionan sin enviar `organizationId` manualmente.
4. El inventario, movimientos, importaciones y transacciones aparecen únicamente para la organización del usuario.
5. Un usuario de otra organización no puede consultar ni modificar esos registros.
