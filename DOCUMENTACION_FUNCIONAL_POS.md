# Documentación funcional del sistema POS

## 1. Propósito y alcance

Este documento describe las funciones visibles y los flujos principales del sistema de punto de venta (POS), así como el acceso disponible para cada nivel de usuario según el código actual del proyecto.

El sistema está compuesto por una aplicación web, una API y una base de datos. Incluye módulos de ventas, caja, catálogo e inventario, reportes, facturas, administración de empleados, configuración, suscripciones y descarga del agente local de hardware.

> **Importante:** esta guía documenta la implementación actual. Algunas pantallas presentan opciones cuyo guardado depende de servicios externos, de la conexión a MySQL o de funciones que todavía son demostrativas. Las diferencias conocidas se indican en la sección [Observaciones y límites actuales](#12-observaciones-y-límites-actuales).

## 2. Componentes y operación general

- **Aplicación web:** interfaz para iniciar sesión, realizar ventas y administrar el negocio.
- **API:** atiende las operaciones de autenticación, ventas, caja, empleados, inventario, reportes, facturas, respaldos y suscripciones.
- **Persistencia:** MySQL cuando está disponible. El backend también contempla un modo de demostración con datos en memoria.
- **Organizaciones:** los usuarios tienen una organización asociada. El inventario y los empleados consultados desde la aplicación se filtran por esa organización.
- **Conectividad:** la interfaz muestra si puede comunicarse con el backend. Comprueba el estado al abrirse, al volver a primer plano y periódicamente.
- **Modo sin conexión:** el flujo POS guarda ventas pendientes en almacenamiento local del navegador cuando no puede comunicarse con el servidor. Al volver la conexión, intenta sincronizarlas. También existe una cola local para aperturas de caja pendientes. Esto no significa que todos los módulos estén disponibles sin conexión.
- **Moneda e impuestos:** la configuración de ejemplo usa MXN e IVA de 16 %. El cálculo efectivo debe confirmarse con la configuración del negocio y el producto.

## 3. Niveles de usuario y permisos

La aplicación reconoce principalmente los roles `admin`, `superadmin` y `cashier`. La interfaz también muestra opciones como `manager`, `cajero`, `gerente` y `vendedor`; sus limitaciones actuales se explican después de la tabla.

| Nivel | Funciones disponibles en la interfaz | Facultades exclusivas o límites |
|---|---|---|
| **Cajero (`cashier`)** | Inicio, POS, caja, consulta de su suscripción y descargas. Puede consultar el catálogo, armar ventas, cobrar y trabajar con la cola de ventas sin conexión. | No tiene acceso a las pantallas administrativas de reportes, facturas, inventario, empleados ni configuración. No puede administrar el plan o los usuarios. |
| **Administrador (`admin`)** | Todas las funciones del cajero, más reportes, facturas, inventario, empleados y configuración. Puede administrar la suscripción de su organización, incluida la cancelación de renovación cuando la suscripción lo permite. | No puede administrar globalmente el plan SaaS ni las suscripciones de otras organizaciones. La creación y asignación de roles de empleado está restringida en el backend. |
| **Superadministrador (`superadmin`)** | Tiene acceso administrativo en las rutas de interfaz que aceptan `admin` o `superadmin`. También puede acceder a la administración global de suscripciones. | Es el único rol que puede administrar planes SaaS y suscripciones de organizaciones, y asignar el rol `superadmin`. Hay endpoints que exigen literalmente el rol `admin`, por lo que algunas acciones (como ciertas operaciones de inventario y respaldos) no necesariamente están disponibles para `superadmin`. |
| **Gerente (`manager` / `gerente`)** | La aplicación no le concede privilegios administrativos: se trata como usuario no administrador. La navegación y las rutas administrativas requieren `admin` o `superadmin`. | El selector de usuarios incluye “Gerente”, pero el servicio de empleados no permite asignar ese rol actualmente. |
| **Vendedor (`vendedor`)** | No existe un conjunto de permisos diferenciado implementado. Si la cuenta puede autenticarse, se comporta como un rol no administrador en la interfaz. | Aparece en el formulario de empleados, pero el backend no lo acepta como rol asignable en las operaciones de creación o edición. |

### 3.1 Reglas importantes de roles

- Las rutas de interfaz para reportes, facturas, inventario, empleados y configuración están restringidas a `admin` y `superadmin`.
- El middleware administrativo compartido del backend reconoce ambos roles; algunas rutas especializadas, sin embargo, comparan exclusivamente con `admin`.
- El servicio de empleados permite crear o asignar `cashier`. La asignación de `superadmin` solo está permitida cuando quien realiza la operación ya es `superadmin`.
- Los términos `cajero` y `gerente` de algunos formularios se convierten parcialmente a `cashier` y `manager`. Los nombres de rol no están completamente unificados entre formularios, rutas y backend.
- La visibilidad de un menú no sustituye la validación del servidor. Los permisos dependen de cada ruta del backend.

## 4. Acceso e inicio de sesión

1. El usuario inicia sesión con su nombre de usuario y contraseña.
2. El backend valida las credenciales y devuelve un token de sesión.
3. La aplicación conserva la sesión y utiliza el token al solicitar datos protegidos.
4. Al abrir una ruta protegida, la aplicación comprueba la sesión y, si hace falta, vuelve a cargar el usuario actual.
5. Si la sesión no es válida, el usuario se envía al inicio de sesión. Al salir, la interfaz cierra la sesión local.

Las cuentas inactivas o las credenciales no válidas deben resolverse desde la administración del backend o de empleados; no se permite operar con una sesión autenticada que el servidor rechace.

## 5. Inicio y panel principal

El panel muestra el nombre del usuario, su rol y número de empleado, además de accesos rápidos a las funciones permitidas para ese rol.

- El acceso al POS está disponible para los usuarios autenticados.
- Los accesos a reportes y facturas se muestran a los perfiles administrativos.
- La aplicación presenta indicadores resumidos y el estado general de la operación.
- Los valores del panel incluyen datos estáticos de presentación en la implementación actual; no deben interpretarse automáticamente como indicadores conectados en tiempo real.

## 6. Punto de venta (POS)

El POS permite registrar una venta desde el catálogo o mediante un código de producto.

### 6.1 Selección de productos

- Buscar productos por texto, nombre o código y filtrar por categoría.
- Recorrer el catálogo paginado, con indicación de precio, unidad y stock mostrado.
- Agregar artículos al carrito, modificar sus cantidades o eliminarlos.
- Para productos por peso, seleccionar el producto y especificar los gramos; la interfaz convierte el peso a kilogramos. También ofrece leer una báscula si el agente de hardware está conectado.
- Escanear o escribir un código de barras en el campo de búsqueda rápida.

### 6.2 Carrito y cobro

El carrito presenta subtotal, impuesto y total, y permite limpiar la venta antes del cobro. El formulario de pago contempla:

- **Efectivo:** registrar el importe recibido y calcular el cambio; ofrece importes sugeridos.
- **Terminal bancaria:** registrar una referencia de autorización o folio. La confirmación del cobro se realiza en la terminal bancaria, fuera de la aplicación.
- **Notas:** añadir observaciones a la venta.
- **Descuentos:** contempla descuentos por producto y un porcentaje general de venta, sujetos al cálculo y a los datos del producto.

El sistema requiere que la caja esté abierta antes de cobrar. Una vez confirmada la operación, la venta se registra en el servidor o, ante un error de conectividad, se conserva como pendiente local para sincronización posterior.

### 6.3 Impresión y periféricos

El POS muestra el estado del agente de impresión, permite actualizar su estado y ofrece una acción para abrir el cajón cuando el agente está conectado. La impresión de tickets y el control del cajón dependen del agente local y del hardware configurado en el dispositivo.

## 7. Caja y turnos

La pantalla de caja concentra el control del turno:

1. **Abrir caja:** ingresar el efectivo inicial o base de caja.
2. **Consultar el turno:** revisar ventas, número de transacciones, ticket promedio, efectivo recibido y desglose por método de pago.
3. **Arqueo:** ingresar el efectivo contado y comparar ese importe con el esperado. El cálculo considera la base de caja y las ventas en efectivo; pagos con terminal no forman parte del efectivo físico esperado.
4. **Guardar arqueo y cerrar:** el efectivo contado debe guardarse antes de cerrar. La pantalla muestra diferencias como faltante o sobrante.
5. **Consultar historial:** revisar aperturas y cierres previos, cajero, ventas y diferencia registrada.

Si no hay conexión, la interfaz informa del modo offline y utiliza una cola local para conservar ciertas operaciones de caja y ventas hasta intentar sincronizarlas. La disponibilidad de cada operación depende de la sincronización con el servidor.

## 8. Catálogo e inventario

### Catálogo para ventas

El catálogo del POS está orientado a buscar y vender productos. Presenta código, categoría, descripción, precio, unidad y stock disponible. Los productos sin stock aparecen deshabilitados para agregarse al carrito.

### Administración de inventario

El módulo administrativo incluye:

- Consulta y actualización de existencias por organización.
- Alta y edición de productos.
- Importación masiva mediante CSV, JSON o XLSX.
- Validación previa (*dry run*) con filas válidas, inválidas y duplicadas; solo se confirman las filas aceptadas.
- Plantilla CSV descargable.
- Resumen con cantidad de artículos, unidades, costo, valor de venta, alertas de stock bajo, almacenes e historial de importaciones.
- Reporte de inventario exportable a PDF.
- Consulta de movimientos y registro de entradas, salidas o ajustes con usuario y existencias antes/después.

La pantalla de importación indica un máximo de 10 MB y 10.000 filas. Entre las unidades reconocidas se incluyen PZA, KG, LT, CAJA, M, ROLLO, L, PAQUETE, ML y PAR.

Los reportes, importaciones y movimientos requieren perfil administrativo. La consulta del inventario y de artículos también requiere autenticación.

## 9. Reportes de ventas

Los reportes permiten elegir fechas de inicio y fin y generar una consulta del período. El administrador puede filtrar por número de cajero cuando esa opción está disponible.

El resultado agrupa:

- **Resumen:** ventas totales, artículos, ticket promedio, faltantes de caja y estado final.
- **Caja:** faltantes de caja detectados.
- **Transacciones:** código, ticket, fecha, total y estado, con paginación.
- **Exportación:** CSV, JSON o PDF desde la pantalla de reportes.

El alcance de los datos depende de los filtros y del usuario autenticado; no debe asumirse que una sesión no administrativa puede consultar una vista global.

## 10. Facturas

El módulo administrativo ofrece:

- Generar una factura desde el carrito del POS o iniciar la generación desde el módulo.
- Consultar registros e historial, buscar por folio o cliente y filtrar por estado.
- Ver el detalle de cliente, artículos, importes, método de pago, fecha y folio.
- Descargar una representación PDF sin timbrar y solicitar el archivo XML desde la interfaz.
- Cancelar un registro mediante una confirmación.

**Alcance fiscal:** el backend actual genera una representación de factura basada en la transacción y usa datos predeterminados de consumidor final cuando no se proporciona un cliente. La generación de ese registro no acredita por sí sola el timbrado de un CFDI ante el SAT. La disponibilidad efectiva de descargas fiscales depende de la implementación del proveedor y del servicio correspondiente.

## 11. Administración, suscripción y descargas

### Empleados

El módulo permite consultar, buscar y filtrar empleados, crear o editar sus datos, activar o desactivar cuentas y revisar estadísticas de empleados. El servicio del backend limita la gestión por organización y aplica restricciones de rol. La opción de eliminar de la pantalla de configuración desactiva la cuenta; no equivale necesariamente a borrar físicamente el registro.

### Configuración

La pantalla reúne secciones de configuración general, usuarios, datos de empresa, impresoras y respaldos. Entre las operaciones presentadas están guardar datos del negocio, gestionar usuarios, probar impresora, crear/descargar/restaurar respaldos y consultar estadísticas.

Las funciones de edición de impresora y programación de respaldos que solo muestran un mensaje en la interfaz no deben entenderse como una configuración persistida o una tarea automática ya habilitada.

### Suscripción

- Cada organización puede consultar su plan, estado, fechas del período y pagos.
- Un administrador puede iniciar el flujo de pago con Stripe cuando el backend tiene Stripe configurado y el plan está habilitado; también puede solicitar la cancelación al final del período.
- El superadministrador puede actualizar el plan SaaS y administrar el estado y las fechas de suscripción de organizaciones.
- Las rutas de autenticación y suscripción permiten consultar o resolver el estado de la cuenta aunque otras operaciones estén bloqueadas por falta de suscripción.
- El acceso a las demás operaciones del backend puede exigir una suscripción activa o en período de prueba.

### Descargas

Los usuarios autenticados pueden consultar y descargar los instaladores `.exe` disponibles para Windows. La lista muestra nombre, tamaño y fecha de actualización. La instalación del agente local permite integrar funciones de impresión y periféricos en el equipo de caja.

## 12. Observaciones y límites actuales

1. **Roles no uniformes:** conviven nombres de interfaz en español (`cajero`, `gerente`, `vendedor`) y roles del backend (`cashier`, `manager`, `admin`, `superadmin`). El servicio de empleados solo permite asignar `cashier` o, bajo condición, `superadmin`; opciones como gerente, vendedor y admin no son asignables de forma general aunque aparezcan en ciertos formularios.
2. **Superadministrador y rutas estrictas:** la interfaz suele tratar `superadmin` como administrador, pero algunas rutas del backend —por ejemplo, ciertas operaciones de inventario y respaldos— exigen exactamente `admin`.
3. **Configuraciones de ejemplo:** la API de organización devuelve valores predeterminados y algunos cambios responden con una vista de los datos enviados sin evidencia de persistencia permanente. Verificar cada cambio en el entorno real antes de considerarlo guardado.
4. **Panel de inicio:** algunos indicadores y el turno que se muestran en la página principal son valores de presentación y pueden no representar datos reales de la caja.
5. **Facturación fiscal:** el flujo disponible construye un registro/representación de factura a partir de una venta; no debe confundirse con la emisión fiscal timbrada.
6. **Modo de demostración:** sin MySQL, el modo demo depende de la configuración del backend y utiliza datos en memoria, por lo que no equivale a una instalación productiva con persistencia.
7. **Operación offline parcial:** se conserva una cola local para ventas pendientes y aperturas de caja, pero reportes, facturas, administración, suscripciones y sincronización requieren conectividad con el backend.
8. **Servicios externos:** Stripe, la báscula, la impresora, el cajón y el agente local requieren su propia configuración y disponibilidad. La interfaz puede mostrar opciones que no funcionarán hasta completar esos requisitos.

## 13. Flujo recomendado de una jornada

1. Iniciar sesión con la cuenta asignada y confirmar que la organización y el rol sean correctos.
2. Revisar la conexión, el estado de la suscripción y el estado del agente de hardware.
3. Abrir la caja e ingresar la base de efectivo.
4. Registrar las ventas buscando o escaneando productos; verificar unidad, cantidad, precio, descuentos e impuesto.
5. Seleccionar el medio de pago, registrar el efectivo recibido o la referencia de terminal y confirmar la operación.
6. Al finalizar el turno, consultar ventas y métodos de pago, contar el efectivo y guardar el arqueo.
7. Cerrar la caja y revisar que la diferencia y el historial correspondan con el conteo físico.
8. El personal administrativo puede consultar reportes, revisar inventario y empleados, y gestionar las tareas administrativas permitidas por su rol.

## 14. Términos

- **Base de caja:** efectivo inicial registrado al abrir un turno.
- **Arqueo:** comparación entre el efectivo esperado y el efectivo contado al cierre.
- **Dry run:** validación o previsualización de una importación sin guardar los datos.
- **Transacción pendiente:** venta guardada en el dispositivo que todavía no se ha confirmado/sincronizado con el backend.
- **Agente local:** servicio instalado en el equipo para comunicar el POS con impresoras, cajón y dispositivos compatibles.
- **CFDI timbrado:** comprobante fiscal validado ante el SAT; la representación de factura del POS no demuestra por sí sola que se haya realizado este proceso.
