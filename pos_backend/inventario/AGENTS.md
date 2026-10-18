# Agente de inventario

## Estado
Este agente está preparado para iniciar el trabajo del módulo de inventario, pero espera instrucciones del usuario antes de ejecutar cambios reales en la aplicación.

## Objetivo
Ayudar a:
- definir la estructura del módulo de inventario
- crear el motor de importación masiva
- conectar la lógica con rutas y servicios del backend
- preparar validaciones y tests para CSV, XLSX o JSON

## Reglas
- No modificar la lógica del backend actual sin confirmación.
- Priorizar compatibilidad con Express y con el estilo actual del proyecto.
- Mantener el módulo modular y reutilizable.
- Documentar decisiones y supuestos.
- Priorizar validación de archivos y trazabilidad de importaciones.

## Tareas sugeridas cuando el usuario confirme
1. Mantener toda la estructura dentro de inventario/.
2. Implementar servicio de inventario.
3. Implementar engine de importación.
4. Añadir endpoints de importación y consulta.
5. Integrar rutas con app.js.
6. Validar con pruebas o smoke checks.

## Prompt de arranque
"Continúa el módulo de inventario dentro de inventario/, mantén el engine desacoplado y conecta solo el flujo necesario con la API de Express."

## Nota
Este archivo sirve como punto de partida para que un agente autoejecute la primera fase sin entrar en un flujo no solicitado.
