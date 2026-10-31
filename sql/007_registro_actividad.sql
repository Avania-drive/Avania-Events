-- Registro de actividad de todo el equipo: quién hizo qué y cuándo (accesos, cambios, archivos, administración).
create table if not exists audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  user_id uuid references team_users(id) on delete set null,
  actor text not null default '',
  action text not null,
  category text not null default 'otros',
  event_id uuid references events(id) on delete set null,
  summary text not null default '',
  detail jsonb,
  ip text not null default '',
  ok boolean not null default true
);
create index if not exists audit_log_at_idx on audit_log (at desc);
create index if not exists audit_log_user_idx on audit_log (user_id, at desc);
create index if not exists audit_log_event_idx on audit_log (event_id);
alter table audit_log enable row level security;
