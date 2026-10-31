-- Avania Events: esquema inicial (31-oct-2026).
-- Toda la app habla con Postgres desde el servidor (DATABASE_URL). Las tablas llevan RLS activado y sin políticas:
-- las claves públicas de Supabase (anon) no pueden leer nada.

-- ───────── Equipo (solo personal de AVANIA; el cliente no entra) ─────────
create table if not exists team_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  role text not null check (role in ('super_admin', 'admin', 'member')),
  password_hash text not null,
  must_change_password boolean not null default true,
  active boolean not null default true,
  invite_hash text,
  invite_expires_at timestamptz,
  prefs jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  user_id uuid not null references team_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_idx on sessions(user_id);

-- ───────── Catálogos ─────────
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique check (code ~ '^[A-Z]{2,5}$'),   -- prefijo de la referencia: ALB-016
  color text not null default '#0f766e',
  position int not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists event_types (   -- tipo de acción: Sorteo, Gastronomía, Moda y Casting…
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text not null default '#667085',
  position int not null default 0
);

create table if not exists task_sections (   -- sección de una tarea: Montaje, Creatividades, Personal…
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  position int not null default 0
);

-- ───────── Acciones (eventos) y sus tareas ─────────
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id),
  seq int not null,                                   -- número dentro del cliente
  ref text not null unique,                           -- ALB-016
  year int not null check (year between 2000 and 2100),
  name text not null,
  type_id uuid references event_types(id) on delete set null,
  status text not null default 'sin_empezar' check (status in ('sin_empezar', 'en_proceso', 'terminado', 'en_pausa', 'cancelado')),
  priority text not null default 'media' check (priority in ('baja', 'media', 'alta')),
  owner_id uuid references team_users(id) on delete set null,
  starts_on date,
  ends_on date,
  location text,
  description text not null default '',
  cost numeric(12,2),
  invoiced boolean not null default false,
  -- Briefing
  objective text not null default '',
  audience text not null default '',
  -- Cierre post-evento
  participants int,
  kpi_result text not null default '',
  sponsors text not null default '',
  incidents text not null default '',
  improvements text not null default '',
  rating smallint check (rating between 1 and 5),
  notes_next text not null default '',                -- «notas para el año que viene»
  links jsonb not null default '[]'::jsonb,           -- [{ name, url }]: carpetas de Drive, bases legales, informes…
  notion_id text unique,
  notion_url text,
  archived boolean not null default false,
  created_by uuid references team_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, seq)
);
create index if not exists events_year_idx on events(year, starts_on);
create index if not exists events_client_idx on events(client_id, year);
create index if not exists events_type_idx on events(type_id);
create index if not exists events_owner_idx on events(owner_id);

create table if not exists event_collaborators (
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid not null references team_users(id) on delete cascade,
  primary key (event_id, user_id)
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  parent_id uuid references tasks(id) on delete cascade,
  title text not null,
  section_id uuid references task_sections(id) on delete set null,
  status text not null default 'sin_empezar' check (status in ('sin_decidir', 'sin_empezar', 'en_curso', 'finalizada', 'archivada')),
  priority text check (priority in ('baja', 'media', 'alta')),
  owner_id uuid references team_users(id) on delete set null,
  due_on date,
  cost numeric(12,2),
  summary text not null default '',
  links jsonb not null default '[]'::jsonb,
  position int not null default 0,
  notion_id text unique,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_event_idx on tasks(event_id, position);
create index if not exists tasks_owner_idx on tasks(owner_id, due_on);

create table if not exists event_log (
  id bigserial primary key,
  event_id uuid not null references events(id) on delete cascade,
  user_id uuid references team_users(id) on delete set null,
  actor text not null,
  action text not null,
  detail jsonb,
  at timestamptz not null default now()
);
create index if not exists event_log_event_idx on event_log(event_id, at desc);

alter table team_users enable row level security;
alter table sessions enable row level security;
alter table clients enable row level security;
alter table event_types enable row level security;
alter table task_sections enable row level security;
alter table events enable row level security;
alter table event_collaborators enable row level security;
alter table tasks enable row level security;
alter table event_log enable row level security;

-- ───────── Datos de partida (se pueden cambiar desde Administración) ─────────
insert into clients (name, code, color, position) values
  ('Albacenter', 'ALB', '#0f766e', 1),
  ('UCLM', 'UCL', '#7c3aed', 2)
on conflict do nothing;

insert into event_types (name, color, position) values
  ('Fecha comercial', '#2563eb', 1),
  ('Evento especial', '#ea7a1a', 2),
  ('Moda y casting', '#db2777', 3),
  ('Colaboración', '#7c3aed', 4),
  ('Gastronomía', '#92400e', 5),
  ('Animación', '#ca8a04', 6),
  ('Sorteo', '#16a34a', 7)
on conflict do nothing;

insert into task_sections (name, position) values
  ('Montaje', 1), ('Creatividades', 2), ('Personal', 3), ('Materiales', 4), ('Premios y mercancías', 5),
  ('Patrocinadores', 6), ('Medios', 7), ('Documentación', 8)
on conflict do nothing;
