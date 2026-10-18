# AGENTS

## Tarea activa
Módulo de inventario y motor de importación masiva.

## Estado actual
La base de trabajo ya quedó preparada en:
- inventario/README.md
- inventario/engine/README.md
- inventario/AGENTS.md
- inventario/module/
- inventario/engine/

## Instrucciones para la próxima ejecución
- La ruta de inventario ya está conectada a app.js; no mezclar el engine con Express.
- Mantén la lógica modular y compatible con Express.
- Usa un enfoque incremental para validación, parsing y persistencia.
- Prioriza importación desde CSV, luego JSON y posteriormente XLSX.
- Registra cualquier decisión arquitectónica en documentación.

## Prompt de arranque
"Continúa con el módulo de inventario a partir de la estructura ya creada, conecta el servicio y el engine con la API de Express, y valida el flujo de importación con CSV/JSON sin romper el backend actual."
