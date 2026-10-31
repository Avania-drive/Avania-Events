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

## 31-oct-2026 — Cajas, informes, ubicaciones, Drive
- Vista Cajas por tipo (colores), Informes (global + ficha por acción), Ubicaciones en Administración, orden por fecha en la Lista, público objetivo con opciones, tareas compactas con «Ampliar tarea», colores en las secciones de tareas (sql/003).
- Drive: creada «ALBACENTER EVENTS / 2026 / ALB-0xx NOMBRE» (18 carpetas); `events.drive_folder_id` enlazado. Pendiente: crear subcarpetas por sección y mover los 134 adjuntos de Notion (necesita cuenta de servicio de Google).
- Incidente: las pruebas se ejecutaron contra la base real y dejaron datos de prueba; arreglado (`DATABASE_URL=''` en test/run.mjs), usuarios y acciones de prueba borrados. Queda el cliente «Nuevo Cliente».

## 31-oct-2026 — Importes ocultos, pendientes, clonar, archivos de tareas, Drive en unidad compartida
- **Informes**: filtros (año, tipo, estado, facturación, responsable) y clasificación (fecha, tipo, estado, facturación, responsable, mes). Acceso con usuario y contraseña (`/api/informes/acceso`, 30 min por sesión, sql/004). Importes en negrita y con punto de miles.
- **Importes ocultos** (lista, tablero, fichas, inicio) hasta desbloquear: el servidor vacía `cost`, `tasks_cost`, `por_facturar_importe`, `coste_anio` y rechaza escribir importes con la sesión bloqueada (middleware tras `loadSession`). Botón «🔒 Oculto» abre la ventana de acceso.
- **Aviso diario de pendientes** (primera entrada del día, `prefs.pending_seen`) con enlace a cada tarea (`#/evento/ID?t=TAREA`); **bloque «Pendientes» fijo en el menú** (todas / solo mías).
- **Nueva acción**: recopilatorio de tareas tipo con checks (`/api/task-templates`, `clone_tasks`). **Clonar** acción a otro año (`/api/events/:id/clone`, fechas desplazadas, sin importes).
- **Archivos por tarea** (sql/005 `task_files`): botón de clip activo si la tarea tiene archivos; subida desde «Ampliar tarea» a Creatividades / Documentación / Producción de la carpeta de Drive de la acción.
- **Drive**: cuenta de servicio de Space (carpeta en «Mi unidad» no permite subir: sin cuota). Pasado a la unidad compartida `DRIVE_ROOT_FOLDER`; estructura `Cliente / Año / «REF NOMBRE» / Creatividades · Documentación · Producción` (`scripts/drive-reorganizar.mjs`). Las carpetas antiguas de Mi unidad (ALBACENTER EVENTS) quedan vacías, sin borrar. Las acciones nuevas crean su carpeta solas.
- **Traspaso Notion → Drive** (`scripts/notion-files-to-drive.mjs`, token en `.env`, 134 adjuntos): lanza tras la reorganización.
- **Correo**: SMTP del buzón de Space (el de marketing@ rechazaba la contraseña). Pruebas sin correo real (vaciar SMTP en `test/run.mjs`).
- **Incidentes**: pruebas ejecutadas contra la base real (dos veces: datos de prueba, correos de prueba); corregido y limpiado. Una vez, concesión de permisos de Drive bloqueada por el sistema y hecha por Pascual.
- 88 pruebas en memoria (PGlite), todas correctas.
