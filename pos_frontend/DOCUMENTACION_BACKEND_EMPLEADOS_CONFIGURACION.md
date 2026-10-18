# Diseño profesional de Empleados y Configuración del backend POS

## 1. Objetivo

Definir el contrato funcional y técnico para reemplazar los módulos demo de **Empleados** y **Configuración** por módulos persistentes, seguros y preparados para múltiples organizaciones.

El modelo operativo es:

```text
Administrador (owner de la organización)
  └── Organización / Empresa
        ├── muchos cajeros
        ├── configuración del negocio
        ├── cajas y dispositivos
        └── productos, inventario, ventas y reportes
```

Un cajero siempre pertenece a una organización y queda relacionado con el administrador que la posee. El cajero no debe poder consultar ni modificar información de otra organización, aunque intente enviar otro `organizationId` en la URL, el body o los query params.

## 2. Alcance

### Incluye

- gestión de una organización por administrador;
- alta, edición, activación y bloqueo de cajeros;
- autenticación y autorización multi-organización;
- configuración general, fiscal y operativa de la empresa;
- asociación de cajeros con cajas y dispositivos;
- auditoría de cambios sensibles;
- migración de los datos demo actuales;
- contratos REST para el frontend Vue 3.

### No incluye en la primera versión

- jerarquía de organizaciones o franquicias;
- un usuario perteneciente a varias organizaciones;
- permisos personalizados por pantalla;
- nómina, recursos humanos o control de asistencia;
- eliminación física de usuarios con ventas históricas.

## 3. Roles y responsabilidades

La primera versión debe limitar los roles de negocio a dos valores estables:

| Rol | Alcance | Responsabilidades |
|---|---|---|
| `admin` | Toda su organización | Configurar empresa, administrar cajeros, inventario, cajas, reportes y usuarios. |
| `cashier` | Su organización y sus operaciones | Vender, consultar catálogo, operar su caja y consultar sus propias ventas. |

Reglas obligatorias:

1. Debe existir un administrador activo para crear o administrar una organización.
2. Un administrador puede tener cero o muchos cajeros.
3. Un cajero pertenece a una sola organización.
4. Un cajero no puede crear otro usuario ni cambiar su rol.
5. El administrador no debe editar contraseñas en texto plano ni recibirlas en respuestas.
6. Las ventas, facturas, sesiones de caja, inventario y reportes deben filtrar por `organization_id`.
7. La autorización se ejecuta en backend; ocultar botones en el frontend no es una medida de seguridad.

## 4. Modelo de datos recomendado

Los nombres de base de datos se muestran en `snake_case`; el frontend puede transformarlos a `camelCase`.

### 4.1 `organizations`

Representa la empresa o negocio aislado dentro del sistema.

| Campo | Tipo | Regla |
|---|---|---|
| `id` | `BIGINT` | PK. |
| `name` | `VARCHAR(150)` | Obligatorio. |
| `tax_id` | `VARCHAR(50)` | Opcional, único por organización si se captura. |
| `email` | `VARCHAR(150)` | Email operativo. |
| `phone` | `VARCHAR(40)` | Teléfono operativo. |
| `address` | `VARCHAR(255)` | Dirección fiscal o comercial. |
| `logo_url` | `VARCHAR(500)` | URL validada, opcional. |
| `timezone` | `VARCHAR(60)` | Por defecto la definida por el despliegue. |
| `currency` | `CHAR(3)` | Por defecto `MXN`, configurable. |
| `status` | `ENUM('active','suspended')` | Una organización suspendida no permite operar. |
| `created_at` / `updated_at` | `DATETIME` | Auditoría técnica. |

### 4.2 `users`

Identidad autenticable de administradores y cajeros.

| Campo | Tipo | Regla |
|---|---|---|
| `id` | `BIGINT` | PK. |
| `organization_id` | `BIGINT` | FK a `organizations.id`, obligatorio. |
| `username` | `VARCHAR(80)` | Único dentro de la organización. |
| `email` | `VARCHAR(150)` | Único dentro de la organización si se captura. |
| `password_hash` | `VARCHAR(255)` | Nunca almacenar `password`. |
| `first_name` / `last_name` | `VARCHAR(100)` | Datos del empleado. |
| `employee_number` | `VARCHAR(40)` | Único dentro de la organización. |
| `role` | `ENUM('admin','cashier')` | No usar `cajero`, `manager` o `vendedor` como variantes. |
| `active` | `BOOLEAN` | Bloquea el inicio de sesión si es `false`. |
| `last_login_at` | `DATETIME` | Opcional. |
| `created_at` / `updated_at` | `DATETIME` | Auditoría técnica. |

Restricciones recomendadas:

```sql
UNIQUE (organization_id, username)
UNIQUE (organization_id, employee_number)
UNIQUE (organization_id, email)
INDEX (organization_id, role, active)
```

La organización debe conservar `owner_user_id` o una relación equivalente para identificar a su administrador propietario. Se recomienda que `owner_user_id` apunte a un usuario con rol `admin` y que no pueda eliminarse mientras la organización exista.

### 4.3 Tablas dependientes

Las tablas existentes que sean propiedad del negocio deben incorporar `organization_id` como FK e índice:

- `products` e inventario;
- `transactions` y `invoices`;
- `cash_sessions` y cajas;
- `printers` y dispositivos;
- configuraciones y auditoría.

La aplicación ya utiliza `organizationId` en inventario. Debe migrarse a un criterio único de aislamiento, preferiblemente `organization_id` en persistencia y `organizationId` en TypeScript.

### 4.4 `organization_settings`

Guardar la configuración por secciones, no en un objeto global del navegador.

```text
id
organization_id
section       -- general | fiscal | sales | receipt | hardware | backup
settings_json -- JSON validado por sección
updated_by
created_at
updated_at
```

No incluir contraseñas, tokens, claves privadas ni secretos de hardware en `settings_json`. Los secretos deben vivir en variables de entorno o en un almacén seguro.

## 5. Contrato de sesión

El login debe devolver el contexto mínimo necesario para la interfaz:

```json
{
  "token": "<token>",
  "user": {
    "id": 2,
    "username": "cajero01",
    "nombreEmpleado": "María García",
    "numeroEmpleado": "002",
    "role": "cashier",
    "organizationId": 1,
    "organizationName": "Abarrotes García",
    "active": true
  }
}
```

El token o la sesión del backend debe identificar `user_id`, `organization_id` y `role`. El servidor debe reconstruir `req.user` y validar que el usuario continúe activo. El frontend no puede elevar permisos modificando `organizationId`, `role` o `numeroEmpleado` en `localStorage`.

## 6. Autorización y aislamiento

El middleware debe aplicar esta secuencia:

```text
1. Validar Bearer token.
2. Cargar usuario activo.
3. Cargar organización activa.
4. Adjuntar req.user y req.organization.
5. Verificar rol para la operación.
6. Forzar organization_id desde la sesión en cada consulta.
```

Ejemplo de regla de servicio:

```js
const scope = { organizationId: req.user.organizationId }

// Admin: datos de toda su organización.
// Cajero: datos de su organización y, además, sus propias operaciones.
```

Nunca aceptar `organizationId` del body como fuente de autorización. En SQL, una consulta de venta debe incluir la organización aun cuando también filtre por cajero:

```sql
SELECT *
FROM transactions
WHERE organization_id = ?
  AND numero_empleado = ?;
```

Las respuestas de recursos inexistentes o pertenecientes a otra organización deben ser `404` para no revelar su existencia. Las operaciones sin rol suficiente deben devolver `403`.

## 7. API de empleados

Todas las rutas requieren `Authorization: Bearer <token>`.

```http
GET    /api/employees
GET    /api/employees/:id
POST   /api/employees
PATCH  /api/employees/:id
POST   /api/employees/:id/activate
POST   /api/employees/:id/deactivate
POST   /api/employees/:id/reset-password
```

### Reglas de los endpoints

- Solo `admin` puede listar, crear, editar, activar, desactivar o restablecer cajeros.
- `GET /api/employees` debe filtrar por la organización de la sesión y permitir `search`, `role`, `active`, `page` y `limit`.
- `POST /api/employees` solo debe permitir crear `cashier` en la primera versión.
- El backend asigna `organization_id`; el cliente no lo envía.
- Desactivar es preferible a eliminar: conserva ventas, facturas, arqueos y auditoría.
- No devolver `password_hash` ni la contraseña inicial.
- Un cajero desactivado debe invalidar sus sesiones activas.

Payload de alta:

```json
{
  "username": "cajero01",
  "email": "maria@abarrotes.local",
  "firstName": "María",
  "lastName": "García",
  "employeeNumber": "002",
  "temporaryPassword": "********"
}
```

La respuesta debe indicar que la contraseña es temporal y exigir cambio en el primer inicio de sesión si esa política se implementa.

## 8. API de configuración

```http
GET   /api/organization
PATCH /api/organization
GET   /api/organization/settings
PATCH /api/organization/settings/:section
GET   /api/organization/summary
```

### Secciones mínimas

| Sección | Datos |
|---|---|
| `general` | Nombre comercial, teléfono, email, dirección y logo. |
| `fiscal` | Identificación fiscal, régimen y datos para facturación. |
| `sales` | Moneda, impuestos, descuentos, redondeo y venta por peso. |
| `receipt` | Encabezado, pie, folio y formato del ticket. |
| `hardware` | Impresoras, agente local y estado de dispositivos. |
| `backup` | Política y metadatos de respaldo, nunca credenciales. |

El endpoint debe validar cada sección con un esquema. Las claves desconocidas deben rechazarse o ignorarse explícitamente. Los cambios deben registrar `updated_by`, fecha, sección y valores anterior/nuevo en auditoría, omitiendo secretos.

## 9. Matriz de permisos

| Recurso | Admin | Cajero |
|---|---:|---:|
| Ver y editar empresa | Sí | No |
| Gestionar cajeros | Sí | No |
| Consultar catálogo | Sí | Sí |
| Modificar inventario | Sí | No |
| Abrir y cerrar su caja | Sí | Sí |
| Consultar sus ventas | Sí | Sí |
| Consultar ventas de otros cajeros | Sí | No |
| Reporte global de organización | Sí | No |
| Reporte propio | Sí | Sí |
| Configurar impresoras | Sí | No |
| Crear respaldos | Sí | No |

## 10. Migración desde el estado demo

1. Crear `organizations` y una organización inicial para los datos actuales.
2. Crear `organization_id` en `users`, `transactions`, `facturas`, cajas, productos e inventario.
3. Asociar `admin` y `cajero` demo a la organización inicial.
4. Renombrar o mapear `role: "cajero"` a `role: "cashier"`.
5. Mover los datos locales de `EmpleadosPage.vue` y `SettingsPage.vue` a servicios API.
6. Cambiar `organizationId` enviado por el cliente a un valor informativo; el backend debe sobrescribir el alcance con la sesión.
7. Eliminar credenciales demo antes de producción y forzar cambio de contraseña.
8. Activar restricciones FK, índices y pruebas de aislamiento.

La migración debe ser reversible por etapa y ejecutarse primero en una copia de la base de datos.

## 11. Estructura backend sugerida

```text
backend/src/
  modules/
    auth/
    organizations/
      organization.routes.js
      organization.service.js
      organization.repository.js
      organization.schemas.js
    employees/
      employee.routes.js
      employee.service.js
      employee.repository.js
      employee.schemas.js
    settings/
      settings.routes.js
      settings.service.js
  middleware/
    auth.js
    requireRole.js
    organizationScope.js
  audit/
    audit.service.js
```

El servicio debe recibir el contexto autenticado como dependencia explícita, por ejemplo `employeeService.list({ organizationId, filters })`. Esto evita que una ruta olvide aplicar el alcance.

## 12. Validaciones y seguridad

- Hash de contraseñas con Argon2id o bcrypt con costo apropiado.
- Rate limit para login y restablecimiento de contraseña.
- Validación de payload con esquema antes del servicio.
- Logs sin contraseñas, tokens ni datos fiscales innecesarios.
- Auditoría de alta, cambios de rol, activación, bloqueo, configuración y resets.
- Transacciones de base de datos para crear usuario y registrar auditoría.
- Índices por `organization_id` en todas las tablas multi-tenant.
- Pruebas que intenten acceder a recursos de otra organización.

## 13. Plan de desarrollo

### Fase 1: dominio y persistencia

- Crear tablas, migraciones, FK e índices.
- Definir `organizationId` en tipos y respuesta de autenticación.
- Crear seed de una organización con un admin y varios cajeros.

### Fase 2: autenticación y aislamiento

- Actualizar login, `req.user` y middleware de organización.
- Aplicar filtros obligatorios a ventas, facturas, cajas, inventario y reportes.
- Añadir pruebas de autorización por rol y organización.

### Fase 3: empleados

- Implementar API de empleados.
- Reemplazar la lista y formularios dummy de `EmpleadosPage.vue`.
- Añadir estados de carga, errores, paginación, bloqueo y confirmaciones.

### Fase 4: configuración

- Implementar API por secciones.
- Reemplazar estado local de `SettingsPage.vue`.
- Incorporar auditoría y validación de cambios.

### Fase 5: operación y endurecimiento

- Vincular cajas, impresoras y hardware con la organización.
- Retirar credenciales demo.
- Ejecutar pruebas de regresión y pruebas de aislamiento multi-organización.

## 14. Criterios de aceptación

- Un administrador puede crear dos o más cajeros dentro de su organización.
- Cada cajero puede iniciar sesión y recibe `organizationId` en su contexto autenticado.
- Un cajero solo ve sus ventas y no puede consultar ventas de otro cajero.
- Ningún usuario puede leer o modificar datos de otra organización cambiando IDs enviados por el cliente.
- Un administrador puede actualizar la configuración y un cajero recibe `403` al intentarlo.
- Desactivar un cajero impide nuevos inicios de sesión y conserva su historial.
- `EmpleadosPage.vue` y `SettingsPage.vue` no contienen listas ni configuraciones de negocio hardcodeadas.
- El backend nunca devuelve contraseñas ni secretos.
- Las pruebas cubren admin/cajero, usuario activo/inactivo y dos organizaciones aisladas.

## 15. Decisión recomendada

Implementar primero el modelo de una organización con un administrador propietario y muchos cajeros. No introducir todavía multi-organización por usuario ni roles adicionales: ambos aumentan la complejidad de autorización y no son necesarios para el flujo actual del POS. La extensión a sucursales o franquicias puede construirse después sobre `organization_id` sin romper el contrato de empleados.