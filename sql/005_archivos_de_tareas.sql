-- Archivos de cada tarea: viven en Drive (carpeta de la acción) y aquí se guarda a qué tarea pertenece cada uno.
create table if not exists task_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  event_id uuid not null references events(id) on delete cascade,
  name text not null,
  folder text not null default 'Documentación',
  drive_file_id text not null,
  size bigint,
  mime text not null default '',
  created_by uuid references team_users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (task_id, drive_file_id)
);
create index if not exists task_files_task_idx on task_files(task_id);
create index if not exists task_files_event_idx on task_files(event_id);
alter table task_files enable row level security;
