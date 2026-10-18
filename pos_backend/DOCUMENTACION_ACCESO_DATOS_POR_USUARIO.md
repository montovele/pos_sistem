# Acceso a información por usuario y sesión

## Objetivo

El backend del POS muestra la información según el usuario autenticado:

- Un **cajero** solo puede consultar sus propias ventas, facturas y reportes.
- Un **administrador** puede consultar toda la información sin restricción por cajero.
- La regla se aplica en el backend. El frontend no puede ampliar el alcance enviando otro `numeroEmpleado`.
- Los productos y el inventario son información compartida para todos los usuarios operativos.

## Identidad de la sesión

Todas las rutas protegidas utilizan el middleware:

```text
src/middleware/auth.js
```

El middleware valida el token Bearer y coloca el usuario autenticado en `req.user`.

La estructura mínima utilizada es:

```json
{
  "id": 2,
  "username": "cajero",
  "email": "cajero@pos.local",
  "nombreEmpleado": "Cajero Demo",
  "numeroEmpleado": 2,
  "role": "cashier",
  "photo": ""
}
```

El frontend debe enviar el token en cada petición protegida:

```http
Authorization: Bearer <token>
Content-Type: application/json
```

El backend obtiene `numeroEmpleado` y `role` desde `req.user`. No debe confiar en esos valores cuando llegan desde el body o desde los parámetros enviados por el navegador.

## Regla de autorización

La regla central es:

```text
Si req.user.role === "admin": puede ver todos los registros.
Si req.user.role !== "admin": solo puede ver registros cuyo numeroEmpleado coincide con req.user.numeroEmpleado.
```

La comparación se realiza con el número de empleado de la sesión autenticada, no con el nombre visible del usuario.

## Componentes configurados

### Transacciones

Archivo principal:

```text
src/services/transactionService.js
```

Métodos protegidos por alcance:

- `list(filters, user)`
- `findById(id, user)`
- `confirm(id, user)`
- `cancel(id, user)`

Para MySQL, el filtro de cajero se aplica directamente en la consulta:

```sql
AND numero_empleado = ?
```

Para modo demo, el filtro se aplica sobre la colección de transacciones en memoria.

Las rutas relacionadas son:

```http
GET    /api/transactions
GET    /api/transactions/:id
POST   /api/transactions/:id/confirm
POST   /api/transactions/:id/cancel
```

Ejemplo de comportamiento:

| Usuario | Resultado de `GET /api/transactions` |
|---|---|
| `cashier`, `numeroEmpleado: 2` | Solo ventas con `numeroEmpleado = 2` |
| `admin` | Ventas de todos los empleados |

### Reportes

Archivos principales:

```text
src/routes/reports.routes.js
src/services/reportService.js
```

La ruta pasa el usuario autenticado al servicio:

```text
reportService.list(req.query, req.user)
```

El filtro se ejecuta antes de calcular:

- ventas totales;
- descuentos;
- cantidad de artículos;
- promedio por ticket;
- productos más vendidos;
- flujo de efectivo;
- lista de transacciones incluida en el reporte.

Ruta:

```http
GET /api/reports
```

Un cajero no recibe totales globales por error: los indicadores se calculan únicamente sobre sus transacciones.

### Facturas

Archivo principal:

```text
src/routes/facturas.routes.js
```

Las rutas de listado y detalle reutilizan el alcance de transacciones:

```http
GET /api/facturas
GET /api/facturas/:id
```

El listado llama al servicio con `req.user` y el detalle solo devuelve la factura si la venta pertenece al cajero autenticado o si el usuario es administrador.

La generación de una factura registra la venta con el usuario de sesión mediante:

```text
transactionService.create(payload, req.user)
```

### Caja y arqueo

Archivo principal:

```text
src/services/cajaService.js
```

La caja ya está asociada al `numeroEmpleado` de la sesión:

- cada usuario puede tener su propia caja abierta;
- el estado de caja se consulta por empleado;
- las ventas de caja se filtran por `cashSessionId`;
- el historial se filtra por `numeroEmpleado`;
- el cajero no puede consultar o cerrar la caja de otro usuario usando un valor enviado desde el frontend.

Rutas:

```http
GET  /api/caja/status
POST /api/caja/open
POST /api/caja/close
GET  /api/caja/arqueo
POST /api/caja/arqueo
GET  /api/caja/ventas
GET  /api/caja/history
```

## Productos e inventario

Los productos se consideran información operativa compartida:

- los cajeros pueden consultar el catálogo necesario para vender;
- el stock se actualiza al registrar una venta;
- el alcance por usuario no se aplica al catálogo de productos;
- los reportes de bajo inventario reflejan el inventario compartido.

Archivo principal:

```text
src/services/productService.js
```

## Flujo de autenticación

1. El frontend envía usuario y contraseña a `POST /api/auth/login`.
2. El backend valida las credenciales contra demo o MySQL.
3. La respuesta devuelve un token y los datos básicos del usuario.
4. El frontend guarda el token para las peticiones siguientes.
5. `requireAuth` valida el token y reconstruye `req.user`.
6. Los servicios usan `req.user.role` y `req.user.numeroEmpleado` para definir el alcance.

Endpoints auxiliares:

```http
GET /api/auth/me
GET /api/auth/current-user
GET /api/auth/verify-token
```

El frontend debe actualizar el usuario de sesión usando `/api/auth/me` o `/api/auth/current-user`, en lugar de confiar únicamente en datos guardados localmente.

## Configuración de usuarios

Usuarios demo definidos en:

```text
src/data/demoData.js
```

Ejemplo:

```json
{
  "username": "admin",
  "role": "admin",
  "numeroEmpleado": 1
}
```

```json
{
  "username": "cajero",
  "role": "cashier",
  "numeroEmpleado": 2
}
```

En MySQL, la tabla `usuarios` debe conservar los campos:

```text
id
username
password
nombre
apellido
email
numero_empleado
role
activo
```

Los roles deben utilizar valores consistentes. El acceso total se concede únicamente al rol `admin`; cualquier otro rol queda limitado a sus propios registros, salvo que se agregue una política explícita.

## Recomendaciones para el frontend

- Enviar siempre el token Bearer.
- No enviar `numeroEmpleado` para decidir qué datos consultar.
- Usar los datos de `req.user` para mostrar el nombre y rol de la sesión.
- No mezclar en una misma vista datos globales de admin con datos de cajero.
- Para cajero, mostrar las respuestas de `/api/transactions`, `/api/reports`, `/api/facturas` y `/api/caja` tal como las devuelve el backend.
- Para admin, mostrar los listados completos y permitir filtros adicionales por fecha o empleado cuando el endpoint los soporte.
- Si el token expira o la API responde `401`, cerrar la sesión local y solicitar autenticación nuevamente.

## Verificación funcional

La configuración debe cumplir estas pruebas mínimas:

1. Crear o cargar transacciones de dos empleados distintos.
2. Consultar como cajero con `numeroEmpleado: 2`.
3. Confirmar que solo aparecen sus ventas y sus totales.
4. Consultar como admin.
5. Confirmar que aparecen las ventas de ambos empleados.
6. Intentar consultar el detalle de una venta ajena como cajero.
7. Confirmar que la API responde como no encontrada o no autorizada y no entrega la venta.
8. Repetir la prueba en modo demo y con MySQL.

## Archivos involucrados

```text
src/middleware/auth.js
src/routes/auth.routes.js
src/routes/transactions.routes.js
src/routes/reports.routes.js
src/routes/facturas.routes.js
src/routes/caja.routes.js
src/services/authService.js
src/services/transactionService.js
src/services/reportService.js
src/services/cajaService.js
src/data/demoData.js
```
