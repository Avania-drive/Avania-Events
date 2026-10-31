# Bitácora de Avania Events

## 31-oct-2026 — Primera versión
- Servidor Express + Supabase (Postgres), acceso solo del equipo (roles superadmin / admin / equipo), invitación por correo 48 h.
- Esquema: clientes (Albacenter, UCLM), tipos de acción, secciones de tareas, acciones con referencia por cliente (ALB-001), tareas con subtareas, registro de actividad.
- Interfaz: menú por años y tipos, panel de inicio, lista / tablero / cronograma, ficha de acción con guardado automático, administración (equipo, clientes, tipos y secciones).
- Pruebas: 65 en memoria (PGlite) + recorrido en Chromium de escritorio y móvil.
- Pendiente: credenciales de Supabase en .env, migrar, crear superadmin, ruta Traefik + PM2, importar 2026 desde Notion.
