# Bitácora de Avania Events

## 31-oct-2026 — Primera versión
- Servidor Express + Supabase (Postgres), acceso solo del equipo (roles superadmin / admin / equipo), invitación por correo 48 h.
- Esquema: clientes (Albacenter, UCLM), tipos de acción, secciones de tareas, acciones con referencia por cliente (ALB-001), tareas con subtareas, registro de actividad.
- Interfaz: menú por años y tipos, panel de inicio, lista / tablero / cronograma, ficha de acción con guardado automático, administración (equipo, clientes, tipos y secciones).
- Pruebas: 65 en memoria (PGlite) + recorrido en Chromium de escritorio y móvil.
- Pendiente: credenciales de Supabase en .env, migrar, crear superadmin, ruta Traefik + PM2, importar 2026 desde Notion.

## 31-oct-2026 — Despliegue e importación de 2026
- Migración 001 aplicada en Supabase; superadmin creado; PM2 `avania-events` (3004) y ruta Traefik `events.yml`; https://events.goavania.com en marcha.
- Importadas de Notion 18 acciones de Albacenter 2026 (las 15 de «ACCIONES ALBACENTER 26» + Fiesta del Color + Casting AB Fashion 2026) y 197 tareas, con `scripts/import-notion-2026.mjs` (repetible: actualiza por notion_id, no duplica). Datos fuente en `data/` (no se sube a git).
- Mapeo: Planificación→sin empezar, En curso→en proceso, Finalizada→terminado; sección Archivos→Documentación; adjuntos de Notion anotados en el resumen de la tarea (no se copian los archivos). Tipos de acción asignados a ojo, para revisar.
