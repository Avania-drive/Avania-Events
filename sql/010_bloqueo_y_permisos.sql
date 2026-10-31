-- Una acción terminada sin valoración queda bloqueada; cualquiera puede pedir permiso y el superusuario autoriza.
create table if not exists action_unlocks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  requested_by uuid references team_users(id) on delete set null,
  reason text not null default '',
  status text not null default 'pendiente' check (status in ('pendiente', 'autorizada', 'rechazada')),
  requested_at timestamptz not null default now(),
  decided_by uuid references team_users(id) on delete set null,
  decided_at timestamptz,
  valid_until timestamptz
);
create index if not exists action_unlocks_event_idx on action_unlocks(event_id, requested_at desc);
create index if not exists action_unlocks_status_idx on action_unlocks(status);
alter table action_unlocks enable row level security;
-- Para avisar una sola vez del resumen de costes cuando la acción se termina.
alter table events add column if not exists completed_notified_at timestamptz;
