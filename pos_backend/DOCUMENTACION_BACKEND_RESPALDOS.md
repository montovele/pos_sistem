# Documentacion del backend de respaldos

## 1. Objetivo

El backend expone una API para que un usuario administrador pueda crear, listar, descargar y restaurar respaldos del estado del POS.

Los formatos disponibles son:

- `json`: respaldo completo legible por aplicaciones.
- `csv`: respaldo tabular compatible con hojas de calculo.
- `xlsx`: libro de Excel con una hoja por seccion.

La API esta implementada en:

- `src/routes/backups.routes.js`
- `src/services/backupService.js`
- `src/app.js`

## 2. Requisitos

- Node.js instalado.
- Dependencias del backend instaladas.
- Backend ejecutandose en `http://localhost:4000`.
- Usuario con rol `admin`.
- Token Bearer obtenido desde `/api/auth/login`.

Instalacion y arranque:

```powershell
cd C:\Users\Anderson\Documents\pos_frontend\backend
npm install
npm run dev
```

El frontend usa normalmente esta URL:

```env
VITE_API_URL=http://localhost:4000/api
```

## 3. Autenticacion

Todos los endpoints de respaldos requieren el header:

```http
Authorization: Bearer demo-token-<userId> en modo demo o `db-token-<userId>` con MySQL.
```

Solo los usuarios con rol `admin` pueden gestionar respaldos.

Obtener un token de prueba:

```powershell
$login = Invoke-RestMethod `
  -Uri http://localhost:4000/api/auth/login `
  -Method Post `
  -ContentType 'application/json' `
  -Body '{"username":"admin","password":"1234"}'

$token = $login.data.token
$headers = @{ Authorization = "Bearer $token" }
```

## 4. Crear un respaldo

### Endpoint

```http
POST /api/backups
Authorization: Bearer <token>
Content-Type: application/json
```

### Cuerpo

El formato puede ser `json`, `csv` o `xlsx`:

```json
{
  "format": "xlsx"
}
```

Si no se envia formato, se utiliza `json`.

### PowerShell

```powershell
$body = @{ format = 'xlsx' } | ConvertTo-Json

$created = Invoke-RestMethod `
  -Uri http://localhost:4000/api/backups `
  -Method Post `
  -Headers $headers `
  -ContentType 'application/json' `
  -Body $body

$created.data
```

Respuesta resumida:

```json
{
  "success": true,
  "data": {
    "id": 1,
    "format": "xlsx",
    "size": 18432,
    "createdAt": "2026-09-21T12:00:00.000Z"
  }
}
```

## 5. Listar respaldos

### Endpoint

```http
GET /api/backups
Authorization: Bearer <token>
```

Ejemplo:

```powershell
Invoke-RestMethod `
  -Uri http://localhost:4000/api/backups `
  -Headers $headers
```

El listado no devuelve el contenido interno del respaldo. Solo devuelve metadatos como identificador, formato, tamano y fecha.

## 6. Descargar un respaldo

### Endpoint

```http
GET /api/backups/{id}/download?format={format}
Authorization: Bearer <token>
```

El parametro `format` es opcional. Si se omite, se usa el formato con el que se creo el respaldo.

### PowerShell: JSON

```powershell
Invoke-WebRequest `
  -Uri http://localhost:4000/api/backups/1/download?format=json `
  -Headers $headers `
  -OutFile .\respaldo-1.json
```

### PowerShell: CSV

```powershell
Invoke-WebRequest `
  -Uri http://localhost:4000/api/backups/1/download?format=csv `
  -Headers $headers `
  -OutFile .\respaldo-1.csv
```

### PowerShell: Excel

```powershell
Invoke-WebRequest `
  -Uri http://localhost:4000/api/backups/1/download?format=xlsx `
  -Headers $headers `
  -OutFile .\respaldo-1.xlsx
```

El backend envia el tipo MIME y el nombre de archivo mediante `Content-Disposition`.

## 7. Restaurar un respaldo

La restauracion aplica la instantanea seleccionada sobre los datos de la organización autenticada.

### Endpoint

```http
POST /api/backups/{id}/restore
Authorization: Bearer <token>
```

### PowerShell

```powershell
Invoke-RestMethod `
  -Uri http://localhost:4000/api/backups/1/restore `
  -Method Post `
  -Headers $headers
```

En modo demo, la restauración actualiza:

- organizaciones;
- productos;
- transacciones;

Las contraseñas no se exportan. Los usuarios existentes conservan su contraseña durante una restauración.

La persistencia completa de restauración sobre MySQL queda pendiente del adaptador de producción; actualmente el servicio devuelve `501` en ese modo para evitar sobrescrituras parciales.


## 8. Contenido del respaldo

La instantanea contiene estas secciones:

- `organizationSettings`
- `organizations`
- `users`
- `products`
- `inventory`
- `transactions`
- `facturas`
- `cashSessions`
- `cashHistory`

En formato `JSON`, cada seccion se conserva como estructura de datos.

En formato `CSV`, cada fila contiene la seccion y el registro serializado.

En formato `XLSX`, cada seccion se guarda en una hoja independiente.

## 9. Errores comunes

### `401`

El token no existe, es invalido o expiro.

### `403`

El usuario autenticado no tiene rol `admin`.

### `404`

El identificador del respaldo no existe.

### `400`

El formato enviado no es valido. Los valores permitidos son:

```text
json
csv
xlsx
```

## 10. Integracion con el frontend

La pantalla `src/pages/SettingsPage.vue` consume estos endpoints:

```text
GET  /api/backups
POST /api/backups
GET  /api/backups/:id/download?format=json|csv|xlsx
POST /api/backups/:id/restore
```

El formato se selecciona antes de crear el respaldo y tambien antes de descargarlo.

## 11. Limitacion actual

El backend actual utiliza arreglos en memoria como almacenamiento de demostracion. Por ello, los respaldos y los datos se pierden al reiniciar el proceso de Node.js.

Para produccion se debe reemplazar el almacenamiento en memoria por una tabla de respaldos y guardar los archivos en disco o en almacenamiento de objetos. Tambien se recomienda agregar:

- retencion automatica;
- cifrado de archivos;
- auditoria de restauraciones;
- validacion de tamano y frecuencia;
- copias fuera del equipo local.
